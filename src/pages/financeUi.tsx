import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, errorText, financialState } from '../api';
import { Button, ErrorBox, Modal, Skeleton, SkeletonCards, SkeletonRows } from '../components/ui';

// Pieces shared by Pagos (resident) and Tesorería (administration): money, dates, actions and dialogs.

/** Cents (as the API sends them, strings) to `$1,234.50 MXN`. */
export function money(cents: string | bigint) {
  const n = BigInt(cents); const a = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}$${(a / 100n).toLocaleString('en-US')}.${(a % 100n).toString().padStart(2, '0')} MXN`;
}
/** `1234.5` → `"123450"`. Exact: no floating point ever touches money. */
export function toCents(value: string, negative = false) {
  const text = value.trim().replace(/[$,\s]/g, '');
  if (!(negative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(text)) throw new Error('Escribe un importe en pesos, con hasta dos decimales.');
  const [whole, decimal = ''] = text.replace('-', '').split('.');
  return ((BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'))) * (text.startsWith('-') ? -1n : 1n)).toString();
}
/** `"123450"` → `"1234.50"` for an input's value. */
export const pesos = (cents: string) => { const n = BigInt(cents); const a = n < 0n ? -n : n; return `${n < 0n ? '-' : ''}${a / 100n}.${(a % 100n).toString().padStart(2, '0')}`; };
const zone = 'America/Mexico_City';
export const monthName = (month: string) => new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00Z`));
export const dayText = (iso: string) => new Intl.DateTimeFormat('es-MX', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
export const dateTimeText = (iso: string) => new Intl.DateTimeFormat('es-MX', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
/** A charge's due instant is the start of day 21: the last day to pay is the day before. */
export const lastPayDay = (dueAt: string) => dayText(new Date(new Date(dueAt).getTime() - 12 * 3600_000).toISOString());
export const currentMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
export const METHOD: Record<string, string> = { CARD: 'Tarjeta', SPEI: 'Transferencia SPEI', CASH: 'Efectivo', TRANSFER: 'Transferencia directa' };

/** Wide screens show a detail beside its list; phones open it over the list. */
export function useWide(query = '(min-width: 1100px)') {
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => { const list = window.matchMedia(query); const update = () => setWide(list.matches); list.addEventListener('change', update); return () => list.removeEventListener('change', update); }, [query]);
  return wide;
}

/**
 * Money actions. An uncertain request keeps its idempotency key for the life of the page, so a
 * retry after a timeout can never become a second operation. Reads discard answers that arrive
 * after the session, home or community changed.
 */
export function useFinanceAction(refresh: () => void) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const pending = useRef(new Map<string, string>()), locked = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function run(path: string, body: unknown, done = 'Listo.') {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    const signature = JSON.stringify([path, body]); const key = pending.current.get(signature) ?? crypto.randomUUID(); pending.current.set(signature, key);
    try { await api(path, { method: 'POST', body, key }); pending.current.delete(signature); if (alive.current) setNotice(done); refresh(); return true; }
    catch (e) { if (alive.current) setError(errorText(e)); return false; }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  async function read<T>(path: string, receive: (value: T) => void) {
    const epoch = financialState();
    try { const result = await api<T>(path); if (alive.current && epoch === financialState()) receive(result); } catch (e) { if (alive.current) setError(errorText(e)); }
  }
  return { run, read, busy, error, setError, notice, setNotice, alive, clear: () => { setError(''); setNotice(''); } };
}

/** Every financial change asks why, and the answer goes to the audit trail. */
export function ReasonDialog({ title, text, confirm, danger, busy, error, children, ready = true, onConfirm, onClose, placeholder = 'Por ejemplo: lo pidió la Mesa Directiva' }: {
  title: string; text?: ReactNode; confirm: string; danger?: boolean; busy: boolean; error?: string; children?: ReactNode; ready?: boolean;
  onConfirm: (reason: string) => Promise<boolean> | boolean | void; onClose: () => void; placeholder?: string;
}) {
  const [reason, setReason] = useState('');
  async function submit(e: FormEvent) { e.preventDefault(); if (await onConfirm(reason.trim())) onClose(); }
  return <Modal title={title} onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit}><fieldset disabled={busy}>
    {text && <div className="fin-dialog-text">{text}</div>}
    {children}
    <label>Motivo<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder={placeholder}/><small>Queda guardado en la auditoría con tu nombre y la hora.</small></label>
  </fieldset><ErrorBox message={error}/><div className="modal-actions"><Button className="secondary" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" className={danger ? 'danger' : ''} busy={busy} disabled={!ready || reason.trim().length < 3}>{confirm}</Button></div></form></Modal>;
}

export type Receipt = { folio: string; amountCents: string; retainedCents?: string; currency: string; date: string | null; method: string; notice: string; sandbox?: boolean; state?: string };
export function ReceiptDialog({ value, home, onClose }: { value: Receipt; home?: string; onClose: () => void }) {
  const changed = value.retainedCents !== undefined && value.retainedCents !== value.amountCents;
  return <Modal title="Recibo de pago" onClose={onClose}><div className="fin-receipt" aria-label="Recibo">
    {value.sandbox && <p className="fin-flag">Pago de prueba · no representa dinero real</p>}
    <div className="fin-receipt-amount"><span>Importe pagado</span><strong>{money(value.amountCents)}</strong></div>
    <dl className="fin-facts">
      <dt>Folio</dt><dd className="fin-mono">{value.folio}</dd>
      {home && <><dt>Vivienda</dt><dd>{home}</dd></>}
      <dt>Forma de pago</dt><dd>{METHOD[value.method] ?? value.method}</dd>
      <dt>Fecha del pago</dt><dd>{value.date ? dateTimeText(value.date) : 'Fecha histórica no registrada'}</dd>
      {changed && <><dt>Importe vigente</dt><dd>{money(value.retainedCents!)} <small>(después de devoluciones o aclaraciones)</small></dd></>}
    </dl>
    <p className="small muted">{value.notice}</p>
  </div><div className="modal-actions"><Button className="secondary" onClick={() => window.print()}>Imprimir</Button><Button onClick={onClose}>Cerrar</Button></div></Modal>;
}

/** Pagos while it loads: the balance card, both ways to pay and a couple of rows. */
export function ResidentSkeleton() {
  return <div className="skeleton-block" role="status" aria-busy="true"><span className="sr-only">Cargando tus pagos…</span>
    <span className="fin-sk-balance"><Skeleton w={64} h={13}/><Skeleton w="58%" h={40}/><Skeleton w="72%" h={13}/></span>
    <span className="fin-sk-methods">{[0, 1].map(i => <span key={i} className="fin-sk-card"><span className="fin-sk-head"><Skeleton w={42} h={42}/><span className="skeleton-lines"><Skeleton w="62%" h={16}/><Skeleton w="88%" h={12}/></span></span><Skeleton h={62}/><Skeleton h={44}/></span>)}</span>
    <SkeletonRows rows={2}/>
  </div>;
}
/** Tesorería while it loads: title, tabs, totals and rows. */
export function TreasurySkeleton() {
  return <div className="skeleton-block" role="status" aria-busy="true"><span className="sr-only">Cargando tesorería…</span>
    <span className="skeleton-heading"><Skeleton w={150} h={26}/><Skeleton w="56%" h={13}/></span>
    <span className="fin-sk-tabs">{[86, 92, 64, 104, 118].map((w, i) => <Skeleton key={i} w={w} h={34}/>)}</span>
    <SkeletonCards/><SkeletonRows rows={4}/>
  </div>;
}

export function Stat({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: '' | 'good' | 'warn' | 'bad' | 'accent' }) {
  return <div className={`fin-stat ${tone}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}
