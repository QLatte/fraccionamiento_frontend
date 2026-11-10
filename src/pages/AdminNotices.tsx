import { useState, type FormEvent } from 'react';
import { Archive, Megaphone, Plus } from 'lucide-react';
import { dateText, useMutation, useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Info, Loading, Modal, Success } from '../components/ui';
import { AttachmentList, AttachmentPicker, type Attachment } from '../components/NoticeAttachments';
import './Notices.css';

// Comunicados: the fraccionamiento's administration writes once and every resident gets it in
// the app and by push. Read and «Enterado» counts tell how far it reached.
type AdminNotice = { id: string; title: string; body: string; urgent: boolean; createdAt: string; archivedAt: string | null; author: string; read: number; acknowledged: number; attachments?: Attachment[] };
type Data = { audience: number; data: AdminNotice[] };
const TITLE = 120, BODY = 4000;

export function AdminNotices() {
  const notices = useQuery<Data>('/admin/notices', 30_000);
  const [writing, setWriting] = useState(false), [archive, setArchive] = useState<AdminNotice | null>(null), [view, setView] = useState<'current' | 'archived'>('current');
  const [notice, setNotice] = useState('');
  const mutation = useMutation();
  const audience = notices.data?.audience ?? 0;
  const list = (notices.data?.data ?? []).filter(n => view === 'archived' ? n.archivedAt : !n.archivedAt);
  const archivedCount = (notices.data?.data ?? []).filter(n => n.archivedAt).length;
  async function confirmArchive() {
    if (await mutation.run(`/admin/notices/${archive!.id}/archive`, 'POST', {})) { setArchive(null); setNotice('Comunicado archivado.'); notices.refresh(); }
  }
  return <section className="panel admin-notices">
    <div className="panel-heading"><div><h2>Comunicados</h2><p>Avisos para todos los residentes del fraccionamiento. Les llegan en la app y como notificación en su celular.</p></div>
      <Button onClick={() => { setWriting(true); setNotice(''); mutation.clear(); }}><Plus size={17}/> Nuevo comunicado</Button></div>
    {notice && <Success>{notice}</Success>}
    <ErrorBox message={notices.error} retry={notices.refresh}/>
    {archivedCount > 0 && <div className="tabs padded"><button className={view === 'current' ? 'active' : ''} onClick={() => setView('current')}>Vigentes</button><button className={view === 'archived' ? 'active' : ''} onClick={() => setView('archived')}>Archivados ({archivedCount})</button></div>}
    {notices.loading && !notices.data ? <Loading rows={3}/> : !list.length
      ? <Empty icon={<Megaphone/>} title={view === 'archived' ? 'Sin comunicados archivados' : 'Aún no hay comunicados'} text="Por ejemplo: un corte de agua, la próxima asamblea o el aviso de cuotas."/>
      : <ul className="notice-list">{list.map(n => { const readPct = audience ? Math.min(1, n.read / audience) : 0;
        return <li key={n.id} className={`notice-card${n.urgent ? ' urgent' : ''}${n.archivedAt ? ' archived' : ''}`}>
          <div className="notice-meta">{n.urgent && <span className="notice-flag">Urgente</span>}{n.archivedAt && <span className="badge pending"><span/>Archivado</span>}<span>{dateText(n.createdAt, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {n.author}</span></div>
          <h2>{n.title}</h2>
          <p className="notice-body clamped">{n.body}</p>
          <AttachmentList attachments={n.attachments ?? []} pathFor={id => `/admin/notices/attachments/${id}`}/>
          <div className="admin-notice-stats">
            <span><strong>Leído por {n.read} de {audience}</strong> residentes · <strong>{n.acknowledged}</strong> dieron «Enterado»</span>
            <span className="admin-notice-bar" aria-hidden="true"><i style={{ transform: `scaleX(${readPct})` }}/></span>
          </div>
          {!n.archivedAt && <div className="notice-foot"><span className="notice-author">Se ve en la app hasta que lo archives.</span><button type="button" className="notice-more" onClick={() => { setArchive(n); mutation.clear(); }}><Archive size={15}/> Archivar</button></div>}
        </li>; })}</ul>}
    {writing && <Compose audience={audience} onClose={() => setWriting(false)} onPublished={() => { setWriting(false); setView('current'); setNotice('Comunicado publicado. Ya les está llegando a los residentes.'); notices.refresh(); }}/>}
    {archive && <Modal title="¿Archivar este comunicado?" onClose={() => { if (!mutation.busy) setArchive(null); }}><p><strong>{archive.title}</strong> dejará de verse en la app de los residentes. Lo seguirás viendo aquí, en Archivados.</p><ErrorBox message={mutation.error}/><div className="modal-actions"><Button className="secondary" disabled={mutation.busy} onClick={() => setArchive(null)}>Conservar</Button><Button busy={mutation.busy} onClick={() => void confirmArchive()}><Archive size={16}/> Archivar</Button></div></Modal>}
  </section>;
}

function Compose({ audience, onClose, onPublished }: { audience: number; onClose: () => void; onPublished: () => void }) {
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState<{ ids: string[]; busy: boolean }>({ ids: [], busy: false });
  const mutation = useMutation();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await mutation.run('/admin/notices', 'POST', { title: title.trim(), body: body.trim(), urgent, attachmentIds: files.ids })) onPublished();
  }
  const preview = body.trim().length > 160 ? `${body.trim().slice(0, 159)}…` : body.trim();
  return <Modal title="Nuevo comunicado" onClose={() => { if (!mutation.busy) onClose(); }}><form onSubmit={submit}><fieldset disabled={mutation.busy}>
    <label>Título<input required minLength={3} maxLength={TITLE} value={title} onChange={e => setTitle(e.target.value)} placeholder="Por ejemplo: Corte de agua el jueves"/><span className="notice-count">{title.length}/{TITLE}</span></label>
    <label>Mensaje<textarea required rows={7} maxLength={BODY} value={body} onChange={e => setBody(e.target.value)} placeholder="Qué pasa, cuándo y qué deben hacer los residentes."/><span className="notice-count">{body.length}/{BODY}</span></label>
    <AttachmentPicker onChange={(ids, busy) => setFiles({ ids, busy })}/>
    <label className="checkbox-label"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)}/><span><strong>Urgente</strong><small>Llega aunque tengan «No molestar» o hayan apagado los avisos de comunicados. Úsalo solo para emergencias.</small></span></label>
    {(title.trim() || preview) && <><small className="muted">Así llegará al celular:</small><div className="notice-preview"><img src="/icon-192.png" alt=""/><div><strong>{urgent ? 'Urgente' : 'Comunicado'}: {title.trim() || 'Título'}</strong><span>{preview || 'Mensaje'}</span></div></div></>}
    {urgent && <Info>Se mostrará en rojo al inicio de la app de cada residente hasta que lo lea.</Info>}
  </fieldset><ErrorBox message={mutation.error}/><div className="modal-actions"><Button className="secondary" disabled={mutation.busy} onClick={onClose}>Cancelar</Button><Button type="submit" busy={mutation.busy} disabled={title.trim().length < 3 || !body.trim() || files.busy}><Megaphone size={17}/> Publicar a {audience} {audience === 1 ? 'residente' : 'residentes'}</Button></div></form></Modal>;
}
