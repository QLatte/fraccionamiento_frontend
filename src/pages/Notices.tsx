import { useEffect, useRef, useState } from 'react';
import { Check, Megaphone } from 'lucide-react';
import { api, errorText } from '../api';
import { useAuth } from '../auth';
import { dateText, useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Loading, PageHeader } from '../components/ui';
import './Notices.css';

// Comunicados of the fraccionamiento for residents. A notice counts as read once it has been on
// screen for a moment; «Enterado» tells administration the household is aware.
export type Notice = { id: string; title: string; body: string; urgent: boolean; createdAt: string; author: string; read: boolean; acknowledged: boolean };
const LONG = 420;

export function Notices({ onChange }: { onChange?: () => void }) {
  const { property } = useAuth();
  const propertyId = property!.id;
  const list = useQuery<{ data: Notice[]; unread: number }>(`/notices?propertyId=${propertyId}`, 60_000);
  const [local, setLocal] = useState<Record<string, Partial<Notice>>>({});
  const [error, setError] = useState('');
  const sent = useRef(new Set<string>());
  async function mark(id: string, acknowledge: boolean) {
    const key = `${id}:${acknowledge}`;
    if (sent.current.has(key)) return;
    sent.current.add(key);
    setLocal(l => ({ ...l, [id]: { ...l[id], read: true, ...(acknowledge ? { acknowledged: true } : {}) } }));
    try { await api(`/notices/${id}/read`, { method: 'POST', body: { propertyId, acknowledge } }); onChange?.(); }
    catch (e) { sent.current.delete(key); setLocal(l => ({ ...l, [id]: { ...l[id], ...(acknowledge ? { acknowledged: false } : { read: false }) } })); setError(errorText(e)); }
  }
  const notices = (list.data?.data ?? []).map(n => ({ ...n, ...local[n.id] }));
  return <div className="notices">
    <PageHeader title="Comunicados" text={`Avisos de la administración de ${property?.cluster.community?.name ?? 'tu fraccionamiento'}.`}/>
    <ErrorBox message={list.error || error} retry={list.error ? list.refresh : undefined}/>
    {list.loading && !list.data ? <Loading rows={3}/> : !notices.length
      ? <section className="panel"><Empty icon={<Megaphone/>} title="Aún no hay comunicados" text="Aquí verás los avisos de la administración: cortes de servicio, asambleas, cuotas y más."/></section>
      : <ul className="notice-list">{notices.map(n => <NoticeCard key={n.id} notice={n} onSeen={() => { if (!n.read) void mark(n.id, false); }} onAcknowledge={() => void mark(n.id, true)}/>)}</ul>}
  </div>;
}

/** Marks a notice read after it has been at least half visible for 800 ms. */
function useSeen(ref: React.RefObject<HTMLElement | null>, active: boolean, onSeen: () => void) {
  const latest = useRef(onSeen); latest.current = onSeen;
  useEffect(() => {
    const el = ref.current;
    if (!el || !active || typeof IntersectionObserver === 'undefined') return;
    let timer = 0;
    const observer = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry.isIntersecting && document.visibilityState === 'visible') timer = window.setTimeout(() => latest.current(), 800);
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [ref, active]);
}

function NoticeCard({ notice, onSeen, onAcknowledge }: { notice: Notice; onSeen: () => void; onAcknowledge: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const [open, setOpen] = useState(false);
  useSeen(ref, !notice.read, onSeen);
  const long = notice.body.length > LONG;
  return <li ref={ref} className={`notice-card${notice.urgent ? ' urgent' : ''}${notice.read ? '' : ' unread'}`}>
    <div className="notice-meta">
      {notice.urgent && <span className="notice-flag">Urgente</span>}
      {!notice.read && <span className="notice-new"><span aria-hidden="true"/>Nuevo</span>}
      <span>{dateText(notice.createdAt, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
    </div>
    <h2>{notice.title}</h2>
    <p className={`notice-body${long && !open ? ' clamped' : ''}`}>{notice.body}</p>
    {long && <button type="button" className="notice-more" onClick={() => { setOpen(o => !o); onSeen(); }}>{open ? 'Ver menos' : 'Leer completo'}</button>}
    <div className="notice-foot">
      <span className="notice-author">Administración · {notice.author}</span>
      {notice.acknowledged ? <span className="notice-done"><Check size={16}/> Enterado</span> : <Button className="secondary small-button" onClick={onAcknowledge}>Enterado</Button>}
    </div>
  </li>;
}
