import { useEffect, useState, type FormEvent } from 'react';
import { Home, LogOut, Mail, Smartphone, UserRound } from 'lucide-react';
import AnimatedFilledBell from '../components/icons/AnimatedFilledBell';
import AnimatedMoon from '../components/icons/AnimatedMoon';
import { useAuth } from '../auth';
import { api, errorText } from '../api';
import { Button, ErrorBox, Loading, PageHeader, Success } from '../components/ui';
import { VisitAlerts } from '../components/VisitAlerts';
import type { Profile as ProfileData } from '../types';

const roleLabel = { RESIDENT_OWNER: 'Propietario', FAMILY_MEMBER: 'Familiar' } as const;
type Prefs = ProfileData['preferences'];

/** Mi perfil: display name, visit alert preferences and read-only account details. */
export function Profile({ navigate }: { navigate: (path: string) => void }) {
  const { identity, properties, property, logout, refreshIdentity } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadError, setLoadError] = useState('');
  const resident = identity?.session.profile === 'RESIDENT';

  useEffect(() => { api<ProfileData>('/profile').then(setProfile).catch(e => setLoadError(errorText(e))); }, []);

  if (!profile) return <><PageHeader title="Mi perfil" text="Tus datos, tus avisos y tu cuenta."/>{loadError ? <ErrorBox message={loadError}/> : <Loading/>}</>;
  return <>
    <PageHeader title="Mi perfil" text="Tus datos, tus avisos y tu cuenta."/>
    <div className="profile-grid">
      <NameCard profile={profile} onSaved={async value => { setProfile(value); await refreshIdentity().catch(() => undefined); }}/>
      <AlertsCard profile={profile} propertyId={resident ? property?.id : undefined} onSaved={setProfile}/>
      <section className="panel profile-card">
        <div className="profile-card-head"><span className="profile-icon"><Mail size={20}/></span><div><h2>Mi cuenta</h2><p>Datos que administra tu fraccionamiento.</p></div></div>
        <dl className="details profile-account">
          <div><dt>Correo electrónico</dt><dd>{profile.email}</dd></div>
        </dl>
        <p className="small muted">Con este correo ingresas a Zentry. Para cambiarlo, contacta a administración.</p>
        {properties.length > 0 && <><h3 className="profile-subtitle">Mis viviendas</h3>
          <ul className="profile-homes">{properties.map(home => <li key={home.id}><Home size={18}/><span><strong>{home.street} {home.houseNumber}</strong><small>{home.cluster.name}{home.membershipRole ? ` · ${roleLabel[home.membershipRole]}` : ''}</small></span></li>)}</ul></>}
        <div className="profile-actions">
          {resident && <Button className="secondary" onClick={() => navigate('/dispositivos')}><Smartphone size={17}/> Mis dispositivos</Button>}
          <Button className="danger-outline" onClick={() => void logout().catch(() => {})}><LogOut size={17}/> Cerrar sesión</Button>
        </div>
      </section>
    </div>
  </>;
}

function NameCard({ profile, onSaved }: { profile: ProfileData; onSaved: (profile: ProfileData) => Promise<void> }) {
  const [name, setName] = useState(profile.fullName);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const changed = name.trim() !== profile.fullName && name.trim().length >= 2;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try { await onSaved(await api<ProfileData>('/profile', { method: 'PATCH', body: { fullName: name.trim() } })); setSaved(true); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <section className="panel profile-card">
    <div className="profile-card-head"><span className="profile-avatar">{(name.trim() || profile.fullName).slice(0, 1)}</span><div><h2>Datos personales</h2><p>Cómo te ven tu vivienda y la caseta.</p></div></div>
    <form onSubmit={submit}>
      <label>Nombre<input value={name} onChange={e => { setName(e.target.value); setSaved(false); }} minLength={2} maxLength={120} required autoComplete="name"/></label>
      <p className="small muted">Aparece en tus pases (la caseta lo ve al escanear) y en los avisos de tu vivienda, por ejemplo «Invitó {name.trim().split(' ')[0] || 'María'}». Cada cambio queda registrado.</p>
      <ErrorBox message={error}/>{saved && <Success>Nombre actualizado.</Success>}
      <div className="profile-actions"><Button type="submit" busy={busy} disabled={!changed}><UserRound size={17}/> Guardar nombre</Button></div>
    </form>
  </section>;
}

function AlertsCard({ profile, propertyId, onSaved }: { profile: ProfileData; propertyId?: string; onSaved: (profile: ProfileData) => void }) {
  const [prefs, setPrefs] = useState<Prefs>(profile.preferences);
  const [quiet, setQuiet] = useState(profile.preferences.quietHours ?? { start: '22:00', end: '07:00' });
  const [quietOn, setQuietOn] = useState(!!profile.preferences.quietHours);
  const [moonPlays, setMoonPlays] = useState(0); // the moon tilts each time No molestar is turned on
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const desired = { alertEntries: prefs.alertEntries, alertExits: prefs.alertExits, quietHours: quietOn ? quiet : null };
  const original = { alertEntries: profile.preferences.alertEntries, alertExits: profile.preferences.alertExits, quietHours: profile.preferences.quietHours };
  const changed = JSON.stringify(desired) !== JSON.stringify(original);
  const invalid = quietOn && quiet.start === quiet.end;

  async function save() {
    setBusy(true); setError(''); setSaved(false);
    try {
      // Quiet hours follow this device's time zone.
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const value = await api<ProfileData>('/profile', { method: 'PATCH', body: { preferences: { ...desired, ...(quietOn ? { timezone: zone } : {}) } } });
      setPrefs(value.preferences); onSaved(value); setSaved(true);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return <section className="panel profile-card">
    <div className="profile-card-head"><span className="profile-icon icon-hover"><AnimatedFilledBell size={20}/></span><div><h2>Avisos</h2><p>Qué te avisamos cuando llegan visitas a tu vivienda.</p></div></div>
    {propertyId && <VisitAlerts propertyId={propertyId}/>}
    <div className="profile-toggles">
      <label className="checkbox-label"><input type="checkbox" checked={prefs.alertEntries} onChange={e => { setPrefs(p => ({ ...p, alertEntries: e.target.checked })); setSaved(false); }}/><span><strong>Entradas de visitas</strong><small>Cuando una visita entra al fraccionamiento.</small></span></label>
      <label className="checkbox-label"><input type="checkbox" checked={prefs.alertExits} onChange={e => { setPrefs(p => ({ ...p, alertExits: e.target.checked })); setSaved(false); }}/><span><strong>Salidas de visitas</strong><small>Cuando una visita se retira.</small></span></label>
      <label className="checkbox-label"><input type="checkbox" checked readOnly disabled/><span><strong>Solicitudes de visitas sin pase</strong><small>Siempre activas: necesitan tu respuesta para que la visita pueda entrar.</small></span></label>
    </div>
    <div className={'profile-quiet' + (quietOn ? ' on' : '')}>
      <label className="checkbox-label icon-hover"><input type="checkbox" checked={quietOn} onChange={e => { setQuietOn(e.target.checked); setSaved(false); if (e.target.checked) setMoonPlays(n => n + 1); }}/><span><strong><AnimatedMoon size={16} play={moonPlays}/> No molestar</strong><small>Silencia las entradas y salidas en este horario. Las solicitudes de visitas sin pase sí te llegan.</small></span></label>
      {quietOn && <div className="field-grid"><label>Desde<input className="scheme-light-dark" type="time" value={quiet.start} onChange={e => { setQuiet(q => ({ ...q, start: e.target.value })); setSaved(false); }} required/></label><label>Hasta<input className="scheme-light-dark" type="time" value={quiet.end} onChange={e => { setQuiet(q => ({ ...q, end: e.target.value })); setSaved(false); }} required/></label></div>}
      {invalid && <p className="small danger-text">El inicio y el fin deben ser distintos.</p>}
    </div>
    <p className="small muted">Estas preferencias aplican en todos tus teléfonos con avisos activados.</p>
    <ErrorBox message={error}/>{saved && <Success>Preferencias guardadas.</Success>}
    <div className="profile-actions"><Button busy={busy} disabled={!changed || invalid} onClick={() => void save()}>Guardar avisos</Button></div>
  </section>;
}
