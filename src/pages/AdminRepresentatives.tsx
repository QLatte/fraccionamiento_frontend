import { useState } from 'react';
import { MessagesSquare, ShieldCheck, UserPlus } from 'lucide-react';
import { useMutation, useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Info, Loading, Modal } from '../components/ui';
import TrashIcon from '../components/icons/AnimatedTrash';
import './Chat.css';

type Privada = { clusterId: string; name: string; type: string; representatives: { userId: string; name: string; active: boolean }[]; owners: { userId: string; name: string; home: string }[] };

// Representantes: owners chosen by the admin to moderate their privada's chat.
export function AdminRepresentatives() {
  const list = useQuery<{ data: Privada[] }>('/admin/representatives');
  const mutation = useMutation();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<{ privada: Privada; userId: string; name: string } | null>(null);
  async function add(privada: Privada) {
    const userId = choice[privada.clusterId];
    if (userId && await mutation.run('/admin/representatives', 'POST', { clusterId: privada.clusterId, userId })) { setChoice(c => ({ ...c, [privada.clusterId]: '' })); list.refresh(); }
  }
  async function confirmRemove() {
    if (await mutation.run(`/admin/representatives/${remove!.privada.clusterId}/${remove!.userId}`, 'DELETE')) { setRemove(null); list.refresh(); }
  }
  const privadas = list.data?.data ?? [];
  return <section className="panel">
    <div className="panel-heading"><div><h2>Representantes del chat</h2><p>Cada privada tiene su chat entre propietarios. Elige quién lo modera: puede fijar avisos, quitar mensajes y silenciar a quien no respete las reglas.</p></div></div>
    <ErrorBox message={list.error} retry={list.refresh}/>
    {!remove && <ErrorBox message={mutation.error}/>}
    {list.loading && !list.data ? <Loading variant="cards"/> : !privadas.length ? <Empty icon={<MessagesSquare/>} title="Aún no hay privadas" text="Cuando des de alta privadas y viviendas, aquí podrás elegir a sus representantes."/> :
      <div className="reps-list">{privadas.map(p => {
        const candidates = p.owners.filter(o => !p.representatives.some(r => r.userId === o.userId));
        return <article className="reps-card" key={p.clusterId}>
          <h3>{p.type === 'PRIVADA' ? 'Privada ' : ''}{p.name}</h3>
          <p>{p.owners.length === 1 ? '1 propietario' : `${p.owners.length} propietarios`} en el chat</p>
          {p.representatives.length ? <ul className="reps-people">{p.representatives.map(r => <li key={r.userId}>
            <ShieldCheck size={17} color="var(--brand)"/>
            <span><strong>{r.name}</strong>{!r.active && <small>Ya no es propietario aquí; no modera</small>}</span>
            <button type="button" className="icon-button danger-text" aria-label={`Quitar a ${r.name} como representante`} onClick={() => { mutation.clear(); setRemove({ privada: p, userId: r.userId, name: r.name }); }}><TrashIcon size={17}/></button>
          </li>)}</ul> : <p className="small muted">Sin representante todavía.</p>}
          {candidates.length > 0 && <div className="reps-add">
            <select aria-label={`Propietario para representar ${p.name}`} value={choice[p.clusterId] ?? ''} onChange={e => setChoice(c => ({ ...c, [p.clusterId]: e.target.value }))}>
              <option value="">Elige un propietario</option>
              {candidates.map(o => <option key={o.userId} value={o.userId}>Casa {o.home} · {o.name}</option>)}
            </select>
            <Button className="secondary" disabled={!choice[p.clusterId]} busy={mutation.busy && !!choice[p.clusterId]} onClick={() => void add(p)}><UserPlus size={17}/> Asignar</Button>
          </div>}
        </article>;
      })}</div>}
    {remove && <Modal title="¿Quitar representante?" onClose={() => { if (!mutation.busy) setRemove(null); }}>
      <p><strong>{remove.name}</strong> dejará de moderar el chat de {remove.privada.name}. Seguirá participando como propietario.</p>
      <Info>Los silencios que haya puesto siguen vigentes; otro representante puede quitarlos.</Info>
      <ErrorBox message={mutation.error}/>
      <div className="modal-actions"><Button className="secondary" disabled={mutation.busy} onClick={() => setRemove(null)}>Conservar</Button><Button className="danger" busy={mutation.busy} onClick={confirmRemove}><TrashIcon size={17}/> Quitar</Button></div>
    </Modal>}
  </section>;
}
