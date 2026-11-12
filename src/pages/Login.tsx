import { useState, type FormEvent } from 'react';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { ArrowUpRight, ShieldCheck, KeyRound, ArrowLeft, ScanLine, BellRing, QrCode, Check } from 'lucide-react';
import { api, errorText } from '../api';
import { useAuth } from '../auth';
import { Brand, Button, ErrorBox } from '../components/ui';
import { ZentryCode } from '../components/Splash';
import './Login.css';
import { AnimatedFingerprint } from '../components/icons/AnimatedIcons';
import type { SessionResult } from '../types';
export function Login() {
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
        <div className="login-code"><ZentryCode/><span className="login-scan" aria-hidden="true"/></div>
        <h1>Tu casa empieza en la <em>bienvenida</em>.</h1>
        <p>Invita a tus visitas con un QR, entérate cuando llegan y entra con tu huella.</p>
        {/* A sample pass, to show at a glance what Zentry does. */}
        <div className="login-ticket" aria-hidden="true">
          <span className="login-ticket-label">Pase de visita</span>
          <strong>Mariana López</strong>
          <span className="login-ticket-when">Hoy · 4:00 – 8:00 p.m.</span>
          <span className="login-ticket-ok"><Check size={14}/> Acceso concedido · 4:12 p.m.</span>
        </div>
      </div>
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
