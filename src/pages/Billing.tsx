import { FinancialBoundary } from '../components/FinancialBoundary';
import { useState, type FormEvent } from 'react';
import { api, errorText } from '../api';
import { useQuery } from '../hooks';
import { Button, ErrorBox, Loading } from '../components/ui';
import './Billing.css';
import { AdminPayments } from './Payments';

type Concept = { id: string; conceptId: string; name: string; category: string; baseCents: string; effectiveMonth: string; active: boolean };
type Account = { id: string; propertyId: string; payerId: string | null; balanceCents: string; overdueCents: string; property?: { street: string; houseNumber: string; memberships: { userId: string; user: { fullName: string } }[] } };
type Overview = { accounts: Account[]; concepts: Concept[]; fees: { accountId: string; conceptId: string; adjustmentCents: string; effectiveMonth: string }[]; currentMonth: string };
type Statement = { balanceCents: string; overdueCents: string; movements: { id: string; description: string; amountCents: string; effectiveAt: string; dueAt: string | null; kind: string; reversesId: string | null; reason: string; period: string | null }[] };
export function mxn(cents: string) { const n = BigInt(cents); const a = n < 0n ? -n : n; return `${n < 0n ? '-' : ''}$${(a / 100n).toLocaleString('en-US')}.${(a % 100n).toString().padStart(2, '0')} MXN`; }
function cents(value: string) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error('Escribe un importe con hasta dos decimales.');
  const [whole, decimal = ''] = value.replace('-', '').split('.');
  return ((BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'))) * (value.startsWith('-') ? -1n : 1n)).toString();
}
const categories: Record<string, string> = { MAINTENANCE: 'Mantenimiento', EXTRAORDINARY: 'Cuota extraordinaria', RESERVE: 'Fondo de reserva', FINE: 'Multa', OTHER: 'Otro' };
const monthNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);

function BillingContent({ canConfigure = false, userId, communityId }: { canConfigure?: boolean; userId?: string; communityId?: string }) {
  const scoped = (path: string) => communityId ? `${path}${path.includes('?') ? '&' : '?'}communityId=${encodeURIComponent(communityId)}` : path;
  const access = useQuery<{ enabled: boolean; canManage: boolean; canResolve: boolean; canConfigure: boolean }>(scoped('/billing/availability'));
  const settings = useQuery<{ enabled: boolean; emissionEnabled: boolean; startMonth: string } | null>(access.data?.canManage || canConfigure ? scoped('/billing/settings') : null);
  const overview = useQuery<Overview>(access.data?.canManage ? scoped('/billing/overview') : null);
  const grants = useQuery<{ users: { id: string; fullName: string; active: boolean }[]; operators: { id: string; fullName: string }[] }>(canConfigure ? scoped('/billing/grants') : null);
  const [selected, setSelected] = useState('');
  const statement = useQuery<Statement>(selected && access.data?.canManage ? scoped(`/billing/accounts/${selected}/statement`) : null);
  const [month, setMonth] = useState(monthNow);
  const [name, setName] = useState('Mantenimiento'); const [base, setBase] = useState(''); const [category, setCategory] = useState('MAINTENANCE'); const [conceptId, setConceptId] = useState('');
  const [feeConcept, setFeeConcept] = useState(''); const [adjustment, setAdjustment] = useState('0'); const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  // Keep an uncertain operation's key for retries for the entire lifetime of the page.
  const [pending] = useState(() => new Map<string, string>());
  const [reverseId, setReverseId] = useState(''); const [reverseReason, setReverseReason] = useState('');
  const [grantUser, setGrantUser] = useState('');
  const [operatorUser, setOperatorUser] = useState(''), [operatorReason, setOperatorReason] = useState('');
  const latest = overview.data?.concepts.filter((c, i, all) => !all.slice(0, i).some(v => v.conceptId === c.conceptId)) ?? [];
  const effectiveConcepts = overview.data?.concepts.filter((c, i, all) => c.effectiveMonth <= month && !all.slice(0, i).some(v => v.conceptId === c.conceptId && v.effectiveMonth <= month)) ?? [];
  const home = overview.data?.accounts.find(a => a.id === selected);
  async function mutate(path: string, body: unknown) {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    const signature = JSON.stringify([path, body]); const key = pending.get(signature) ?? crypto.randomUUID(); pending.set(signature, key);
    try { await api(scoped(path), { method: 'POST', body, key }); pending.delete(signature); access.refresh(); settings.refresh(); overview.refresh(); statement.refresh(); grants.refresh(); setNotice('Cambio guardado.'); return true; }
    catch (e) { setError(errorText(e)); return false; }
    finally { setBusy(false); }
  }
  async function saveConcept(e: FormEvent) {
    e.preventDefault();
    try { if (await mutate('/billing/concepts', { ...(conceptId ? { conceptId } : {}), name, category, baseCents: cents(base), effectiveMonth: month, active: true, reason })) { setName(''); setBase(''); setReason(''); setConceptId(''); } }
    catch (e) { setError(errorText(e)); }
  }
  async function saveFee(e: FormEvent) {
    e.preventDefault();
    try { await mutate('/billing/fees', { accountId: selected, conceptId: feeConcept, adjustmentCents: cents(adjustment), effectiveMonth: month, reason }); }
    catch (e) { setError(errorText(e)); }
  }
  return <div className="stack billing-page">
    <section className="panel"><h2>Cobranza</h2><p>Cuotas mensuales · corte el día 1 · pago oportuno hasta el día 20, hora de Ciudad de México.</p><p>Saldos iniciales en cero. Zentry no cobra comisión por cobranza.</p></section>
    <ErrorBox message={error || access.error || overview.error || settings.error || grants.error}/>{notice && <p role="status">{notice}</p>}
    {access.loading && <Loading/>}
    {canConfigure && <section className="panel"><h3>Habilitación del fraccionamiento</h3><p>Al habilitar, la emisión permanece pausada hasta revisar conceptos y ajustes.</p><label>Primer periodo<input type="month" value={settings.data?.startMonth ?? month} disabled={!!settings.data} onChange={e => setMonth(e.target.value)}/></label><Button disabled={busy} onClick={() => void mutate('/billing/settings', { enabled: !settings.data?.enabled, startMonth: settings.data?.startMonth ?? month, reason: settings.data?.enabled ? 'Deshabilitar cobranza' : 'Habilitar apertura en cero' })}>{settings.data?.enabled ? 'Deshabilitar cobranza' : 'Habilitar cobranza'}</Button>
      <form onSubmit={e => { e.preventDefault(); void mutate('/billing/grants', { userId: grantUser, role: 'TREASURER', active: true, reason: 'Asignación de tesorería' }); }}><label>Persona responsable de tesorería<select required value={grantUser} onChange={e => setGrantUser(e.target.value)}><option value="">Selecciona una persona</option>{grants.data?.users.filter(u => u.id !== userId).map(u => <option key={u.id} value={u.id}>{u.fullName}{u.active ? ' · Tesorero activo' : ''}</option>)}</select></label><div className="billing-actions"><Button type="submit" disabled={busy}>Asignar tesorero</Button><Button type="button" className="secondary" disabled={busy || !grantUser} onClick={() => void mutate('/billing/grants', { userId: grantUser, role: 'TREASURER', active: false, reason: 'Revocación de tesorería' })}>Revocar tesorero</Button></div></form>
      <form onSubmit={e => { e.preventDefault(); void mutate('/billing/grants', { userId: operatorUser, role: 'OPERATOR', active: true, reason: operatorReason }); }}><label>Otra persona de plataforma para soporte financiero<select required value={operatorUser} onChange={e => setOperatorUser(e.target.value)}><option value="">Selecciona a otra persona</option>{grants.data?.operators?.filter(u => u.id !== userId).map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></label><label>Motivo de aprobación de soporte<input required minLength={3} maxLength={300} value={operatorReason} onChange={e => setOperatorReason(e.target.value)}/></label><Button type="submit" disabled={busy}>Aprobar soporte financiero</Button><Button type="button" disabled={busy || !operatorUser || operatorReason.length < 3} onClick={() => void mutate('/billing/grants', { userId: operatorUser, role: 'OPERATOR', active: false, reason: operatorReason })}>Revocar soporte financiero</Button></form>
    </section>}
    {!access.loading && !access.data?.canManage && !canConfigure && <section className="panel"><p>La cobranza no está habilitada o no tienes permiso financiero.</p></section>}
    {access.data?.canResolve && <AdminPayments key={`${communityId ?? "local"}:${selected}`} communityId={communityId} accountId={selected || undefined} enabled={access.data.enabled} refresh={() => { overview.refresh(); statement.refresh(); }}/>}
    {access.data?.canManage && <>
      <section className="panel"><h3>Emisión mensual</h3><p>{settings.data?.emissionEnabled ? 'La emisión está activa. El proceso revisa cada minuto los cargos pendientes desde el primer periodo.' : 'Emisión pausada. Configura primero los conceptos y ajustes de cada vivienda.'}</p><Button disabled={busy} onClick={() => void mutate('/billing/emission', { emissionEnabled: !settings.data?.emissionEnabled, reason: settings.data?.emissionEnabled ? 'Pausa de emisión mensual' : 'Configuración revisada, activar emisión mensual' })}>{settings.data?.emissionEnabled ? 'Pausar emisión' : 'Activar emisión mensual'}</Button></section>
      <section className="panel"><h3>Conceptos y cuotas base</h3><p>Las versiones nuevas conservan el historial. Si ya se emitió un periodo, programa el cambio para el siguiente.</p>
        <div className="billing-list">{latest.map(c => <div key={c.id}><strong>{c.name}</strong><span>{mxn(c.baseCents)} · desde {c.effectiveMonth} · {c.active ? 'Activo' : 'Archivado'}</span><div className="billing-actions"><Button className="secondary" disabled={busy} onClick={() => { setConceptId(c.conceptId); setName(c.name); setCategory(c.category); setBase(`${BigInt(c.baseCents) / 100n}.${(BigInt(c.baseCents) % 100n).toString().padStart(2, '0')}`); }}>Preparar nueva versión</Button><Button className="secondary" disabled={busy || reason.trim().length < 3} onClick={() => void mutate('/billing/concepts', { conceptId: c.conceptId, name: c.name, category: c.category, baseCents: c.baseCents, effectiveMonth: month, active: false, reason })}>Archivar desde el periodo elegido</Button></div></div>)}</div>
        <form onSubmit={saveConcept}><fieldset disabled={busy}><legend>{conceptId ? 'Nueva versión del concepto' : 'Nuevo concepto mensual'}</legend><div className="billing-fields"><label>Concepto<input required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label><label>Tipo<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(categories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>Cuota base en MXN<input required inputMode="decimal" value={base} onChange={e => setBase(e.target.value)}/></label><label>Vigente desde<input required type="month" value={month} onChange={e => setMonth(e.target.value)}/></label></div><label>Motivo del cambio<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/></label><div className="billing-actions"><Button type="submit">Guardar concepto</Button>{conceptId && <Button type="button" className="secondary" onClick={() => setConceptId('')}>Crear otro concepto</Button>}</div></fieldset></form>
      </section>
      <section className="panel"><h3>Saldos por vivienda</h3>{overview.loading && <Loading/>}<div className="billing-list">{overview.data?.accounts.map(a => <button className="billing-home" key={a.id} onClick={() => { setSelected(a.id); setReverseId(''); }} aria-pressed={selected === a.id}><strong>{a.property?.street} · Casa {a.property?.houseNumber}</strong><span>Saldo {mxn(a.balanceCents)} · vencido {mxn(a.overdueCents)}</span></button>)}</div></section>
      {home && <section className="panel"><h3>{home.property?.street} · Casa {home.property?.houseNumber}</h3><label>Titular financiero<select aria-label="Titular financiero" value={home.payerId ?? ''} disabled={busy} onChange={e => void mutate(`/billing/accounts/${home.id}/payer`, { payerId: e.target.value || null, reason: 'Actualización del titular financiero' })}><option value="">Sin titular asignado</option>{home.property?.memberships.map(m => <option key={m.userId} value={m.userId}>{m.user.fullName}</option>)}</select></label>
        <h3>Cuotas de esta vivienda para {month}</h3><div className="billing-list">{effectiveConcepts.filter(c => c.active).map(c => { const fee = overview.data?.fees.find(f => f.accountId === selected && f.conceptId === c.conceptId && f.effectiveMonth <= month); const extra = fee?.adjustmentCents ?? '0'; return <div key={c.id}><strong>{c.name}: {mxn((BigInt(c.baseCents) + BigInt(extra)).toString())}</strong><span>Base {mxn(c.baseCents)} · ajuste {mxn(extra)}</span></div>; })}</div>
        <form onSubmit={saveFee}><fieldset disabled={busy}><legend>Ajuste de cuota de esta vivienda</legend><label>Concepto<select required value={feeConcept} onChange={e => setFeeConcept(e.target.value)}><option value="">Elige un concepto</option>{latest.map(c => <option key={c.conceptId} value={c.conceptId}>{c.name}</option>)}</select></label><div className="billing-fields"><label>Ajuste en MXN (se suma a la base)<input required inputMode="decimal" value={adjustment} onChange={e => setAdjustment(e.target.value)}/></label><label>Desde el periodo<input type="month" required value={month} onChange={e => setMonth(e.target.value)}/></label></div><label>Motivo<input required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/></label><Button type="submit">Guardar ajuste</Button></fieldset></form>
        <h3>Estado de cuenta</h3><ErrorBox message={statement.error}/>{statement.loading ? <Loading/> : <><p>Saldo: {mxn(statement.data?.balanceCents ?? '0')}</p>{!statement.data?.movements.length && <p>Sin movimientos. Saldo inicial en cero.</p>}<div className="billing-list">{statement.data?.movements.map(m => <div key={m.id}><strong>{m.description} · {mxn(m.amountCents)}</strong><span>{m.period ?? new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium' }).format(new Date(m.effectiveAt))} · {m.reason}</span>{m.kind !== 'REVERSAL' && !statement.data?.movements.some(r => r.reversesId === m.id) && <Button className="secondary" disabled={busy} onClick={() => { setReverseId(m.id); setReverseReason(''); }}>Corregir con reverso</Button>}</div>)}</div></>}
        {reverseId && <form onSubmit={async e => { e.preventDefault(); if (await mutate(`/billing/movements/${reverseId}/reverse`, { reason: reverseReason })) setReverseId(''); }}><p>Se anulará el movimiento completo con un movimiento inverso. El original permanecerá en el historial.</p><label>Motivo del reverso<input required minLength={3} maxLength={300} value={reverseReason} onChange={e => setReverseReason(e.target.value)}/></label><div className="billing-actions"><Button type="submit" disabled={busy}>Confirmar reverso</Button><Button type="button" className="secondary" onClick={() => setReverseId('')}>Cancelar</Button></div></form>}
      </section>}
    </>}
  </div>;
}

export function Billing(props: { canConfigure?: boolean; userId?: string; communityId?: string }) {
  return <FinancialBoundary scope={`${props.userId}:${props.communityId}`}><BillingContent {...props}/></FinancialBoundary>;
}
