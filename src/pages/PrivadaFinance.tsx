import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Banknote, Check, ChevronRight, FileText, Gavel, Home as HomeIcon, Landmark, Plus, Receipt, Search, Wallet } from 'lucide-react';
import { apiFile, errorText } from '../api';
import { compressPhoto } from '../chat';
import { useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Info, Loading, Modal, Success } from '../components/ui';
import { METHOD, ReasonDialog, Stat, TreasurySkeleton, currentMonth, dateTimeText, dayText, lastPayDay, money, monthName, pesos, toCents, useFinanceAction, useWide } from './financeUi';
import './Billing.css';
import './PrivadaFinance.css';
import { OnlinePayments, type Online } from './PrivadaOnline';

// Mi privada: the finances a privada's administrator runs. The homes pay the privada (its own
// maintenance), the administrator pays the privada's expenses and deposits to the fraccionamiento
// what it owes per home each month. Same building blocks as Tesorería.

type Concept = { id: string; conceptId: string; name: string; category: string; baseCents: string; effectiveMonth: string; active: boolean };
type Fee = { accountId: string; conceptId: string; adjustmentCents: string; effectiveMonth: string };
type HomeRow = { accountId: string; propertyId: string; home: string; houseNumber: string; active: boolean; payer: string | null; balanceCents: string; debtCents: string; overdueCents: string; creditCents: string };
type Due = { id: string; period: string; homes: number; rateCents: string; amountCents: string };
type Deposit = { id: string; amountCents: string; depositedAt: string; reference: string; status: 'PENDING' | 'CONFIRMED' | 'REJECTED'; reviewedAt: string | null; reviewReason: string | null; createdAt: string };
type Expense = { id: string; spentAt: string; category: string; description: string; amountCents: string; receipt: { mime: string; size: number } | null; voided: boolean; voidReason: string | null };
type ChargeCategory = 'FINE' | 'SURCHARGE' | 'EXTRAORDINARY' | 'ORDINARY' | 'AMENITIES' | 'OTHER';
type Charge = { id: string; batchId: string; accountId: string; houseNumber: string; payer: string | null; category: ChargeCategory; concept: string; amountCents: string; remainingCents: string; dueAt: string | null; status: 'PENDING' | 'OVERDUE' | 'PAID' | 'CANCELLED'; note: string; createdAt: string };
export type PrivadaSummary = {
  privada: { id: string; name: string; type: string }; role: 'ADMIN' | 'REPRESENTATIVE'; model: boolean; enabled: boolean; startMonth: string | null; configured: boolean; representatives: { userId: string; name: string }[]; currentMonth: string;
  cash: { collectedCents: string; spentCents: string; depositedCents: string; pendingDepositsCents: string; balanceCents: string; receivableCents: string };
  fraccionamiento: { owedCents: string; paidCents: string; pendingCents: string; balanceCents: string };
  concepts: Concept[]; fees: Fee[]; homes: HomeRow[]; dues: Due[]; deposits: Deposit[]; expenses: Expense[];
  /** Recargos y multas, and whether this viewer (the privada's own administrator) may apply them. */
  charges?: Charge[]; canCharge?: boolean;
  online?: Online;
  /** The viewer is this privada's administrator (resident profile): they fill in Stripe's form. */
  canOnboard?: boolean;
};
type Movement = { id: string; description: string; amountCents: string; effectiveAt: string; dueAt: string | null; kind: string; reversesId: string | null; reason: string; period: string | null };
type Statement = { balanceCents: string; overdueCents: string; movements: Movement[] };
type Tab = 'resumen' | 'casas' | 'cuotas' | 'recargos' | 'gastos' | 'depositos';
type Action = ReturnType<typeof useFinanceAction>;

const CATEGORY: Record<string, string> = { MAINTENANCE: 'Mantenimiento', EXTRAORDINARY: 'Cuota extraordinaria', RESERVE: 'Fondo de reserva', FINE: 'Multa', OTHER: 'Otro' };
export const EXPENSE: Record<string, string> = { AMENITIES: 'Amenidades', MAINTENANCE: 'Mantenimiento', SECURITY: 'Vigilancia', UTILITIES: 'Servicios (luz, agua)', CLEANING: 'Limpieza y jardinería', OTHER: 'Otro' };
export const CHARGE: Record<ChargeCategory, { label: string; placeholder: string }> = {
  FINE: { label: 'Multa', placeholder: 'Por ejemplo: ruido después de las 11 p. m.' },
  SURCHARGE: { label: 'Recargo', placeholder: 'Por ejemplo: pago tardío de octubre' },
  EXTRAORDINARY: { label: 'Cuota extraordinaria', placeholder: 'Por ejemplo: pintura de la barda' },
  ORDINARY: { label: 'Cuota ordinaria', placeholder: 'Por ejemplo: diferencia de mantenimiento' },
  AMENITIES: { label: 'Amenidades', placeholder: 'Por ejemplo: renta de la palapa' },
  OTHER: { label: 'Otros', placeholder: 'Escribe el concepto' },
};
const CHARGE_STATUS: Record<Charge['status'], { label: string; badge: string }> = { PENDING: { label: 'Por pagar', badge: 'expired' }, OVERDUE: { label: 'Vencido', badge: 'revoked' }, PAID: { label: 'Pagado', badge: 'active' }, CANCELLED: { label: 'Cancelado', badge: 'pending' } };
const DEPOSIT: Record<Deposit['status'], { label: string; badge: string }> = { PENDING: { label: 'Por confirmar', badge: 'expired' }, CONFIRMED: { label: 'Confirmado', badge: 'active' }, REJECTED: { label: 'Rechazado', badge: 'revoked' } };
const latest = (concepts: Concept[]) => concepts.filter((c, i, all) => !all.slice(0, i).some(v => v.conceptId === c.conceptId));
const inForce = (concepts: Concept[], month: string) => concepts.filter((c, i, all) => c.effectiveMonth <= month && !all.slice(0, i).some(v => v.conceptId === c.conceptId && v.effectiveMonth <= month));
const homeTitle = (h: HomeRow) => `Casa ${h.houseNumber}`;
/** The ledger names payments by method code («Pago CASH»); people read «Pago en efectivo». */
const movementName = (description: string) => description.replace(/^Pago (CARD|SPEI|CASH|TRANSFER)/, (_m, method: string) => `Pago · ${METHOD[method] ?? method}`);
/** A date input (YYYY-MM-DD) as an instant: today means now (never «in the future»), past days at noon. */
function dayInstant(day: string) {
  const today = new Date().toLocaleDateString('en-CA');
  return day === today ? new Date().toISOString() : new Date(`${day}T12:00:00`).toISOString();
}
const todayInput = () => new Date().toLocaleDateString('en-CA');
const inDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toLocaleDateString('en-CA'); };
async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** The privada page. `privadas` are the ones this person administers (usually one). */
export function PrivadaFinance({ privadas }: { privadas: { clusterId: string; name: string }[] }) {
  const [clusterId, setClusterId] = useState(privadas[0]?.clusterId ?? '');
  if (!privadas.length) return <section className="panel"><Empty icon={<Landmark/>} title="No administras ninguna privada" text="La administración del fraccionamiento asigna al administrador de cada privada."/></section>;
  return <>
    {privadas.length > 1 && <label className="pf-switch">Privada<select value={clusterId} onChange={e => setClusterId(e.target.value)}>{privadas.map(p => <option key={p.clusterId} value={p.clusterId}>{p.name}</option>)}</select></label>}
    <PrivadaContent key={clusterId} clusterId={clusterId}/>
  </>;
}

export function PrivadaContent({ clusterId }: { clusterId: string }) {
  const summary = useQuery<PrivadaSummary>(`/privadas/${clusterId}`);
  const [selected, setSelected] = useState('');
  const statement = useQuery<Statement>(selected ? `/privadas/${clusterId}/accounts/${selected}/statement` : null);
  const action = useFinanceAction(() => { summary.refresh(); statement.refresh(); });
  const [tab, setTab] = useState<Tab>('resumen');
  const s = summary.data;
  if (summary.loading && !s) return <TreasurySkeleton/>;
  if (!s) return <section className="panel"><ErrorBox message={summary.error} retry={summary.refresh}/></section>;
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'resumen', label: 'Resumen' }, { id: 'casas', label: 'Casas' }, { id: 'cuotas', label: 'Cuotas' },
    { id: 'recargos', label: 'Recargos y multas', badge: (s.charges ?? []).filter(c => c.status === 'OVERDUE').length || undefined }, { id: 'gastos', label: 'Gastos' },
    { id: 'depositos', label: 'Depósitos', badge: s.deposits.filter(d => d.status === 'PENDING').length || undefined },
  ];
  const go = (t: Tab) => { action.clear(); setTab(t); };
  return <div className="fin pf">
    <div className="fin-title"><div><h2>{s.privada.type === 'PRIVADA' ? 'Privada ' : ''}{s.privada.name}</h2><p>Lo que pagan las casas a la privada, sus gastos y lo que deposita al fraccionamiento.</p></div>
      <span className={'fin-flag' + (s.configured ? '' : ' warn')}>{s.configured ? <><Check size={15}/> Cobro activo desde {s.startMonth ? monthName(s.startMonth) : '—'}</> : <><AlertTriangle size={15}/> Cobro sin activar</>}</span></div>
    <div className="fin-tabs" role="tablist" aria-label="Secciones de la privada">{tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)}>{t.label}{t.badge ? <span className="fin-tab-badge">{t.badge}</span> : null}</button>)}</div>
    <ErrorBox message={summary.error}/>
    {action.notice && <Success>{action.notice}</Success>}
    {tab === 'resumen' && <Overview s={s} clusterId={clusterId} action={action} onChanged={summary.refresh} onGo={go} onOpenHome={id => { setSelected(id); go('casas'); }}/>}
    {tab === 'casas' && <Homes s={s} clusterId={clusterId} selected={selected} onSelect={setSelected} statement={statement} action={action}/>}
    {tab === 'cuotas' && <Concepts s={s} clusterId={clusterId} action={action}/>}
    {tab === 'recargos' && <Charges s={s} clusterId={clusterId} action={action}/>}
    {tab === 'gastos' && <Expenses s={s} clusterId={clusterId} action={action}/>}
    {tab === 'depositos' && <Deposits s={s} clusterId={clusterId} action={action}/>}
  </div>;
}

/** The cash box, what the privada owes the fraccionamiento, and what needs attention. */
function Overview({ s, clusterId, action, onChanged, onGo, onOpenHome }: { s: PrivadaSummary; clusterId: string; action: Action; onChanged: () => void; onGo: (t: Tab) => void; onOpenHome: (accountId: string) => void }) {
  const late = s.homes.filter(h => BigInt(h.overdueCents) > 0n).sort((a, b) => (BigInt(b.overdueCents) > BigInt(a.overdueCents) ? 1 : -1)).slice(0, 5);
  const current = s.homes.filter(h => BigInt(h.debtCents) === 0n).length;
  const owed = BigInt(s.fraccionamiento.balanceCents);
  const missing = [
    !s.model && 'La administración aún no activa el cobro por privada en el fraccionamiento.',
    !s.enabled && 'La administración aún no activa las finanzas de esta privada.',
    !s.representatives.length && 'La privada no tiene administrador asignado.',
    s.configured && !latest(s.concepts).some(c => c.active) && 'Aún no hay cuotas: crea la cuota de mantenimiento en Cuotas.',
  ].filter(Boolean) as string[];
  return <div className="fin-stack">
    {missing.length > 0 && <div className="fin-callout"><AlertTriangle size={20}/><div><strong>{s.configured ? 'Falta un paso para cobrar' : 'El cobro de la privada aún no empieza'}</strong>{missing.map(m => <span key={m}>{m}</span>)}</div>{s.configured && <Button className="small-button" onClick={() => onGo('cuotas')}>Ir a Cuotas</Button>}</div>}
    {s.model && s.enabled && s.online && <OnlinePayments clusterId={clusterId} online={s.online} admin={!s.canOnboard} action={action} onChanged={onChanged}/>}
    <section className="pf-cash" aria-label="Caja de la privada">
      <div><span>Caja de la privada</span><strong>{money(s.cash.balanceCents)}</strong><small>Cobrado menos gastos y depósitos al fraccionamiento</small></div>
      <ul>
        <li><span>Cobrado a las casas</span><strong>{money(s.cash.collectedCents)}</strong></li>
        <li><span>Gastos</span><strong>−{money(s.cash.spentCents)}</strong></li>
        <li><span>Depositado al fraccionamiento</span><strong>−{money(BigInt(s.cash.depositedCents) + BigInt(s.cash.pendingDepositsCents))}</strong></li>
      </ul>
    </section>
    <section className="fin-stats" aria-label="Totales">
      <Stat label="Por cobrar" value={money(s.cash.receivableCents)} hint="Lo que deben las casas hoy" tone={BigInt(s.cash.receivableCents) > 0n ? 'accent' : ''}/>
      <Stat label="Casas al corriente" value={`${current} de ${s.homes.length}`} hint={s.homes.length ? `${Math.round(current / s.homes.length * 100)}% sin adeudo` : 'Sin casas todavía'} tone="good"/>
      <Stat label={s.role === 'ADMIN' ? 'Debe al fraccionamiento' : 'Debes al fraccionamiento'} value={money(owed > 0n ? owed : 0n)} hint={BigInt(s.fraccionamiento.pendingCents) > 0n ? `${money(s.fraccionamiento.pendingCents)} por confirmar` : 'Cuota por casa de cada mes'} tone={owed > 0n ? 'warn' : 'good'}/>
    </section>
    <div className="fin-two">
      <section className="panel fin-section"><h3>Casas con adeudo vencido</h3>{!late.length ? <p className="muted">Ninguna casa tiene cuotas vencidas.</p> :
        <ul className="fin-rows">{late.map(h => <li key={h.accountId}><button type="button" className="fin-row fin-row-button" onClick={() => onOpenHome(h.accountId)}><div className="fin-row-main"><strong>{homeTitle(h)}</strong><small>{h.payer ?? 'Sin titular'}</small></div><strong className="fin-amount bad">{money(h.overdueCents)}</strong><ChevronRight size={16}/></button></li>)}</ul>}</section>
      <section className="panel fin-section"><div className="fin-section-head"><h3>Últimos gastos</h3><button type="button" className="fin-link" onClick={() => onGo('gastos')}>Ver todos <ChevronRight size={15}/></button></div>
        {!s.expenses.filter(e => !e.voided).length ? <p className="muted">Aún no hay gastos registrados.</p> : <ul className="fin-rows">{s.expenses.filter(e => !e.voided).slice(0, 4).map(e => <li key={e.id} className="fin-row"><div className="fin-row-main"><strong>{e.description}</strong><small>{EXPENSE[e.category] ?? e.category} · {dayText(e.spentAt)}</small></div><strong className="fin-amount">{money(e.amountCents)}</strong></li>)}</ul>}</section>
    </div>
  </div>;
}

type Filter = 'all' | 'owe' | 'late' | 'ok';
const FILTERS: { id: Filter; label: string; test: (h: HomeRow) => boolean }[] = [
  { id: 'all', label: 'Todas', test: () => true },
  { id: 'owe', label: 'Con adeudo', test: h => BigInt(h.debtCents) > 0n },
  { id: 'late', label: 'Vencidas', test: h => BigInt(h.overdueCents) > 0n },
  { id: 'ok', label: 'Al corriente', test: h => BigInt(h.debtCents) === 0n },
];

/** Each home's account with the privada: balance, statement, and registering a payment. */
function Homes({ s, clusterId, selected, onSelect, statement, action }: { s: PrivadaSummary; clusterId: string; selected: string; onSelect: (id: string) => void; statement: ReturnType<typeof useQuery<Statement>>; action: Action }) {
  const [q, setQ] = useState(''), [filter, setFilter] = useState<Filter>('all');
  const wide = useWide();
  const byNumber = useMemo(() => new Intl.Collator('es', { numeric: true }), []);
  const term = q.trim().toLowerCase();
  const list = s.homes.filter(FILTERS.find(f => f.id === filter)!.test).filter(h => !term || homeTitle(h).toLowerCase().includes(term) || (h.payer ?? '').toLowerCase().includes(term)).sort((a, b) => byNumber.compare(a.houseNumber, b.houseNumber));
  const current = s.homes.find(h => h.accountId === selected);
  const detail = current && <HomeDetail key={current.accountId} home={current} s={s} clusterId={clusterId} statement={statement} action={action}/>;
  if (!s.homes.length) return <section className="panel"><Empty icon={<HomeIcon/>} title="Aún no hay casas con cuenta" text={s.configured ? 'Las cuentas de las casas se abren solas; vuelve a cargar en un momento.' : 'Las cuentas se abren cuando la administración activa el cobro de la privada y tiene administrador.'}/></section>;
  return <section className="panel fin-section">
    <div className="fin-toolbar"><h3>Casas</h3><label className="fin-search"><Search size={16}/><input aria-label="Buscar casa o titular" placeholder="Casa o titular" value={q} onChange={e => setQ(e.target.value)}/></label></div>
    <div className="fin-chips" role="group" aria-label="Filtrar casas">{FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label} <span>{s.homes.filter(f.test).length}</span></button>)}</div>
    <div className="fin-split">
      <ul className="fin-rows fin-list">{!list.length ? <li><p className="muted">Ninguna casa con este filtro.</p></li> : list.map(h => { const debt = BigInt(h.debtCents), late = BigInt(h.overdueCents) > 0n, credit = BigInt(h.creditCents);
        return <li key={h.accountId}><button type="button" className={`fin-row fin-row-button${h.accountId === selected ? ' selected' : ''}`} aria-pressed={h.accountId === selected} onClick={() => onSelect(h.accountId)}>
          <span className="fin-row-icon"><HomeIcon size={17}/></span>
          <div className="fin-row-main"><strong>{homeTitle(h)}</strong><small>{h.payer ?? <span className="fin-note">Sin titular</span>}</small></div>
          <div className="fin-row-side"><strong className={`fin-amount ${late ? 'bad' : debt === 0n && credit > 0n ? 'good' : ''}`}>{debt === 0n && credit > 0n ? `A favor ${money(credit)}` : money(debt)}</strong>{late ? <span className="badge revoked"><span/>Vencido {money(h.overdueCents)}</span> : debt === 0n ? <span className="badge active"><span/>Al corriente</span> : <span className="badge expired"><span/>Por pagar</span>}</div>
        </button></li>; })}</ul>
      {wide && <aside className="fin-detail" aria-label="Detalle de la casa">{detail ?? <Empty icon={<HomeIcon/>} title="Elige una casa" text="Verás su estado de cuenta con la privada y podrás registrar un pago."/>}</aside>}
    </div>
    {!wide && current && <Modal title={homeTitle(current)} onClose={() => onSelect('')}>{detail}</Modal>}
  </section>;
}

function HomeDetail({ home, s, clusterId, statement, action }: { home: HomeRow; s: PrivadaSummary; clusterId: string; statement: ReturnType<typeof useQuery<Statement>>; action: Action }) {
  const [pay, setPay] = useState(false), [adjust, setAdjust] = useState(false), [charge, setCharge] = useState(false);
  const month = currentMonth();
  const st = statement.data;
  const reversed = new Set((st?.movements ?? []).map(m => m.reversesId).filter(Boolean));
  const movements = [...(st?.movements ?? [])].sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt));
  const fees = inForce(s.concepts, month).filter(c => c.active).map(c => { const fee = s.fees.find(f => f.accountId === home.accountId && f.conceptId === c.conceptId && f.effectiveMonth <= month); return { concept: c, adjustment: fee?.adjustmentCents ?? '0' }; });
  return <div className="fin-stack">
    <div className="fin-detail-head"><div><h3>{homeTitle(home)}</h3><p>{home.payer ? `Titular: ${home.payer}` : 'Sin titular financiero'}</p></div></div>
    <div className="fin-stats compact">
      <Stat label="Debe a la privada" value={money(home.debtCents)} tone={BigInt(home.debtCents) > 0n ? 'accent' : 'good'}/>
      <Stat label="Vencido" value={money(home.overdueCents)} tone={BigInt(home.overdueCents) > 0n ? 'bad' : ''}/>
    </div>
    <Button onClick={() => { action.clear(); setPay(true); }}><Banknote size={17}/> Registrar pago en efectivo o transferencia</Button>
    {s.canCharge && s.configured && <Button className="secondary" onClick={() => { action.clear(); setCharge(true); }}><Gavel size={17}/> Aplicar recargo o multa</Button>}

    <div className="fin-block"><div className="fin-section-head"><h4>Cuota de {monthName(month)}</h4>{fees.length > 0 && <button type="button" className="fin-link" onClick={() => { action.clear(); setAdjust(true); }}>Ajustar para esta casa</button>}</div>
      {!fees.length ? <p className="small muted">Aún no hay cuotas en la privada. Créalas en Cuotas.</p> : <ul className="fin-plain">{fees.map(f => { const total = BigInt(f.concept.baseCents) + BigInt(f.adjustment);
        return <li key={f.concept.id}><span>{f.concept.name}</span><strong>{money(total)}</strong>{f.adjustment !== '0' && <small>Base {money(f.concept.baseCents)} {BigInt(f.adjustment) > 0n ? '+' : '−'} ajuste {money(BigInt(f.adjustment) < 0n ? -BigInt(f.adjustment) : BigInt(f.adjustment))}</small>}</li>; })}</ul>}</div>

    <div className="fin-block"><h4>Estado de cuenta con la privada</h4><ErrorBox message={statement.error}/>
      {statement.loading && !st ? <Loading/> : !movements.length ? <p className="small muted">Sin movimientos todavía. La cuenta empezó en cero.</p> :
        <ul className="fin-rows">{movements.map(m => { const amount = BigInt(m.amountCents), cancelled = reversed.has(m.id);
          return <li key={m.id} className="fin-row fin-row-wrap"><div className="fin-row-main"><strong className={cancelled ? 'fin-struck' : ''}>{movementName(m.description)}</strong>
            <small>{m.period ? monthName(m.period) : dateTimeText(m.effectiveAt)}{m.kind === 'CHARGE' && m.dueAt && !cancelled ? ` · fecha límite ${lastPayDay(m.dueAt)}` : ''}{cancelled ? ' · anulado' : ''}</small><small className="muted">{m.reason}</small></div>
            <div className="fin-row-side"><strong className={`fin-amount ${amount < 0n ? 'good' : ''}`}>{amount < 0n ? `−${money(-amount)}` : money(amount)}</strong></div></li>; })}</ul>}</div>

    {pay && <PaymentDialog home={home} clusterId={clusterId} action={action} onClose={() => setPay(false)}/>}
    {adjust && <AdjustDialog home={home} s={s} clusterId={clusterId} action={action} onClose={() => setAdjust(false)}/>}
    {charge && <ChargeDialog s={s} clusterId={clusterId} action={action} initial={[home.accountId]} onClose={() => setCharge(false)}/>}
  </div>;
}

/** A payment the home made outside the app: cash in hand, or a transfer to the privada's account. */
function PaymentDialog({ home, clusterId, action, onClose }: { home: HomeRow; clusterId: string; action: Action; onClose: () => void }) {
  const [amount, setAmount] = useState(BigInt(home.debtCents) > 0n ? pesos(home.debtCents) : ''), [method, setMethod] = useState<'CASH' | 'TRANSFER'>('CASH'), [reference, setReference] = useState(''), [day, setDay] = useState(todayInput());
  return <ReasonDialog title={`Registrar pago · ${homeTitle(home)}`} confirm="Registrar pago" busy={action.busy} error={action.error} onClose={onClose} ready={!!amount && reference.trim().length >= 3}
    placeholder="Por ejemplo: me lo entregó en mano el vecino"
    text={<p>Se aplica a las cuotas más antiguas de la casa. Lo que sobre queda como saldo a favor.</p>}
    onConfirm={async reason => { try { return await action.run(`/privadas/${clusterId}/accounts/${home.accountId}/payments`, { amountCents: toCents(amount), method, reference: reference.trim(), effectiveAt: dayInstant(day), reason }, 'Pago registrado.'); } catch (e) { action.setError(errorText(e)); return false; } }}>
    <div className="fin-fields">
      <label>Importe en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"/></div></label>
      <label>Forma de pago<select value={method} onChange={e => setMethod(e.target.value as 'CASH' | 'TRANSFER')}><option value="CASH">{METHOD.CASH}</option><option value="TRANSFER">{METHOD.TRANSFER}</option></select></label>
    </div>
    <div className="fin-fields">
      <label>Folio o referencia<input required minLength={3} maxLength={100} value={reference} onChange={e => setReference(e.target.value)} placeholder={method === 'CASH' ? 'Número de recibo' : 'Clave de rastreo'}/></label>
      <label>Fecha del pago<input type="date" required value={day} max={todayInput()} onChange={e => setDay(e.target.value)}/></label>
    </div>
  </ReasonDialog>;
}

function AdjustDialog({ home, s, clusterId, action, onClose }: { home: HomeRow; s: PrivadaSummary; clusterId: string; action: Action; onClose: () => void }) {
  const concepts = latest(s.concepts).filter(c => c.active);
  const [concept, setConcept] = useState(concepts[0]?.conceptId ?? ''), [adjustment, setAdjustment] = useState('0'), [month, setMonth] = useState(currentMonth());
  const base = concepts.find(c => c.conceptId === concept)?.baseCents;
  let preview = ''; try { if (base) preview = money(BigInt(base) + BigInt(toCents(adjustment || '0', true))); } catch { preview = ''; }
  return <ReasonDialog title={`Ajustar cuota · ${homeTitle(home)}`} confirm="Guardar ajuste" busy={action.busy} error={action.error} onClose={onClose} ready={!!concept}
    text={<p>Para una casa que paga distinto (un lote más grande, un descuento acordado). Se suma o resta a la cuota desde el mes que elijas.</p>}
    onConfirm={async reason => { try { return await action.run(`/privadas/${clusterId}/fees`, { accountId: home.accountId, conceptId: concept, adjustmentCents: toCents(adjustment, true), effectiveMonth: month, reason }, 'Ajuste guardado.'); } catch (e) { action.setError(errorText(e)); return false; } }}>
    <label>Cuota<select required value={concept} onChange={e => setConcept(e.target.value)}>{concepts.map(c => <option key={c.conceptId} value={c.conceptId}>{c.name} · {money(c.baseCents)}</option>)}</select></label>
    <div className="fin-fields"><label>Ajuste en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={adjustment} onChange={e => setAdjustment(e.target.value)}/></div><small>Usa −100 para descontar.</small></label>
      <label>Desde el mes<input type="month" required value={month} min={currentMonth()} onChange={e => setMonth(e.target.value)}/></label></div>
    {preview && <p className="fin-preview">Cuota resultante: <strong>{preview}</strong></p>}
  </ReasonDialog>;
}

/** The privada's own charges: its maintenance and any extra (one-time or monthly). */
function Concepts({ s, clusterId, action }: { s: PrivadaSummary; clusterId: string; action: Action }) {
  const [editing, setEditing] = useState<Concept | 'new' | null>(null), [ending, setEnding] = useState<Concept | null>(null);
  const month = currentMonth();
  const current = latest(s.concepts);
  return <section className="panel fin-section">
    <div className="fin-section-head"><div><h3>Cuotas de la privada</h3><p>Lo que paga cada casa a la privada cada mes. Un cambio aplica desde el mes que elijas; los meses ya cobrados no cambian.</p></div>
      {s.configured && <Button onClick={() => { action.clear(); setEditing('new'); }}><Plus size={17}/> Nueva cuota</Button>}</div>
    {!s.configured && <Info>Podrás crear cuotas cuando la administración active el cobro de la privada.</Info>}
    {!current.length ? <Empty icon={<Wallet/>} title="Aún no hay cuotas" text="Empieza con la cuota de mantenimiento: lo que cuesta mantener la privada entre todas sus casas."/> :
      <ul className="fin-rows">{current.map(c => { const scheduled = c.effectiveMonth > month, history = s.concepts.filter(v => v.conceptId === c.conceptId);
        return <li key={c.conceptId} className="fin-row fin-row-wrap"><span className="fin-row-icon"><Receipt size={17}/></span>
          <div className="fin-row-main"><strong className={c.active ? '' : 'fin-struck'}>{c.name}</strong><small>{CATEGORY[c.category] ?? c.category} · {c.active ? (scheduled ? `desde ${monthName(c.effectiveMonth)}` : `vigente desde ${monthName(c.effectiveMonth)}`) : `termina en ${monthName(c.effectiveMonth)}`}{history.length > 1 ? ` · ${history.length} versiones` : ''}</small></div>
          <div className="fin-row-side"><strong className="fin-amount">{money(c.baseCents)}</strong>
            {c.active && s.configured && <div className="fin-row-actions"><button type="button" className="fin-link" onClick={() => { action.clear(); setEditing(c); }}>Cambiar monto</button><button type="button" className="fin-link danger-text" onClick={() => { action.clear(); setEnding(c); }}>Dejar de cobrar</button></div>}</div></li>; })}</ul>}
    {editing && <ConceptDialog concept={editing === 'new' ? null : editing} clusterId={clusterId} action={action} onClose={() => setEditing(null)}/>}
    {ending && <EndDialog concept={ending} clusterId={clusterId} action={action} onClose={() => setEnding(null)}/>}
  </section>;
}

function ConceptDialog({ concept, clusterId, action, onClose }: { concept: Concept | null; clusterId: string; action: Action; onClose: () => void }) {
  const next = currentMonth();
  const [name, setName] = useState(concept?.name ?? 'Mantenimiento'), [category, setCategory] = useState(concept?.category ?? 'MAINTENANCE'), [amount, setAmount] = useState(concept ? pesos(concept.baseCents) : ''), [month, setMonth] = useState(next);
  return <ReasonDialog title={concept ? `Cambiar monto · ${concept.name}` : 'Nueva cuota'} confirm={concept ? 'Guardar cambio' : 'Crear cuota'} busy={action.busy} error={action.error} onClose={onClose} ready={!!amount && name.trim().length >= 2}
    placeholder="Por ejemplo: acuerdo de la junta de vecinos"
    text={<p>{concept ? 'El nuevo monto se cobra desde el mes que elijas. Los meses anteriores conservan el monto de entonces.' : 'Se cobra a cada casa de la privada el día 1 de cada mes, desde el mes que elijas.'}</p>}
    onConfirm={async reason => { try { return await action.run(`/privadas/${clusterId}/concepts`, { ...(concept ? { conceptId: concept.conceptId } : {}), name: name.trim(), category, baseCents: toCents(amount), effectiveMonth: month, active: true, reason }, concept ? 'Monto actualizado.' : 'Cuota creada.'); } catch (e) { action.setError(errorText(e)); return false; } }}>
    {!concept && <div className="fin-fields"><label>Nombre<input required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label>
      <label>Tipo<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(CATEGORY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>}
    <div className="fin-fields"><label>Monto por casa en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"/></div></label>
      <label>Desde el mes<input type="month" required value={month} min={next} onChange={e => setMonth(e.target.value)}/></label></div>
  </ReasonDialog>;
}

function EndDialog({ concept, clusterId, action, onClose }: { concept: Concept; clusterId: string; action: Action; onClose: () => void }) {
  const [month, setMonth] = useState(currentMonth());
  return <ReasonDialog title={`Dejar de cobrar · ${concept.name}`} confirm="Dejar de cobrar" danger busy={action.busy} error={action.error} onClose={onClose}
    text={<p>Desde el mes que elijas ya no se cobrará. Lo que las casas deban de meses anteriores se conserva.</p>}
    onConfirm={reason => action.run(`/privadas/${clusterId}/concepts`, { conceptId: concept.conceptId, name: concept.name, category: concept.category, baseCents: concept.baseCents, effectiveMonth: month, active: false, reason }, 'Cuota terminada.')}>
    <label>Desde el mes<input type="month" required value={month} min={currentMonth()} onChange={e => setMonth(e.target.value)}/></label>
  </ReasonDialog>;
}

/**
 * Recargos y multas: one-off charges to some homes (a fine, a late surcharge, an extraordinary fee,
 * amenities…). Only the privada's own administrator applies or cancels them; administración only sees them.
 */
function Charges({ s, clusterId, action }: { s: PrivadaSummary; clusterId: string; action: Action }) {
  const [adding, setAdding] = useState(false), [cancelling, setCancelling] = useState<Charge | null>(null), [filter, setFilter] = useState<ChargeCategory | 'all'>('all');
  const charges = s.charges ?? [];
  const live = charges.filter(c => c.status !== 'CANCELLED');
  const owed = live.reduce((t, c) => t + BigInt(c.remainingCents), 0n);
  const paid = live.reduce((t, c) => t + BigInt(c.amountCents) - BigInt(c.remainingCents), 0n);
  const late = charges.filter(c => c.status === 'OVERDUE').length;
  const list = charges.filter(c => filter === 'all' || c.category === filter);
  const used = (Object.keys(CHARGE) as ChargeCategory[]).filter(k => charges.some(c => c.category === k));
  return <div className="fin-stack">
    <section className="fin-stats" aria-label="Totales de recargos y multas">
      <Stat label="Por cobrar" value={money(owed)} hint="Lo que falta pagar de recargos y multas" tone={owed > 0n ? 'accent' : ''}/>
      <Stat label="Vencidos" value={String(late)} hint={late === 1 ? 'Pasó su fecha límite' : 'Pasaron su fecha límite'} tone={late ? 'bad' : 'good'}/>
      <Stat label="Cobrado" value={money(paid)} hint="Ya entra en la caja de la privada"/>
    </section>
    <section className="panel fin-section">
      <div className="fin-section-head"><div><h3>Recargos y multas</h3><p>Cargos sueltos a una o varias casas: multas, recargos, cuotas extraordinarias, amenidades… Aparecen en el estado de cuenta de cada casa y se pagan como cualquier cuota.</p></div>
        {s.canCharge && s.configured && <Button onClick={() => { action.clear(); setAdding(true); }}><Plus size={17}/> Aplicar recargo o multa</Button>}</div>
      {!s.canCharge && <Info>Solo el administrador de la privada aplica o cancela recargos y multas.</Info>}
      {s.canCharge && !s.configured && <Info>Podrás aplicar recargos y multas cuando la administración active el cobro de la privada.</Info>}
      <ErrorBox message={!adding && !cancelling ? action.error : ''}/>
      {used.length > 1 && <div className="fin-chips" role="group" aria-label="Filtrar por tipo">
        <button type="button" aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos <span>{charges.length}</span></button>
        {used.map(k => <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{CHARGE[k].label} <span>{charges.filter(c => c.category === k).length}</span></button>)}</div>}
      {!charges.length ? <Empty icon={<Gavel/>} title="Aún no hay recargos ni multas" text={s.canCharge ? 'Cuando apliques uno, aquí verás a qué casa, por cuánto y si ya se pagó.' : 'Aquí aparecerán los que aplique el administrador de la privada.'}/> :
        <ul className="fin-rows">{list.map(c => { const st = CHARGE_STATUS[c.status], cancelled = c.status === 'CANCELLED', partial = c.status !== 'PAID' && !cancelled && c.remainingCents !== c.amountCents;
          return <li key={c.id} className="fin-row fin-row-wrap"><span className="fin-row-icon"><Gavel size={17}/></span>
            <div className="fin-row-main"><strong className={cancelled ? 'fin-struck' : ''}>{c.concept}</strong>
              <small>Casa {c.houseNumber}{c.payer ? ` · ${c.payer}` : ''} · {CHARGE[c.category]?.label ?? c.category}{c.dueAt && !cancelled && c.status !== 'PAID' ? ` · fecha límite ${lastPayDay(c.dueAt)}` : ` · ${dayText(c.createdAt)}`}</small>
              {c.note && c.note !== c.concept && <small className="muted">{c.note}</small>}</div>
            <div className="fin-row-side"><strong className={`fin-amount ${c.status === 'OVERDUE' ? 'bad' : ''}`}>{money(c.amountCents)}</strong>
              <span className={`badge ${st.badge}`}><span/>{partial ? `Faltan ${money(c.remainingCents)}` : st.label}</span>
              {s.canCharge && !cancelled && <button type="button" className="fin-link danger-text" onClick={() => { action.clear(); setCancelling(c); }}>Cancelar</button>}</div></li>; })}</ul>}
    </section>
    {adding && <ChargeDialog s={s} clusterId={clusterId} action={action} initial={[]} onClose={() => setAdding(false)}/>}
    {cancelling && <ReasonDialog title="Cancelar recargo" confirm="Cancelar recargo" danger busy={action.busy} error={action.error} onClose={() => setCancelling(null)} placeholder="Por ejemplo: se aclaró con el vecino"
      text={<p><strong>{cancelling.concept} · Casa {cancelling.houseNumber} ({money(cancelling.amountCents)})</strong> deja de cobrarse. Si ya se había pagado algo, vuelve a la casa como saldo a favor. Queda en el historial como cancelado.</p>}
      onConfirm={reason => action.run(`/privadas/${clusterId}/charges/${cancelling.id}/cancel`, { reason }, 'Recargo cancelado.')}/>}
  </div>;
}

/** Apply one recargo or multa to one, several or all homes of the privada. */
function ChargeDialog({ s, clusterId, action, initial, onClose }: { s: PrivadaSummary; clusterId: string; action: Action; initial: string[]; onClose: () => void }) {
  const homes = useMemo(() => s.homes.filter(h => h.active).sort((a, b) => a.houseNumber.localeCompare(b.houseNumber, 'es', { numeric: true })), [s.homes]);
  const [category, setCategory] = useState<ChargeCategory>('FINE'), [concept, setConcept] = useState(''), [amount, setAmount] = useState(''), [due, setDue] = useState(inDays(15)), [note, setNote] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial)), [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = homes.filter(h => !term || homeTitle(h).toLowerCase().includes(term) || (h.payer ?? '').toLowerCase().includes(term));
  const all = homes.length > 0 && homes.every(h => picked.has(h.accountId));
  let each = 0n; try { each = amount ? BigInt(toCents(amount)) : 0n; } catch { each = 0n; }
  function toggle(id: string) { setPicked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  async function submit(e: FormEvent) {
    e.preventDefault(); action.clear();
    try {
      const ok = await action.run(`/privadas/${clusterId}/charges`, { accountIds: homes.filter(h => picked.has(h.accountId)).map(h => h.accountId), category, concept: concept.trim(), amountCents: toCents(amount), dueDate: due, ...(note.trim().length >= 3 ? { note: note.trim() } : {}) }, picked.size === 1 ? 'Recargo aplicado.' : `Recargo aplicado a ${picked.size} casas.`);
      if (ok) onClose();
    } catch (err) { action.setError(errorText(err)); }
  }
  return <Modal title="Aplicar recargo o multa" onClose={() => { if (!action.busy) onClose(); }}><form onSubmit={submit}><fieldset disabled={action.busy}>
    <div className="pf-kind" role="radiogroup" aria-label="Tipo de cargo">{(Object.keys(CHARGE) as ChargeCategory[]).map(k => <button key={k} type="button" role="radio" aria-checked={category === k} className={category === k ? 'active' : ''} onClick={() => setCategory(k)}>{CHARGE[k].label}</button>)}</div>
    <label>Concepto<input required minLength={2} maxLength={100} value={concept} onChange={e => setConcept(e.target.value)} placeholder={CHARGE[category].placeholder}/><small>Así lo verá el vecino en su estado de cuenta{category !== 'OTHER' ? `: «${CHARGE[category].label}: ${concept.trim() || '…'}»` : ''}.</small></label>
    <div className="fin-fields"><label>Monto por casa en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"/></div></label>
      <label>Fecha límite de pago<input type="date" required value={due} min={todayInput()} max={inDays(365)} onChange={e => setDue(e.target.value)}/></label></div>
    <div className="pf-pick">
      <div className="pf-pick-head"><strong>Casas</strong><label className="pf-pick-all"><input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(homes.map(h => h.accountId)))}/> Todas ({homes.length})</label></div>
      {homes.length > 8 && <label className="fin-search"><Search size={16}/><input aria-label="Buscar casa" placeholder="Casa o titular" value={q} onChange={e => setQ(e.target.value)}/></label>}
      <ul>{shown.map(h => <li key={h.accountId}><label><input type="checkbox" checked={picked.has(h.accountId)} onChange={() => toggle(h.accountId)}/><span>{homeTitle(h)}</span><small>{h.payer ?? 'Sin titular'}</small></label></li>)}</ul>
    </div>
    <label>Nota (opcional)<input maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="Por ejemplo: reporte de vigilancia del 12 de noviembre"/><small>Queda en el historial y la puede ver el titular de la casa.</small></label>
    {picked.size > 0 && each > 0n && <p className="fin-preview">Se cobrará <strong>{money(each)}</strong> a {picked.size === 1 ? '1 casa' : `${picked.size} casas`}{picked.size > 1 ? <> · total <strong>{money(each * BigInt(picked.size))}</strong></> : null}. Si la casa tiene saldo a favor, se paga con él.</p>}
  </fieldset><ErrorBox message={action.error}/><div className="modal-actions"><Button className="secondary" disabled={action.busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={action.busy} disabled={!picked.size || concept.trim().length < 2 || !amount}>Aplicar</Button></div></form></Modal>;
}

/** The privada's expenses, each with its receipt when there is one. */
function Expenses({ s, clusterId, action }: { s: PrivadaSummary; clusterId: string; action: Action }) {
  const [adding, setAdding] = useState(false), [voiding, setVoiding] = useState<Expense | null>(null), [viewing, setViewing] = useState<{ url: string; title: string } | null>(null), [opening, setOpening] = useState('');
  const total = s.expenses.filter(e => !e.voided).reduce((t, e) => t + BigInt(e.amountCents), 0n);
  async function open(e: Expense) {
    setOpening(e.id); action.clear();
    try {
      const blob = await apiFile(`/privadas/${clusterId}/expenses/${e.id}/receipt`);
      const url = URL.createObjectURL(blob);
      if (e.receipt?.mime === 'application/pdf') { window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
      else setViewing({ url, title: e.description });
    } catch (err) { action.setError(errorText(err)); } finally { setOpening(''); }
  }
  return <section className="panel fin-section">
    <div className="fin-section-head"><div><h3>Gastos de la privada</h3><p>Amenidades, jardinería, vigilancia y lo que la privada paga con lo que cobra. Total: <strong>{money(total)}</strong></p></div>
      <Button onClick={() => { action.clear(); setAdding(true); }}><Plus size={17}/> Registrar gasto</Button></div>
    <ErrorBox message={!adding && !voiding ? action.error : ''}/>
    {!s.expenses.length ? <Empty icon={<Receipt/>} title="Aún no hay gastos" text="Registra cada pago de la privada con su comprobante: así cualquiera puede ver en qué se usa el dinero."/> :
      <ul className="fin-rows">{s.expenses.map(e => <li key={e.id} className="fin-row fin-row-wrap"><span className="fin-row-icon"><Receipt size={17}/></span>
        <div className="fin-row-main"><strong className={e.voided ? 'fin-struck' : ''}>{e.description}</strong><small>{EXPENSE[e.category] ?? e.category} · {dayText(e.spentAt)}{e.voided ? ` · cancelado: ${e.voidReason ?? ''}` : ''}</small></div>
        <div className="fin-row-side"><strong className="fin-amount">{money(e.amountCents)}</strong>
          <div className="fin-row-actions">{e.receipt && <button type="button" className="fin-link" disabled={opening === e.id} onClick={() => void open(e)}><FileText size={14}/> {opening === e.id ? 'Abriendo…' : 'Comprobante'}</button>}
            {!e.voided && <button type="button" className="fin-link danger-text" onClick={() => { action.clear(); setVoiding(e); }}>Cancelar</button>}</div></div></li>)}</ul>}
    {adding && <ExpenseDialog clusterId={clusterId} action={action} onClose={() => setAdding(false)}/>}
    {voiding && <ReasonDialog title="Cancelar gasto" confirm="Cancelar gasto" danger busy={action.busy} error={action.error} onClose={() => setVoiding(null)} placeholder="Por ejemplo: lo registré dos veces"
      text={<p><strong>{voiding.description} ({money(voiding.amountCents)})</strong> deja de contar en la caja. Queda en el historial como cancelado; nada se borra.</p>}
      onConfirm={reason => action.run(`/privadas/${clusterId}/expenses/${voiding.id}/void`, { reason }, 'Gasto cancelado.')}/>}
    {viewing && <Modal title={viewing.title} onClose={() => { URL.revokeObjectURL(viewing.url); setViewing(null); }}><img className="attach-full" src={viewing.url} alt="Comprobante del gasto"/></Modal>}
  </section>;
}

function ExpenseDialog({ clusterId, action, onClose }: { clusterId: string; action: Action; onClose: () => void }) {
  const [day, setDay] = useState(todayInput()), [category, setCategory] = useState('AMENITIES'), [description, setDescription] = useState(''), [amount, setAmount] = useState(''), [file, setFile] = useState<File | null>(null), [fileError, setFileError] = useState('');
  function choose(f: File | undefined) {
    setFileError(''); setFile(null);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(f.type)) return setFileError('El comprobante debe ser una foto (JPG, PNG o WebP) o un PDF.');
    if (f.size > 12 * 1024 * 1024) return setFileError('El archivo es muy grande.');
    setFile(f);
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); action.clear();
    try {
      const blob = file ? (file.type.startsWith('image/') ? await compressPhoto(file) : file) : null;
      if (blob && blob.size > 5 * 1024 * 1024) { setFileError('El comprobante puede pesar hasta 5 MB.'); return; }
      const ok = await action.run(`/privadas/${clusterId}/expenses`, { spentAt: dayInstant(day), category, description: description.trim(), amountCents: toCents(amount), ...(blob ? { receipt: { data: await toBase64(blob) } } : {}) }, 'Gasto registrado.');
      if (ok) onClose();
    } catch (err) { action.setError(errorText(err)); }
  }
  return <Modal title="Registrar gasto" onClose={() => { if (!action.busy) onClose(); }}><form onSubmit={submit}><fieldset disabled={action.busy}>
    <div className="fin-fields"><label>Concepto<input required minLength={3} maxLength={200} value={description} onChange={e => setDescription(e.target.value)} placeholder="Por ejemplo: jardinero de noviembre"/></label>
      <label>Tipo<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(EXPENSE).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
    <div className="fin-fields"><label>Importe en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"/></div></label>
      <label>Fecha<input type="date" required value={day} max={todayInput()} onChange={e => setDay(e.target.value)}/></label></div>
    <label>Comprobante (opcional)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => choose(e.target.files?.[0])}/><small>Foto del recibo o factura en PDF, hasta 5 MB. Las fotos se reducen antes de subirse.</small></label>
    {fileError && <p className="small danger-text">{fileError}</p>}
  </fieldset><ErrorBox message={action.error}/><div className="modal-actions"><Button className="secondary" disabled={action.busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={action.busy} disabled={!description.trim() || !amount}>Registrar gasto</Button></div></form></Modal>;
}

/** What the privada owes the fraccionamiento each month, and the deposits it made. */
function Deposits({ s, clusterId, action }: { s: PrivadaSummary; clusterId: string; action: Action }) {
  const [adding, setAdding] = useState(false);
  const balance = BigInt(s.fraccionamiento.balanceCents);
  return <div className="fin-stack">
    <section className="fin-stats" aria-label="Cuenta con el fraccionamiento">
      <Stat label={s.role === 'ADMIN' ? 'Debe al fraccionamiento' : 'Debes al fraccionamiento'} value={money(balance > 0n ? balance : 0n)} hint={balance < 0n ? `Saldo a favor ${money(-balance)}` : 'Cuota por casa de cada mes'} tone={balance > 0n ? 'warn' : 'good'}/>
      <Stat label="Depositado y confirmado" value={money(s.fraccionamiento.paidCents)}/>
      <Stat label="Por confirmar" value={money(s.fraccionamiento.pendingCents)} hint="La administración lo confirma al verlo en su cuenta"/>
    </section>
    <section className="panel fin-section">
      <div className="fin-section-head"><div><h3>Depósitos al fraccionamiento</h3><p>Transfiere desde la cuenta de la privada y regístralo aquí. La administración lo confirma.</p></div>
        <Button onClick={() => { action.clear(); setAdding(true); }}><Landmark size={17}/> Registrar depósito</Button></div>
      {!s.deposits.length ? <p className="muted">Aún no hay depósitos registrados.</p> :
        <ul className="fin-rows">{s.deposits.map(d => <li key={d.id} className="fin-row fin-row-wrap"><div className="fin-row-main"><strong>{money(d.amountCents)}</strong><small>{dayText(d.depositedAt)} · Ref. {d.reference}</small>{d.status === 'REJECTED' && d.reviewReason && <small className="danger-text">Motivo: {d.reviewReason}</small>}</div>
          <span className={`badge ${DEPOSIT[d.status].badge}`}><span/>{DEPOSIT[d.status].label}</span></li>)}</ul>}
    </section>
    <section className="panel fin-section"><h3>Lo que corresponde cada mes</h3>
      {!s.dues.length ? <p className="muted">Aún no hay meses emitidos. Se calcula el día 1: casas activas × cuota por casa que fija la administración.</p> :
        <ul className="fin-rows">{s.dues.map(d => <li key={d.id} className="fin-row"><div className="fin-row-main"><strong>{monthName(d.period)}</strong><small>{d.homes} {d.homes === 1 ? 'casa' : 'casas'} × {money(d.rateCents)}</small></div><strong className="fin-amount">{money(d.amountCents)}</strong></li>)}</ul>}
    </section>
    {adding && <DepositDialog s={s} clusterId={clusterId} action={action} onClose={() => setAdding(false)}/>}
  </div>;
}

function DepositDialog({ s, clusterId, action, onClose }: { s: PrivadaSummary; clusterId: string; action: Action; onClose: () => void }) {
  const owed = BigInt(s.fraccionamiento.balanceCents) - BigInt(s.fraccionamiento.pendingCents);
  const [amount, setAmount] = useState(owed > 0n ? pesos(owed.toString()) : ''), [reference, setReference] = useState(''), [day, setDay] = useState(todayInput());
  async function submit(e: FormEvent) {
    e.preventDefault(); action.clear();
    try { if (await action.run(`/privadas/${clusterId}/deposits`, { amountCents: toCents(amount), depositedAt: dayInstant(day), reference: reference.trim() }, 'Depósito registrado. La administración lo confirmará.')) onClose(); }
    catch (err) { action.setError(errorText(err)); }
  }
  return <Modal title="Registrar depósito" onClose={() => { if (!action.busy) onClose(); }}><form onSubmit={submit}><fieldset disabled={action.busy}>
    <p className="small muted">Registra la transferencia que hiciste desde la cuenta de la privada a la del fraccionamiento.</p>
    <div className="fin-fields"><label>Importe en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"/></div></label>
      <label>Fecha del depósito<input type="date" required value={day} max={todayInput()} onChange={e => setDay(e.target.value)}/></label></div>
    <label>Referencia o clave de rastreo<input required minLength={3} maxLength={100} value={reference} onChange={e => setReference(e.target.value)} placeholder="Por ejemplo: SPEI 0123456789"/></label>
  </fieldset><ErrorBox message={action.error}/><div className="modal-actions"><Button className="secondary" disabled={action.busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={action.busy} disabled={!amount || reference.trim().length < 3}>Registrar depósito</Button></div></form></Modal>;
}
