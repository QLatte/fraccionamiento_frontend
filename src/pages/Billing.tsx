import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Banknote, Check, ChevronRight, Home as HomeIcon, Landmark, Plus, Search, ShieldCheck } from 'lucide-react';
import { FinancialBoundary } from '../components/FinancialBoundary';
import { errorText } from '../api';
import { useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Info, Loading, Modal, Success } from '../components/ui';
import { ReasonDialog, Stat, TreasurySkeleton, currentMonth, money, monthName, pesos, toCents, useFinanceAction } from './financeUi';
import { PaymentList, Reconciliation, StripeAccountCard, reviewCount, scopedPath, useAdminPayments, type AdminData, type FinanceAction, type Scoped } from './Payments';
import './Billing.css';

// Tesorería: what each privada or lote owes the fraccionamiento (never what a home owes), the
// payments received and whatever needs review. Split in tabs so daily work stays in front and setup stays aside.

export const mxn = (cents: string) => money(cents);

type Concept = { id: string; conceptId: string; name: string; category: string; baseCents: string; effectiveMonth: string; active: boolean };
/** A home, only to name it and assign its titular: Tesorería never shows what a home owes. */
type Account = { id: string; propertyId: string; payerId: string | null; property?: { street: string; houseNumber: string; cluster?: { id: string; name: string; type: string }; memberships: { userId: string; user: { fullName: string } }[] } };
/** What one privada or lote owes the fraccionamiento. */
type PrivadaDebt = {
  clusterId: string; name: string; type: string; homes: number; billing: 'PRIVADA' | 'NONE' | 'HOMES';
  owedCents: string; overdueCents: string; creditCents: string; pendingCents: string; previousCents: string;
  currentDue: { homes: number; rateCents: string; amountCents: string } | null; withoutPayer: number;
};
type Fee = { accountId: string; conceptId: string; adjustmentCents: string; effectiveMonth: string };
type Overview = { accounts: Account[]; privadas: PrivadaDebt[]; privadaModel: boolean; concepts: Concept[]; fees: Fee[]; currentMonth: string };
type Settings = { enabled: boolean; emissionEnabled: boolean; startMonth: string };
type Access = { enabled: boolean; canManage: boolean; canResolve?: boolean; canConfigure: boolean };
type Grants = { operators: { id: string; fullName: string }[] };
type Tab = 'resumen' | 'privadas' | 'pagos' | 'conciliacion' | 'configuracion';

const CATEGORY: Record<string, string> = { MAINTENANCE: 'Mantenimiento', EXTRAORDINARY: 'Cuota extraordinaria', RESERVE: 'Fondo de reserva', FINE: 'Multa', OTHER: 'Otro' };
const homeLabel = (a?: Account) => a?.property ? `Casa ${a.property.houseNumber} · ${a.property.street}` : 'Casa';
/** Newest version of each concept. */
const latestConcepts = (concepts: Concept[]) => concepts.filter((c, i, all) => !all.slice(0, i).some(v => v.conceptId === c.conceptId));
const privadaName = (p: { name: string; type: string }) => p.type === 'PRIVADA' ? `Privada ${p.name}` : p.name;
const owes = (p: PrivadaDebt) => BigInt(p.owedCents) > 0n;

function BillingContent({ canConfigure = false, userId, communityId }: { canConfigure?: boolean; userId?: string; communityId?: string }) {
  const path = scopedPath(communityId);
  const access = useQuery<Access>(path('/billing/availability'));
  const a = access.data;
  const settings = useQuery<Settings | null>(a?.canManage || canConfigure ? path('/billing/settings') : null);
  const overview = useQuery<Overview>(a?.canManage ? path('/billing/overview') : null);
  const grants = useQuery<Grants>(canConfigure ? path('/billing/grants') : null);
  const payments = useAdminPayments(communityId, !!a?.canResolve);
  const action = useFinanceAction(() => { access.refresh(); settings.refresh(); overview.refresh(); grants.refresh(); payments.refresh(); });
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    ...(a?.canManage ? [{ id: 'resumen' as const, label: 'Resumen' }, { id: 'privadas' as const, label: 'Privadas' }] : []),
    ...(a?.canResolve ? [{ id: 'pagos' as const, label: 'Pagos' }, { id: 'conciliacion' as const, label: 'Pendientes', badge: reviewCount(payments.data) }] : []),
    ...(a?.canManage || canConfigure ? [{ id: 'configuracion' as const, label: 'Configuración' }] : []),
  ];
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab = tabs.some(t => t.id === chosen) ? chosen! : tabs[0]?.id;
  const homes = (overview.data?.accounts ?? []).map(acc => ({ id: acc.id, label: homeLabel(acc) }));
  const homeName = (id: string) => homes.find(h => h.id === id)?.label;

  if (access.loading && !a) return <TreasurySkeleton/>;
  if (!a?.canManage && !a?.canResolve && !canConfigure) return <section className="panel"><ErrorBox message={access.error}/><Empty icon={<ShieldCheck/>} title="Cobranza no disponible" text="La cobranza no está habilitada o no tienes permiso financiero."/></section>;
  return <div className="fin">
    <div className="fin-title"><div><h2>Tesorería</h2><p>Lo que cada privada y lote debe al fraccionamiento, y los pagos recibidos. Corte el día 1 · pago oportuno hasta el día 20 (hora de Ciudad de México).</p></div><span className="fin-flag"><ShieldCheck size={15}/> Stripe en modo de prueba</span></div>
    {tabs.length > 1 && <div className="fin-tabs" role="tablist" aria-label="Secciones de tesorería">{tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setChosen(t.id)}>{t.label}{!!t.badge && <span className="fin-tab-badge">{t.badge}</span>}</button>)}</div>}
    <ErrorBox message={access.error || overview.error || settings.error || grants.error || payments.error}/>
    {action.notice && <Success>{action.notice}</Success>}
    {tab === 'resumen' && (overview.data ? <Summary overview={overview.data} settings={settings.data ?? null} payments={payments.data} canResolve={!!a?.canResolve} path={path} action={action} homeName={homeName} onGo={setChosen}/> : <Loading variant="cards"/>)}
    {tab === 'privadas' && (overview.data ? <Privadas overview={overview.data} path={path} action={action}/> : <Loading rows={6}/>)}
    {tab === 'pagos' && (payments.data ? <section className="panel fin-section"><div className="fin-section-head"><div><h3>Pagos recibidos</h3><p>Los de tarjeta y SPEI llegan solos. Los depósitos de cada privada se confirman en Privadas, en el menú de Administración.</p></div></div><PaymentList payments={payments.data.payments} homeName={homeName} path={path} action={action} empty="Aún no hay pagos registrados."/></section> : <Loading/>)}
    {tab === 'conciliacion' && (payments.data ? <Reconciliation data={payments.data} path={path} action={action} homes={homes} onTaskCursor={payments.setTaskCursor} onEventCursor={payments.setEventCursor} onFirstPage={payments.firstPage} paged={payments.paged}/> : <Loading/>)}
    {tab === 'configuracion' && <Configuration canConfigure={canConfigure} canManage={!!a?.canManage} canResolve={!!a?.canResolve} enabled={!!a?.enabled} userId={userId} settings={settings.data ?? null} overview={overview.data} grants={grants.data} payments={payments.data} path={path} action={action}/>}
  </div>;
}

/** Totals by privada, what is missing to start charging, and what needs attention today. */
function Summary({ overview, settings, payments, canResolve, path, action, homeName, onGo }: { overview: Overview; settings: Settings | null; payments?: AdminData; canResolve: boolean; path: Scoped; action: FinanceAction; homeName: (id: string) => string | undefined; onGo: (tab: Tab) => void }) {
  const privadas = overview.privadas.filter(p => p.homes > 0);
  const sum = (key: 'owedCents' | 'overdueCents' | 'pendingCents' | 'creditCents') => privadas.reduce((s, p) => s + BigInt(p[key]), 0n);
  const owed = sum('owedCents'), overdue = sum('overdueCents'), pendingDeposits = sum('pendingCents'), credit = sum('creditCents');
  const current = privadas.filter(p => !owes(p)).length;
  const withoutPayer = overview.privadas.reduce((s, p) => s + p.withoutPayer, 0);
  const late = privadas.filter(p => BigInt(p.overdueCents) > 0n).sort((x, y) => (BigInt(y.overdueCents) > BigInt(x.overdueCents) ? 1 : -1)).slice(0, 5);
  const steps = [
    { done: !!settings?.enabled, title: 'Zentry activó la cobranza', text: 'La activa Plataforma para este fraccionamiento.', tab: 'configuracion' as Tab },
    ...(canResolve ? [{ done: !!payments?.destination, title: 'Cuenta de Stripe vinculada', text: 'Para recibir pagos con tarjeta y SPEI.', tab: 'configuracion' as Tab }] : []),
    ...(overview.privadaModel ? [] : [{ done: latestConcepts(overview.concepts).some(c => c.active), title: 'Conceptos de cobro creados', text: 'Por ejemplo: Mantenimiento, $850 al mes.', tab: 'configuracion' as Tab }]),
    { done: !withoutPayer, title: 'Titular asignado en cada casa', text: withoutPayer ? `Faltan ${withoutPayer} de ${overview.accounts.length}. Solo el titular ve el saldo de su casa y paga.` : 'Todas las casas tienen titular.', tab: 'privadas' as Tab },
    { done: !!settings?.emissionEnabled, title: 'Emisión mensual activada', text: 'Genera los cargos de cada mes el día 1.', tab: 'configuracion' as Tab },
  ];
  const pending = reviewCount(payments);
  return <div className="fin-stack">
    {pending > 0 && <div className="fin-callout bad"><AlertTriangle size={20}/><div><strong>{pending === 1 ? 'Un pago requiere revisión' : `${pending} pagos requieren revisión`}</strong><span>Cada uno explica el motivo y qué hacer.</span></div><Button className="secondary small-button" onClick={() => onGo('conciliacion')}>Ver pendientes</Button></div>}
    <section className="fin-stats" aria-label="Totales">
      <Stat label="Por cobrar" value={money(owed)} hint="Lo que deben las privadas y lotes" tone={owed > 0n ? 'accent' : ''}/>
      <Stat label="Vencido" value={money(overdue)} hint="No se pagó antes del día 21" tone={overdue > 0n ? 'bad' : ''}/>
      <Stat label="Privadas al corriente" value={`${current} de ${privadas.length}`} hint={privadas.length ? `${Math.round(current / privadas.length * 100)}% sin adeudo` : 'Sin privadas'} tone="good"/>
      {overview.privadaModel ? <Stat label="Depósitos por confirmar" value={money(pendingDeposits)} hint="Se confirman en Privadas"/> : <Stat label="Saldo a favor" value={money(credit)} hint="Se aplica solo a los próximos cargos"/>}
    </section>
    {steps.some(s => !s.done) && <section className="panel fin-section"><h3>Para empezar a cobrar</h3><ol className="fin-steps">{steps.map((s, i) => <li key={s.title} className={s.done ? 'done' : ''}>
      <span className="fin-step-mark" aria-hidden="true">{s.done ? <Check size={15}/> : i + 1}</span><div><strong>{s.title}</strong><small>{s.text}</small></div>
      {!s.done && s.title !== 'Zentry activó la cobranza' && <button type="button" className="fin-link" onClick={() => onGo(s.tab)}>Ir <ChevronRight size={15}/></button>}</li>)}</ol></section>}
    <div className="fin-two">
      <section className="panel fin-section"><h3>Privadas con adeudo vencido</h3>{!late.length ? <p className="muted">Ninguna privada tiene adeudo vencido.</p> :
        <ul className="fin-rows">{late.map(p => <li key={p.clusterId}><button type="button" className="fin-row fin-row-button" onClick={() => onGo('privadas')}><span className="fin-row-icon"><Landmark size={17}/></span><div className="fin-row-main"><strong>{privadaName(p)}</strong><small>{p.homes} {p.homes === 1 ? 'casa' : 'casas'}</small></div><div className="fin-row-side"><strong className="fin-amount bad">{money(p.overdueCents)}</strong><ChevronRight size={16}/></div></button></li>)}</ul>}</section>
      {canResolve && <section className="panel fin-section"><div className="fin-section-head"><h3>Últimos pagos</h3>{!!payments?.payments.length && <button type="button" className="fin-link" onClick={() => onGo('pagos')}>Ver todos <ChevronRight size={15}/></button>}</div>
        {payments ? <PaymentList payments={payments.payments.slice(0, 5)} homeName={homeName} path={path} action={action} empty="Aún no hay pagos."/> : <Loading/>}</section>}
    </div>
  </div>;
}

/**
 * Privadas: what each privada or lote owes the fraccionamiento, and nothing about what a home owes.
 * The homes appear only to assign their titular.
 */
function Privadas({ overview, path, action }: { overview: Overview; path: Scoped; action: FinanceAction }) {
  const byName = useMemo(() => new Intl.Collator('es', { numeric: true }), []);
  const [q, setQ] = useState(''), [titulares, setTitulares] = useState<PrivadaDebt | null>(null);
  const term = q.trim().toLowerCase();
  const list = overview.privadas.filter(p => !term || privadaName(p).toLowerCase().includes(term)).sort((x, y) => (owes(y) ? 1 : 0) - (owes(x) ? 1 : 0) || byName.compare(x.name, y.name));
  const how = (p: PrivadaDebt) => p.billing === 'PRIVADA' ? (p.currentDue ? `${p.currentDue.homes} ${p.currentDue.homes === 1 ? 'casa' : 'casas'} × ${money(p.currentDue.rateCents)} este mes` : `${p.homes} ${p.homes === 1 ? 'casa' : 'casas'} · cuota por casa`)
    : p.billing === 'HOMES' ? `${p.homes} ${p.homes === 1 ? 'casa' : 'casas'} · cobro directo a las casas` : `${p.homes} ${p.homes === 1 ? 'casa' : 'casas'} · cobro por privada sin activar`;
  return <section className="panel fin-section">
    <div className="fin-toolbar"><div><h3>Lo que debe cada privada al fraccionamiento</h3><p className="small muted">{overview.privadaModel ? 'Cada privada cobra a sus casas y deposita al fraccionamiento la cuota por casa.' : 'Suma de lo que deben las casas de cada privada o lote.'}</p></div>
      {overview.privadas.length > 6 && <label className="fin-search"><Search size={16}/><input aria-label="Buscar privada" placeholder="Privada o lote" value={q} onChange={e => setQ(e.target.value)}/></label>}</div>
    {!overview.privadas.length ? <Empty icon={<Landmark/>} title="Aún no hay privadas" text="Zentry carga las privadas y lotes del fraccionamiento."/> :
    !list.length ? <p className="muted">Ninguna privada coincide con «{q.trim()}».</p> :
    <div className="fin-groups">{list.map(p => { const owed = BigInt(p.owedCents), late = BigInt(p.overdueCents), pending = BigInt(p.pendingCents), credit = BigInt(p.creditCents);
      return <article key={p.clusterId} className="fin-group fin-group-static" aria-label={privadaName(p)}>
        <div className="fin-group-head"><span className="fin-row-icon"><Landmark size={17}/></span><div><strong>{privadaName(p)}</strong><small>{how(p)}</small></div>
          {owed > 0n ? late > 0n ? <span className="badge revoked"><span/>Vencido</span> : <span className="badge expired"><span/>Por pagar</span> : <span className="badge active"><span/>Al corriente</span>}</div>
        <dl className="fin-group-stats">
          <div><dt>Debe</dt><dd className={owed > 0n ? 'accent' : 'good'}>{money(owed)}</dd></div>
          <div><dt>Vencido</dt><dd className={late > 0n ? 'bad' : ''}>{money(late)}</dd></div>
          {pending > 0n || p.billing === 'PRIVADA' ? <div><dt>Por confirmar</dt><dd>{money(pending)}</dd></div> : <div><dt>A favor</dt><dd className={credit > 0n ? 'good' : ''}>{money(credit)}</dd></div>}
        </dl>
        {BigInt(p.previousCents) > 0n && <small className="fin-group-note">Incluye {money(p.previousCents)} de cuotas anteriores al cobro por privada.</small>}
        <button type="button" className="fin-link fin-group-link" onClick={() => { action.clear(); setTitulares(p); }}>Titulares de las casas{p.withoutPayer > 0 && <span className="fin-tab-badge" title="Casas sin titular">{p.withoutPayer}</span>}<ChevronRight size={15}/></button>
      </article>; })}</div>}
    {titulares && <Modal title={`Titulares · ${privadaName(titulares)}`} onClose={() => { if (!action.busy) setTitulares(null); }}>
      <p className="small muted">El titular es quien ve el saldo de su casa y paga desde su app. Aquí solo se asigna; Tesorería no muestra lo que debe cada casa.</p>
      <ErrorBox message={action.error}/>
      <ul className="fin-rows">{overview.accounts.filter(acc => acc.property?.cluster?.id === titulares.clusterId).sort((x, y) => byName.compare(x.property?.houseNumber ?? '', y.property?.houseNumber ?? '')).map(acc => <TitularRow key={acc.id} account={acc} path={path} action={action}/>)}</ul>
    </Modal>}
  </section>;
}

function TitularRow({ account, path, action }: { account: Account; path: Scoped; action: FinanceAction }) {
  const [payer, setPayer] = useState(account.payerId ?? '');
  const changed = payer !== (account.payerId ?? '');
  return <li className="fin-row fin-row-wrap"><span className="fin-row-icon"><HomeIcon size={17}/></span>
    <div className="fin-row-main"><strong>Casa {account.property?.houseNumber ?? ''}</strong>{!account.payerId && <small className="fin-note">Sin titular</small>}</div>
    <div className="fin-inline"><select aria-label={`Titular de la casa ${account.property?.houseNumber ?? ''}`} value={payer} disabled={action.busy} onChange={e => setPayer(e.target.value)}><option value="">Sin titular asignado</option>{account.property?.memberships.map(m => <option key={m.userId} value={m.userId}>{m.user.fullName}</option>)}</select>
      {changed && <Button className="small-button" busy={action.busy} onClick={() => void action.run(path(`/billing/accounts/${account.id}/payer`), { payerId: payer || null, reason: 'Actualización del titular financiero' }, 'Titular actualizado.')}>Guardar</Button>}</div></li>;
}

function Configuration({ canConfigure, canManage, canResolve, enabled, userId, settings, overview, grants, payments, path, action }: { canConfigure: boolean; canManage: boolean; canResolve: boolean; enabled: boolean; userId?: string; settings: Settings | null; overview?: Overview; grants?: Grants; payments?: AdminData; path: Scoped; action: FinanceAction }) {
  const [concept, setConcept] = useState<Concept | 'new' | null>(null), [archive, setArchive] = useState<Concept | null>(null), [toggle, setToggle] = useState<'billing' | 'emission' | null>(null);
  const [startMonth, setStartMonth] = useState(currentMonth()), [archiveMonth, setArchiveMonth] = useState(currentMonth());
  const [operator, setOperator] = useState(''), [operatorDialog, setOperatorDialog] = useState<boolean | null>(null);
  const concepts = latestConcepts(overview?.concepts ?? []);
  return <div className="fin-stack">
    {canConfigure && <section className="panel fin-section"><div className="fin-section-head"><div><h3>Activación (Plataforma)</h3><p>Solo Plataforma activa la cobranza de un fraccionamiento. Las finanzas las ve y opera la administración del fraccionamiento.</p></div>{settings?.enabled ? <span className="badge"><span/>Activa</span> : <span className="badge pending"><span/>Inactiva</span>}</div>
      <div className="fin-inline"><label>Primer mes de cobro<input type="month" value={settings?.startMonth ?? startMonth} min={currentMonth()} disabled={!!settings} onChange={e => setStartMonth(e.target.value)}/></label>
        <Button className={settings?.enabled ? 'secondary' : ''} disabled={action.busy} onClick={() => { action.clear(); setToggle('billing'); }}>{settings?.enabled ? 'Desactivar cobranza' : 'Activar cobranza'}</Button></div>
      {settings && <p className="small muted">El primer mes ({monthName(settings.startMonth)}) ya no se puede cambiar, para no duplicar ni perder cargos.</p>}
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
