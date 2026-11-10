import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeftRight, Banknote, Check, CircleCheck, Clock, Copy, CreditCard, ExternalLink, FileText, Landmark, Receipt as ReceiptIcon, RotateCcw, ShieldCheck } from 'lucide-react';
import { FinancialBoundary } from '../components/FinancialBoundary';
import { errorText } from '../api';
import { useOnline, useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Info, Loading, Modal, PageHeader, Success } from '../components/ui';
import { METHOD, ReasonDialog, ReceiptDialog, ResidentSkeleton, dateTimeText, dayText, lastPayDay, money, monthName, pesos, toCents, useFinanceAction, type Receipt } from './financeUi';
import { paymentIssue, taskKind } from './paymentIssues';
import './Billing.css';

// Kept for callers of the previous helpers.
export const paymentMoney = (cents: string) => money(cents);
export const paymentCents = (value: string) => toCents(value);

const METHOD_ICON: Record<string, typeof CreditCard> = { CARD: CreditCard, SPEI: Landmark, CASH: Banknote, TRANSFER: ArrowLeftRight };
const MIN_CARD = 1000n;
type Item = { id: string; kind: string; amountCents: string; remainingCents: string; period: string | null; dueAt: string | null; description: string; effectiveAt: string };
type MyStatement = { balanceCents: string; overdueCents?: string; creditCents?: string; items?: Item[]; movements?: { id: string; reversesId: string | null }[] };
type MyPayments = { accountId: string; communityId: string; destination: boolean; instructions: { clabe: string; bank: string; beneficiary: string } | null; payments: { id: string; amountCents: string; method: string; createdAt?: string }[]; tasks: CheckoutTask[] };
/** `paid`: Stripe confirmed it (it names its payment). `expired`: an unpaid Stripe link older than 24 hours. */
type CheckoutTask = { id: string; kind: string; status: string; errorCode?: string | null; result: { url?: string } | null; amountCents?: string | null; paid?: boolean; paymentId?: string | null; expired?: boolean };

/** What the household owes, or has in its favor, in one sentence. */
function BalanceCard({ statement }: { statement: MyStatement }) {
  const balance = BigInt(statement.balanceCents), overdue = BigInt(statement.overdueCents ?? '0');
  const open = (statement.items ?? []).filter(i => i.kind === 'CHARGE' && BigInt(i.remainingCents) > 0n && i.dueAt && new Date(i.dueAt) > new Date()).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  if (balance > 0n) return <section className={`fin-balance ${overdue > 0n ? 'bad' : 'warn'}`} aria-label="Saldo">
    <span className="fin-balance-label">Debes</span><strong className="fin-balance-amount">{money(balance)}</strong>
    <p>{overdue > 0n ? `${money(overdue)} ya están vencidos. Ponte al corriente cuando puedas.` : open[0] ? `Paga a más tardar el ${lastPayDay(open[0].dueAt!)}.` : 'Puedes pagar una parte o el total.'}</p>
  </section>;
  if (balance < 0n) return <section className="fin-balance good" aria-label="Saldo"><span className="fin-balance-label">Tienes saldo a favor</span><strong className="fin-balance-amount">{money(-balance)}</strong><p>Se usará solo en tus próximas cuotas.</p></section>;
  return <section className="fin-balance good" aria-label="Saldo"><span className="fin-balance-label">Estás al corriente</span><strong className="fin-balance-amount">{money(0n)}</strong><p>No tienes cuotas pendientes.</p></section>;
}

/** Each monthly fee with what is left to pay. */
function Charges({ statement }: { statement: MyStatement }) {
  const reversed = new Set((statement.movements ?? []).map(m => m.reversesId).filter(Boolean));
  const charges = (statement.items ?? []).filter(i => i.kind === 'CHARGE').sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt)).slice(0, 12);
  if (!charges.length) return null;
  return <section className="panel fin-section"><h3>Tus cuotas</h3><ul className="fin-rows">{charges.map(c => {
    const left = BigInt(c.remainingCents), overdue = left > 0n && !!c.dueAt && new Date(c.dueAt) <= new Date();
    const state = reversed.has(c.id) ? <span className="badge pending"><span/>Cancelada</span> : left === 0n ? <span className="badge"><span/>Pagada</span> : overdue ? <span className="badge revoked"><span/>Vencida</span> : <span className="badge expired"><span/>Pendiente</span>;
    return <li key={c.id} className="fin-row"><div className="fin-row-main"><strong>{c.description}</strong><small>{c.period ? monthName(c.period) : dayText(c.effectiveAt)}{left > 0n && c.dueAt && !reversed.has(c.id) ? ` · ${overdue ? 'venció el' : 'vence el'} ${lastPayDay(c.dueAt)}` : ''}</small></div>
      <div className="fin-row-side"><strong className="fin-amount">{money(c.amountCents)}</strong>{left > 0n && left !== BigInt(c.amountCents) && <small>Faltan {money(left)}</small>}{state}</div></li>;
  })}</ul></section>;
}

function ResidentPaymentsContent({ propertyId }: { propertyId: string }) {
  // Back from Stripe: check often until the payment is confirmed.
  const [returned, setReturned] = useState(() => new URLSearchParams(location.search).get('resultado') === 'regreso');
  // While a CLABE or a Stripe link is being prepared, or a payment confirmed, check often for the
  // first 20 seconds (it usually takes a few), then calmly, so many waiting residents do not pile up.
  const [preparing, setPreparing] = useState(false), [fastUntil, setFastUntil] = useState(() => Date.now() + 20000);
  const waiting = preparing || returned, fast = waiting && Date.now() < fastUntil;
  const data = useQuery<MyPayments>(`/billing/my-payments?propertyId=${propertyId}`, waiting ? (fast ? (preparing ? 1500 : 3000) : 5000) : 10000);
  const statement = useQuery<MyStatement>(`/billing/my-statement?propertyId=${propertyId}`, returned ? (fast ? 3000 : 5000) : 10000);
  const action = useFinanceAction(() => { data.refresh(); statement.refresh(); });
  const [amount, setAmount] = useState(''), [receipt, setReceipt] = useState<Receipt | null>(null), [copied, setCopied] = useState(false), [paid, setPaid] = useState<CheckoutTask | null>(null);
  const online = useOnline();
  const d = data.data, s = statement.data;
  const owed = s && BigInt(s.balanceCents) > 0n ? BigInt(s.balanceCents) : 0n;
  const checkout = d?.tasks.find(t => t.kind === 'CHECKOUT');
  const preparingClabe = !!d?.tasks.some(t => t.kind === 'CUSTOMER' && t.status === 'PENDING');
  // Announce a checkout once, when it turns paid while the page is open or right after returning from Stripe.
  const seen = useRef(new Map<string, boolean>()), announced = useRef(new Set<string>());
  useEffect(() => {
    const now = !!d?.tasks.some(t => t.status === 'PENDING' && (t.kind === 'CHECKOUT' || t.kind === 'CUSTOMER'));
    setPreparing(before => { if (now && !before) setFastUntil(Date.now() + 20000); return now; });
  }, [d]);
  useEffect(() => {
    if (!d) return;
    for (const t of d.tasks.filter(t => t.kind === 'CHECKOUT')) {
      const before = seen.current.get(t.id);
      if (t.paid && !announced.current.has(t.id) && (before === false || (before === undefined && returned && t.id === checkout?.id))) {
        announced.current.add(t.id); setPaid(t); setReturned(false); statement.refresh();
        history.replaceState(history.state, '', location.pathname);
      }
      seen.current.set(t.id, !!t.paid);
    }
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const paidAmount = paid && (paid.amountCents ?? d?.payments.find(p => p.id === paid.paymentId)?.amountCents);
  async function request(kind: 'CUSTOMER' | 'CHECKOUT') {
    if (!d) return;
    try { if (await action.run('/billing/my-payments', { accountId: d.accountId, communityId: d.communityId, kind, ...(kind === 'CHECKOUT' ? { amountCents: toCents(amount) } : {}) }, kind === 'CHECKOUT' ? 'Preparando tu pago seguro…' : 'Generando tu CLABE…')) { setPreparing(true); setFastUntil(Date.now() + 20000); } }
    catch (e) { action.setError(errorText(e)); }
  }
  async function copy(clabe: string) { try { await navigator.clipboard.writeText(clabe); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch (e) { action.setError(errorText(e)); } }

  return <div className="fin">
    <PageHeader title="Pagos" text="Las cuotas de tu vivienda y cómo pagarlas." action={<span className="fin-flag"><ShieldCheck size={15}/> Modo de prueba de Stripe</span>}/>
    <ErrorBox message={data.error || statement.error || action.error}/>
    {(data.loading && !d) || (statement.loading && !s) ? <ResidentSkeleton/> : <>
      {s && <BalanceCard statement={s}/>}
      {returned && !checkout?.paid && <p className="fin-waiting"><Clock size={16}/> Estamos confirmando tu pago con Stripe. Tarda unos segundos; no cierres esta pantalla.</p>}
      {d && !d.destination ? <Info>Administración aún no activa los pagos en línea. Mientras tanto, paga como de costumbre en administración.</Info> : d && <div className="fin-methods">
        <section className="panel fin-method">
          <div className="fin-method-head"><span className="fin-method-icon"><Landmark size={20}/></span><div><h3>Transferencia SPEI</h3><p>Desde la app de tu banco. Se acredita sola en cuanto llega.</p></div></div>
          {!d.instructions ? <>{preparingClabe ? <p className="fin-waiting"><Clock size={16}/> Generando tu CLABE… tarda unos segundos.</p> : <p className="small muted">Tu casa tendrá una CLABE propia; la usas siempre que pagues.</p>}
            <Button disabled={action.busy || !online || preparingClabe} busy={action.busy} onClick={() => void request('CUSTOMER')}>Solicitar datos SPEI</Button></> : <>
            <div className="fin-clabe"><span>CLABE de tu casa</span><strong className="fin-mono">{d.instructions.clabe.replace(/(\d{4})(?=\d)/g, '$1 ')}</strong></div>
            <dl className="fin-facts"><dt>Banco</dt><dd>{d.instructions.bank}</dd><dt>Beneficiario</dt><dd>{d.instructions.beneficiary}</dd></dl>
            <Button className="secondary" onClick={() => void copy(d.instructions!.clabe)}>{copied ? <><Check size={16}/> CLABE copiada</> : <><Copy size={16}/> Copiar CLABE</>}</Button>
            <p className="small muted">Esta CLABE es solo de tu casa. Puedes transferir cualquier monto.</p></>}
        </section>
        <section className="panel fin-method">
          <div className="fin-method-head"><span className="fin-method-icon"><CreditCard size={20}/></span><div><h3>Tarjeta de crédito o débito</h3><p>En la página segura de Stripe. Zentry nunca ve los datos de tu tarjeta.</p></div></div>
          {!d.instructions ? <p className="small muted">Primero solicita tus datos SPEI: con ellos se identifica tu casa en Stripe.</p> :
            checkout?.status === 'PENDING' ? <p className="fin-waiting"><Clock size={16}/> Preparando tu pago seguro… tarda unos segundos.</p> : <>
              {checkout?.status === 'DONE' && !checkout.paid && !checkout.expired && checkout.result?.url && new URL(checkout.result.url).origin === 'https://checkout.stripe.com' && <div className="fin-ready"><Success>Tu pago está listo.</Success><a className="button" href={checkout.result.url} rel="noreferrer">Continuar en Stripe <ExternalLink size={16}/></a><small>Volver de Stripe no confirma el pago; el recibo aparece cuando Stripe lo confirme.</small></div>}
              {checkout?.status === 'REVIEW' && <p className="fin-alert">No se pudo preparar tu último pago. Administración ya ve el motivo para resolverlo; no hace falta volver a intentarlo.</p>}
              <form onSubmit={e => { e.preventDefault(); void request('CHECKOUT'); }}>
                <label>Importe a pagar en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"/></div></label>
                {owed >= MIN_CARD && <button type="button" className="fin-chip" onClick={() => setAmount(pesos(owed.toString()))}>Pagar todo ({money(owed)})</button>}
                <small className="muted">Puedes pagar una parte o el total. Mínimo $10.00 MXN.</small>
                <Button type="submit" busy={action.busy} disabled={action.busy || !online}>Preparar pago seguro</Button>
              </form></>}
        </section>
      </div>}
      {s && <Charges statement={s}/>}
      <section className="panel fin-section"><h3>Pagos y recibos</h3>{!d?.payments.length ? <p className="muted">Aquí verás cada pago confirmado con su recibo.</p> :
        <ul className="fin-rows">{d.payments.map(p => { const Icon = METHOD_ICON[p.method] ?? ReceiptIcon; return <li key={p.id} className="fin-row">
          <span className="fin-row-icon"><Icon size={18}/></span><div className="fin-row-main"><strong>{METHOD[p.method] ?? p.method}</strong>{p.createdAt && <small>{dateTimeText(p.createdAt)}</small>}</div>
          <div className="fin-row-side"><strong className="fin-amount">{money(p.amountCents)}</strong><Button className="secondary small-button" onClick={() => void action.read<Receipt>(`/billing/payments/${p.id}/receipt?communityId=${d.communityId}`, setReceipt)}>Ver recibo</Button></div></li>; })}</ul>}
        <p className="small muted">El fraccionamiento absorbe las comisiones de tarjeta y SPEI. Zentry no cobra comisión.</p></section>
    </>}
    {paid && <Modal title="Pago realizado" onClose={() => setPaid(null)}><div className="fin-paid" role="status">
      <span className="fin-paid-icon"><CircleCheck size={40}/></span>
      <strong>{paidAmount ? `Recibimos tu pago de ${money(paidAmount)}` : 'Recibimos tu pago'}</strong>
      <p>Stripe lo confirmó y ya se aplicó a tus cuotas, empezando por la más antigua.</p>
    </div><div className="modal-actions">{paid.paymentId && d && <Button className="secondary" onClick={() => { const id = paid.paymentId!; setPaid(null); void action.read<Receipt>(`/billing/payments/${id}/receipt?communityId=${d.communityId}`, setReceipt); }}>Ver recibo</Button>}<Button onClick={() => setPaid(null)}>Listo</Button></div></Modal>}
    {receipt && <ReceiptDialog value={receipt} onClose={() => setReceipt(null)}/>}
  </div>;
}

// ——— Administration pieces, composed by Tesorería ———

export type AdminPayment = { id: string; accountId: string; method: string; amountCents: string; createdAt?: string; effectiveAt?: string | null; evidenceAvailable: boolean; revisions: { retainedCents: string; refundedCents: string; disputedCents: string; feeCents: string | null; netCents: string | null; state: string }[] };
export type AdminData = { taskCursor?: string | null; eventCursor?: string | null; deposits?: { id: string; providerId: string; amountCents: string; currency: string; effectiveAt: string; accountId: string | null }[]; destination: { stripeAccount: string; reconciledAt: string | null } | null; payments: AdminPayment[]; tasks: { id: string; accountId?: string | null; kind: string; status: string; errorCode: string | null; createdAt?: string }[]; events: { id: string; eventType: string; status: string; errorCode: string | null }[] };
export type FinanceAction = ReturnType<typeof useFinanceAction>;
type Evidence = { name: string; type: string; data: string };
export type Scoped = (path: string) => string;
export const scopedPath = (communityId?: string): Scoped => p => communityId ? `${p}${p.includes('?') ? '&' : '?'}communityId=${encodeURIComponent(communityId)}` : p;

/** Payments with their receipt, evidence and refund. */
export function PaymentList({ payments, homeName, path, action, empty = 'Aún no hay pagos.' }: { payments: AdminPayment[]; homeName?: (accountId: string) => string | undefined; path: Scoped; action: FinanceAction; empty?: string }) {
  const [receipt, setReceipt] = useState<{ value: Receipt; home?: string } | null>(null), [refund, setRefund] = useState<AdminPayment | null>(null);
  function download(v: { evidence: Evidence | string | null }) {
    if (!v.evidence) return; if (typeof v.evidence === 'string') { action.setError(v.evidence); return; }
    const bytes = Uint8Array.from(atob(v.evidence.data), c => c.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = v.evidence.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!payments.length) return <p className="muted">{empty}</p>;
  return <><ul className="fin-rows">{payments.map(p => {
    const r = p.revisions[0], Icon = METHOD_ICON[p.method] ?? ReceiptIcon, home = homeName?.(p.accountId);
    const changed = r && r.retainedCents !== p.amountCents;
    return <li key={p.id} className="fin-row fin-row-wrap">
      <span className="fin-row-icon"><Icon size={18}/></span>
      <div className="fin-row-main"><strong>{home ?? METHOD[p.method] ?? p.method}</strong><small>{home ? `${METHOD[p.method] ?? p.method} · ` : ''}{p.effectiveAt ? dateTimeText(p.effectiveAt) : p.createdAt ? dateTimeText(p.createdAt) : ''}</small>
        {changed && <small className="fin-note">Vigente {money(r.retainedCents)}{BigInt(r.refundedCents) > 0n ? ` · devuelto ${money(r.refundedCents)}` : ''}{BigInt(r.disputedCents) > 0n ? ` · en aclaración ${money(r.disputedCents)}` : ''}</small>}
        {r?.feeCents != null && <small>Comisión de Stripe (la paga el fraccionamiento): {money(r.feeCents)}</small>}</div>
      <div className="fin-row-side"><strong className="fin-amount">{money(p.amountCents)}</strong>
        <div className="fin-row-actions">
          <button type="button" className="fin-link" onClick={() => void action.read<Receipt>(path(`/billing/payments/${p.id}/receipt`), v => setReceipt({ value: v, home }))}><FileText size={15}/> Recibo</button>
          {p.evidenceAvailable && <button type="button" className="fin-link" onClick={() => void action.read<{ evidence: Evidence | string | null }>(path(`/billing/payments/${p.id}/evidence`), download)}>Comprobante</button>}
          {r && BigInt(r.retainedCents) > 0n && <button type="button" className="fin-link" onClick={() => { action.clear(); setRefund(p); }}><RotateCcw size={15}/> Devolución</button>}
        </div></div>
    </li>;
  })}</ul>
    {receipt && <ReceiptDialog value={receipt.value} home={receipt.home} onClose={() => setReceipt(null)}/>}
    {refund && <RefundDialog payment={refund} path={path} action={action} onClose={() => setRefund(null)}/>}</>;
}

function RefundDialog({ payment, path, action, onClose }: { payment: AdminPayment; path: Scoped; action: FinanceAction; onClose: () => void }) {
  const [amount, setAmount] = useState(''), [email, setEmail] = useState('');
  const viaStripe = payment.method === 'CARD' || payment.method === 'SPEI', available = payment.revisions[0]?.retainedCents ?? '0';
  return <ReasonDialog title="Devolución" confirm="Confirmar devolución" danger busy={action.busy} error={action.error} onClose={onClose} ready={!!amount && (payment.method !== 'SPEI' || !!email)}
    text={viaStripe ? <p>Stripe devolverá el dinero al medio original. El saldo de la casa cambia solo cuando Stripe confirme la devolución. Disponible: <strong>{money(available)}</strong>.</p> : <p>Registra una devolución que <strong>ya hiciste</strong> en efectivo o por transferencia fuera de Zentry. Disponible: <strong>{money(available)}</strong>.</p>}
    onConfirm={async reason => { try { return await action.run(path(`/billing/payments/${payment.id}/refund`), { amountCents: toCents(amount), reason, ...(email ? { instructionsEmail: email } : {}) }, 'Devolución solicitada.'); } catch (e) { action.setError(errorText(e)); return false; } }}>
    <label>Importe a devolver en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></div></label>
    {payment.method === 'SPEI' && <label>Correo de quien pagó<input type="email" required value={email} onChange={e => setEmail(e.target.value)}/><small>Stripe le escribe para pedirle la cuenta donde recibirá el dinero.</small></label>}
  </ReasonDialog>;
}

/** Cash or a direct transfer received by administration. Card and SPEI arrive on their own. */
export function ManualPaymentDialog({ accountId, home, path, action, onClose }: { accountId: string; home: string; path: Scoped; action: FinanceAction; onClose: () => void }) {
  const [method, setMethod] = useState('CASH'), [amount, setAmount] = useState(''), [reference, setReference] = useState(''), [note, setNote] = useState(''), [effectiveAt, setEffectiveAt] = useState(''), [evidence, setEvidence] = useState<Evidence | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try { if (await action.run(path('/billing/payments/manual'), { accountId, amountCents: toCents(amount), method, reference, reason: note, ...(effectiveAt ? { effectiveLocal: effectiveAt } : {}), ...(evidence ? { evidence } : {}) }, 'Pago registrado y aplicado a las cuotas más antiguas.')) onClose(); }
    catch (err) { action.setError(errorText(err)); }
  }
  return <Modal title={`Registrar pago · ${home}`} onClose={() => { if (!action.busy) onClose(); }}><form onSubmit={submit}><fieldset disabled={action.busy}>
    <p className="fin-dialog-text">Para dinero que recibió administración. Los pagos con tarjeta o SPEI llegan solos; no los registres aquí.</p>
    <label>Medio<select value={method} onChange={e => setMethod(e.target.value)}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia directa</option></select></label>
    <div className="fin-fields"><label>Importe en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></div></label>
      <label>Fecha del pago<input type="datetime-local" value={effectiveAt} onChange={e => setEffectiveAt(e.target.value)}/><small>Hora de Ciudad de México. Vacío = ahora.</small></label></div>
    <label>Folio único de caja o transferencia<input required minLength={3} maxLength={100} value={reference} onChange={e => setReference(e.target.value)}/><small>Si se repite, el sistema lo detiene para no registrar dos veces el mismo dinero.</small></label>
    <label>Nota<input required minLength={3} maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="Por ejemplo: pagó en caja, recibo 0142"/></label>
    <label>Comprobante <span className="optional">(opcional · PDF, PNG o JPEG hasta 250 KB)</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => { const f = e.target.files?.[0]; setEvidence(null); if (!f) return; if (f.size > 250000) { action.setError('El comprobante debe pesar hasta 250 KB.'); return; } const reader = new FileReader(); reader.onload = () => { if (action.alive.current) setEvidence({ name: f.name, type: f.type, data: String(reader.result).split(',')[1] }); }; reader.onerror = () => action.setError('No se pudo leer el comprobante.'); reader.readAsDataURL(f); }}/></label>
  </fieldset><ErrorBox message={action.error}/><div className="modal-actions"><Button className="secondary" disabled={action.busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={action.busy}>Confirmar pago recibido</Button></div></form></Modal>;
}

/** The fraccionamiento's Stripe account: linked once, never replaced. */
export function StripeAccountCard({ data, path, action, enabled }: { data?: AdminData; path: Scoped; action: FinanceAction; enabled: boolean }) {
  const [confirm, setConfirm] = useState(false);
  return <section className="panel fin-section"><div className="fin-section-head"><div><h3>Cuenta de Stripe</h3><p>Donde el fraccionamiento recibe los pagos con tarjeta y SPEI. Zentry no recibe ni guarda ese dinero.</p></div>
    {data?.destination ? <span className="badge"><span/>Vinculada</span> : <span className="badge pending"><span/>Sin vincular</span>}</div>
    {data?.destination ? <dl className="fin-facts"><dt>Cuenta</dt><dd className="fin-mono">{data.destination.stripeAccount}</dd><dt>Última revisión con Stripe</dt><dd>{data.destination.reconciledAt ? dateTimeText(data.destination.reconciledAt) : 'Pendiente'}</dd></dl>
      : <Button disabled={action.busy || !enabled} onClick={() => { action.clear(); setConfirm(true); }}>Vincular cuenta de prueba</Button>}
    {confirm && <ReasonDialog title="Vincular cuenta de Stripe" confirm="Vincular" busy={action.busy} error={action.error} onClose={() => setConfirm(false)} text={<p>Se usará la cuenta configurada en el servidor para este fraccionamiento. Una vez vinculada no se puede cambiar por otra.</p>} onConfirm={reason => action.run(path('/billing/payments/destination'), { reason }, 'Cuenta vinculada.')}/>}
  </section>;
}

const DIFFERENCE: Record<string, string> = { PROVIDER_BALANCED: 'Cuadra', BANK_CONFIRMATION_UNAVAILABLE: 'Sin confirmación del banco', TAX_BREAKDOWN_UNAVAILABLE: 'Sin desglose de IVA', LEDGER_LINK_UNAVAILABLE: 'Sin pago vinculado en Zentry', NET_MISMATCH: 'El neto no cuadra', PRINCIPAL_MISMATCH: 'No cuadra con los pagos', CURRENCY_MISMATCH: 'Moneda distinta' };
type Settlement = { id: string; providerId: string; kind: string; amountCents: string; feeCents: string | null; taxCents: string | null; netCents: string | null; currency: string; difference: string; createdAt: string };
type Pending = { key: string; title: string; status: string; code: string | null; when?: string; act: 'task' | 'event'; id: string; kind?: string };
type DialogState = { type: 'retry' | 'verify' | 'event' | 'return' | 'link' | 'resolve' | 'reconcile'; item?: Pending; deposit?: NonNullable<AdminData['deposits']>[number] };

/** Items that need review, for counters elsewhere. */
export const reviewCount = (data?: AdminData) => (data?.tasks.filter(t => t.status === 'REVIEW').length ?? 0) + (data?.events.filter(e => e.status === 'REVIEW').length ?? 0);

/** What the system could not finish on its own, each with its reason and the actions that fit it. */
export function Reconciliation({ data, path, action, homes, onTaskCursor, onEventCursor, onFirstPage, paged }: {
  data: AdminData; path: Scoped; action: FinanceAction; homes: { id: string; label: string }[];
  onTaskCursor: (cursor: string) => void; onEventCursor: (cursor: string) => void; onFirstPage: () => void; paged: boolean;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [providerId, setProviderId] = useState(''), [email, setEmail] = useState(''), [linkHome, setLinkHome] = useState(''), [customerId, setCustomerId] = useState('');
  const [resolution, setResolution] = useState({ paymentId: '', reference: '', decision: 'SAME_PAYMENT' });
  const [showReport, setShowReport] = useState(false), [reportCursor, setReportCursor] = useState('');
  const report = useQuery<{ items: Settlement[]; cursor: string | null }>(showReport ? path(`/billing/payments/settlements${reportCursor ? `?cursor=${reportCursor}` : ''}`) : null);
  const home = (id?: string | null) => homes.find(h => h.id === id)?.label;
  const items: Pending[] = [
    ...data.tasks.map(t => ({ key: 't' + t.id, id: t.id, kind: t.kind, act: 'task' as const, status: t.status, code: t.errorCode, when: t.createdAt, title: [taskKind(t.kind), home(t.accountId)].filter(Boolean).join(' · ') })),
    ...data.events.map(e => ({ key: 'e' + e.id, id: e.id, act: 'event' as const, status: e.status, code: e.errorCode, title: `Aviso de Stripe (${e.eventType})` })),
  ];
  const review = items.filter(i => i.status === 'REVIEW').length;
  const open = (next: DialogState) => { action.clear(); setDialog(next); };
  const close = () => { setDialog(null); setProviderId(''); setEmail(''); };
  const providerHint = dialog?.item?.kind === 'REFUND' ? 're_' : dialog?.item?.kind === 'CUSTOMER' ? 'cus_' : 'pi_';

  return <div className="fin-stack">
    <section className="panel fin-section">
      <div className="fin-section-head"><div><h3>Pendientes</h3><p>Lo que el sistema no pudo terminar solo. Lo normal es que esta lista esté vacía; nada de aquí cambia saldos hasta verificarlo con Stripe.</p></div>
        {review > 0 && <span className="badge revoked"><span/>{review === 1 ? '1 requiere revisión' : `${review} requieren revisión`}</span>}</div>
      {!items.length ? <Empty icon={<CircleCheck/>} title="Todo en orden" text="No hay pagos ni avisos de Stripe pendientes."/> :
        <ul className="fin-rows">{items.map(i => { const issue = paymentIssue(i.code), canRetry = i.act === 'task' && i.status === 'REVIEW' && !issue?.fixFirst && i.code !== 'IDEMPOTENCY_WINDOW_EXPIRED';
          return <li key={i.key} className="fin-row fin-row-wrap">
            <span className={`fin-row-icon ${i.status === 'REVIEW' ? 'bad' : ''}`} aria-hidden="true">{i.status === 'REVIEW' ? '!' : <Clock size={17}/>}</span>
            <div className="fin-row-main payment-issue"><strong>{i.title}</strong><small>{i.status === 'REVIEW' ? 'Requiere revisión' : 'En proceso'}{i.when ? ` · ${dateTimeText(i.when)}` : ''}</small>
              <span className="fin-issue">{issue ? issue.text : 'Esperando a Stripe. No hay que hacer nada.'}</span>
              {issue?.fixFirst && <small className="fin-note">Reintentar fallará igual hasta corregir la causa.</small>}
              {i.code && <small className="muted fin-mono">Código: {i.code}</small>}</div>
            {i.status === 'REVIEW' && <div className="fin-row-actions">
              {canRetry && <Button className="secondary small-button" onClick={() => open({ type: 'retry', item: i })}>Reintentar</Button>}
              {i.act === 'task' && ['CHECKOUT', 'DEPOSIT', 'REFUND', 'CUSTOMER'].includes(i.kind!) && <Button className="secondary small-button" onClick={() => open({ type: 'verify', item: i })}>Ya existe en Stripe</Button>}
              {i.act === 'event' && <Button className="secondary small-button" onClick={() => open({ type: 'event', item: i })}>Revisar con Stripe</Button>}
            </div>}
          </li>; })}</ul>}
      {(data.taskCursor || data.eventCursor || paged) && <div className="fin-actions">{data.taskCursor && <Button className="secondary" onClick={() => onTaskCursor(data.taskCursor!)}>Más pagos pendientes</Button>}{data.eventCursor && <Button className="secondary" onClick={() => onEventCursor(data.eventCursor!)}>Más avisos</Button>}{paged && <Button className="secondary" onClick={onFirstPage}>Volver al inicio</Button>}</div>}
    </section>

    {!!data.deposits?.length && <section className="panel fin-section"><h3>Transferencias recibidas en proceso</h3><p className="small muted">Ya se acreditaron a la casa. Stripe las termina de procesar solas; devuélvelas solo si alguien transfirió por error.</p>
      <ul className="fin-rows">{data.deposits.map(dep => <li key={dep.id} className="fin-row"><span className="fin-row-icon"><Landmark size={17}/></span><div className="fin-row-main"><strong>{home(dep.accountId) ?? 'Sin casa identificada'}</strong><small>{dateTimeText(dep.effectiveAt)} · <span className="fin-mono">{dep.providerId}</span></small></div>
        <div className="fin-row-side"><strong className="fin-amount">{money(dep.amountCents)}</strong>{dep.accountId && <button type="button" className="fin-link" onClick={() => open({ type: 'return', deposit: dep })}>Devolver</button>}</div></li>)}</ul></section>}

    <details className="panel fin-section fin-advanced"><summary><strong>Herramientas avanzadas</strong><span>Para soporte: vincular depósitos, resolver referencias repetidas y el reporte de Stripe.</span></summary>
      <div className="fin-tools">
        <div className="fin-tool"><h4>Depósito SPEI sin casa</h4><p>Si llegó dinero de un cliente de Stripe que no está ligado a ninguna casa, vincúlalo después de revisar el comprobante.</p><Button className="secondary" onClick={() => open({ type: 'link' })}>Vincular cliente a una casa</Button></div>
        <div className="fin-tool"><h4>Referencia repetida</h4><p>Cuando un pago manual y uno de Stripe tienen la misma referencia, decide si es el mismo dinero o son dos pagos.</p><Button className="secondary" onClick={() => open({ type: 'resolve' })}>Resolver referencia</Button></div>
        <div className="fin-tool"><h4>Reporte de Stripe</h4><p>Cobros, comisiones y depósitos al banco según Stripe, para cuadrar con el banco.</p><div className="fin-actions"><Button className="secondary" onClick={() => setShowReport(v => !v)}>{showReport ? 'Ocultar reporte' : 'Ver reporte'}</Button><Button className="secondary" onClick={() => open({ type: 'reconcile' })}>Volver a consultar a Stripe</Button></div></div>
      </div>
      {showReport && <div className="fin-report"><ErrorBox message={report.error}/>{report.loading && !report.data ? <Loading/> : !report.data?.items.length ? <p className="muted">Stripe aún no reporta movimientos.</p> :
        <ul className="fin-rows">{report.data.items.map(item => <li key={item.id} className="fin-row fin-row-wrap"><div className="fin-row-main"><strong>{item.kind === 'PAYOUT' ? 'Depósito al banco' : 'Movimiento en Stripe'}</strong><small>{dateTimeText(item.createdAt)} · <span className="fin-mono">{item.providerId}</span></small>
          <small>{item.difference.split(',').map(d => DIFFERENCE[d] ?? d).join(' · ')}</small></div>
          <div className="fin-row-side"><strong className="fin-amount">{money(item.amountCents)}</strong>{item.feeCents !== null && <small>Comisión {money(item.feeCents)}{item.taxCents !== null ? ` (IVA ${money(item.taxCents)})` : ''}</small>}{item.netCents !== null && <small>Neto {money(item.netCents)}</small>}</div></li>)}</ul>}
        {report.data?.cursor && <Button className="secondary" onClick={() => setReportCursor(report.data!.cursor!)}>Más movimientos</Button>}</div>}
    </details>

    {dialog?.type === 'retry' && <ReasonDialog title="Reintentar" confirm="Reintentar" busy={action.busy} error={action.error} onClose={close} text={<p>Se manda a Stripe <strong>la misma solicitud</strong>, sin riesgo de cobrar dos veces. Úsalo cuando la falla fue temporal.</p>} onConfirm={reason => action.run(path(`/billing/payments/tasks/${dialog.item!.id}/retry`), { reason }, 'Se reintentará en el próximo minuto.')}/>}
    {dialog?.type === 'event' && <ReasonDialog title="Revisar con Stripe" confirm="Revisar" busy={action.busy} error={action.error} onClose={close} text={<p>Zentry volverá a preguntar a Stripe por este aviso y aplicará lo que Stripe confirme.</p>} onConfirm={reason => action.run(path(`/billing/payments/events/${dialog.item!.id}/retry`), { reason }, 'Se revisará en el próximo minuto.')}/>}
    {dialog?.type === 'verify' && <ReasonDialog title="La operación ya existe en Stripe" confirm="Verificar y vincular" busy={action.busy} error={action.error} onClose={close} ready={providerId.startsWith(providerHint)}
      text={<p>Úsalo solo si en Stripe <strong>sí existe</strong> el pago, la devolución o el cliente de esta solicitud. Zentry no acredita por lo que escribas: le pregunta a Stripe y revisa casa, importe y moneda antes de aplicar nada.</p>}
      onConfirm={reason => action.run(path(`/billing/payments/tasks/${dialog.item!.id}/resolve`), { reason, providerId }, 'Se verificará con Stripe en el próximo minuto.')}>
      <label>Identificador en Stripe<input required value={providerId} onChange={e => setProviderId(e.target.value.trim())} placeholder={`${providerHint}…`}/><small>{providerHint === 'pi_' ? 'Empieza con pi_. Está en Stripe → Pagos, en el detalle del pago.' : providerHint === 're_' ? 'Empieza con re_. Está en el detalle de la devolución en Stripe.' : 'Empieza con cus_. Está en Stripe → Clientes.'}</small></label>
    </ReasonDialog>}
    {dialog?.type === 'return' && dialog.deposit && <ReasonDialog title="Devolver transferencia" confirm="Devolver" danger busy={action.busy} error={action.error} onClose={close} ready={!!email}
      text={<p>Se devolverán <strong>{money(dialog.deposit.amountCents)}</strong> a quien transfirió, y se retirará ese crédito de la casa cuando Stripe confirme.</p>}
      onConfirm={reason => action.run(path(`/billing/payments/deposits/${dialog.deposit!.id}/return`), { reason, instructionsEmail: email }, 'Devolución solicitada.')}>
      <label>Correo de quien transfirió<input type="email" required value={email} onChange={e => setEmail(e.target.value)}/><small>Stripe le escribe para pedirle la cuenta donde recibirá el dinero.</small></label>
    </ReasonDialog>}
    {dialog?.type === 'link' && <ReasonDialog title="Vincular cliente de Stripe a una casa" confirm="Verificar y vincular" busy={action.busy} error={action.error} onClose={close} ready={!!linkHome && customerId.startsWith('cus_')}
      text={<p>Hazlo solo después de revisar el comprobante. Si la casa ya tiene su CLABE, se conserva.</p>}
      onConfirm={reason => action.run(path('/billing/payments/customer-link'), { accountId: linkHome, customerId, reason }, 'Se verificará con Stripe en el próximo minuto.')}>
      <label>Casa<select required value={linkHome} onChange={e => setLinkHome(e.target.value)}><option value="">Elige una casa</option>{homes.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}</select></label>
      <label>Cliente de Stripe<input required value={customerId} onChange={e => setCustomerId(e.target.value.trim())} placeholder="cus_…"/></label>
    </ReasonDialog>}
    {dialog?.type === 'resolve' && <ReasonDialog title="Resolver referencia repetida" confirm="Guardar decisión" busy={action.busy} error={action.error} onClose={close} ready={!!resolution.paymentId && resolution.reference.length >= 3}
      text={<p>Revisa los comprobantes y los identificadores. Nunca decidas solo por importe o fecha.</p>}
      onConfirm={reason => action.run(path('/billing/payments/reference-resolution'), { ...resolution, reason }, 'Decisión guardada.')}>
      <label>Pago ya registrado<select required value={resolution.paymentId} onChange={e => setResolution(r => ({ ...r, paymentId: e.target.value }))}><option value="">Elige un pago</option>{data.payments.map(p => <option key={p.id} value={p.id}>{home(p.accountId) ?? 'Casa'} · {METHOD[p.method]} · {money(p.amountCents)}</option>)}</select></label>
      <label>Referencia que coincide<input required value={resolution.reference} onChange={e => setResolution(r => ({ ...r, reference: e.target.value }))}/></label>
      <label>Resultado<select value={resolution.decision} onChange={e => setResolution(r => ({ ...r, decision: e.target.value }))}><option value="SAME_PAYMENT">Es el mismo dinero: conservar un solo crédito</option><option value="DISTINCT_PAYMENT">Son dos pagos distintos</option></select></label>
    </ReasonDialog>}
    {dialog?.type === 'reconcile' && <ReasonDialog title="Volver a consultar a Stripe" confirm="Consultar" busy={action.busy} error={action.error} onClose={close} text={<p>Zentry volverá a revisar con Stripe los pagos, depósitos y comisiones en los próximos minutos.</p>} onConfirm={reason => action.run(path('/billing/payments/reconcile'), { reason }, 'Se consultará a Stripe en los próximos minutos.')}/>}
  </div>;
}

/** Payments data of one fraccionamiento, with its own pagination of pending items. */
export function useAdminPayments(communityId: string | undefined, enabled: boolean) {
  const path = scopedPath(communityId);
  const [taskCursor, setTaskCursor] = useState(''), [eventCursor, setEventCursor] = useState('');
  const query = useQuery<AdminData>(enabled ? path(`/billing/payments${taskCursor || eventCursor ? `?${[taskCursor && `taskCursor=${taskCursor}`, eventCursor && `eventCursor=${eventCursor}`].filter(Boolean).join('&')}` : ''}`) : null, 15000);
  return { ...query, path, setTaskCursor, setEventCursor, paged: !!(taskCursor || eventCursor), firstPage: () => { setTaskCursor(''); setEventCursor(''); } };
}

/** Payments and pending items of one fraccionamiento (Tesorería composes the same pieces in tabs). */
function AdminPaymentsContent({ communityId, accountId, enabled, refresh }: { communityId?: string; accountId?: string; enabled: boolean; refresh: () => void }) {
  const data = useAdminPayments(communityId, true);
  const action = useFinanceAction(() => { data.refresh(); refresh(); });
  const [manual, setManual] = useState(false);
  return <div className="fin-stack"><ErrorBox message={action.error || data.error}/>{action.notice && <Success>{action.notice}</Success>}{data.loading && !data.data ? <Loading/> : data.data && <>
    {enabled && accountId && <div className="fin-actions"><Button onClick={() => { action.clear(); setManual(true); }}><Banknote size={17}/> Registrar pago</Button></div>}
    <section className="panel fin-section"><h3>Pagos</h3><PaymentList payments={data.data.payments.filter(p => !accountId || p.accountId === accountId)} path={data.path} action={action}/></section>
    <Reconciliation data={data.data} path={data.path} action={action} homes={[]} onTaskCursor={data.setTaskCursor} onEventCursor={data.setEventCursor} onFirstPage={data.firstPage} paged={data.paged}/>
  </>}{manual && accountId && <ManualPaymentDialog accountId={accountId} home="vivienda seleccionada" path={data.path} action={action} onClose={() => setManual(false)}/>}</div>;
}

export function ResidentPayments(props: { propertyId: string }) {
  return <FinancialBoundary scope={props.propertyId}><ResidentPaymentsContent {...props}/></FinancialBoundary>;
}
export function AdminPayments(props: { communityId?: string; accountId?: string; enabled: boolean; refresh: () => void }) {
  return <FinancialBoundary scope={`${props.communityId}:${props.accountId}`}><AdminPaymentsContent {...props}/></FinancialBoundary>;
}
