import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api, errorText } from '../api';
import { useQuery } from '../hooks';
import { Button, ErrorBox, Info, Loading, Modal, PageHeader } from '../components/ui';
import { PlatformCommunity } from './PlatformCommunity';
import type { Usage } from './platformTypes';

export function Platform() {
  const usage = useQuery<Usage>('/platform/usage');
  const [selected, setSelected] = useState('');
  const [creating, setCreating] = useState(false);
  const communities = usage.data?.data ?? [];
  return <><PageHeader title="Plataforma" text="Fraccionamientos, altas de residentes desde Excel, invitaciones por correo y cobro." action={<Button onClick={() => setCreating(true)}><Plus size={18}/> Nuevo fraccionamiento</Button>}/>
    {usage.data && !usage.data.emailEnabled && <Info>El envío de correos no está configurado. Agrega RESEND_API_KEY y EMAIL_FROM en el API (Render) para mandar las invitaciones; mientras tanto puedes importar y entregar invitaciones en persona.</Info>}
    <ErrorBox message={usage.error} retry={usage.refresh}/>
    {usage.loading && !usage.data ? <Loading/> : <section className="panel platform-panel"><h2>Fraccionamientos</h2><p>Casas activas y residentes únicos. «Extra» son los residentes por encima de los 2 incluidos por casa, que se cobran aparte.</p>
      <div className="platform-table"><table><thead><tr><th>Fraccionamiento</th><th>Privadas y lotes</th><th>Casas</th><th>Residentes</th><th>Extra</th><th>Administrador</th><th/></tr></thead>
        <tbody>{communities.map(c => <tr key={c.id} className={selected === c.id ? 'selected' : ''}>
          <td data-label="Fraccionamiento"><strong>{c.name}</strong></td>
          <td data-label="Privadas y lotes">{[c.privadas && `${c.privadas} ${c.privadas === 1 ? 'privada' : 'privadas'}`, c.lotes && `${c.lotes} ${c.lotes === 1 ? 'lote' : 'lotes'}`].filter(Boolean).join(' · ') || '—'}</td>
          <td data-label="Casas">{c.activeProperties}</td>
          <td data-label="Residentes">{c.activeResidents}</td>
          <td data-label="Extra">{c.extraResidents ? <span className="badge expired"><span/>+{c.extraResidents}</span> : '0'}</td>
          <td data-label="Administrador">{c.admins ? 'Asignado' : 'Sin asignar'}</td>
          <td><Button className="secondary" onClick={() => setSelected(c.id)}>Administrar</Button></td>
        </tr>)}</tbody></table></div>
      {!communities.length && <p>No hay fraccionamientos registrados. Crea uno e importa su Excel.</p>}</section>}
    {selected && <PlatformCommunity key={selected} id={selected} communities={communities} emailEnabled={!!usage.data?.emailEnabled} onChanged={usage.refresh}/>}
    {creating && <CreateCommunity onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setSelected(id); usage.refresh(); }}/>}
  </>;
}

function CreateCommunity({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(''); const [mapsUrl, setMapsUrl] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const created = await api<{ id: string }>('/platform/communities', { method: 'POST', body: { name: name.trim(), mapsUrl: mapsUrl.trim() || null } }); onCreated(created.id); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return <Modal title="Nuevo fraccionamiento" onClose={() => { if (!busy) onClose(); }}><form onSubmit={submit}><fieldset disabled={busy}>
    <label>Nombre<input required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Por ejemplo: Fraccionamiento Las Palmas"/></label>
    <label>Ubicación en Google Maps <span className="optional">(opcional)</span><input type="url" inputMode="url" maxLength={500} value={mapsUrl} onChange={e => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…"/><small>Se envía con cada pase compartido para que la visita llegue.</small></label>
  </fieldset><ErrorBox message={error}/><div className="modal-actions"><Button className="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" busy={busy}>Crear fraccionamiento</Button></div></form></Modal>;
}
