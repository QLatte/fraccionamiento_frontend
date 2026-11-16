import { useEffect, useRef, useState, type FormEvent } from 'react';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { ArrowUpRight, ShieldCheck, KeyRound, ArrowLeft, ScanLine } from 'lucide-react';
import { api, errorText } from '../api';
import { useAuth } from '../auth';
import { Brand, Button, ErrorBox } from '../components/ui';
import { GateScene, type GateState } from '../components/GateScene';
import { AnimatedFingerprint } from '../components/icons/AnimatedIcons';
import type { SessionResult } from '../types';
import './Login.css';

const GATE_OPENS_MS = 680;   // the arm lifts before the app appears
const GATE_DENIED_MS = 1400; // red lamp and a shake, then back to closed
const greeting = (at: Date) => { const h = at.getHours(); return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
const clock = (at: Date) => new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(at);

/**
 * The login is the caseta: an illustrated entrance that lives on the person's clock (sun or moon
 * where it really is, lit windows at night) and answers what they do. Asking for the passkey
 * blinks the lamp, a granted access lifts the barrier and lets the app in, a failure shakes it.
 */
export function Login() {
  const [mode, setMode] = useState<'login' | 'register' | 'help'>(location.pathname === '/activar' ? 'register' : 'login');
  const [invitation, setInvitation] = useState(() => { const hash = location.hash.slice(1); if (hash) history.replaceState(null, '', location.pathname); return /^[A-Za-z0-9_-]{43}$/.test(hash) ? hash : ''; });
  const [label, setLabel] = useState('Mi dispositivo'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [gate, setGate] = useState<GateState>('closed');
  const [now, setNow] = useState(() => new Date());
  const denied = useRef(0);
  const auth = useAuth();
  // The scene follows the real time: the sun moves, the phase and the greeting change.
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 30_000); return () => { window.clearInterval(id); window.clearTimeout(denied.current); }; }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    window.clearTimeout(denied.current); setGate('waiting');
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
      // Access granted: the lamp turns green and the arm lifts; then the app comes in.
      setGate('open');
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, GATE_OPENS_MS));
      await auth.accept(session); history.replaceState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (e) {
      setError(errorText(e)); setGate('denied');
      denied.current = window.setTimeout(() => setGate('closed'), GATE_DENIED_MS);
    } finally { setBusy(false); }
  }

  return <div className={`login gate-${gate}`}>
    <header className="login-top"><Brand/></header>

    <div className="login-scene"><GateScene now={now} gate={gate}/></div>

    <section className="login-panel">
      <div key={mode} className="login-mode">{mode === 'help' ? <>
        <h2>Te ayudamos a entrar.</h2>
        <p className="login-lead">Tu llave de acceso usa la huella, el rostro o el PIN de tu dispositivo.</p>
        <div className="help-card"><KeyRound/><h3>¿Es tu primera vez?</h3><p>Pide a administración una invitación de registro y úsala en “Activar mi acceso”.</p></div>
        <div className="help-card"><ShieldCheck/><h3>¿Cambiaste de teléfono?</h3><p>Administración verificará tu identidad y te entregará una invitación de recuperación para registrar tu nuevo dispositivo.</p></div>
        <Button className="secondary" onClick={() => setMode('login')}><ArrowLeft size={17}/> Volver al inicio</Button>
      </> : <>
        <p className="login-when"><strong>{greeting(now)}</strong><span>{clock(now)}</span></p>
        <h2>{mode === 'register' ? 'Activa tu acceso' : 'Qué gusto verte.'}</h2>
        <p className="login-lead">{mode === 'register' ? 'Activa tu acceso con la invitación de administración.' : 'Tu huella, tu rostro o tu PIN abren la pluma. Sin contraseñas.'}</p>
        {auth.expired && <div className="info-box">Tu sesión terminó. Ingresa de nuevo para continuar.</div>}
        <form onSubmit={submit}><fieldset disabled={busy || gate === 'open'}>{mode === 'register' ? <><label>Invitación de acceso<textarea required minLength={32} maxLength={256} autoComplete="off" value={invitation} onChange={e => setInvitation(e.target.value)} placeholder="Pega aquí tu invitación" rows={3}/></label><label>Nombre de este dispositivo<input required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} placeholder="Por ejemplo: Mi teléfono"/></label></> : null}</fieldset>
          <ErrorBox message={error}/>
          <Button busy={busy} disabled={gate === 'open'} type="submit" className="full login-cta"><AnimatedFingerprint size={20}/>{gate === 'open' ? 'Adelante' : mode === 'register' ? 'Activar mi acceso' : 'Ingresar con mi llave'}<ArrowUpRight size={18}/></Button>
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
