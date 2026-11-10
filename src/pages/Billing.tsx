import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Banknote, Check, ChevronRight, Home as HomeIcon, Plus, Search, ShieldCheck } from 'lucide-react';
import { FinancialBoundary } from '../components/FinancialBoundary';
import { errorText } from '../api';
import { useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Info, Loading, Modal, Success } from '../components/ui';
import { ReasonDialog, Stat, currentMonth, dateTimeText, lastPayDay, money, monthName, pesos, toCents, useFinanceAction, useWide } from './financeUi';
import { ManualPaymentDialog, PaymentList, Reconciliation, StripeAccountCard, reviewCount, scopedPath, useAdminPayments, type AdminData, type FinanceAction, type Scoped } from './Payments';
import './Billing.css';

// Tesorería: what the fraccionamiento charges, what each home owes, the payments received and
// whatever needs review. Split in tabs so daily work stays in front and setup stays aside.

export const mxn = (cents: string) => money(cents);

type Concept = { id: string; conceptId: string; name: string; category: string; baseCents: string; effectiveMonth: string; active: boolean };
type Account = { id: string; propertyId: string; payerId: string | null; balanceCents: string; overdueCents: string; property?: { street: string; houseNumber: string; memberships: { userId: string; user: { fullName: string } }[] } };
type Fee = { accountId: string; conceptId: string; adjustmentCents: string; effectiveMonth: string };
type Overview = { accounts: Account[]; concepts: Concept[]; fees: Fee[]; currentMonth: string };
type Movement = { id: string; description: string; amountCents: string; effectiveAt: string; dueAt: string | null; kind: string; reversesId: string | null; reason: string; period: string | null };
type Statement = { balanceCents: string; overdueCents: string; movements: Movement[] };
type Settings = { enabled: boolean; emissionEnabled: boolean; startMonth: string };
type Access = { enabled: boolean; canManage: boolean; canResolve?: boolean; canConfigure: boolean };
type Grants = { users: { id: string; fullName: string; active: boolean }[]; operators: { id: string; fullName: string }[] };
type Tab = 'resumen' | 'viviendas' | 'pagos' | 'conciliacion' | 'configuracion';

const CATEGORY: Record<string, string> = { MAINTENANCE: 'Mantenimiento', EXTRAORDINARY: 'Cuota extraordinaria', RESERVE: 'Fondo de reserva', FINE: 'Multa', OTHER: 'Otro' };
const homeLabel = (a?: Account) => a?.property ? `Casa ${a.property.houseNumber} · ${a.property.street}` : 'Casa';
const payerName = (a: Account) => a.property?.memberships.find(m => m.userId === a.payerId)?.user.fullName;
/** Newest version of each concept. */
const latestConcepts = (concepts: Concept[]) => concepts.filter((c, i, all) => !all.slice(0, i).some(v => v.conceptId === c.conceptId));
/** Versions in force for a month. */
const conceptsFor = (concepts: Concept[], month: string) => concepts.filter((c, i, all) => c.effectiveMonth <= month && !all.slice(0, i).some(v => v.conceptId === c.conceptId && v.effectiveMonth <= month));

function BillingContent({ canConfigure = false, userId, communityId }: { canConfigure?: boolean; userId?: string; communityId?: string }) {
  const path = scopedPath(communityId);
  const access = useQuery<Access>(path('/billing/availability'));
  const a = access.data;
  const settings = useQuery<Settings | null>(a?.canManage || canConfigure ? path('/billing/settings') : null);
  const overview = useQuery<Overview>(a?.canManage ? path('/billing/overview') : null);
  const grants = useQuery<Grants>(canConfigure ? path('/billing/grants') : null);
  const payments = useAdminPayments(communityId, !!a?.canResolve);
  const [selected, setSelected] = useState('');
  const statement = useQuery<Statement>(selected && a?.canManage ? path(`/billing/accounts/${selected}/statement`) : null);
  const action = useFinanceAction(() => { access.refresh(); settings.refresh(); overview.refresh(); grants.refresh(); payments.refresh(); statement.refresh(); });
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    ...(a?.canManage ? [{ id: 'resumen' as const, label: 'Resumen' }, { id: 'viviendas' as const, label: 'Viviendas' }] : []),
    ...(a?.canResolve ? [{ id: 'pagos' as const, label: 'Pagos' }, { id: 'conciliacion' as const, label: 'Pendientes', badge: reviewCount(payments.data) }] : []),
    ...(a?.canManage || canConfigure ? [{ id: 'configuracion' as const, label: 'Configuración' }] : []),
  ];
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab = tabs.some(t => t.id === chosen) ? chosen! : tabs[0]?.id;
  const homes = (overview.data?.accounts ?? []).map(acc => ({ id: acc.id, label: homeLabel(acc) }));
  const homeName = (id: string) => homes.find(h => h.id === id)?.label;
  function openHome(id: string) { setSelected(id); setChosen('viviendas'); }

  if (access.loading && !a) return <Loading/>;
  if (!a?.canManage && !a?.canResolve && !canConfigure) return <section className="panel"><ErrorBox message={access.error}/><Empty icon={<ShieldCheck/>} title="Cobranza no disponible" text="La cobranza no está habilitada o no tienes permiso financiero."/></section>;
  return <div className="fin">
    <div className="fin-title"><div><h2>Tesorería</h2><p>Cuotas, saldos y pagos del fraccionamiento. Corte el día 1 · pago oportuno hasta el día 20 (hora de Ciudad de México).</p></div><span className="fin-flag"><ShieldCheck size={15}/> Stripe en modo de prueba</span></div>
    {tabs.length > 1 && <div className="fin-tabs" role="tablist" aria-label="Secciones de tesorería">{tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setChosen(t.id)}>{t.label}{!!t.badge && <span className="fin-tab-badge">{t.badge}</span>}</button>)}</div>}
    <ErrorBox message={access.error || overview.error || settings.error || grants.error || payments.error}/>
    {action.notice && <Success>{action.notice}</Success>}
    {tab === 'resumen' && (overview.data ? <Summary overview={overview.data} settings={settings.data ?? null} payments={payments.data} canResolve={!!a?.canResolve} path={path} action={action} homeName={homeName} onGo={setChosen} onOpenHome={openHome}/> : <Loading/>)}
    {tab === 'viviendas' && (overview.data ? <Homes overview={overview.data} selected={selected} onSelect={setSelected} statement={statement} payments={payments.data} enabled={!!a?.enabled} path={path} action={action} homeName={homeName}/> : <Loading/>)}
    {tab === 'pagos' && (payments.data ? <section className="panel fin-section"><div className="fin-section-head"><div><h3>Pagos recibidos</h3><p>Los de tarjeta y SPEI llegan solos; el efectivo y las transferencias directas se registran desde la casa, en Viviendas.</p></div></div><PaymentList payments={payments.data.payments} homeName={homeName} path={path} action={action} empty="Aún no hay pagos registrados."/></section> : <Loading/>)}
    {tab === 'conciliacion' && (payments.data ? <Reconciliation data={payments.data} path={path} action={action} homes={homes} onTaskCursor={payments.setTaskCursor} onEventCursor={payments.setEventCursor} onFirstPage={payments.firstPage} paged={payments.paged}/> : <Loading/>)}
    {tab === 'configuracion' && <Configuration canConfigure={canConfigure} canManage={!!a?.canManage} canResolve={!!a?.canResolve} enabled={!!a?.enabled} userId={userId} settings={settings.data ?? null} overview={overview.data} grants={grants.data} payments={payments.data} path={path} action={action}/>}
  </div>;
}

/** Totals, what is missing to start charging, and what needs attention today. */
function Summary({ overview, settings, payments, canResolve, path, action, homeName, onGo, onOpenHome }: { overview: Overview; settings: Settings | null; payments?: AdminData; canResolve: boolean; path: Scoped; action: FinanceAction; homeName: (id: string) => string | undefined; onGo: (tab: Tab) => void; onOpenHome: (id: string) => void }) {
  const accounts = overview.accounts;
  const owed = accounts.reduce((s, x) => s + (BigInt(x.balanceCents) > 0n ? BigInt(x.balanceCents) : 0n), 0n);
  const credit = accounts.reduce((s, x) => s + (BigInt(x.balanceCents) < 0n ? -BigInt(x.balanceCents) : 0n), 0n);
  const overdue = accounts.reduce((s, x) => s + BigInt(x.overdueCents), 0n);
  const current = accounts.filter(x => BigInt(x.balanceCents) <= 0n).length;
  const withoutPayer = accounts.filter(x => !x.payerId).length;
  const late = accounts.filter(x => BigInt(x.overdueCents) > 0n).sort((x, y) => (BigInt(y.overdueCents) > BigInt(x.overdueCents) ? 1 : -1)).slice(0, 5);
  const steps = [
    { done: !!settings?.enabled, title: 'Zentry activó la cobranza', text: 'La activa Plataforma para este fraccionamiento.', tab: 'configuracion' as Tab },
    ...(canResolve ? [{ done: !!payments?.destination, title: 'Cuenta de Stripe vinculada', text: 'Para recibir pagos con tarjeta y SPEI.', tab: 'configuracion' as Tab }] : []),
    { done: latestConcepts(overview.concepts).some(c => c.active), title: 'Conceptos de cobro creados', text: 'Por ejemplo: Mantenimiento, $850 al mes.', tab: 'configuracion' as Tab },
    { done: !withoutPayer, title: 'Titular asignado en cada casa', text: withoutPayer ? `Faltan ${withoutPayer} de ${accounts.length}. Solo el titular ve el saldo y paga.` : 'Todas las casas tienen titular.', tab: 'viviendas' as Tab },
    { done: !!settings?.emissionEnabled, title: 'Emisión mensual activada', text: 'Genera la cuota de cada casa el día 1.', tab: 'configuracion' as Tab },
  ];
  const pending = reviewCount(payments);
  return <div className="fin-stack">
    {pending > 0 && <div className="fin-callout bad"><AlertTriangle size={20}/><div><strong>{pending === 1 ? 'Un pago requiere revisión' : `${pending} pagos requieren revisión`}</strong><span>Cada uno explica el motivo y qué hacer.</span></div><Button className="secondary small-button" onClick={() => onGo('conciliacion')}>Ver pendientes</Button></div>}
    <section className="fin-stats" aria-label="Totales">
      <Stat label="Por cobrar" value={money(owed)} hint="Lo que deben las casas hoy" tone={owed > 0n ? 'accent' : ''}/>
      <Stat label="Vencido" value={money(overdue)} hint="No se pagó antes del día 21" tone={overdue > 0n ? 'bad' : ''}/>
      <Stat label="Casas al corriente" value={`${current} de ${accounts.length}`} hint={accounts.length ? `${Math.round(current / accounts.length * 100)}% sin adeudo` : 'Sin casas'} tone="good"/>
      <Stat label="Saldo a favor" value={money(credit)} hint="Se aplica solo a las próximas cuotas"/>
    </section>
    {steps.some(s => !s.done) && <section className="panel fin-section"><h3>Para empezar a cobrar</h3><ol className="fin-steps">{steps.map((s, i) => <li key={s.title} className={s.done ? 'done' : ''}>
      <span className="fin-step-mark" aria-hidden="true">{s.done ? <Check size={15}/> : i + 1}</span><div><strong>{s.title}</strong><small>{s.text}</small></div>
      {!s.done && s.title !== 'Zentry activó la cobranza' && <button type="button" className="fin-link" onClick={() => onGo(s.tab)}>Ir <ChevronRight size={15}/></button>}</li>)}</ol></section>}
    <div className="fin-two">
      <section className="panel fin-section"><h3>Casas con adeudo vencido</h3>{!late.length ? <p className="muted">Ninguna casa tiene cuotas vencidas.</p> :
        <ul className="fin-rows">{late.map(x => <li key={x.id}><button type="button" className="fin-row fin-row-button" onClick={() => onOpenHome(x.id)}><div className="fin-row-main"><strong>{homeLabel(x)}</strong><small>{payerName(x) ?? 'Sin titular'}</small></div><div className="fin-row-side"><strong className="fin-amount bad">{money(x.overdueCents)}</strong><ChevronRight size={16}/></div></button></li>)}</ul>}</section>
      {canResolve && <section className="panel fin-section"><div className="fin-section-head"><h3>Últimos pagos</h3>{!!payments?.payments.length && <button type="button" className="fin-link" onClick={() => onGo('pagos')}>Ver todos <ChevronRight size={15}/></button>}</div>
        {payments ? <PaymentList payments={payments.payments.slice(0, 5)} homeName={homeName} path={path} action={action} empty="Aún no hay pagos."/> : <Loading/>}</section>}
    </div>
  </div>;
}

type HomeFilter = 'all' | 'owe' | 'late' | 'nopayer' | 'credit';
const HOME_FILTERS: { id: HomeFilter; label: string; test: (a: Account) => boolean }[] = [
  { id: 'all', label: 'Todas', test: () => true },
  { id: 'owe', label: 'Con adeudo', test: a => BigInt(a.balanceCents) > 0n },
  { id: 'late', label: 'Vencidas', test: a => BigInt(a.overdueCents) > 0n },
  { id: 'nopayer', label: 'Sin titular', test: a => !a.payerId },
  { id: 'credit', label: 'Saldo a favor', test: a => BigInt(a.balanceCents) < 0n },
];

function Homes({ overview, selected, onSelect, statement, payments, enabled, path, action, homeName }: { overview: Overview; selected: string; onSelect: (id: string) => void; statement: ReturnType<typeof useQuery<Statement>>; payments?: AdminData; enabled: boolean; path: Scoped; action: FinanceAction; homeName: (id: string) => string | undefined }) {
  const [q, setQ] = useState(''), [filter, setFilter] = useState<HomeFilter>('all');
  const wide = useWide();
  const byNumber = useMemo(() => new Intl.Collator('es', { numeric: true }), []);
  const term = q.trim().toLowerCase();
  const list = overview.accounts.filter(HOME_FILTERS.find(f => f.id === filter)!.test).filter(x => !term || homeLabel(x).toLowerCase().includes(term) || (payerName(x) ?? '').toLowerCase().includes(term))
    .sort((x, y) => byNumber.compare(homeLabel(x), homeLabel(y)));
  const current = overview.accounts.find(x => x.id === selected);
  const detail = current && <HomeDetail key={current.id} account={current} overview={overview} statement={statement} payments={payments?.payments.filter(p => p.accountId === current.id)} enabled={enabled} path={path} action={action}/>;
  return <section className="panel fin-section">
    <div className="fin-toolbar"><h3>Viviendas</h3><label className="fin-search"><Search size={16}/><input aria-label="Buscar casa o titular" placeholder="Casa o titular" value={q} onChange={e => setQ(e.target.value)}/></label></div>
    <div className="fin-chips" role="group" aria-label="Filtrar viviendas">{HOME_FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label} <span>{overview.accounts.filter(f.test).length}</span></button>)}</div>
    <div className="fin-split">
      <ul className="fin-rows fin-list">{!list.length ? <li><p className="muted">Ninguna casa con este filtro.</p></li> : list.map(x => { const balance = BigInt(x.balanceCents), late = BigInt(x.overdueCents) > 0n;
        return <li key={x.id}><button type="button" className={`fin-row fin-row-button${x.id === selected ? ' selected' : ''}`} aria-pressed={x.id === selected} onClick={() => onSelect(x.id)}>
          <span className="fin-row-icon"><HomeIcon size={17}/></span>
          <div className="fin-row-main"><strong>{homeLabel(x)}</strong><small>{payerName(x) ?? <span className="fin-note">Sin titular</span>}</small></div>
          <div className="fin-row-side"><strong className={`fin-amount ${late ? 'bad' : balance < 0n ? 'good' : ''}`}>{balance < 0n ? `A favor ${money(-balance)}` : money(balance)}</strong>{late ? <span className="badge revoked"><span/>Vencido {money(x.overdueCents)}</span> : balance <= 0n ? <span className="badge"><span/>Al corriente</span> : <span className="badge expired"><span/>Por pagar</span>}</div>
        </button></li>; })}</ul>
      {wide && <aside className="fin-detail" aria-label="Detalle de la vivienda">{detail ?? <Empty icon={<HomeIcon/>} title="Elige una casa" text="Verás su saldo, su titular, sus cuotas y sus pagos."/>}</aside>}
    </div>
    {!wide && current && <Modal title={homeLabel(current)} onClose={() => onSelect('')}>{detail}</Modal>}
  </section>;
}

function HomeDetail({ account, overview, statement, payments, enabled, path, action }: { account: Account; overview: Overview; statement: ReturnType<typeof useQuery<Statement>>; payments?: AdminData['payments']; enabled: boolean; path: Scoped; action: FinanceAction }) {
  const [payer, setPayer] = useState(account.payerId ?? ''), [manual, setManual] = useState(false), [adjust, setAdjust] = useState(false), [reverse, setReverse] = useState<Movement | null>(null);
  const month = currentMonth();
  const s = statement.data;
  const reversed = new Set((s?.movements ?? []).map(m => m.reversesId).filter(Boolean));
  const movements = [...(s?.movements ?? [])].sort((x, y) => y.effectiveAt.localeCompare(x.effectiveAt));
  const fees = conceptsFor(overview.concepts, month).filter(c => c.active).map(c => { const fee = overview.fees.find(f => f.accountId === account.id && f.conceptId === c.conceptId && f.effectiveMonth <= month); return { concept: c, adjustment: fee?.adjustmentCents ?? '0' }; });
  const balance = BigInt(s?.balanceCents ?? account.balanceCents);
  return <div className="fin-stack">
    <div className="fin-detail-head"><div><h3>{homeLabel(account)}</h3><p>{payerName(account) ? `Titular: ${payerName(account)}` : 'Sin titular financiero'}</p></div></div>
    <div className="fin-stats compact">
      <Stat label={balance < 0n ? 'Saldo a favor' : 'Saldo'} value={money(balance < 0n ? -balance : balance)} tone={balance > 0n ? 'accent' : 'good'}/>
      <Stat label="Vencido" value={money(s?.overdueCents ?? account.overdueCents)} tone={BigInt(s?.overdueCents ?? account.overdueCents) > 0n ? 'bad' : ''}/>
    </div>
    {enabled && <Button onClick={() => { action.clear(); setManual(true); }}><Banknote size={17}/> Registrar pago en efectivo o transferencia</Button>}

    <div className="fin-block"><h4>Titular financiero</h4><p className="small muted">Solo esta persona ve el saldo de la casa y paga desde su app.</p>
      <div className="fin-inline"><select aria-label="Titular financiero" value={payer} disabled={action.busy} onChange={e => setPayer(e.target.value)}><option value="">Sin titular asignado</option>{account.property?.memberships.map(m => <option key={m.userId} value={m.userId}>{m.user.fullName}</option>)}</select>
        {payer !== (account.payerId ?? '') && <Button className="small-button" busy={action.busy} onClick={() => void action.run(path(`/billing/accounts/${account.id}/payer`), { payerId: payer || null, reason: 'Actualización del titular financiero' }, 'Titular actualizado.')}>Guardar</Button>}</div></div>

    <div className="fin-block"><div className="fin-section-head"><h4>Cuota mensual ({monthName(month)})</h4><button type="button" className="fin-link" onClick={() => { action.clear(); setAdjust(true); }}>Ajustar cuota</button></div>
      {!fees.length ? <p className="small muted">Aún no hay conceptos de cobro. Créalos en Configuración.</p> : <ul className="fin-plain">{fees.map(f => { const total = BigInt(f.concept.baseCents) + BigInt(f.adjustment);
        return <li key={f.concept.id}><span>{f.concept.name}</span><strong>{money(total)}</strong>{f.adjustment !== '0' && <small>Base {money(f.concept.baseCents)} {BigInt(f.adjustment) > 0n ? '+' : '−'} ajuste {money(BigInt(f.adjustment) < 0n ? -BigInt(f.adjustment) : BigInt(f.adjustment))}</small>}</li>; })}</ul>}</div>

    <div className="fin-block"><h4>Estado de cuenta</h4><ErrorBox message={statement.error}/>
      {statement.loading && !s ? <Loading/> : !movements.length ? <p className="small muted">Sin movimientos todavía. La casa empezó con saldo en cero.</p> :
        <ul className="fin-rows">{movements.map(m => { const amount = BigInt(m.amountCents), cancelled = reversed.has(m.id);
          return <li key={m.id} className="fin-row fin-row-wrap"><div className="fin-row-main"><strong className={cancelled ? 'fin-struck' : ''}>{m.description}</strong>
            <small>{m.period ? monthName(m.period) : dateTimeText(m.effectiveAt)}{m.kind === 'CHARGE' && m.dueAt && !cancelled ? ` · fecha límite ${lastPayDay(m.dueAt)}` : ''}{cancelled ? ' · anulado con reverso' : ''}</small><small className="muted">{m.reason}</small></div>
            <div className="fin-row-side"><strong className={`fin-amount ${amount < 0n ? 'good' : ''}`}>{amount < 0n ? `−${money(-amount)}` : money(amount)}</strong>
              {m.kind === 'CHARGE' && !cancelled && <button type="button" className="fin-link" onClick={() => { action.clear(); setReverse(m); }}>Corregir con reverso</button>}</div></li>; })}</ul>}</div>

    {payments && <div className="fin-block"><h4>Pagos de esta casa</h4><PaymentList payments={payments} path={path} action={action} empty="Esta casa aún no tiene pagos."/></div>}

    {manual && <ManualPaymentDialog accountId={account.id} home={homeLabel(account)} path={path} action={action} onClose={() => setManual(false)}/>}
    {adjust && <AdjustDialog account={account} overview={overview} path={path} action={action} onClose={() => setAdjust(false)}/>}
    {reverse && <ReasonDialog title="Corregir con reverso" confirm="Confirmar reverso" danger busy={action.busy} error={action.error} onClose={() => setReverse(null)}
      text={<p>Se anulará <strong>{reverse.description} ({money(reverse.amountCents)})</strong> con un movimiento contrario. El original queda en el historial; nada se borra.</p>}
      onConfirm={reason => action.run(path(`/billing/movements/${reverse.id}/reverse`), { reason }, 'Cargo anulado.')}/>}
  </div>;
}

function AdjustDialog({ account, overview, path, action, onClose }: { account: Account; overview: Overview; path: Scoped; action: FinanceAction; onClose: () => void }) {
  const concepts = latestConcepts(overview.concepts).filter(c => c.active);
  const [concept, setConcept] = useState(concepts[0]?.conceptId ?? ''), [adjustment, setAdjustment] = useState('0'), [month, setMonth] = useState(currentMonth());
  const base = concepts.find(c => c.conceptId === concept)?.baseCents;
  let preview = ''; try { if (base) preview = money(BigInt(base) + BigInt(toCents(adjustment || '0', true))); } catch { preview = ''; }
  return <ReasonDialog title={`Ajustar cuota · ${homeLabel(account)}`} confirm="Guardar ajuste" busy={action.busy} error={action.error} onClose={onClose} ready={!!concept}
    text={<p>Para una casa que paga distinto, por ejemplo un lote más grande. El ajuste se suma (o resta, con signo menos) a la cuota base desde el mes que elijas.</p>}
    onConfirm={async reason => { try { return await action.run(path('/billing/fees'), { accountId: account.id, conceptId: concept, adjustmentCents: toCents(adjustment, true), effectiveMonth: month, reason }, 'Ajuste guardado.'); } catch (e) { action.setError(errorText(e)); return false; } }}>
    <label>Concepto<select required value={concept} onChange={e => setConcept(e.target.value)}>{concepts.map(c => <option key={c.conceptId} value={c.conceptId}>{c.name} · base {money(c.baseCents)}</option>)}</select></label>
    <div className="fin-fields"><label>Ajuste en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={adjustment} onChange={e => setAdjustment(e.target.value)}/></div><small>Usa −100 para descontar.</small></label>
      <label>Desde el mes<input type="month" required value={month} min={currentMonth()} onChange={e => setMonth(e.target.value)}/></label></div>
    {preview && <p className="fin-preview">Cuota resultante: <strong>{preview}</strong></p>}
  </ReasonDialog>;
}

function Configuration({ canConfigure, canManage, canResolve, enabled, userId, settings, overview, grants, payments, path, action }: { canConfigure: boolean; canManage: boolean; canResolve: boolean; enabled: boolean; userId?: string; settings: Settings | null; overview?: Overview; grants?: Grants; payments?: AdminData; path: Scoped; action: FinanceAction }) {
  const [concept, setConcept] = useState<Concept | 'new' | null>(null), [archive, setArchive] = useState<Concept | null>(null), [toggle, setToggle] = useState<'billing' | 'emission' | null>(null);
  const [startMonth, setStartMonth] = useState(currentMonth()), [archiveMonth, setArchiveMonth] = useState(currentMonth());
  const [treasurer, setTreasurer] = useState(''), [operator, setOperator] = useState(''), [operatorDialog, setOperatorDialog] = useState<boolean | null>(null);
  const concepts = latestConcepts(overview?.concepts ?? []);
  return <div className="fin-stack">
    {canConfigure && <section className="panel fin-section"><div className="fin-section-head"><div><h3>Activación (Plataforma)</h3><p>Solo Plataforma activa la cobranza de un fraccionamiento y asigna tesoreros.</p></div>{settings?.enabled ? <span className="badge"><span/>Activa</span> : <span className="badge pending"><span/>Inactiva</span>}</div>
      <div className="fin-inline"><label>Primer mes de cobro<input type="month" value={settings?.startMonth ?? startMonth} min={currentMonth()} disabled={!!settings} onChange={e => setStartMonth(e.target.value)}/></label>
        <Button className={settings?.enabled ? 'secondary' : ''} disabled={action.busy} onClick={() => { action.clear(); setToggle('billing'); }}>{settings?.enabled ? 'Desactivar cobranza' : 'Activar cobranza'}</Button></div>
      {settings && <p className="small muted">El primer mes ({monthName(settings.startMonth)}) ya no se puede cambiar, para no duplicar ni perder cargos.</p>}
      <div className="fin-block"><h4>Tesorero</h4><p className="small muted">Un residente que maneja las finanzas sin ser administrador.</p>
        <div className="fin-inline"><select aria-label="Persona responsable de tesorería" value={treasurer} onChange={e => setTreasurer(e.target.value)}><option value="">Selecciona una persona</option>{grants?.users.filter(u => u.id !== userId).map(u => <option key={u.id} value={u.id}>{u.fullName}{u.active ? ' · tesorero activo' : ''}</option>)}</select>
          <Button className="small-button" disabled={action.busy || !treasurer} onClick={() => void action.run(path('/billing/grants'), { userId: treasurer, role: 'TREASURER', active: true, reason: 'Asignación de tesorería' }, 'Tesorero asignado.')}>Asignar</Button>
          <Button className="secondary small-button" disabled={action.busy || !treasurer} onClick={() => void action.run(path('/billing/grants'), { userId: treasurer, role: 'TREASURER', active: false, reason: 'Revocación de tesorería' }, 'Tesorero revocado.')}>Revocar</Button></div></div>
      <div className="fin-block"><h4>Soporte financiero</h4><p className="small muted">Permite que otra persona de Plataforma opere las finanzas de este fraccionamiento. Nadie se lo aprueba a sí mismo.</p>
        <div className="fin-inline"><select aria-label="Persona de plataforma" value={operator} onChange={e => setOperator(e.target.value)}><option value="">Selecciona a otra persona</option>{grants?.operators.filter(u => u.id !== userId).map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select>
          <Button className="small-button" disabled={action.busy || !operator} onClick={() => { action.clear(); setOperatorDialog(true); }}>Aprobar</Button>
          <Button className="secondary small-button" disabled={action.busy || !operator} onClick={() => { action.clear(); setOperatorDialog(false); }}>Revocar</Button></div></div>
    </section>}

    {canResolve && <StripeAccountCard data={payments} path={path} action={action} enabled={enabled}/>}

    {canManage && <section className="panel fin-section"><div className="fin-section-head"><div><h3>Emisión mensual</h3><p>{settings?.emissionEnabled ? 'Activa: el día 1 de cada mes se genera la cuota de cada casa. Si falta algún mes desde el primer mes de cobro, también se genera.' : 'Emisión pausada. Revisa los conceptos y los ajustes de cada casa antes de activarla.'}</p></div>
      {settings?.emissionEnabled ? <span className="badge"><span/>Activa</span> : <span className="badge expired"><span/>Pausada</span>}</div>
      <Button className={settings?.emissionEnabled ? 'secondary' : ''} disabled={action.busy} onClick={() => { action.clear(); setToggle('emission'); }}>{settings?.emissionEnabled ? 'Pausar emisión' : 'Activar emisión mensual'}</Button></section>}

    {canManage && <section className="panel fin-section"><div className="fin-section-head"><div><h3>Conceptos de cobro</h3><p>Lo que paga cada casa al mes. Un cambio se programa para un mes futuro y el historial se conserva.</p></div><Button className="small-button" onClick={() => { action.clear(); setConcept('new'); }}><Plus size={16}/> Nuevo concepto</Button></div>
      {!concepts.length ? <Empty icon={<Banknote/>} title="Sin conceptos todavía" text="Crea el primero, por ejemplo «Mantenimiento»."/> : <ul className="fin-rows">{concepts.map(c => <li key={c.id} className="fin-row fin-row-wrap">
        <div className="fin-row-main"><strong>{c.name}</strong><small>{CATEGORY[c.category] ?? c.category} · desde {monthName(c.effectiveMonth)}</small></div>
        <div className="fin-row-side"><strong className="fin-amount">{money(c.baseCents)}</strong>{c.active ? <span className="badge"><span/>Activo</span> : <span className="badge pending"><span/>Archivado</span>}
          <div className="fin-row-actions"><button type="button" className="fin-link" onClick={() => { action.clear(); setConcept(c); }}>Cambiar cuota</button>{c.active && <button type="button" className="fin-link" onClick={() => { action.clear(); setArchive(c); }}>Archivar</button>}</div></div></li>)}</ul>}
    </section>}

    {concept && <ConceptDialog concept={concept === 'new' ? null : concept} path={path} action={action} onClose={() => setConcept(null)}/>}
    {archive && <ReasonDialog title={`Archivar «${archive.name}»`} confirm="Archivar" danger busy={action.busy} error={action.error} onClose={() => setArchive(null)} text={<p>Deja de generarse desde el mes que elijas. Los cargos anteriores se conservan.</p>}
      onConfirm={reason => action.run(path('/billing/concepts'), { conceptId: archive.conceptId, name: archive.name, category: archive.category, baseCents: archive.baseCents, effectiveMonth: archiveMonth, active: false, reason }, 'Concepto archivado.')}>
      <label>Dejar de cobrar desde<input type="month" required value={archiveMonth} min={currentMonth()} onChange={e => setArchiveMonth(e.target.value)}/></label></ReasonDialog>}
    {toggle === 'billing' && <ReasonDialog title={settings?.enabled ? 'Desactivar cobranza' : 'Activar cobranza'} confirm={settings?.enabled ? 'Desactivar' : 'Activar'} danger={!!settings?.enabled} busy={action.busy} error={action.error} onClose={() => setToggle(null)}
      text={settings?.enabled ? <p>No se generarán cuotas ni pagos nuevos. Los pagos que ya iniciaron se terminan de registrar.</p> : <p>Se abre con saldo cero en todas las casas a partir de <strong>{monthName(settings?.startMonth ?? startMonth)}</strong>. La emisión mensual queda pausada hasta que la actives.</p>}
      onConfirm={reason => action.run(path('/billing/settings'), { enabled: !settings?.enabled, startMonth: settings?.startMonth ?? startMonth, reason }, settings?.enabled ? 'Cobranza desactivada.' : 'Cobranza activada.')}/>}
    {toggle === 'emission' && <ReasonDialog title={settings?.emissionEnabled ? 'Pausar emisión' : 'Activar emisión mensual'} confirm={settings?.emissionEnabled ? 'Pausar' : 'Activar'} busy={action.busy} error={action.error} onClose={() => setToggle(null)}
      text={settings?.emissionEnabled ? <p>Dejan de generarse las cuotas nuevas. Nada de lo emitido se borra.</p> : <p>En el próximo minuto se generarán las cuotas pendientes desde el primer mes de cobro, y después el día 1 de cada mes.</p>}
      onConfirm={reason => action.run(path('/billing/emission'), { emissionEnabled: !settings?.emissionEnabled, reason }, settings?.emissionEnabled ? 'Emisión pausada.' : 'Emisión activada.')}/>}
    {operatorDialog !== null && <ReasonDialog title={operatorDialog ? 'Aprobar soporte financiero' : 'Revocar soporte financiero'} confirm={operatorDialog ? 'Aprobar' : 'Revocar'} busy={action.busy} error={action.error} onClose={() => setOperatorDialog(null)}
      onConfirm={reason => action.run(path('/billing/grants'), { userId: operator, role: 'OPERATOR', active: operatorDialog, reason }, operatorDialog ? 'Soporte aprobado.' : 'Soporte revocado.')}/>}
  </div>;
}

function ConceptDialog({ concept, path, action, onClose }: { concept: Concept | null; path: Scoped; action: FinanceAction; onClose: () => void }) {
  const [name, setName] = useState(concept?.name ?? 'Mantenimiento'), [category, setCategory] = useState(concept?.category ?? 'MAINTENANCE'), [base, setBase] = useState(concept ? pesos(concept.baseCents) : ''), [month, setMonth] = useState(currentMonth()), [reason, setReason] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    try { if (await action.run(path('/billing/concepts'), { ...(concept ? { conceptId: concept.conceptId } : {}), name: name.trim(), category, baseCents: toCents(base), effectiveMonth: month, active: true, reason: reason.trim() }, concept ? 'Nueva cuota programada.' : 'Concepto creado.')) onClose(); }
    catch (err) { action.setError(errorText(err)); }
  }
  return <Modal title={concept ? `Cambiar cuota · ${concept.name}` : 'Nuevo concepto de cobro'} onClose={() => { if (!action.busy) onClose(); }}><form onSubmit={submit}><fieldset disabled={action.busy}>
    {concept && <Info>La cuota actual ({money(concept.baseCents)}) se conserva hasta el mes anterior al que elijas.</Info>}
    <div className="fin-fields"><label>Concepto<input required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label>
      <label>Tipo<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>
    <div className="fin-fields"><label>Cuota base en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={base} onChange={e => setBase(e.target.value)} placeholder="850.00"/></div><small>Lo que paga cada casa al mes.</small></label>
      <label>Vigente desde<input required type="month" value={month} min={currentMonth()} onChange={e => setMonth(e.target.value)}/><small>Un mes ya cobrado no se puede cambiar.</small></label></div>
    <label>Motivo del cambio<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Por ejemplo: aprobado en asamblea"/></label>
  </fieldset><ErrorBox message={action.error}/><div className="modal-actions"><Button className="secondary" disabled={action.busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={action.busy}>Guardar concepto</Button></div></form></Modal>;
}

export function Billing(props: { canConfigure?: boolean; userId?: string; communityId?: string }) {
  return <FinancialBoundary scope={`${props.userId}:${props.communityId}`}><BillingContent {...props}/></FinancialBoundary>;
}
