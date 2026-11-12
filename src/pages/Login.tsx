import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { ArrowUpRight, ShieldCheck, KeyRound, ArrowLeft, ScanLine, BellRing, QrCode, Check, Package, Send } from 'lucide-react';
import { api, errorText } from '../api';
import { useAuth } from '../auth';
import { Brand, Button, ErrorBox, toneOf } from '../components/ui';
import { ZentryCode } from '../components/Splash';
import './Login.css';
import { AnimatedFingerprint } from '../components/icons/AnimatedIcons';
import type { SessionResult } from '../types';
// What happens around a Zentry home, shown one at a time beside the orbit (in sync with its pulse).
const MOMENTS = [
  { Icon: Check, text: 'Carlos entró', meta: 'Caseta norte · 4:12 p.m.', tone: 'ok' },
  { Icon: Send, text: 'Pase enviado a Mariana', meta: 'Hoy de 4:00 a 8:00 p.m.', tone: 'pass' },
  { Icon: Package, text: 'Paquetería en la caseta', meta: 'Esperando tu respuesta', tone: 'wait' },
  { Icon: BellRing, text: 'Nuevo comunicado', meta: 'Mantenimiento de jardines', tone: 'notice' },
] as const;
// Neighbours travelling on the rings: [name, ring, angle in degrees].
const NEIGHBOURS: [string, 1 | 2, number][] = [['Ana García', 1, 200], ['Luis Hernández', 1, 20], ['Marta Ruiz', 2, 110], ['Jorge Peña', 2, 250], ['Sofía Ramírez', 2, 340]];
const PULSE_MS = 3200;

/** The moment shown now; it advances with the orbit's pulse (and stays put with reduced motion). */
function useMoment() {
  const [moment, setMoment] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setMoment(m => (m + 1) % MOMENTS.length), PULSE_MS);
    return () => window.clearInterval(id);
  }, []);
  return moment;
}

/** The notices, all mounted and crossfading: the leaving one goes faster than the arriving one. */
function Moments({ moment, className }: { moment: number; className: string }) {
  return <div className={className} aria-hidden="true">{MOMENTS.map((m, i) => <div key={m.text} className={`orbit-moment ${m.tone}${i === moment ? ' on' : ''}`}><span><m.Icon size={15}/></span><div><strong>{m.text}</strong><small>{m.meta}</small></div></div>)}</div>;
}

/**
 * The Zentry code at the centre of a slowly turning orbit of neighbours; a sun pulse leaves the
 * code every few seconds (a scan). Full size beside the title on computers, a small one in the
 * phone header. Rings and faces move with transform only; with reduced motion all stands still.
 */
function AccessOrbit({ compact = false, moment }: { compact?: boolean; moment?: number }) {
  const seats = compact ? NEIGHBOURS.filter(n => n[1] === 2) : NEIGHBOURS;
  return <div className={'login-orbit' + (compact ? ' compact' : '')} aria-hidden="true">
    {[1, 2].map(ring => <div key={ring} className={`orbit-ring r${ring}`}>
      {seats.filter(n => n[1] === ring).map(([name, , angle]) => {
        const rad = angle * Math.PI / 180;
        return <span key={name} className="orbit-seat" style={{ left: `${50 + 50 * Math.cos(rad)}%`, top: `${50 + 50 * Math.sin(rad)}%` } as CSSProperties}>
          <span className={'orbit-face ' + toneOf(name)}>{name.split(' ').map(w => w[0]).join('')}</span>
        </span>;
      })}
    </div>)}
    <span className="orbit-pulse"/>
    <span className="orbit-pulse late"/>
    <div className="orbit-core"><ZentryCode/></div>
    {moment !== undefined && <Moments moment={moment} className="orbit-moments"/>}
  </div>;
}

export function Login() {
  const moment = useMoment();
  const [mode, setMode] = useState<'login' | 'register' | 'help'>(location.pathname === '/activar' ? 'register' : 'login');
  const [invitation, setInvitation] = useState(() => { const hash = location.hash.slice(1); if (hash) history.replaceState(null, '', location.pathname); return /^[A-Za-z0-9_-]{43}$/.test(hash) ? hash : ''; });
  const [label, setLabel] = useState('Mi dispositivo'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const auth = useAuth();
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      if (!window.isSecureContext || !browserSupportsWebAuthn()) throw new Error('Abre Zentry en un navegador compatible y con una conexión HTTPS para usar tu llave de acceso.');
      let session: SessionResult;
      if (mode === 'register') {
        const options = await api<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>('/auth/register/options', { method: 'POST', public: true, body: { enrollmentToken: invitation.trim() } });
        const response = await startRegistration({ optionsJSON: options.options });
        session = await api('/auth/register/verify', { method: 'POST', public: true, body: { challengeId: options.challengeId, response, deviceLabel: label.trim() } });
      } else {
        // The phone offers its passkeys; the one chosen decides the person and the home.
        const options = await api<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>('/auth/login/options', { method: 'POST', public: true, body: {} });
        const response = await startAuthentication({ optionsJSON: options.options });
        session = await api('/auth/login/verify', { method: 'POST', public: true, body: { challengeId: options.challengeId, response } });
      }
      await auth.accept(session); history.replaceState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const helpMode = mode === 'help';
  return <div className="login">
    {/* Hero: the same Zentry code as the splash, read by a passing scan line, and the promise in one line. */}
    <section className="login-hero">
      <Brand light/>
      <div className="login-hero-body">
        <AccessOrbit compact/>
        <h1>Tu casa empieza en la <em>bienvenida</em>.</h1>
        <p>Invita a tus visitas con un QR, entérate cuando llegan y entra con tu huella.</p>
        <Moments moment={moment} className="login-ticker"/>
      </div>
      <AccessOrbit moment={moment}/>
      <ul className="login-perks">
        <li><QrCode size={17}/> Pases en segundos</li>
        <li><BellRing size={17}/> Avisos al momento</li>
        <li><ShieldCheck size={17}/> Tu huella es tu llave</li>
      </ul>
    </section>

    {/* The form: a floating card on computers, a sheet rising from the bottom on phones. */}
    <section className="login-sheet">
      <div key={mode} className="login-mode">{helpMode ? <>
        <h2>Te ayudamos a entrar.</h2>
        <p className="login-lead">Tu llave de acceso usa la huella, el rostro o el PIN de tu dispositivo.</p>
        <div className="help-card"><KeyRound/><h3>¿Es tu primera vez?</h3><p>Pide a administración una invitación de registro y úsala en “Activar mi acceso”.</p></div>
        <div className="help-card"><ShieldCheck/><h3>¿Cambiaste de teléfono?</h3><p>Administración verificará tu identidad y te entregará una invitación de recuperación para registrar tu nuevo dispositivo.</p></div>
        <Button className="secondary" onClick={() => setMode('login')}><ArrowLeft size={17}/> Volver al inicio</Button>
      </> : <>
        <div className="login-key"><AnimatedFingerprint size={30} autoplay={350}/></div>
        <h2>{mode === 'register' ? 'Activa tu acceso' : 'Qué gusto verte.'}</h2>
        <p className="login-lead">{mode === 'register' ? 'Activa tu acceso con la invitación de administración.' : 'Entra con la huella, el rostro o el PIN de tu teléfono. Sin contraseñas.'}</p>
        {auth.expired && <div className="info-box">Tu sesión terminó. Ingresa de nuevo para continuar.</div>}
        <form onSubmit={submit}><fieldset disabled={busy}>{mode === 'register' ? <><label>Invitación de acceso<textarea required minLength={32} maxLength={256} autoComplete="off" value={invitation} onChange={e => setInvitation(e.target.value)} placeholder="Pega aquí tu invitación" rows={3}/></label><label>Nombre de este dispositivo<input required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} placeholder="Por ejemplo: Mi teléfono"/></label></> : null}</fieldset>
          <ErrorBox message={error}/>
          <Button busy={busy} type="submit" className="full login-cta"><AnimatedFingerprint size={20}/>{mode === 'register' ? 'Activar mi acceso' : 'Ingresar con mi llave'}<ArrowUpRight size={18}/></Button>
          {mode === 'login' && <p className="login-hint">¿Tienes más de una vivienda? Elige la llave de la vivienda a la que quieres entrar. Desde una computadora, escanea con tu teléfono el QR que aparece.</p>}
        </form>
        <div className="login-switch">{mode === 'login' ? '¿Primera vez en Zentry?' : '¿Ya tienes una llave?'} <button disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Activar mi acceso' : 'Ingresar'}</button></div>
        <button className="subtle-link" disabled={busy} onClick={() => { setMode('help'); setError(''); }}>Necesito ayuda para ingresar</button>
      </>}</div>
      {/* Gate devices use their own entry, without a personal account. */}
      <a className="login-station" href="/caseta"><ScanLine size={18}/><span><strong>Acceso de caseta</strong><small>Abrir el escáner sin cuenta personal ni biometría</small></span><ArrowUpRight size={16}/></a>
    </section>
  </div>;
}
