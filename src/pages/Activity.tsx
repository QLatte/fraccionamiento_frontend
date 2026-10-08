import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, History, RotateCw, UserX, XCircle } from 'lucide-react';
import { useAuth } from '../auth';
import { api, codeText, errorText } from '../api';
import { dateText } from '../hooks';
import { markSeen } from '../activity';
import { Empty, ErrorBox, Loading, PageHeader } from '../components/ui';
import AnimatedArrowRightDashed from '../components/icons/AnimatedArrowRightDashed';
import AnimatedArrowLeftDashed from '../components/icons/AnimatedArrowLeftDashed';
import AnimatedFilledBell from '../components/icons/AnimatedFilledBell';
import { reasonLabel } from '../walkins';
import type { ActivityItem, WalkInReason } from '../types';

type Filter = 'all' | 'entries' | 'exits' | 'walkins' | 'denied';
const filters: [Filter, string][] = [['all', 'Todo'], ['entries', 'Entradas'], ['exits', 'Salidas'], ['walkins', 'Sin pase'], ['denied', 'Rechazos']];
const matches: Record<Filter, (item: ActivityItem) => boolean> = {
  all: () => true,
  entries: i => i.type === 'VISIT_ENTERED' || i.type === 'WALKIN_APPROVED',
  exits: i => i.type === 'VISIT_EXITED' || i.type === 'WALKIN_EXITED',
  walkins: i => i.type.startsWith('WALKIN_'),
  denied: i => i.type === 'VISIT_DENIED' || i.type === 'WALKIN_REJECTED',
};

/** How each event reads in the feed: tone, icon, title and detail line. */
export function describe(item: ActivityItem): { tone: string; icon: ReactNode; title: string; detail: string } {
  const who = item.guestName ?? 'Una visita';
  const at = item.gate ? `por ${item.gate}` : '';
  const how = item.method === 'APP' ? 'desde la app' : item.method === 'PHONE' ? 'por teléfono' : '';
  const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');
  switch (item.type) {
    case 'VISIT_ENTERED': return { tone: 'in', icon: <AnimatedArrowRightDashed size={20}/>, title: `${who} entró`, detail: join(at, item.by ? `Invitó ${item.by}` : '') };
    case 'VISIT_EXITED': return { tone: 'out', icon: <AnimatedArrowLeftDashed size={20}/>, title: `${who} salió`, detail: at };
    case 'VISIT_DENIED': return { tone: 'denied', icon: <XCircle size={20}/>, title: `No se permitió el paso a ${who}`, detail: join((codeText(item.reason ?? '') ?? 'Lectura rechazada').replace(/\.$/, ''), at) };
    case 'WALKIN_REQUESTED': return { tone: 'request', icon: <AnimatedFilledBell size={19}/>, title: `${who} pidió entrar sin pase`, detail: join(reasonLabel[item.reason as WalkInReason] ?? '', at) };
    case 'WALKIN_APPROVED': return { tone: 'in', icon: <Check size={20}/>, title: `${who} entró sin pase`, detail: join(item.by ? `Autorizó ${item.by} ${how}`.trim() : '', at) };
    case 'WALKIN_REJECTED': return { tone: 'denied', icon: <XCircle size={20}/>, title: `Se rechazó la entrada de ${who}`, detail: join(item.by ? `Rechazó ${item.by} ${how}`.trim() : '', at) };
    case 'WALKIN_CANCELLED': return { tone: 'muted', icon: <UserX size={20}/>, title: `${who} se retiró sin entrar`, detail: 'Nadie alcanzó a responder' };
    case 'WALKIN_EXITED': return { tone: 'out', icon: <AnimatedArrowLeftDashed size={20}/>, title: `${who} salió`, detail: join('Visita sin pase', at) };
  }
}

function dayLabel(iso: string) {
  const day = new Date(iso); const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return 'Hoy';
  if (day.toDateString() === yesterday.toDateString()) return 'Ayer';
  return dateText(iso, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Actividad: entries, exits, walk-ins and rejections for the selected household (last 30 days). */
export function Activity() {
  const { property } = useAuth();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const propertyId = property?.id;

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const data = (await api<{ data: ActivityItem[] }>(`/activity?propertyId=${propertyId}`)).data;
      setItems(data); setError('');
      // Opening the feed clears the unread dot on this device.
      markSeen(propertyId, data[0]?.at ?? new Date().toISOString());
    } catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  }, [propertyId]);

  useEffect(() => { setItems(null); void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) void load(); };
    const poll = window.setInterval(refresh, 20_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  const groups = useMemo(() => {
    const shown = (items ?? []).filter(matches[filter]);
    const byDay = new Map<string, ActivityItem[]>();
    for (const item of shown) { const key = dayLabel(item.at); byDay.set(key, [...(byDay.get(key) ?? []), item]); }
    return [...byDay.entries()];
  }, [items, filter]);

  return <>
    <PageHeader title="Actividad" text={`Lo que pasa en la caseta con las visitas de ${property ? `${property.street} ${property.houseNumber}` : 'tu vivienda'}. Últimos 30 días.`}/>
    <section className="panel activity-panel">
      <div className="activity-toolbar">
        <div className="tabs" role="tablist" aria-label="Filtrar actividad">{filters.map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <button className="icon-button" aria-label="Actualizar actividad" onClick={() => void load()} disabled={loading}><RotateCw size={18} className={loading ? 'spin' : undefined}/></button>
      </div>
      <ErrorBox message={error} retry={() => void load()}/>
      {!items ? (error ? null : <Loading/>) : !groups.length ? <Empty icon={<History/>} title={filter === 'all' ? 'Sin actividad todavía' : 'Nada en esta categoría'} text="Aquí verás cada entrada, salida y visita sin pase de tu vivienda en cuanto ocurra."/> :
        <div className="activity-days">{groups.map(([day, rows]) => <div key={day} className="activity-day">
          <h3>{day}</h3>
          <ol className="activity-list">{rows.map(item => {
            const view = describe(item);
            return <li key={item.id} className={`activity-item ${view.tone} icon-hover`}>
              <span className="activity-icon">{view.icon}</span>
              <div><strong>{view.title}</strong>{view.detail && <span>{view.detail}</span>}</div>
              <time dateTime={item.at}>{dateText(item.at, { hour: 'numeric', minute: '2-digit' })}</time>
            </li>;
          })}</ol>
        </div>)}</div>}
    </section>
  </>;
}
