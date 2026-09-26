import { useState } from 'react';
import { api, errorText } from '../api';
import { useQuery } from '../hooks';
import { Button, ErrorBox, Loading, PageHeader } from '../components/ui';
type Person = { id: string; fullName: string; email: string; globalRole?: string };
type Community = { id: string; name: string; type: string; activeProperties: number; activeResidents: number; admins: number };
type Detail = { id: string; name: string; admins: { user: Person; createdAt: string }[]; properties: { id: string; street: string; houseNumber: string; status: string; memberships: { membershipRole: string; user: Person }[] }[] };
export function Platform() {
  const communities = useQuery<{ data: Community[] }>('/platform/usage');
  const [selected, setSelected] = useState('');
  const detail = useQuery<Detail>(selected ? `/platform/clusters/${selected}` : null);
  const [person, setPerson] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const owners = [...new Map((detail.data?.properties ?? []).filter(p => p.status === 'ACTIVE').flatMap(p => p.memberships.filter(m => m.membershipRole === 'RESIDENT_OWNER' && ['RESIDENT', 'ADMIN'].includes(m.user.globalRole ?? '')).map(m => [m.user.id, m.user] as const))).values()].filter(u => !detail.data?.admins.some(a => a.user.id === u.id));
  async function change(userId: string, remove = false) {
    setBusy(true); setError(''); setMessage('');
    try { await api(remove ? `/platform/cluster-admins/${userId}/${selected}` : '/platform/cluster-admins', { method: remove ? 'DELETE' : 'POST', ...(remove ? {} : { body: { userId, clusterId: selected } }) }); setPerson(''); setMessage(remove ? 'Administración revocada. Su acceso residente se conserva.' : 'Administrador asignado. Ya puede cambiar al perfil Administración.'); detail.refresh(); communities.refresh(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <><PageHeader title="Plataforma" text="Control global de fraccionamientos, viviendas, residentes y administradores."/>
    <ErrorBox message={communities.error} retry={communities.refresh}/>{communities.loading ? <Loading/> : <section className="panel platform-panel"><h2>Fraccionamientos</h2><p>Los conteos incluyen viviendas activas y residentes únicos por fraccionamiento. Un propietario administrador también cuenta como residente.</p><div className="platform-table"><table><thead><tr><th>Fraccionamiento</th><th>Casas activas</th><th>Residentes</th><th>Administradores</th><th/></tr></thead><tbody>{communities.data?.data.map(c => <tr key={c.id}><td data-label="Fraccionamiento">{c.name}</td><td data-label="Casas activas">{c.activeProperties}</td><td data-label="Residentes">{c.activeResidents}</td><td data-label="Administradores">{c.admins}</td><td><Button className="secondary" onClick={() => { setSelected(c.id); setPerson(''); setMessage(''); setError(''); }}>Administrar</Button></td></tr>)}</tbody></table></div>{!communities.data?.data.length && <p>No hay fraccionamientos registrados.</p>}</section>}
    <ErrorBox message={detail.error} retry={detail.refresh}/>{selected && detail.loading ? <Loading/> : detail.data && <section className="panel platform-panel" key={selected}><h2>{detail.data.name}</h2><h3>Administradores asignados</h3>{!detail.data.admins.length && <p>Sin administradores asignados.</p>}{detail.data.admins.map(a => <div className="platform-person" key={a.user.id}><span><strong>{a.user.fullName}</strong><br/>{a.user.email}</span><Button className="secondary" disabled={busy} onClick={() => { if (window.confirm(`¿Revocar la administración de ${a.user.fullName}? Su perfil de residente se conservará.`)) void change(a.user.id, true); }}>Revocar administración</Button></div>)}
    <form onSubmit={e => { e.preventDefault(); void change(person); }}><label>Asignar propietario como administrador<select value={person} onChange={e => setPerson(e.target.value)} required disabled={busy}><option value="">Selecciona una persona</option>{owners.map(u => <option key={u.id} value={u.id}>{u.fullName} · {u.email}</option>)}</select></label><Button disabled={!person || busy} type="submit">Asignar administrador</Button></form><ErrorBox message={error}/>{message && <p role="status">{message}</p>}
    <h3>Viviendas y residentes</h3><div className="platform-table"><table><thead><tr><th>Vivienda</th><th>Estado</th><th>Personas asociadas</th></tr></thead><tbody>{detail.data.properties.map(p => <tr key={p.id}><td data-label="Vivienda">{p.street} {p.houseNumber}</td><td data-label="Estado">{p.status === 'ACTIVE' ? 'Activa' : 'Inactiva'}</td><td data-label="Personas asociadas">{p.memberships.map(m => <div key={m.user.id}>{m.user.fullName} · {m.user.email} · {m.membershipRole === 'RESIDENT_OWNER' ? 'Propietario' : 'Familiar'}</div>)}</td></tr>)}</tbody></table></div></section>}
  </>;
}
