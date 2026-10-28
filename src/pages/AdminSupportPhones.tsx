import { useState, type FormEvent } from 'react';
import { Pencil, Phone, Plus } from 'lucide-react';
import { useMutation, useQuery } from '../hooks';
import type { SupportContact } from '../types';
import { Button, Empty, ErrorBox, Info, Loading, Modal } from '../components/ui';
import TrashIcon from '../components/icons/AnimatedTrash';
import { contactIcon, phoneText } from './SupportPhones';

// Teléfonos de apoyo: the numbers this fraccionamiento's residents see in the app and can call.
export function AdminSupportPhones() {
  const contacts = useQuery<{ data: SupportContact[] }>('/admin/support-contacts');
  const [editing, setEditing] = useState<SupportContact | 'new' | null>(null); const [label, setLabel] = useState(''); const [phone, setPhone] = useState(''); const [remove, setRemove] = useState<SupportContact | null>(null);
  const mutation = useMutation();
  function open(target: SupportContact | 'new') { setEditing(target); setLabel(target === 'new' ? '' : target.label); setPhone(target === 'new' ? '' : target.phone); mutation.clear(); }
  async function save(e: FormEvent) {
    e.preventDefault();
    const body = { label: label.trim(), phone: phone.trim() };
    const ok = editing === 'new' ? await mutation.run('/admin/support-contacts', 'POST', body) : await mutation.run(`/admin/support-contacts/${(editing as SupportContact).id}`, 'PATCH', body);
    if (ok) { setEditing(null); contacts.refresh(); }
  }
  async function confirmRemove() { if (await mutation.run(`/admin/support-contacts/${remove!.id}`, 'DELETE')) { setRemove(null); contacts.refresh(); } }
  const list = contacts.data?.data ?? [];
  return <section className="panel">
    <div className="panel-heading"><div><h2>Teléfonos de apoyo</h2><p>Los residentes los ven en la app y llaman con un toque. Aparecen en el orden en que los agregas; Emergencias 911 siempre se muestra primero.</p></div><Button onClick={() => open('new')}><Plus size={17}/> Agregar teléfono</Button></div>
    <ErrorBox message={contacts.error} retry={contacts.refresh}/>
    {contacts.loading && !contacts.data ? <Loading/> : !list.length ? <Empty icon={<Phone/>} title="Aún no hay teléfonos" text="Agrega, por ejemplo, Administración, Caseta vehicular, Caseta peatonal o Patrulla."/> :
      <div className="device-list">{list.map(c => { const Icon = contactIcon(c.label); return <div className="device-row" key={c.id}><span className="device-symbol"><Icon/></span><div><h3>{c.label}</h3><p>{phoneText(c.phone)}</p></div>
        <div className="gate-actions"><button className="icon-button" aria-label={`Editar ${c.label}`} onClick={() => open(c)}><Pencil size={17}/></button><button className="icon-button danger-text" aria-label={`Eliminar ${c.label}`} onClick={() => { setRemove(c); mutation.clear(); }}><TrashIcon size={18}/></button></div></div>; })}</div>}
    {editing && <Modal title={editing === 'new' ? 'Agregar teléfono' : 'Editar teléfono'} onClose={() => { if (!mutation.busy) setEditing(null); }}><form onSubmit={save}><fieldset disabled={mutation.busy}>
      <label>Nombre<input autoFocus required minLength={2} maxLength={60} value={label} onChange={e => setLabel(e.target.value)} placeholder="Por ejemplo: Caseta vehicular"/></label>
      <label>Teléfono<input required type="tel" inputMode="tel" maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Por ejemplo: 55 1234 5678"/></label>
    </fieldset><ErrorBox message={mutation.error}/><div className="modal-actions"><Button className="secondary" disabled={mutation.busy} onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" busy={mutation.busy}>{editing === 'new' ? 'Agregar' : 'Guardar'}</Button></div></form></Modal>}
    {remove && <Modal title="¿Eliminar este teléfono?" onClose={() => { if (!mutation.busy) setRemove(null); }}><p><strong>{remove.label}</strong> ({phoneText(remove.phone)}) dejará de aparecer en la app de los residentes.</p><Info>Puedes volver a agregarlo cuando quieras.</Info><ErrorBox message={mutation.error}/><div className="modal-actions"><Button className="secondary" disabled={mutation.busy} onClick={() => setRemove(null)}>Conservar</Button><Button className="danger" busy={mutation.busy} onClick={confirmRemove}><TrashIcon size={17}/> Eliminar</Button></div></Modal>}
  </section>;
}
