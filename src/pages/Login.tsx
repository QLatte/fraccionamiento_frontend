import { useState, type FormEvent } from 'react';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { ArrowUpRight, Fingerprint, ShieldCheck, Sparkles, KeyRound, ArrowLeft } from 'lucide-react';
import { api, errorText } from '../api';
import { useAuth } from '../auth';
import { Brand, Button, ErrorBox } from '../components/ui';
import type { SessionResult } from '../types';
function remembered() { try { return JSON.parse(localStorage.getItem('sica:login') ?? '{}') as { email?: string; propertyId?: string }; } catch { return {}; } }
export function Login() {
  const saved = remembered();
  const [mode, setMode] = useState<'login' | 'register' | 'help'>(location.pathname === '/activar' ? 'register' : 'login');
  const [email, setEmail] = useState(saved.email ?? ''); const [propertyId, setPropertyId] = useState(saved.propertyId ?? '');
  const [invitation, setInvitation] = useState(() => { const hash = location.hash.slice(1); if (hash) history.replaceState(null, '', location.pathname); return /^[A-Za-z0-9_-]{43}$/.test(hash) ? hash : ''; });
  const [label, setLabel] = useState('Mi dispositivo'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const auth = useAuth();
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      if (!window.isSecureContext || !browserSupportsWebAuthn()) throw new Error('Abre SICA en un navegador compatible y con una conexión HTTPS para usar tu llave de acceso.');
      let session: SessionResult;
      if (mode === 'register') {
        const options = await api<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>('/auth/register/options', { method: 'POST', public: true, body: { enrollmentToken: invitation.trim() } });
        const response = await startRegistration({ optionsJSON: options.options });
        session = await api('/auth/register/verify', { method: 'POST', public: true, body: { challengeId: options.challengeId, response, deviceLabel: label.trim() } });
      } else {
        const options = await api<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>('/auth/login/options', { method: 'POST', public: true, body: { email: email.trim(), propertyId: propertyId.trim() } });
        const response = await startAuthentication({ optionsJSON: options.options });
        session = await api('/auth/login/verify', { method: 'POST', public: true, body: { challengeId: options.challengeId, response } });
      }
      await auth.accept(session); history.replaceState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <div className="login-layout"><section className="login-story"><Brand light/><div className="story-body"><div className="story-tag"><span/> EL ACCESO, EN TUS MANOS</div><h1>Las mejores visitas<br/>empiezan con<br/><em>una bienvenida.</em></h1><p>Crea un pase, compártelo y recibe a quienes más importan. Así de simple.</p><div className="neighborhood" aria-hidden="true"><div className="sun"/><div className="house h1"><i/><b/><span/></div><div className="house h2"><i/><b/><span/></div><div className="house h3"><i/><b/><span/></div><div className="tree t1"/><div className="tree t2"/><div className="road"/><div className="floating-pass"><ShieldCheck size={22}/><div>Una comunidad<br/><strong>más conectada</strong></div><ArrowUpRight size={20}/></div></div></div><div className="story-footer"><ShieldCheck size={16}/> Tranquilidad para ti. Bienvenida para ellos.</div></section>
    <section className="login-form-side"><div className="mobile-brand"><Brand/></div><span className="section-caption">TU COMUNIDAD, CONECTADA</span>
      {mode === 'help' ? <><h2>Te ayudamos a entrar.</h2><p>Tu llave de acceso usa la huella, el rostro o el PIN de tu dispositivo.</p><div className="help-card"><KeyRound/><h3>¿Es tu primera vez?</h3><p>Pide a administración una invitación de registro y úsala en “Activar mi acceso”.</p></div><div className="help-card"><ShieldCheck/><h3>¿Cambiaste de teléfono?</h3><p>Administración verificará tu identidad y te entregará una invitación de recuperación para registrar tu nuevo dispositivo.</p></div><Button className="secondary" onClick={() => setMode('login')}><ArrowLeft size={17}/> Volver al inicio</Button></> : <><div className="login-title-icon"><Fingerprint size={30}/></div><h2>{mode === 'register' ? 'Tu comunidad te espera.' : 'Qué gusto verte.'}</h2><p>{mode === 'register' ? 'Activa tu acceso con la invitación de administración.' : 'Ingresa de forma segura con tu llave de acceso.'}</p>{auth.expired && <div className="info-box">Tu sesión terminó. Ingresa de nuevo para continuar.</div>}
      <form onSubmit={submit}><fieldset disabled={busy}>{mode === 'register' ? <><label>Invitación de acceso<textarea required minLength={32} maxLength={256} autoComplete="off" value={invitation} onChange={e => setInvitation(e.target.value)} placeholder="Pega aquí tu invitación" rows={3}/></label><label>Nombre de este dispositivo<input required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} placeholder="Por ejemplo: Mi teléfono"/></label></> : <><label>Correo electrónico<input type="email" autoComplete="username webauthn" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com"/></label><label>Código de vivienda<input required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" value={propertyId} onChange={e => setPropertyId(e.target.value)} placeholder="El código que te dio administración"/><small>Lo recordaremos para tu siguiente visita.</small></label></>}</fieldset><ErrorBox message={error}/><Button busy={busy} type="submit" className="full"><Fingerprint size={19}/>{mode === 'register' ? 'Activar mi acceso' : 'Ingresar con mi llave'}<ArrowUpRight size={18}/></Button></form>
      <div className="login-switch">{mode === 'login' ? '¿Primera vez en SICA?' : '¿Ya tienes una llave?'} <button disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Activar mi acceso' : 'Ingresar'}</button></div><button className="subtle-link" disabled={busy} onClick={() => { setMode('help'); setError(''); }}>Necesito ayuda para ingresar</button></>}
      <div className="login-bottom"><Sparkles size={15}/> Sin contraseñas que recordar.</div></section></div>;
}
