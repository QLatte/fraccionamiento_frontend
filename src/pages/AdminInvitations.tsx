import { useState, type FormEvent } from 'react';
import { Check, KeyRound, Mail, Search, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../auth';
import { dateText, useMutation, useQuery } from '../hooks';
import type { AdminUser, Page, Property } from '../types';
import { Button, Empty, ErrorBox, Info, Loading, Success } from '../components/ui';
import { Secret } from './AdminSecret';

type Grant = { channel: 'IN_PERSON'; enrollmentToken: string; expiresAt: string } | { channel: 'EMAIL'; sentTo: string; expiresAt: string };

// Community admins only renew access (a resident changed or lost their phone). New
// residents are loaded by Zentry from the fraccionamiento's spreadsheet.
export function AdminInvitations() {
  const platform = useAuth().identity?.session.profile === 'SUPERADMIN';
  const [q, setQ] = useState(''); const [search, setSearch] = useState(''); const [cursor, setCursor] = useState(''); const [selected, setSelected] = useState<AdminUser | null>(null); const [home, setHome] = useState('');
  const [purpose, setPurpose] = useState('RECOVERY'); const [channel, setChannel] = useState<'EMAIL' | 'IN_PERSON'>('EMAIL'); const [verified, setVerified] = useState(false); const [grant, setGrant] = useState<Grant | null>(null);
  const users = useQuery<Page<AdminUser>>(`/admin/users?q=${encodeURIComponent(search)}${cursor ? '&cursor=' + cursor : ''}`); const homes = useQuery<Page<Property>>(selected ? `/admin/users/${selected.id}/properties` : null);
  const options = useQuery<{ emailEnabled: boolean }>('/admin/invitation-options'); const emailEnabled = !!options.data?.emailEnabled;
  const via = emailEnabled ? channel : 'IN_PERSON';
  const mutation = useMutation();
  async function submit(e: FormEvent) { e.preventDefault(); const result = await mutation.run<Grant>('/admin/enrollments', 'POST', { userId: selected!.id, propertyId: home, purpose: platform ? purpose : 'RECOVERY', channel: via, identityVerified: verified }); if (result) setGrant(result); }
  const reset = () => { setGrant(null); setVerified(false); mutation.clear(); };
  return <div className="admin-columns"><section className="panel"><div className="panel-heading"><div><h2>Encuentra a un residente</h2><p>Busca entre los residentes de tu fraccionamiento.</p></div><Users size={22}/></div><form className="admin-search" onSubmit={e => { e.preventDefault(); setCursor(''); setSearch(q); }}><input aria-label="Buscar personas" value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre o correo electrónico" maxLength={120}/><Button type="submit" className="secondary"><Search size={17}/> Buscar</Button></form><ErrorBox message={users.error} retry={users.refresh}/>{users.loading ? <Loading/> : !users.data?.data.length ? <Empty title="No encontramos a esa persona" text="Las altas de residentes las hace Zentry con el archivo del fraccionamiento. Si falta alguien, pídelo a Zentry."/> : <div className="people-list">{users.data.data.map(u => <button className={selected?.id === u.id ? 'selected' : ''} key={u.id} onClick={() => { setSelected(u); setHome(''); reset(); }}><span className="avatar">{u.fullName.slice(0, 1).toUpperCase()}</span><span><strong>{u.fullName}</strong><small>{u.email}</small></span>{selected?.id === u.id && <Check size={18}/>}</button>)}</div>}<div className="pager">{cursor && <Button className="secondary" onClick={() => setCursor('')}>Volver al inicio</Button>}{users.data?.nextCursor && <Button className="secondary" onClick={() => setCursor(users.data!.nextCursor!)}>Más personas</Button>}</div></section>
    <section className="panel invitation-form">{!selected ? <Empty icon={<KeyRound/>} title="¿Alguien cambió de teléfono?" text="Selecciona a la persona para renovar su acceso. Su llave anterior dejará de funcionar cuando active la nueva."/> : grant ? <><h2>Acceso renovado para {selected.fullName}</h2>{grant.channel === 'EMAIL' ? <><Success>Enviamos la invitación a {grant.sentTo}.</Success><p className="small">Debe abrir el enlace desde su teléfono nuevo antes del {dateText(grant.expiresAt)}. Solo funciona una vez.</p></> : <Secret title="Invitación creada" value={`${location.origin}/activar#${grant.enrollmentToken}`} expiresAt={grant.expiresAt}/>}<Button className="secondary" onClick={reset}>Crear otra invitación</Button></> : <><h2>Renovar acceso de {selected.fullName}</h2><form onSubmit={submit}><fieldset disabled={mutation.busy}>
      <label>Vivienda<select required value={home} onChange={e => setHome(e.target.value)}><option value="">Selecciona una vivienda</option>{homes.data?.data.map(h => <option key={h.id} value={h.id}>{h.street} {h.houseNumber} · {h.cluster.name}</option>)}</select></label><ErrorBox message={homes.error} retry={homes.refresh}/>{homes.data && !homes.data.data.length && <Info>Esta persona no tiene una vivienda activa en tu fraccionamiento.</Info>}
      {platform && <label>Motivo<select value={purpose} onChange={e => setPurpose(e.target.value)}><option value="RECOVERY">Recuperar acceso</option><option value="REGISTER">Registrar una nueva llave</option></select></label>}
      <fieldset className="channel-choice"><legend>¿Cómo se la entregas?</legend>
        <label className={'channel-option' + (via === 'EMAIL' ? ' selected' : '') + (!emailEnabled ? ' disabled' : '')}><input type="radio" name="channel" value="EMAIL" checked={via === 'EMAIL'} disabled={!emailEnabled} onChange={() => setChannel('EMAIL')}/><Mail size={19}/><span><strong>Por correo</strong><small>{emailEnabled ? `Llega a ${selected.email}. Vence en 72 horas.` : 'El envío de correos aún no está disponible.'}</small></span></label>
        <label className={'channel-option' + (via === 'IN_PERSON' ? ' selected' : '')}><input type="radio" name="channel" value="IN_PERSON" checked={via === 'IN_PERSON'} onChange={() => setChannel('IN_PERSON')}/><KeyRound size={19}/><span><strong>En persona</strong><small>Te mostramos un enlace para abrirlo en su teléfono ahí mismo. Vence en 15 minutos.</small></span></label>
      </fieldset>
      {(platform ? purpose : 'RECOVERY') === 'RECOVERY' && <Info>La nueva llave reemplazará las llaves de esta persona en la vivienda seleccionada y cerrará sus sesiones.</Info>}
      <label className="checkbox-label"><input type="checkbox" required checked={verified} onChange={e => setVerified(e.target.checked)}/> {via === 'EMAIL' ? 'Confirmé con esta persona que pidió renovar su acceso.' : 'Verifiqué la identidad de esta persona en persona.'}</label></fieldset>
      <ErrorBox message={mutation.error}/><Button className="full" type="submit" busy={mutation.busy} disabled={!home || !verified}>{via === 'EMAIL' ? <><Mail size={18}/> Enviar invitación</> : <><UserPlus size={18}/> Crear invitación</>}</Button></form></>}</section></div>;
}
