import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Car, ChevronRight, DoorOpen, History, Plus } from 'lucide-react';
import { useAuth } from '../auth';
import { dateText, typeLabel, useQuery } from '../hooks';
import type { ActivityItem, CreatedPass, PassType } from '../types';
import { Button, ErrorBox, Modal } from '../components/ui';
import { SharePass } from '../components/SharePass';
import type { PassPlace, PassSummary } from '../components/passCard';
import { CommunityArt } from '../components/CommunityArt';
import AnimatedQr from '../components/icons/AnimatedQr';
import { CreatePass } from './Passes';
import { describe } from './Activity';
import './HomeOverview.css';

type Expected = { id: string; guestName: string; guestVehicle: string | null; passType: PassType; validFrom: string; validUntil: string };
type Today = { inside: { id: string; kind: 'pass' | 'walkin'; guestName: string; since: string }[]; expected: Expected[] };

const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const time = (iso: string) => dateText(iso, { hour: 'numeric', minute: '2-digit' });
const sameDay = (iso: string, dayStart: string) => new Date(iso).toDateString() === new Date(dayStart).toDateString();
const initials = (name: string) => name.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (parts: string[]) => parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;

/** When an expected pass can be used, in words: "Desde las 16:00", "Hasta las 18:00" or "Hasta el 12 oct". */
function windowText(p: Expected, dayStart: string) {
  if (p.passType === 'RECURRING') return 'Le toca hoy';
  if (new Date(p.validFrom) > new Date()) return `Desde las ${time(p.validFrom)}`;
  return sameDay(p.validUntil, dayStart) ? `Hasta las ${time(p.validUntil)}` : `Hasta el ${dateText(p.validUntil, { day: 'numeric', month: 'short' })}`;
}

/** One sentence that answers "what is happening at home today". */
function daySentence(arrived: number, inside: number, expected: number) {
  if (!arrived && !inside && !expected) return 'Hoy no esperas a nadie. Cuando invites a alguien, aquí verás su llegada.';
  const parts = [
    arrived ? plural(arrived, 'visita llegó', 'visitas llegaron') + ' hoy' : 'Todavía no llega nadie hoy',
    ...(inside ? [plural(inside, 'sigue dentro', 'siguen dentro')] : []),
    ...(expected ? [plural(expected, 'más puede llegar', 'más pueden llegar')] : []),
  ];
  return list(parts) + '.';
}

function Skeleton({ rows }: { rows: number }) {
  return <ul className="home-list" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <li key={i} className="home-row skeleton"><span className="home-avatar"/><span><i/><i/></span></li>)}</ul>;
}

/** Inicio: what is happening at home today. Managing every pass lives in Mis pases. */
export function Home({ navigate }: { navigate: (path: string) => void }) {
  const { identity, property, links, rememberPass } = useAuth();
  const id = property!.id;
  const canCreate = identity?.session.profile === 'RESIDENT';
  const [dayStart, setDayStart] = useState(midnight);
  // The app can stay open past midnight; "today" moves with the clock.
  useEffect(() => { const tick = window.setInterval(() => setDayStart(d => d === midnight() ? d : midnight()), 60_000); return () => window.clearInterval(tick); }, []);
  const today = useQuery<Today>(`/activity/today?propertyId=${id}&dayStart=${encodeURIComponent(dayStart)}`, 20_000);
  const feed = useQuery<{ data: ActivityItem[] }>(`/activity?propertyId=${id}`, 20_000);
  const [create, setCreate] = useState(false);
  const [shared, setShared] = useState<{ value: CreatedPass; pass: PassSummary; title: string } | null>(null);
  const place = useMemo<PassPlace | undefined>(() => property ? { address: `${property.street} ${property.houseNumber}`, community: property.cluster.community?.name ?? property.cluster.name, mapsUrl: property.cluster.community?.mapsUrl } : undefined, [property]);

  const events = (feed.data?.data ?? []).filter(item => sameDay(item.at, dayStart));
  const arrived = events.filter(i => i.type === 'VISIT_ENTERED' || i.type === 'WALKIN_APPROVED').length;
  const inside = today.data?.inside ?? [];
  const expected = today.data?.expected ?? [];
  const ready = !!today.data && !!feed.data;
  const refresh = () => { today.refresh(); feed.refresh(); };
  // The QR link is only known on the device that created the pass (and recurring cards need their rule).
  const shareable = (p: Expected) => !!links[p.id] && p.passType !== 'RECURRING';
  const openExpected = (p: Expected) => shareable(p) ? setShared({ value: links[p.id], title: `Pase de ${p.guestName}`, pass: { ...p, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, recurrenceRule: null, windowSeconds: 300 } }) : navigate('/pases');

  return <div className="home">
    <header className="home-head">
      <p className="home-date">{dateText(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>Hola, {identity!.user.fullName.split(' ')[0]}.</h1>
      <p className="home-sentence" aria-live="polite">{ready ? daySentence(arrived, inside.length, expected.length) : ' '}</p>
    </header>

    <div className="home-top">
      <section className="home-now" aria-labelledby="home-now-title">
        <div className="home-section-head">
          <h2 id="home-now-title"><span className={`home-live${inside.length ? ' on' : ''}`} aria-hidden="true"/>Ahora en casa</h2>
          {inside.length > 0 && <span className="home-count">{inside.length}</span>}
        </div>
        <ErrorBox message={today.error} retry={today.refresh}/>
        {!today.data ? (today.error ? null : <Skeleton rows={2}/>) : !inside.length
          ? <div className="home-quiet"><DoorOpen size={22}/><p>Ninguna de tus visitas está dentro en este momento.</p></div>
          : <ul className="home-list">{inside.map((v, i) => <li key={v.id} className="home-row" style={{ '--i': i } as CSSProperties}>
              <span className={`home-avatar avatar-${v.guestName.length % 4}`}>{initials(v.guestName)}</span>
              <span><strong>{v.guestName}</strong><small>{v.kind === 'walkin' ? 'Sin pase, autorizada' : 'Con pase'} · entró {sameDay(v.since, dayStart) ? `a las ${time(v.since)}` : dateText(v.since)}</small></span>
            </li>)}</ul>}
      </section>

      {canCreate && <section className="home-invite" aria-label="Invitar a una visita">
        <div>
          <h2>¿Esperas a alguien?</h2>
          <p>Crea su pase y compártele el QR. Solo tiene que mostrarlo en la caseta.</p>
          <Button onClick={() => setCreate(true)}><Plus size={18}/> Crear pase</Button>
        </div>
        <CommunityArt/>
      </section>}
    </div>

    <div className="home-day">
      <section className="home-panel" aria-labelledby="home-expected-title">
        <div className="home-section-head">
          <h2 id="home-expected-title">Pueden llegar hoy</h2>
          <button className="home-link" onClick={() => navigate('/pases')}>Mis pases<ChevronRight size={16}/></button>
        </div>
        {!today.data ? (today.error ? null : <Skeleton rows={3}/>) : !expected.length
          ? <div className="home-quiet"><AnimatedQr size={22}/><p>No hay pases vigentes para hoy.{canCreate && <> <button className="home-inline" onClick={() => setCreate(true)}>Crear uno</button></>}</p></div>
          : <ul className="home-list">{expected.map((p, i) => <li key={p.id} style={{ '--i': i } as CSSProperties}>
              <button className="home-row action" onClick={() => openExpected(p)} aria-label={`${p.guestName}. ${windowText(p, dayStart)}. ${shareable(p) ? 'Ver QR' : 'Abrir en Mis pases'}`}>
                <span className={`home-avatar avatar-${p.guestName.length % 4}`}>{initials(p.guestName)}</span>
                <span><strong>{p.guestName}</strong><small>{p.guestVehicle ? <><Car size={12}/> {p.guestVehicle}</> : typeLabel[p.passType]}</small></span>
                <span className="home-when">{windowText(p, dayStart)}</span>
                {shareable(p) ? <AnimatedQr size={18}/> : <ChevronRight size={17}/>}
              </button>
            </li>)}</ul>}
      </section>

      <section className="home-panel" aria-labelledby="home-feed-title">
        <div className="home-section-head">
          <h2 id="home-feed-title">Lo que pasó hoy</h2>
          <button className="home-link" onClick={() => navigate('/actividad')}>Actividad<ChevronRight size={16}/></button>
        </div>
        <ErrorBox message={feed.error} retry={feed.refresh}/>
        {!feed.data ? (feed.error ? null : <Skeleton rows={3}/>) : !events.length
          ? <div className="home-quiet"><History size={22}/><p>Sin movimientos en la caseta hoy.</p></div>
          : <ol className="home-feed">{events.slice(0, 6).map((item, i) => { const view = describe(item); return <li key={item.id} className={`activity-item ${view.tone} icon-hover`} style={{ '--i': i } as CSSProperties}>
              <span className="activity-icon">{view.icon}</span>
              <div><strong>{view.title}</strong>{view.detail && <span>{view.detail}</span>}</div>
              <time dateTime={item.at}>{time(item.at)}</time>
            </li>; })}</ol>}
        {events.length > 6 && <button className="home-more" onClick={() => navigate('/actividad')}>Ver {plural(events.length - 6, 'movimiento más', 'movimientos más')}<ArrowUpRight size={15}/></button>}
      </section>
    </div>

    {canCreate && ready && !events.length && !expected.length && !inside.length && <button className="home-help" onClick={() => navigate('/ayuda')}><span>¿Tu primera invitación?<strong>Cómo crear y compartir un pase</strong></span><ArrowUpRight size={20}/></button>}

    {canCreate && create && <CreatePass onClose={() => setCreate(false)} onCreated={(value, pass) => { setCreate(false); setShared({ value, pass, title: 'Tu pase está listo' }); rememberPass(value); refresh(); }}/>}
    {shared && <Modal title={shared.title} onClose={() => setShared(null)}><SharePass url={shared.value.shareUrl} pass={shared.pass} place={place}/></Modal>}
  </div>;
}
