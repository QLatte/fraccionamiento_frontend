import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Landmark, ShieldCheck, UserPlus } from 'lucide-react';
import { errorText } from '../api';
import { useMutation, useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Info, Loading, Modal, Success } from '../components/ui';
import TrashIcon from '../components/icons/AnimatedTrash';
import { ReasonDialog, currentMonth, dayText, money, monthName, pesos, toCents, useFinanceAction } from './financeUi';
import { PrivadaContent } from './PrivadaFinance';
import { ONLINE_LABEL, type Online } from './PrivadaOnline';
import './Chat.css';
import './Billing.css';
import './AdminPrivadas.css';

// Privadas (administration): who administers each privada (its chat and its finances) and, with
// the privada model, how the fraccionamiento collects: each privada bills its homes and deposits
// the fraccionamiento a fixed amount per home and month.

type RepPrivada = { clusterId: string; name: string; type: string; representatives: { userId: string; name: string; active: boolean }[]; owners: { userId: string; name: string; home: string }[] };
type FinPrivada = { clusterId: string; name: string; type: string; online?: Online['phase']; homes: number; enabled: boolean; startMonth: string | null; configured: boolean; owedCents: string; paidCents: string; pendingCents: string; balanceCents: string };
type PendingDeposit = { id: string; clusterId: string; privada: string; amountCents: string; depositedAt: string; reference: string; registeredBy: string | null; mine: boolean; createdAt: string };
type Finance = { role: 'ADMIN'; privadaModel: boolean; billingStartMonth: string; currentMonth: string; rates: { id: string; amountCents: string; effectiveMonth: string; createdAt: string }[]; privadas: FinPrivada[]; pendingDeposits: PendingDeposit[] };
type Action = ReturnType<typeof useFinanceAction>;

const title = (p: { name: string; type: string }) => `${p.type === 'PRIVADA' ? 'Privada ' : ''}${p.name}`;

export function AdminPrivadas() {
  const reps = useQuery<{ data: RepPrivada[] }>('/admin/representatives');
  const finance = useQuery<Finance>('/privadas');
  const action = useFinanceAction(() => { finance.refresh(); reps.refresh(); });
  const [open, setOpen] = useState<string | null>(null);
  const f = finance.data;

  // One privada's finances, as administration sees them (same page its administrator uses).
  if (open) return <section className="fin-stack">
    <button type="button" className="ap-back" onClick={() => { setOpen(null); finance.refresh(); }}><ArrowLeft size={17}/> Todas las privadas</button>
    <PrivadaContent clusterId={open}/>
  </section>;

  const list = reps.data?.data ?? [];
  return <section className="fin-stack">
    <div className="panel ap-head">
      <div><h2>Privadas</h2><p>Cada privada tiene un administrador: modera su chat y, con el cobro por privada, cobra a sus casas, paga sus gastos y deposita al fraccionamiento la cuota por casa.</p></div>
    </div>
    <ErrorBox message={reps.error}/>
    {action.notice && <Success>{action.notice}</Success>}
    {f ? <FinanceSettings f={f} action={action}/> : finance.loading ? <Loading/> : <div className="fin-callout"><AlertTriangle size={20}/><div><strong>No se pudieron abrir las finanzas por privada</strong>
      <span>{finance.error || 'El servidor no respondió.'}</span>
      <span>Se necesitan la cobranza del fraccionamiento activa (Plataforma la activa en Tesorería) y el perfil de Administración del fraccionamiento o un permiso de tesorería.</span></div></div>}
    {f && f.pendingDeposits.length > 0 && <PendingDeposits deposits={f.pendingDeposits} action={action}/>}
    {reps.loading && !reps.data ? <Loading variant="cards"/> : !list.length ? <Empty icon={<Landmark/>} title="Aún no hay privadas" text="Cuando des de alta privadas y viviendas, aquí podrás asignar a su administrador."/> :
      <div className="ap-grid">{list.map(p => <PrivadaCard key={p.clusterId} privada={p} fin={f?.privadas.find(x => x.clusterId === p.clusterId)} model={!!f?.privadaModel} hasFinance={!!f} action={action} onChanged={reps.refresh} onOpen={() => { action.clear(); setOpen(p.clusterId); }}/>)}</div>}
  </section>;
}

/** The switch for the whole fraccionamiento, and what each privada owes it per home. */
function FinanceSettings({ f, action }: { f: Finance; action: Action }) {
  const [toggle, setToggle] = useState(false), [rate, setRate] = useState(false);
  const month = currentMonth();
  const current = f.rates.find(r => r.effectiveMonth <= month), scheduled = f.rates.filter(r => r.effectiveMonth > month).at(-1);
  const configured = f.privadas.filter(p => p.configured).length;
  return <section className="panel fin-section">
    <div className="ap-settings">
      <div className="ap-setting">
        <span className={'ap-dot' + (f.privadaModel ? ' on' : '')} aria-hidden="true"/>
        <div><h3>Cobro por privada</h3><p>{f.privadaModel ? `Encendido · ${configured} de ${f.privadas.length} privadas cobrando. Las casas de privadas sin configurar no reciben cargos.` : 'Apagado · el fraccionamiento cobra directamente a todas las casas, como hasta ahora.'}</p></div>
        <Button className={f.privadaModel ? 'secondary' : ''} onClick={() => { action.clear(); setToggle(true); }}>{f.privadaModel ? 'Apagar' : 'Encender'}</Button>
      </div>
      <div className="ap-setting">
        <span className="ap-icon" aria-hidden="true"><Landmark size={18}/></span>
        <div><h3>Cuota por casa al fraccionamiento</h3><p>{current ? <>Cada privada deposita <strong>{money(current.amountCents)}</strong> por casa al mes{scheduled ? ` · desde ${monthName(scheduled.effectiveMonth)}: ${money(scheduled.amountCents)}` : ''}.</> : 'Aún no está definida: sin ella no se calcula lo que debe cada privada.'}</p></div>
        <Button className="secondary" onClick={() => { action.clear(); setRate(true); }}>{current ? 'Cambiar' : 'Definir'}</Button>
      </div>
    </div>
    {toggle && <ReasonDialog title={f.privadaModel ? 'Apagar el cobro por privada' : 'Encender el cobro por privada'} confirm={f.privadaModel ? 'Apagar' : 'Encender'} danger={f.privadaModel} busy={action.busy} error={action.error} onClose={() => setToggle(false)}
      text={f.privadaModel
        ? <p>El fraccionamiento volverá a cobrar directamente a las casas con sus propias cuotas, y las privadas dejarán de emitir cargos. Lo que ya se cobró y lo que se debe se conserva.</p>
        : <><p>Desde ahora el fraccionamiento <strong>deja de emitir cargos a las casas</strong>. Cada privada configurada (finanzas activas y con administrador) cobra a sus casas con sus cuotas y te deposita la cuota por casa.</p><p>Las casas de privadas sin configurar <strong>no reciben cargos</strong> hasta que las configures. Los adeudos actuales con el fraccionamiento se conservan.</p></>}
      onConfirm={reason => action.run('/privadas/model', { privadaModel: !f.privadaModel, reason }, f.privadaModel ? 'Cobro por privada apagado.' : 'Cobro por privada encendido.')}/>}
    {rate && <RateDialog current={current?.amountCents} action={action} onClose={() => setRate(false)}/>}
  </section>;
}

function RateDialog({ current, action, onClose }: { current?: string; action: Action; onClose: () => void }) {
  const [amount, setAmount] = useState(current ? pesos(current) : ''), [month, setMonth] = useState(currentMonth());
  return <ReasonDialog title="Cuota por casa al fraccionamiento" confirm="Guardar" busy={action.busy} error={action.error} onClose={onClose} ready={!!amount} placeholder="Por ejemplo: acuerdo de la asamblea"
    text={<p>Lo que cada privada deposita al fraccionamiento por cada casa, cada mes. Es igual para todas las privadas, sin importar cuánto cobre cada una a sus vecinos. Los meses ya emitidos no cambian.</p>}
    onConfirm={async reason => { try { return await action.run('/privadas/dues-rate', { amountCents: toCents(amount), effectiveMonth: month, reason }, 'Cuota por casa guardada.'); } catch (e) { action.setError(errorText(e)); return false; } }}>
    <div className="fin-fields"><label>Monto por casa en MXN<div className="fin-money-input"><span>$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"/></div></label>
      <label>Desde el mes<input type="month" required value={month} min={currentMonth()} onChange={e => setMonth(e.target.value)}/></label></div>
  </ReasonDialog>;
}

/** Deposits the privadas registered, for administration to confirm once it sees them in the bank. */
function PendingDeposits({ deposits, action }: { deposits: PendingDeposit[]; action: Action }) {
  const [review, setReview] = useState<{ deposit: PendingDeposit; approve: boolean } | null>(null);
  return <section className="panel fin-section">
    <div className="fin-section-head"><div><h3>Depósitos por confirmar</h3><p>Búscalos en la cuenta del fraccionamiento con la referencia. Confírmalos solo cuando veas el dinero.</p></div></div>
    <ul className="fin-rows">{deposits.map(d => <li key={d.id} className="fin-row fin-row-wrap">
      <span className="fin-row-icon"><Landmark size={17}/></span>
      <div className="fin-row-main"><strong>{d.privada} · {money(d.amountCents)}</strong><small>{dayText(d.depositedAt)} · Ref. <span className="fin-mono">{d.reference}</span>{d.registeredBy ? ` · registró ${d.registeredBy}` : ''}</small>{d.mine && <small className="fin-note">Lo registraste tú: otra persona de la administración debe confirmarlo.</small>}</div>
      <div className="fin-row-actions"><button type="button" className="fin-link danger-text" disabled={d.mine} onClick={() => { action.clear(); setReview({ deposit: d, approve: false }); }}>Rechazar</button>
        <Button className="small-button" disabled={d.mine} onClick={() => { action.clear(); setReview({ deposit: d, approve: true }); }}><Check size={15}/> Confirmar</Button></div>
    </li>)}</ul>
    {review && <ReasonDialog title={review.approve ? 'Confirmar depósito' : 'Rechazar depósito'} confirm={review.approve ? 'Confirmar' : 'Rechazar'} danger={!review.approve} busy={action.busy} error={action.error} onClose={() => setReview(null)}
      placeholder={review.approve ? 'Por ejemplo: visto en el estado de cuenta' : 'Por ejemplo: no aparece en el banco'}
      text={<p>{review.deposit.privada}: <strong>{money(review.deposit.amountCents)}</strong> del {dayText(review.deposit.depositedAt)}, referencia {review.deposit.reference}. {review.approve ? 'Se descuenta de lo que debe la privada.' : 'La privada verá el motivo y podrá registrarlo de nuevo.'} No se puede cambiar después.</p>}
      onConfirm={reason => action.run(`/privadas/deposits/${review.deposit.id}/review`, { approve: review.approve, reason }, review.approve ? 'Depósito confirmado.' : 'Depósito rechazado.')}/>}
  </section>;
}

/** One privada: its administrator, whether it bills, and how it stands with the fraccionamiento. */
function PrivadaCard({ privada, fin, model, hasFinance, action, onChanged, onOpen }: { privada: RepPrivada; fin?: FinPrivada; model: boolean; hasFinance: boolean; action: Action; onChanged: () => void; onOpen: () => void }) {
  const mutation = useMutation();
  const [choice, setChoice] = useState(''), [remove, setRemove] = useState<{ userId: string; name: string } | null>(null), [settings, setSettings] = useState(false), [approve, setApprove] = useState(false);
  const active = privada.representatives.filter(r => r.active);
  const candidates = privada.owners.filter(o => !privada.representatives.some(r => r.userId === o.userId));
  const status = !hasFinance ? null : !model ? { label: 'Cobro por privada apagado', tone: 'muted' } : !fin?.enabled ? { label: 'Finanzas sin activar', tone: 'warn' } : !active.length ? { label: 'Falta administrador', tone: 'warn' } : { label: 'Cobrando', tone: 'good' };
  const owed = BigInt(fin?.balanceCents ?? '0');
  async function add() { if (choice && await mutation.run('/admin/representatives', 'POST', { clusterId: privada.clusterId, userId: choice })) { setChoice(''); onChanged(); } }
  async function confirmRemove() { if (await mutation.run(`/admin/representatives/${privada.clusterId}/${remove!.userId}`, 'DELETE')) { setRemove(null); onChanged(); } }
  return <article className="reps-card ap-card">
    <div className="ap-card-head"><div><h3>{title(privada)}</h3><p>{privada.owners.length === 1 ? '1 propietario' : `${privada.owners.length} propietarios`}{fin ? ` · ${fin.homes} ${fin.homes === 1 ? 'casa' : 'casas'}` : ''}</p></div>
      {status && <span className={`ap-status ${status.tone}`}>{status.label}</span>}</div>

    <div className="ap-block"><h4>Administrador de la privada</h4>
      {privada.representatives.length ? <ul className="reps-people">{privada.representatives.map(r => <li key={r.userId}>
        <ShieldCheck size={17} color="var(--brand)"/>
        <span><strong>{r.name}</strong>{!r.active && <small>Ya no es propietario aquí; no administra</small>}</span>
        <button type="button" className="icon-button danger-text" aria-label={`Quitar a ${r.name} como administrador`} onClick={() => { mutation.clear(); setRemove({ userId: r.userId, name: r.name }); }}><TrashIcon size={17}/></button>
      </li>)}</ul> : <p className="small muted">Sin administrador todavía.</p>}
      {candidates.length > 0 && <div className="reps-add">
        <select aria-label={`Propietario para administrar ${privada.name}`} value={choice} onChange={e => setChoice(e.target.value)}>
          <option value="">Elige un propietario</option>
          {candidates.map(o => <option key={o.userId} value={o.userId}>Casa {o.home} · {o.name}</option>)}
        </select>
        <Button className="secondary" disabled={!choice} busy={mutation.busy && !!choice} onClick={() => void add()}><UserPlus size={17}/> Asignar</Button>
      </div>}
      {!remove && <ErrorBox message={mutation.error}/>}
    </div>

    {hasFinance && fin && <div className="ap-block"><h4>Finanzas</h4>
      <p className="small">{fin.enabled && fin.startMonth ? <>Cobra a sus casas desde <strong>{monthName(fin.startMonth)}</strong>.</> : fin.enabled ? 'Activas.' : fin.startMonth ? 'Pausadas: no emite cargos.' : 'Aún no activas.'}{' '}<button type="button" className="fin-link" onClick={() => { action.clear(); setSettings(true); }}>{fin.enabled ? 'Pausar' : 'Activar'}</button></p>
      {(fin.enabled || BigInt(fin.owedCents) > 0n) && <dl className="ap-owed"><div><dt>Debe al fraccionamiento</dt><dd className={owed > 0n ? 'warn' : ''}>{money(owed > 0n ? owed : 0n)}</dd></div><div><dt>Por confirmar</dt><dd>{money(fin.pendingCents)}</dd></div></dl>}
      {fin.enabled && fin.online && <p className="small ap-online">Pagos en línea: <span className={`ap-status ${ONLINE_LABEL[fin.online].tone}`}>{ONLINE_LABEL[fin.online].label}</span>
        {fin.online === 'READY' && <button type="button" className="fin-link" onClick={() => { action.clear(); setApprove(true); }}>Aprobar</button>}</p>}
      {(fin.enabled || BigInt(fin.owedCents) > 0n) && <button type="button" className="ap-open" onClick={onOpen}>Ver finanzas de la privada <ChevronRight size={16}/></button>}
    </div>}

    {remove && <Modal title="¿Quitar administrador?" onClose={() => { if (!mutation.busy) setRemove(null); }}>
      <p><strong>{remove.name}</strong> dejará de administrar {title(privada)}: ya no moderará su chat ni verá sus finanzas. Seguirá participando como propietario.</p>
      {fin?.enabled && active.length === 1 && active[0].userId === remove.userId && <div className="fin-callout"><AlertTriangle size={18}/><span>Es el único administrador: la privada dejará de emitir cargos a sus casas hasta que asignes a otro.</span></div>}
      <ErrorBox message={mutation.error}/>
      <div className="modal-actions"><Button className="secondary" disabled={mutation.busy} onClick={() => setRemove(null)}>Conservar</Button><Button className="danger" busy={mutation.busy} onClick={confirmRemove}><TrashIcon size={17}/> Quitar</Button></div>
    </Modal>}
    {approve && <ReasonDialog title={`Aprobar cuenta nueva · ${title(privada)}`} confirm="Aprobar" busy={action.busy} error={action.error} onClose={() => setApprove(false)} placeholder="Por ejemplo: cambio de administrador acordado en junta"
      text={<p>El administrador de la privada dio de alta otra cuenta de Stripe y Stripe ya la aprobó. Desde ahora los pagos en línea de sus vecinos llegarán a la cuenta nueva; la anterior deja de recibir pagos nuevos.</p>}
      onConfirm={reason => action.run(`/privadas/${privada.clusterId}/stripe/approve`, { reason }, 'Cuenta nueva aprobada.')}/>}
    {settings && fin && <SettingsDialog privada={privada} fin={fin} action={action} onClose={() => setSettings(false)}/>}
  </article>;
}

function SettingsDialog({ privada, fin, action, onClose }: { privada: RepPrivada; fin: FinPrivada; action: Action; onClose: () => void }) {
  const [month, setMonth] = useState(fin.startMonth ?? currentMonth());
  const enabling = !fin.enabled;
  return <ReasonDialog title={`${enabling ? 'Activar' : 'Pausar'} finanzas · ${title(privada)}`} confirm={enabling ? 'Activar' : 'Pausar'} danger={!enabling} busy={action.busy} error={action.error} onClose={onClose}
    text={enabling
      ? <p>Con un administrador asignado, la privada empieza a cobrar a sus casas con sus cuotas desde el mes que elijas, y cada mes debe al fraccionamiento la cuota por casa.{fin.startMonth ? ' El mes de inicio ya quedó fijado.' : ''}</p>
      : <p>La privada deja de emitir cargos nuevos a sus casas y de generar cuota al fraccionamiento. Lo cobrado y lo pendiente se conservan.</p>}
    onConfirm={reason => action.run(`/privadas/${privada.clusterId}/settings`, { enabled: enabling, startMonth: month, reason }, enabling ? 'Finanzas de la privada activadas.' : 'Finanzas de la privada pausadas.')}>
    {enabling && <label>Empieza a cobrar en<input type="month" required value={month} min={fin.startMonth ?? currentMonth()} disabled={!!fin.startMonth} onChange={e => setMonth(e.target.value)}/>{fin.startMonth && <small>Se conserva el mes de inicio para no perder ni duplicar cargos.</small>}</label>}
  </ReasonDialog>;
}
