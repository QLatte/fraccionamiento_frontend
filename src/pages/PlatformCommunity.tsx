import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MapPin, Send } from 'lucide-react';
import { api, errorText } from '../api';
import { dateText, useQuery } from '../hooks';
import { Button, ErrorBox, Loading } from '../components/ui';
import { PlatformImport } from './PlatformImport';
import { accessLabel, needsInvite, type CommunityDetail, type CommunitySummary, type Home, type InvitationJob, type Member } from './platformTypes';

// Invitations are emailed in the background; this follows the job and refreshes the list when it ends.
function useInvitationJob(communityId: string, onFinished: () => void) {
  const [job, setJob] = useState<InvitationJob | null>(null);
  // 'open': check once when the page opens; 'sent': a send was just started from here.
  const [tracking, setTracking] = useState<'open' | 'sent' | null>('open');
  const track = useCallback(() => setTracking('sent'), []);
  useEffect(() => {
    if (!tracking) return;
    let alive = true; let timer = 0; let wasRunning = tracking === 'sent';
    const poll = async () => {
      try {
        const next = await api<InvitationJob>(`/platform/communities/${communityId}/invitations/status`);
        if (!alive) return;
        setJob(next);
        if (next.running) { wasRunning = true; timer = window.setTimeout(poll, 1500); return; }
        setTracking(null);
        // Statuses only change when a send was in progress; the first check on open reloads nothing.
        if (wasRunning) onFinished();
      } catch { if (alive) timer = window.setTimeout(poll, 4000); }
    };
    void poll();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [tracking, communityId, onFinished]);
  return { job, track };
}

function InvitationProgress({ job }: { job: InvitationJob }) {
  const done = job.sent + job.failed;
  if (!job.total || (!job.running && !job.finishedAt)) return null;
  return <div className={'invite-progress' + (job.running ? '' : job.failed ? ' failed' : ' done')} role="status">
    <div className="invite-progress-text">{job.running
      ? <><Send size={16}/> Enviando invitaciones: {done} de {job.total}…</>
      : job.failed ? <>Se enviaron {job.sent} de {job.total}; {job.failed} no se pudieron enviar. {job.errors.join(' ')}</>
      : <>{job.sent === 1 ? 'Invitación enviada.' : `Se enviaron las ${job.sent} invitaciones.`}</>}</div>
    {job.running && <span className="invite-progress-bar"><i style={{ transform: `scaleX(${job.total ? done / job.total : 0})` }}/></span>}
  </div>;
}

// Platform accounts may hold a placeholder home to log in; they are not billed residents.
const residentsOf = (home: Home) => home.memberships.filter(m => m.user.globalRole !== 'SUPERADMIN').length;

type Props = { id: string; communities: CommunitySummary[]; emailEnabled: boolean; onChanged: () => void };

export function PlatformCommunity({ id, communities, emailEnabled, onChanged }: Props) {
  const detail = useQuery<CommunityDetail>(`/platform/communities/${id}`);
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const refresh = useCallback(() => { detail.refresh(); onChanged(); }, [detail.refresh, onChanged]);
  const invitations = useInvitationJob(id, refresh);
  // One action at a time; `key` names it so only its button shows progress.
  async function act(key: string, run: () => Promise<string>) {
    setBusy(key); setError(''); setMessage('');
    try { setMessage(await run()); refresh(); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  if (detail.loading && !detail.data) return <Loading/>;
  if (!detail.data) return <ErrorBox message={detail.error} retry={detail.refresh}/>;
  const community = detail.data;
  const homes = community.clusters.flatMap(c => c.properties);
  const pending = homes.flatMap(h => h.memberships.filter(m => needsInvite(m.access.status) && m.user.globalRole !== 'SUPERADMIN'));
  const admin = community.admins[0];
  const owners = [...new Map(homes.filter(p => p.status === 'ACTIVE').flatMap(p => p.memberships.filter(m => m.membershipRole === 'RESIDENT_OWNER' && ['RESIDENT', 'ADMIN'].includes(m.user.globalRole ?? '')).map(m => [m.user.id, m.user] as const))).values()].filter(u => u.id !== admin?.user.id);

  const sending = !!invitations.job?.running;
  const invite = (targets?: { userId: string; propertyId: string }[]) => act(targets ? `invite:${targets[0].userId}:${targets[0].propertyId}` : 'invite-all', async () => {
    await api<InvitationJob>(`/platform/communities/${id}/invitations`, { method: 'POST', body: targets ? { targets } : {} });
    invitations.track();
    return '';
  });

  return <section className="panel platform-panel platform-community" aria-label={community.name}>
    <h2>{community.name}</h2>
    <Settings community={community} onSaved={refresh}/>
    {communities.length > 1 && <Merge community={community} others={communities.filter(c => c.id !== community.id)} onMerged={refresh}/>}

    <h3>Administrador</h3>
    <p className="small">Solo hay uno por fraccionamiento y debe ser propietario de una casa. Puede renovar accesos y vincular equipos de caseta; no puede dar de alta residentes.</p>
    {admin ? <div className="platform-person"><span><strong>{admin.user.fullName}</strong><br/>{admin.user.email}</span><Button className="secondary" disabled={!!busy} onClick={() => { if (window.confirm(`¿Revocar la administración de ${admin.user.fullName}? Su perfil de residente se conservará.`)) void act('admin', async () => { await api(`/platform/community-admins/${admin.user.id}/${id}`, { method: 'DELETE' }); return 'Administración revocada. Su acceso residente se conserva.'; }); }}>Revocar administración</Button></div> : <p>Sin administrador asignado.</p>}
    <AssignAdmin owners={owners} replacing={!!admin} busy={busy === 'admin'} disabled={!!busy} onAssign={userId => act('admin', async () => { await api('/platform/community-admins', { method: 'POST', body: { userId, communityId: id } }); return admin ? 'Administrador reemplazado.' : 'Administrador asignado. Ya puede cambiar al perfil Administración.'; })}/>
    <ErrorBox message={error}/>{message && <p role="status" className="success-text">{message}</p>}

    <h3>Casetas</h3>
    <p className="small">Las crea y administra el administrador del fraccionamiento. Cada una deja entrar a visitas de cualquier casa de aquí.</p>
    {community.gates.length ? <ul className="platform-gates">{community.gates.map(g => <li key={g.id}><strong>{g.label}</strong><span>{g._count.devices === 1 ? '1 equipo' : `${g._count.devices} equipos`}</span></li>)}</ul> : <p className="muted">Aún no tiene casetas.</p>}

    <PlatformImport communityId={id} emailEnabled={emailEnabled} onImported={queued => { refresh(); if (queued) invitations.track(); }}/>

    <div className="platform-section-heading"><h3>Viviendas y residentes</h3>
      {!!pending.length && <Button busy={busy === 'invite-all' || sending} disabled={!emailEnabled || !!busy || sending} onClick={() => void invite()}><Send size={17}/> Enviar invitaciones pendientes ({pending.length})</Button>}</div>
    {invitations.job && <InvitationProgress job={invitations.job}/>}
    {!community.clusters.length && <p>Aún no hay privadas ni lotes. Importa el Excel del fraccionamiento.</p>}
    {community.clusters.map(section => <div className="platform-cluster" key={section.id}>
      <div className="platform-cluster-heading"><h4>{section.name} <span className="muted">· {section.type === 'LOTE' ? 'Lote' : 'Privada'} · {section.properties.length} {section.properties.length === 1 ? 'casa' : 'casas'}</span></h4>
        {communities.length > 1 && <label className="platform-move">Mover a<select value={id} disabled={!!busy} onChange={e => { const target = communities.find(c => c.id === e.target.value); if (target && window.confirm(`¿Mover ${section.name} a ${target.name}? Sus casas y residentes se van con la sección.`)) void act('move', async () => { await api(`/platform/clusters/${section.id}`, { method: 'PATCH', body: { communityId: target.id } }); return `${section.name} ahora pertenece a ${target.name}.`; }); }}>{communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      </div>
      <div className="platform-table"><table><thead><tr><th>Casa</th><th>Teléfonos</th><th>Residentes</th></tr></thead><tbody>
        {section.properties.map(home => <tr key={home.id}>
          <td data-label="Casa"><strong>{home.houseNumber}</strong>{home.status !== 'ACTIVE' && <small className="muted"> · inactiva</small>}{residentsOf(home) > 2 && <><br/><span className="badge expired"><span/>+{residentsOf(home) - 2} extra</span></>}</td>
          <td data-label="Teléfonos"><DeviceLimit home={home} onSaved={refresh}/></td>
          <td data-label="Residentes">{!home.memberships.length && <span className="muted">Sin residentes</span>}{home.memberships.map(m => <Resident key={m.user.id} member={m} busy={busy === `invite:${m.user.id}:${home.id}`} disabled={!emailEnabled || !!busy || sending} onInvite={() => void invite([{ userId: m.user.id, propertyId: home.id }])}/>)}</td>
        </tr>)}
      </tbody></table></div>
    </div>)}
  </section>;
}

function Resident({ member, busy, disabled, onInvite }: { member: Member; busy: boolean; disabled: boolean; onInvite: () => void }) {
  const { status, expiresAt, invitedAt, error } = member.access;
  const label = accessLabel[status];
  const platformAccount = member.user.globalRole === 'SUPERADMIN';
  return <div className="platform-resident"><div><strong>{member.user.fullName}</strong><small>{member.user.email}</small>
    {!platformAccount && <small><span className={`badge ${label.tone}`}><span/>{label.text}</span>{status === 'SENT' && expiresAt && <> · vence {dateText(expiresAt)}</>}{status === 'EXPIRED' && invitedAt && <> · enviada {dateText(invitedAt)}</>}</small>}
    {error && <small className="danger-text">{error}</small>}</div>
    {!platformAccount && status !== 'ACTIVE' && <Button className="secondary small-button" busy={busy} disabled={disabled} onClick={onInvite}>{status === 'PENDING' ? 'Enviar invitación' : 'Reenviar'}</Button>}
  </div>;
}

function DeviceLimit({ home, onSaved }: { home: Home; onSaved: () => void }) {
  const [value, setValue] = useState(String(home.deviceLimit)); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const used = home.memberships.reduce((sum, m) => sum + m.access.devices, 0);
  const changed = Number(value) !== home.deviceLimit;
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api(`/platform/properties/${home.id}`, { method: 'PATCH', body: { deviceLimit: Number(value) } }); onSaved(); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return <form className="device-limit" onSubmit={save}><span>{used} de</span><input aria-label={`Teléfonos permitidos en la casa ${home.houseNumber}`} type="number" inputMode="numeric" min={Math.max(1, used)} max={20} required value={value} onChange={e => setValue(e.target.value)}/>{changed && <Button type="submit" className="secondary small-button" busy={busy}>Guardar</Button>}{error && <small className="danger-text">{error}</small>}</form>;
}

function AssignAdmin({ owners, replacing, busy, disabled, onAssign }: { owners: { id: string; fullName: string; email: string }[]; replacing: boolean; busy: boolean; disabled: boolean; onAssign: (userId: string) => void }) {
  const [person, setPerson] = useState('');
  if (!owners.length) return null;
  return <form onSubmit={e => { e.preventDefault(); if (!replacing || window.confirm('El administrador actual dejará de serlo. ¿Continuar?')) onAssign(person); }}><label>{replacing ? 'Cambiar administrador' : 'Asignar propietario como administrador'}<select value={person} onChange={e => setPerson(e.target.value)} required disabled={disabled}><option value="">Selecciona una persona</option>{owners.map(u => <option key={u.id} value={u.id}>{u.fullName} · {u.email}</option>)}</select></label><Button disabled={!person || disabled} busy={busy} type="submit">{replacing ? 'Cambiar administrador' : 'Asignar administrador'}</Button></form>;
}

// Two fraccionamientos that are really the same customer (e.g. privadas migrated one per
// fraccionamiento): the other one's sections, homes and casetas move here.
function Merge({ community, others, onMerged }: { community: CommunityDetail; others: CommunitySummary[]; onMerged: () => void }) {
  const [from, setFrom] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('');
  const other = others.find(c => c.id === from);
  async function merge(e: FormEvent) {
    e.preventDefault(); if (!other) return;
    if (!window.confirm(`¿Unir «${other.name}» con «${community.name}»? Sus privadas, lotes, casas, residentes y casetas pasarán a «${community.name}» y «${other.name}» dejará de existir. Hazlo solo si son el mismo fraccionamiento.`)) return;
    setBusy(true); setError(''); setDone('');
    try { await api(`/platform/communities/${community.id}/merge`, { method: 'POST', body: { fromCommunityId: other.id } }); setDone(`«${other.name}» ahora es parte de «${community.name}».`); setFrom(''); onMerged(); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return <form className="platform-merge" onSubmit={merge}>
    <label>Unir con otro fraccionamiento<select value={from} onChange={e => setFrom(e.target.value)}><option value="">Solo si son el mismo cliente</option>{others.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <Button type="submit" className="secondary" busy={busy} disabled={!other}>Unir aquí</Button>
    {done && <p role="status" className="small success-text">{done}</p>}<ErrorBox message={error}/>
  </form>;
}

function Settings({ community, onSaved }: { community: CommunityDetail; onSaved: () => void }) {
  const [name, setName] = useState(community.name); const [mapsUrl, setMapsUrl] = useState(community.mapsUrl ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const changed = name.trim() !== community.name || mapsUrl.trim() !== (community.mapsUrl ?? '');
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try { await api(`/platform/communities/${community.id}`, { method: 'PATCH', body: { name: name.trim(), mapsUrl: mapsUrl.trim() || null } }); setSaved(true); onSaved(); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return <form className="platform-settings" onSubmit={save}>
    <label>Nombre<input required minLength={2} maxLength={120} value={name} onChange={e => { setName(e.target.value); setSaved(false); }}/></label>
    <label><span><MapPin size={15}/> Ubicación en Google Maps</span><input type="url" inputMode="url" maxLength={500} value={mapsUrl} onChange={e => { setMapsUrl(e.target.value); setSaved(false); }} placeholder="https://maps.app.goo.gl/…"/></label>
    <Button type="submit" className="secondary" busy={busy} disabled={!changed}>Guardar</Button>
    {saved && !changed && <p role="status" className="small">Guardado. Los pases nuevos usan esta ubicación.</p>}<ErrorBox message={error}/>
  </form>;
}
