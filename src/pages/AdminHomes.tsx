import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronRight, Home as HomeIcon, KeyRound, Mail, Phone, Search, UserPlus } from 'lucide-react';
import { AnimatedSend } from '../components/icons/AnimatedIcons';
import { dateText, useMutation, useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Info, Loading, Modal, Success } from '../components/ui';
import { Secret } from './AdminSecret';
import { InvitationProgress, useInvitationJob } from './PlatformCommunity';
import { phoneText } from './SupportPhones';
import { accessLabel, needsInvite, type Home, type Member, type Section } from './platformTypes';
import './AdminHomes.css';

// Viviendas: the fraccionamiento's privadas and lotes with their homes. The admin adds people,
// invites them, renews access and sets how many phones each home may register.
type Homes = { emailEnabled: boolean; clusters: Section[] };
type Filter = 'all' | 'missing' | 'sent' | 'active' | 'extra';
type Grant = { channel: 'IN_PERSON'; enrollmentToken: string; expiresAt: string } | { channel: 'EMAIL'; sentTo: string; expiresAt: string };

const INCLUDED = 2;
const MAX_PHONES = 10;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' }, { id: 'missing', label: 'Sin acceso' }, { id: 'sent', label: 'Invitación enviada' },
  { id: 'active', label: 'Todos activos' }, { id: 'extra', label: 'Con residentes extra' },
];
// Platform accounts may hold a placeholder home to log in; they are not residents.
const people = (home: Home) => home.memberships.filter(m => m.user.globalRole !== 'SUPERADMIN');
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const matches: Record<Filter, (home: Home) => boolean> = {
  all: () => true,
  missing: home => people(home).some(m => needsInvite(m.access.status)),
  sent: home => people(home).some(m => m.access.status === 'SENT'),
  active: home => people(home).length > 0 && people(home).every(m => m.access.status === 'ACTIVE'),
  extra: home => people(home).length > INCLUDED,
};

/** Wide screens show the selected home beside the list; phones open it over the list. */
function useWide() {
  const query = '(min-width: 1100px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => { const list = window.matchMedia(query); const update = () => setWide(list.matches); list.addEventListener('change', update); return () => list.removeEventListener('change', update); }, []);
  return wide;
}

export function AdminHomes() {
  const homes = useQuery<Homes>('/admin/homes');
  const invitations = useInvitationJob('/admin/invitations/status', homes.refresh);
  const [q, setQ] = useState(''); const [cluster, setCluster] = useState(''); const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState(''); const [adding, setAdding] = useState(false);
  const bulk = useMutation();
  const wide = useWide();
  const clusters = homes.data?.clusters ?? [];
  const emailEnabled = !!homes.data?.emailEnabled;
  const all = clusters.flatMap(c => c.properties.map(home => ({ home, section: c })));
  const pending = all.flatMap(({ home }) => people(home).filter(m => needsInvite(m.access.status))).length;
  const residents = all.reduce((sum, { home }) => sum + people(home).length, 0);
  const active = all.reduce((sum, { home }) => sum + people(home).filter(m => m.access.status === 'ACTIVE').length, 0);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.id, all.filter(({ home }) => matches[f.id](home)).length])), [homes.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const term = fold(q.trim());
  const visible = clusters.filter(c => !cluster || c.id === cluster).map(section => ({ section, homes: section.properties.filter(home => matches[filter](home)
    && (!term || fold(home.houseNumber).includes(term) || people(home).some(m => fold(m.user.fullName).includes(term) || m.user.email.includes(term)))) })).filter(s => s.homes.length);
  const current = all.find(({ home }) => home.id === selected);
  const sending = !!invitations.job?.running;

  async function inviteAll() {
    if (await bulk.run('/admin/invitations', 'POST', {})) invitations.track();
  }

  const detail = current && <HomeDetail key={current.home.id} home={current.home} section={current.section} emailEnabled={emailEnabled} sending={sending} onChanged={homes.refresh} onAdd={() => setAdding(true)}/>;
  return <div className="homes">
    <section className="homes-kpis" aria-label="Resumen">
      <div className="kpi"><span className="kpi-label">Casas</span><strong>{all.length}</strong><small>{clusters.length === 1 ? '1 privada o lote' : `${clusters.length} privadas y lotes`}</small></div>
      <div className="kpi"><span className="kpi-label">Residentes</span><strong>{residents}</strong><small>{residents ? `${Math.round(active / residents * 100)}% con acceso activo` : 'Aún no hay residentes'}</small></div>
      <button type="button" className="kpi" onClick={() => setFilter('missing')}><span className="kpi-label">Sin acceso</span><strong>{pending}</strong><small>Sin invitar, vencidas o sin enviar</small></button>
      <button type="button" className="kpi" onClick={() => setFilter('extra')}><span className="kpi-label">Casas con extra</span><strong>{counts.extra ?? 0}</strong><small>Más de {INCLUDED} residentes, se cobran aparte</small></button>
    </section>

    <section className="panel homes-panel" aria-label="Viviendas">
      <div className="homes-toolbar">
        <h2>Viviendas</h2>
        <label className="homes-search"><Search size={16}/><input aria-label="Buscar casa o residente" placeholder="Casa, nombre o correo" value={q} onChange={e => setQ(e.target.value)} maxLength={80}/></label>
        {clusters.length > 1 && <label className="movements-select">Privada o lote<select value={cluster} onChange={e => setCluster(e.target.value)}><option value="">Todas</option>{clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {!!pending && <Button busy={bulk.busy || sending} disabled={!emailEnabled || sending} onClick={() => void inviteAll()}><AnimatedSend size={17}/> Invitar a {pending} sin acceso</Button>}
      </div>
      <div className="movements-chips" role="group" aria-label="Filtrar viviendas">{FILTERS.map(f => <button key={f.id} type="button" className={filter === f.id ? 'active' : ''} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} <span className="homes-count">{counts[f.id] ?? 0}</span></button>)}</div>
      {homes.data && !emailEnabled && <Info>El envío de correos aún no está disponible: puedes dar de alta residentes y entregarles la invitación en persona.</Info>}
      {invitations.job && <InvitationProgress job={invitations.job}/>}
      <ErrorBox message={homes.error || bulk.error} retry={homes.error ? homes.refresh : undefined}/>
      {homes.loading && !homes.data ? <Loading/> : !all.length ? <Empty icon={<HomeIcon/>} title="Aún no hay viviendas" text="Zentry carga las privadas y casas del fraccionamiento desde su Excel."/> :
        <div className="homes-layout">
          <div className="homes-list">
            {!visible.length ? <Empty icon={<Search/>} title="Nada con este filtro" text="Cambia el filtro o la búsqueda."/> : visible.map(({ section, homes: list }) => <div className="homes-group" key={section.id}>
              <h3>{section.name} <span>{section.type === 'LOTE' ? 'Lote' : 'Privada'} · {list.length === 1 ? '1 casa' : `${list.length} casas`}</span></h3>
              <ul>{list.map(home => <HomeRow key={home.id} home={home} selected={home.id === selected} onSelect={() => setSelected(home.id)}/>)}</ul>
            </div>)}
          </div>
          {wide && <aside className="homes-detail" aria-label="Detalle de la vivienda">{detail ?? <Empty icon={<HomeIcon/>} title="Elige una casa" text="Verás quién vive ahí, su acceso y sus teléfonos."/>}</aside>}
        </div>}
    </section>
    {!wide && current && <Modal title={`Casa ${current.home.houseNumber}`} onClose={() => setSelected('')}>{detail}</Modal>}
    {adding && current && <AddResident home={current.home} emailEnabled={emailEnabled} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); homes.refresh(); }}/>}
  </div>;
}

function HomeRow({ home, selected, onSelect }: { home: Home; selected: boolean; onSelect: () => void }) {
  const list = people(home);
  const missing = list.filter(m => needsInvite(m.access.status)).length;
  const devices = list.reduce((sum, m) => sum + m.access.devices, 0);
  return <li><button type="button" className={'homes-row' + (selected ? ' selected' : '')} aria-pressed={selected} onClick={onSelect}>
    <span className="homes-number">{home.houseNumber}{home.status !== 'ACTIVE' && <small>Inactiva</small>}</span>
    <span className="homes-people">{!list.length ? <span className="muted">Sin residentes</span> : <><strong>{list.map(m => m.user.fullName.split(' ')[0]).join(', ')}</strong><small>{list.length === 1 ? '1 residente' : `${list.length} residentes`}{list.length > INCLUDED && ` · +${list.length - INCLUDED} extra`}</small></>}</span>
    <span className="homes-state">{missing ? <span className="badge expired"><span/>{missing === 1 ? '1 sin acceso' : `${missing} sin acceso`}</span> : list.some(m => m.access.status === 'SENT') ? <span className="badge used"><span/>Invitados</span> : list.length ? <span className="badge"><span/>Activos</span> : null}</span>
    <span className="homes-phones" aria-label={`${devices} de ${home.deviceLimit} teléfonos`}><Phone size={14}/>{devices}/{home.deviceLimit}</span>
    <ChevronRight size={18} className="homes-chevron"/>
  </button></li>;
}

function HomeDetail({ home, section, emailEnabled, sending, onChanged, onAdd }: { home: Home; section: Section; emailEnabled: boolean; sending: boolean; onChanged: () => void; onAdd: () => void }) {
  const list = people(home);
  const devices = list.reduce((sum, m) => sum + m.access.devices, 0);
  const [access, setAccess] = useState<{ member: Member; purpose: 'REGISTER' | 'RECOVERY' } | null>(null);
  const [notice, setNotice] = useState('');
  const send = useMutation();
  async function invite(member: Member) {
    setNotice('');
    const sent = await send.run<Grant>('/admin/enrollments', 'POST', { userId: member.user.id, propertyId: home.id, purpose: 'REGISTER', channel: 'EMAIL', identityVerified: true });
    if (sent && sent.channel === 'EMAIL') { setNotice(`Invitación enviada a ${sent.sentTo}.`); onChanged(); }
  }
  return <div className="homes-detail-body">
    <div className="homes-detail-head">
      <div><h2>Casa {home.houseNumber}</h2><p>{section.name} · {section.type === 'LOTE' ? 'Lote' : 'Privada'}{home.status !== 'ACTIVE' && ' · inactiva'}</p></div>
      {list.length > INCLUDED && <span className="badge expired"><span/>+{list.length - INCLUDED} extra</span>}
    </div>
    <PhoneLimit home={home} used={devices} onSaved={onChanged}/>
    <div className="homes-section-title"><h3>Residentes</h3>{home.status === 'ACTIVE' && <Button className="secondary small-button" onClick={onAdd}><UserPlus size={16}/> Agregar</Button>}</div>
    {notice && <Success>{notice}</Success>}<ErrorBox message={send.error}/>
    {!list.length ? <p className="muted">Nadie vive aquí todavía. Agrega a la primera persona.</p> : <ul className="homes-residents">{list.map(member => {
      const label = accessLabel[member.access.status];
      const { status, expiresAt, invitedAt, error } = member.access;
      return <li key={member.user.id}>
        <span className="avatar">{member.user.fullName.slice(0, 1).toUpperCase()}</span>
        <div className="homes-resident-info">
          <strong>{member.user.fullName}</strong>
          <small>{member.user.email}</small>
          {member.user.phone && <a href={`tel:${member.user.phone}`}>{phoneText(member.user.phone)}</a>}
          <small><span className={`badge ${label.tone}`}><span/>{label.text}</span> {member.membershipRole === 'FAMILY_MEMBER' ? 'Familiar' : 'Propietario'}{status === 'SENT' && expiresAt && ` · vence ${dateText(expiresAt)}`}{status === 'EXPIRED' && invitedAt && ` · enviada ${dateText(invitedAt)}`}{status === 'ACTIVE' && ` · ${member.access.devices === 1 ? '1 teléfono' : `${member.access.devices} teléfonos`}`}</small>
          {error && <small className="danger-text">{error}</small>}
        </div>
        <div className="homes-resident-actions">{status === 'ACTIVE'
          ? <Button className="secondary small-button" onClick={() => setAccess({ member, purpose: 'RECOVERY' })}><KeyRound size={15}/> Renovar acceso</Button>
          : <>{emailEnabled && <Button className="secondary small-button" busy={send.busy} disabled={sending} onClick={() => void invite(member)}><Mail size={15}/> {status === 'PENDING' ? 'Invitar' : 'Reenviar'}</Button>}
            <Button className="secondary small-button" onClick={() => setAccess({ member, purpose: 'REGISTER' })}><KeyRound size={15}/> En persona</Button></>}</div>
      </li>;
    })}</ul>}
    {access && <AccessModal member={access.member} home={home} purpose={access.purpose} emailEnabled={emailEnabled} onClose={() => { setAccess(null); onChanged(); }}/>}
  </div>;
}

function PhoneLimit({ home, used, onSaved }: { home: Home; used: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(Math.min(home.deviceLimit, MAX_PHONES))); const [saved, setSaved] = useState(false);
  const mutation = useMutation();
  // Plataforma can allow more than the admin's maximum; the admin can only bring it back within it.
  const options = Array.from({ length: MAX_PHONES - Math.max(1, used) + 1 }, (_, i) => Math.max(1, used) + i);
  async function save(e: FormEvent) { e.preventDefault(); setSaved(false); if (await mutation.run(`/admin/properties/${home.id}`, 'PATCH', { deviceLimit: Number(value) })) { setSaved(true); onSaved(); } }
  return <form className="homes-phones-form" onSubmit={save}>
    <div><strong>Teléfonos</strong><small>{used} registrados de {home.deviceLimit} permitidos</small></div>
    <span className="homes-phones-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, used / home.deviceLimit)})` }}/></span>
    <label>Permitir<select value={value} onChange={e => { setValue(e.target.value); setSaved(false); }} disabled={mutation.busy}>{home.deviceLimit > MAX_PHONES && <option value={home.deviceLimit}>{home.deviceLimit} (asignado por Zentry)</option>}{options.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    {Number(value) !== home.deviceLimit && <Button type="submit" className="small-button" busy={mutation.busy}>Guardar</Button>}
    {saved && Number(value) === home.deviceLimit && <small role="status" className="success-text">Guardado.</small>}
    <ErrorBox message={mutation.error}/>
  </form>;
}

function AddResident({ home, emailEnabled, onClose, onAdded }: { home: Home; emailEnabled: boolean; onClose: () => void; onAdded: () => void }) {
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [invite, setInvite] = useState(emailEnabled);
  const [result, setResult] = useState<{ invitation: { ok: boolean; sentTo: string } | null } | null>(null);
  const mutation = useMutation();
  const extra = people(home).length >= INCLUDED;
  async function submit(e: FormEvent) {
    e.preventDefault();
    const added = await mutation.run<{ invitation: { ok: boolean; sentTo: string } | null }>('/admin/residents', 'POST', { propertyId: home.id, fullName: fullName.trim(), email: email.trim(), phone: phone.trim() || undefined, invite: emailEnabled && invite });
    if (added) setResult(added);
  }
  return <Modal title={`Agregar residente a Casa ${home.houseNumber}`} onClose={() => { if (!mutation.busy) (result ? onAdded : onClose)(); }}>
    {result ? <>
      <Success>{fullName.trim()} ya vive en Casa {home.houseNumber}.</Success>
      <p className="small">{result.invitation ? (result.invitation.ok ? `Le enviamos la invitación a ${result.invitation.sentTo}.` : 'No se pudo enviar el correo: aparece como «No se envió» para reintentarlo.') : 'Entrégale la invitación desde su ficha, por correo o en persona.'}</p>
      <div className="modal-actions"><Button onClick={onAdded}>Listo</Button></div>
    </> : <form onSubmit={submit}><fieldset disabled={mutation.busy}>
      <label>Nombre completo<input autoFocus required minLength={2} maxLength={120} value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="off"/></label>
      <label>Correo electrónico<input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} autoComplete="off"/><small>Ahí le llega la invitación para activar su acceso.</small></label>
      <label>Teléfono de contacto <span className="optional">(opcional)</span><input type="tel" inputMode="tel" maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} placeholder="55 1234 5678"/><small>La caseta lo usa para llamar si llega una visita sin pase.</small></label>
      {emailEnabled && <label className="checkbox-label"><input type="checkbox" checked={invite} onChange={e => setInvite(e.target.checked)}/> Enviarle la invitación por correo ahora</label>}
      {extra && <Info>Casa {home.houseNumber} ya tiene {people(home).length} residentes. A partir del tercero, cada persona cuenta como residente extra y se cobra aparte.</Info>}
    </fieldset><ErrorBox message={mutation.error}/><div className="modal-actions"><Button className="secondary" disabled={mutation.busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={mutation.busy}><UserPlus size={17}/> Agregar</Button></div></form>}
  </Modal>;
}

/** An invitation shown in person, or a renewal (by email or in person) for someone who changed phones. */
function AccessModal({ member, home, purpose, emailEnabled, onClose }: { member: Member; home: Home; purpose: 'REGISTER' | 'RECOVERY'; emailEnabled: boolean; onClose: () => void }) {
  const renew = purpose === 'RECOVERY';
  const [channel, setChannel] = useState<'EMAIL' | 'IN_PERSON'>(renew && emailEnabled ? 'EMAIL' : 'IN_PERSON'); const [verified, setVerified] = useState(false); const [grant, setGrant] = useState<Grant | null>(null);
  const mutation = useMutation();
  async function submit(e: FormEvent) { e.preventDefault(); const result = await mutation.run<Grant>('/admin/enrollments', 'POST', { userId: member.user.id, propertyId: home.id, purpose, channel, identityVerified: verified }); if (result) setGrant(result); }
  return <Modal title={renew ? `Renovar acceso de ${member.user.fullName}` : `Invitar en persona a ${member.user.fullName}`} onClose={() => { if (!mutation.busy) onClose(); }}>
    {grant ? <>{grant.channel === 'EMAIL' ? <><Success>Enviamos la invitación a {grant.sentTo}.</Success><p className="small">Debe abrir el enlace desde su teléfono nuevo antes del {dateText(grant.expiresAt)}. Solo funciona una vez.</p></> : <Secret title="Invitación creada" value={`${location.origin}/activar#${grant.enrollmentToken}`} expiresAt={grant.expiresAt}/>}<div className="modal-actions"><Button onClick={onClose}>Listo</Button></div></> :
      <form onSubmit={submit}><fieldset disabled={mutation.busy}>
        {renew && <fieldset className="channel-choice"><legend>¿Cómo se la entregas?</legend>
          <label className={'channel-option' + (channel === 'EMAIL' ? ' selected' : '') + (!emailEnabled ? ' disabled' : '')}><input type="radio" name="channel" value="EMAIL" checked={channel === 'EMAIL'} disabled={!emailEnabled} onChange={() => setChannel('EMAIL')}/><Mail size={19}/><span><strong>Por correo</strong><small>{emailEnabled ? `Llega a ${member.user.email}. Vence en 72 horas.` : 'El envío de correos aún no está disponible.'}</small></span></label>
          <label className={'channel-option' + (channel === 'IN_PERSON' ? ' selected' : '')}><input type="radio" name="channel" value="IN_PERSON" checked={channel === 'IN_PERSON'} onChange={() => setChannel('IN_PERSON')}/><KeyRound size={19}/><span><strong>En persona</strong><small>Te mostramos un enlace para abrirlo en su teléfono ahí mismo. Vence en 15 minutos.</small></span></label>
        </fieldset>}
        {renew ? <Info>La nueva llave reemplazará las llaves de esta persona en Casa {home.houseNumber} y cerrará sus sesiones.</Info> : <p className="small">Te mostramos un enlace para que {member.user.fullName} lo abra en su teléfono ahí mismo. Vence en 15 minutos.</p>}
        <label className="checkbox-label"><input type="checkbox" required checked={verified} onChange={e => setVerified(e.target.checked)}/> {channel === 'EMAIL' ? 'Confirmé con esta persona que pidió renovar su acceso.' : 'Verifiqué la identidad de esta persona en persona.'}</label>
      </fieldset><ErrorBox message={mutation.error}/><div className="modal-actions"><Button className="secondary" disabled={mutation.busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={mutation.busy} disabled={!verified}>{channel === 'EMAIL' ? <><Mail size={17}/> Enviar invitación</> : <><KeyRound size={17}/> Crear invitación</>}</Button></div></form>}
  </Modal>;
}
