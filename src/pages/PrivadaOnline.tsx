import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CircleCheck, Clock, CreditCard, ExternalLink, FileText, IdCard, Landmark, RefreshCw, Timer } from 'lucide-react';
import { api, errorText } from '../api';
import { Button, ErrorBox, Modal } from '../components/ui';
import { ReasonDialog, dayText, type useFinanceAction } from './financeUi';

// Pagos en línea de la privada: its own Stripe account. The privada's administrator fills in
// Stripe's form (identity, RFC, CLABE); Zentry never sees those details, only Stripe's answer.

export type Online = {
  phase: 'NONE' | 'ONBOARDING' | 'NEEDS_INFO' | 'REVIEW' | 'READY' | 'ACTIVE';
  active: { since: string; chargesEnabled: boolean; payoutsEnabled: boolean; currentlyDue: number } | null;
  pending: { id: string; phase: 'ONBOARDING' | 'NEEDS_INFO' | 'REVIEW' | 'READY'; startedAt: string; startedBy: string | null; currentlyDue: number; checkedAt: string | null } | null;
};
type Action = ReturnType<typeof useFinanceAction>;
export const ONLINE_LABEL: Record<Online['phase'], { label: string; tone: 'good' | 'warn' | 'muted' }> = {
  NONE: { label: 'Sin activar', tone: 'muted' }, ONBOARDING: { label: 'Alta sin terminar', tone: 'warn' }, NEEDS_INFO: { label: 'Stripe pide datos', tone: 'warn' },
  REVIEW: { label: 'En revisión de Stripe', tone: 'muted' }, READY: { label: 'Cuenta nueva por aprobar', tone: 'warn' }, ACTIVE: { label: 'Activos', tone: 'good' },
};
const origin = 'https://connect.stripe.com';

/** Card on the privada's Resumen: from «activar» to «activos», with the one next step each time. */
export function OnlinePayments({ clusterId, online, admin, action, onChanged }: { clusterId: string; online: Online; admin: boolean; action: Action; onChanged: () => void }) {
  const [checklist, setChecklist] = useState<null | { replace: boolean }>(null), [abandon, setAbandon] = useState(false), [approve, setApprove] = useState(false);
  const [busy, setBusy] = useState<'' | 'link' | 'refresh'>(''), [error, setError] = useState('');
  const handled = useRef(false);

  async function toStripe(replace = false) {
    setBusy('link'); setError('');
    try {
      const { url } = await api<{ url: string }>(`/privadas/${clusterId}/stripe/onboarding`, { method: 'POST', body: replace ? { replace: true } : {} });
      if (new URL(url).origin !== origin) throw new Error('Stripe devolvió un enlace inesperado.');
      location.assign(url);
    } catch (e) { setError(errorText(e)); setBusy(''); }
  }
  async function refresh() {
    setBusy('refresh'); setError('');
    try { await api(`/privadas/${clusterId}/stripe/refresh`, { method: 'POST', body: {} }); onChanged(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  // Back from Stripe: read its answer now. An expired form link: ask for a fresh one.
  useEffect(() => {
    if (handled.current) return; handled.current = true;
    const back = new URLSearchParams(location.search).get('stripe');
    if (!back) return;
    history.replaceState(history.state, '', location.pathname);
    if (back === 'renovar' && !admin) void toStripe(); else void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { phase, active, pending } = online;
  const activeNeeds = !!active && (active.currentlyDue > 0 || !active.chargesEnabled || !active.payoutsEnabled);
  const linkBusy = busy === 'link';
  let body: React.ReactNode;
  if (phase === 'NONE') body = <>
    <div className="pf-online-head"><span className="pf-online-icon"><CreditCard size={20}/></span><div><h3>Cobra con tarjeta y SPEI</h3><p>Tus vecinos pagan desde Zentry y el dinero llega directo a la cuenta de la privada. Cada pago se abona solo a su casa: ya no tienes que registrarlo.</p></div></div>
    {admin ? <p className="small muted">El administrador de la privada lo activa desde «Mi privada» con sus datos.</p> :
      <div className="pf-online-actions"><Button onClick={() => setChecklist({ replace: false })}><CreditCard size={17}/> Activar pagos con tarjeta</Button><small>Unos 15 minutos, en la página de Stripe.</small></div>}
  </>;
  else if (active && !pending) body = <>
    <div className="pf-online-head"><span className={'pf-online-icon ' + (activeNeeds ? 'warn' : 'good')}>{activeNeeds ? <AlertTriangle size={20}/> : <CircleCheck size={20}/>}</span>
      <div><h3>{activeNeeds ? 'Stripe necesita datos de la cuenta' : 'Pagos en línea activos'}</h3>
        <p>{activeNeeds ? 'Mientras no los completes, Stripe puede pausar los cobros o los depósitos a tu banco.' : `Desde el ${dayText(active.since)}. Tus vecinos pagan con tarjeta o SPEI y Stripe deposita a la cuenta de la privada.`}</p></div></div>
    <div className="pf-online-actions">
      {activeNeeds && !admin && <Button busy={linkBusy} disabled={!!busy} onClick={() => void toStripe()}>Completar en Stripe <ExternalLink size={16}/></Button>}
      {!activeNeeds && !admin && <a className="button secondary" href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">Abrir mi panel de Stripe <ExternalLink size={16}/></a>}
      <button type="button" className="fin-link" disabled={!!busy} onClick={() => void refresh()}><RefreshCw size={14}/> {busy === 'refresh' ? 'Actualizando…' : 'Actualizar estado'}</button>
      {!admin && <button type="button" className="fin-link" onClick={() => setChecklist({ replace: true })}>¿Cambió el administrador? Dar de alta otra cuenta</button>}
    </div>
  </>;
  else if (pending) {
    const step = {
      ONBOARDING: { icon: <FileText size={20}/>, tone: 'warn', title: 'Falta terminar el formulario de Stripe', text: `Lo empezó ${pending.startedBy ?? 'el administrador'} el ${dayText(pending.startedAt)}. Continúa donde te quedaste.` },
      NEEDS_INFO: { icon: <AlertTriangle size={20}/>, tone: 'warn', title: 'Stripe necesita algo más', text: pending.currentlyDue ? `Faltan ${pending.currentlyDue} ${pending.currentlyDue === 1 ? 'dato' : 'datos'}: una foto más clara, tu RFC o tu CLABE, por ejemplo.` : 'Revisa en Stripe qué falta para aprobar la cuenta.' },
      REVIEW: { icon: <Clock size={20}/>, tone: '', title: 'Stripe está revisando tus datos', text: 'Suele tardar de unos minutos a 1 o 2 días. Te avisamos aquí en cuanto quede lista; no tienes que hacer nada.' },
      READY: { icon: <CircleCheck size={20}/>, tone: 'good', title: 'La cuenta nueva está lista', text: admin ? 'Al aprobarla, los pagos de los vecinos llegarán a la cuenta nueva. La anterior deja de recibir pagos nuevos.' : 'Falta que la administración del fraccionamiento la apruebe. Mientras, los pagos siguen llegando a la cuenta actual.' },
    }[pending.phase];
    body = <>
      {active && <p className="pf-online-note"><CircleCheck size={15}/> La cuenta actual sigue recibiendo pagos mientras tanto.</p>}
      <div className="pf-online-head"><span className={'pf-online-icon ' + step.tone}>{step.icon}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></div>
      <div className="pf-online-actions">
        {(pending.phase === 'ONBOARDING' || pending.phase === 'NEEDS_INFO') && !admin && <Button busy={linkBusy} disabled={!!busy} onClick={() => void toStripe()}>{pending.phase === 'ONBOARDING' ? 'Continuar en Stripe' : 'Completar en Stripe'} <ExternalLink size={16}/></Button>}
        {pending.phase === 'READY' && admin && <Button onClick={() => { action.clear(); setApprove(true); }}><CircleCheck size={17}/> Aprobar cuenta nueva</Button>}
        {pending.phase !== 'READY' && <button type="button" className="fin-link" disabled={!!busy} onClick={() => void refresh()}><RefreshCw size={14}/> {busy === 'refresh' ? 'Actualizando…' : 'Actualizar estado'}</button>}
        {pending.phase !== 'READY' && <button type="button" className="fin-link danger-text" onClick={() => { action.clear(); setAbandon(true); }}>Empezar de nuevo</button>}
      </div>
    </>;
  }
  return <section className="panel pf-online" aria-label="Pagos en línea">
    {body}
    <ErrorBox message={error}/>
    {checklist && <Modal title={checklist.replace ? 'Dar de alta otra cuenta' : 'Activar pagos con tarjeta'} onClose={() => { if (!linkBusy) setChecklist(null); }}>
      <p>Te llevamos a la página de Stripe, la empresa que procesa los pagos. Ten a la mano:</p>
      <ul className="pf-checklist">
        <li><IdCard size={18}/><span><strong>Tu INE</strong>Stripe te pide una foto por ambos lados.</span></li>
        <li><FileText size={18}/><span><strong>Tu RFC</strong>El de la asociación o el tuyo como persona física.</span></li>
        <li><Landmark size={18}/><span><strong>La CLABE</strong>De la cuenta donde la privada recibirá el dinero.</span></li>
        <li><Timer size={18}/><span><strong>Unos 15 minutos</strong>Si te interrumpen, continúas después desde aquí.</span></li>
      </ul>
      <p className="small muted">Zentry no ve tus datos ni los de tu banco. El dinero llega a la cuenta que registres: si es tu cuenta personal, conviene que lo platiques con tu contador. Stripe cobra su comisión de cada pago a la privada.</p>
      {checklist.replace && <p className="small">La cuenta actual seguirá recibiendo pagos hasta que la administración apruebe la nueva.</p>}
      <ErrorBox message={error}/>
      <div className="modal-actions"><Button className="secondary" disabled={linkBusy} onClick={() => setChecklist(null)}>Ahora no</Button><Button busy={linkBusy} onClick={() => void toStripe(checklist.replace)}>Ir a Stripe <ExternalLink size={16}/></Button></div>
    </Modal>}
    {abandon && <ReasonDialog title="Empezar de nuevo" confirm="Descartar y empezar de nuevo" danger busy={action.busy} error={action.error} onClose={() => setAbandon(false)} placeholder="Por ejemplo: lo empezó el administrador anterior"
      text={<p>Se descarta el formulario de Stripe en curso. Después podrás empezar uno nuevo desde cero.</p>}
      onConfirm={async reason => { const ok = await action.run(`/privadas/${clusterId}/stripe/abandon`, { reason }, 'Alta de Stripe descartada.'); if (ok) onChanged(); return ok; }}/>}
    {approve && <ReasonDialog title="Aprobar cuenta nueva" confirm="Aprobar" busy={action.busy} error={action.error} onClose={() => setApprove(false)} placeholder="Por ejemplo: cambio de administrador acordado en junta"
      text={<p>Los pagos en línea de la privada llegarán a la cuenta nueva desde ahora. La anterior deja de recibir pagos nuevos; lo que ya cobró se conserva.</p>}
      onConfirm={async reason => { const ok = await action.run(`/privadas/${clusterId}/stripe/approve`, { reason }, 'Cuenta nueva aprobada.'); if (ok) onChanged(); return ok; }}/>}
  </section>;
}
