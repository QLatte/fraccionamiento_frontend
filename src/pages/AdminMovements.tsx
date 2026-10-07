import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, Download, Search, ShieldAlert, Users } from 'lucide-react';
import { api, errorText } from '../api';
import { dateText, useQuery } from '../hooks';
import { Button, Empty, ErrorBox, Loading } from '../components/ui';
import './AdminMovements.css';

// Movements panel for the fraccionamiento's admin: how many visitors came in and went out,
// when, who is inside now, and the detailed log. Visitors only: residents are not scanned.
type Period = 'today' | '7d' | '30d' | 'custom';
type LogKind = 'all' | 'entries' | 'exits' | 'walkins' | 'denied';
type Options = { gates: { id: string; label: string }[]; clusters: { id: string; name: string; type: string }[]; today: string };
type Summary = {
  range: { from: string; to: string; unit: 'hour' | 'day'; timezone: string };
  totals: { entries: number; exits: number; denied: number; inside: number; longStays: number; previous: { entries: number; exits: number; denied: number } };
  series: { at: string; entries: number; exits: number }[];
  peak: { hour: number | null; weekday: number | null };
  inside: { id: string; kind: 'pass' | 'walkin'; guestName: string; home: string; since: string; longStay: boolean }[];
  kinds: { kind: string; count: number }[];
  topHomes: { home: string; count: number }[];
  rejects: { reason: string; count: number }[];
};
type LogRow = { id: string; at: string; move: 'ENTRY' | 'EXIT' | 'DENIED'; guestName: string | null; kind: 'PASS' | 'WALKIN'; motive: string | null; denial: string | null; home: string | null; by: string | null; gate: string | null; vehicle: string | null };
type LogPage = { data: LogRow[]; total: number; nextOffset: number | null };

const PERIODS: { id: Period; label: string }[] = [{ id: 'today', label: 'Hoy' }, { id: '7d', label: '7 días' }, { id: '30d', label: '30 días' }, { id: 'custom', label: 'Personalizado' }];
const KINDS: { id: LogKind; label: string }[] = [{ id: 'all', label: 'Todo' }, { id: 'entries', label: 'Entradas' }, { id: 'exits', label: 'Salidas' }, { id: 'walkins', label: 'Sin pase' }, { id: 'denied', label: 'Rechazos' }];
const KIND_LABEL: Record<string, string> = { PASS: 'Con pase QR', VISIT: 'Sin pase · visita', DELIVERY: 'Repartidores', SERVICE: 'Servicios', OTHER: 'Otros' };
const MOTIVE: Record<string, string> = { VISIT: 'Visita', DELIVERY: 'Repartidor', SERVICE: 'Servicio', OTHER: 'Otro motivo' };
const REJECT: Record<string, string> = {
  DENIED_EXPIRED: 'Pase vencido o fuera de horario', DENIED_USED: 'Pase ya usado', DENIED_REVOKED: 'Pase cancelado', DENIED_NOT_FOUND: 'Pase no válido',
  DENIED_ALREADY_INSIDE: 'La visita ya estaba dentro', DENIED_NOT_INSIDE: 'Salida sin entrada', WALKIN_REJECTED: 'La vivienda no autorizó',
};
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const COMPARE: Record<Period, string> = { today: 'que ayer', '7d': 'que los 7 días anteriores', '30d': 'que los 30 días anteriores', custom: 'que el periodo anterior' };
const MIX_COLORS = ['#123c4a', '#4f8597', '#a9c9d4', '#e6b85c', '#c7d6dc'];

const hourText = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'a.m.' : 'p.m.'}`;
const localDay = (iso: string, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
const number = (n: number) => n.toLocaleString('es-MX');
function stay(since: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(since).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} min` : minutes < 24 * 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim() : `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`;
}
function change(now: number, before: number) {
  if (!before) return now ? 'Sin datos del periodo anterior' : '';
  const pct = Math.round((now - before) / before * 100);
  return pct === 0 ? 'Igual' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
}

/** Every bucket of the range, including empty ones; server buckets are local wall-clock times in UTC fields. */
function chartBuckets(summary: Summary) {
  const { from, to, unit, timezone } = summary.range;
  const [y, m, d] = localDay(from, timezone).split('-').map(Number);
  const count = unit === 'hour' ? Math.round((new Date(to).getTime() - new Date(from).getTime()) / 3600_000) : Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400_000);
  const byKey = new Map(summary.series.map(s => [s.at.slice(0, 13), s]));
  return Array.from({ length: count }, (_, i) => {
    const at = unit === 'hour' ? new Date(Date.UTC(y, m - 1, d, i)) : new Date(Date.UTC(y, m - 1, d + i));
    const point = byKey.get(at.toISOString().slice(0, 13));
    const h = at.getUTCHours();
    // Long labels on wide screens ("3 p.m."), short ones on phones ("3p"), so a whole day fits.
    const label = unit === 'hour' ? (h % 3 === 0 ? hourText(h).replace(' ', ' ') : '') : `${at.getUTCDate()}`;
    const short = unit === 'hour' ? (h % 6 === 0 ? `${h % 12 || 12}${h < 12 ? 'a' : 'p'}` : '') : (i % 5 === 0 ? `${at.getUTCDate()}` : '');
    const tip = unit === 'hour' ? hourText(at.getUTCHours()) : new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(at);
    return { key: at.toISOString(), label, short, tip, entries: point?.entries ?? 0, exits: point?.exits ?? 0 };
  });
}

export function AdminMovements() {
  const options = useQuery<Options>('/admin/movements/options');
  const [period, setPeriod] = useState<Period>('today');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [gate, setGate] = useState(''); const [cluster, setCluster] = useState('');
  const [kind, setKind] = useState<LogKind>('all');
  const [q, setQ] = useState(''); const [search, setSearch] = useState('');
  useEffect(() => { if (options.data && !from) { setFrom(options.data.today); setTo(options.data.today); } }, [options.data, from]);

  const filters = useMemo(() => {
    const p = new URLSearchParams({ period });
    if (period === 'custom' && from && to) { p.set('from', from); p.set('to', to); }
    if (gate) p.set('gate', gate); if (cluster) p.set('cluster', cluster);
    return p.toString();
  }, [period, from, to, gate, cluster]);
  const ready = period !== 'custom' || (!!from && !!to);
  const summary = useQuery<Summary>(ready ? `/admin/movements/summary?${filters}` : null, period === 'today' ? 60_000 : 0);
  const logPath = ready ? `/admin/movements/log?${filters}&kind=${kind}&q=${encodeURIComponent(search)}` : null;
  const log = useQuery<LogPage>(logPath);
  const [more, setMore] = useState<LogRow[]>([]); const [next, setNext] = useState<number | null>(null); const [moreBusy, setMoreBusy] = useState(false);
  useEffect(() => { setMore([]); setNext(log.data?.nextOffset ?? null); }, [log.data]);
  const [exporting, setExporting] = useState(false); const [exportError, setExportError] = useState('');

  async function loadMore() {
    if (next === null || !logPath) return;
    setMoreBusy(true);
    try { const page = await api<LogPage>(`${logPath}&offset=${next}`); setMore(rows => [...rows, ...page.data]); setNext(page.nextOffset); }
    catch (e) { setExportError(errorText(e)); } finally { setMoreBusy(false); }
  }
  async function download() {
    setExporting(true); setExportError('');
    try {
      const file = await api<{ filename: string; content: string }>(`/admin/movements/export?${filters}&kind=${kind}&q=${encodeURIComponent(search)}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([file.content], { type: 'text/csv;charset=utf-8' })); a.download = file.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) { setExportError(errorText(e)); } finally { setExporting(false); }
  }
  function pickKind(next: LogKind) { setKind(next); document.getElementById('movements-log')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  const s = summary.data;
  const buckets = s ? chartBuckets(s) : [];
  const max = Math.max(1, ...buckets.map(b => Math.max(b.entries, b.exits)));
  const rows = [...(log.data?.data ?? []), ...more];
  const mixTotal = s ? s.kinds.reduce((sum, k) => sum + k.count, 0) : 0;
  const topMax = s?.topHomes[0]?.count ?? 1;

  return <div className="movements">
    <section className="panel movements-filters" aria-label="Filtros">
      <div className="movements-periods" role="group" aria-label="Periodo">{PERIODS.map(p => <button key={p.id} type="button" className={period === p.id ? 'active' : ''} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}</div>
      {period === 'custom' && <div className="movements-range"><label>Desde<input type="date" className="scheme-light-dark" value={from} max={options.data?.today} onChange={e => setFrom(e.target.value)}/></label><label>Hasta<input type="date" className="scheme-light-dark" value={to} max={options.data?.today} onChange={e => setTo(e.target.value)}/></label></div>}
      {!!options.data?.gates.length && options.data.gates.length > 1 && <label className="movements-select">Caseta<select value={gate} onChange={e => setGate(e.target.value)}><option value="">Todas</option>{options.data.gates.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>}
      {!!options.data?.clusters.length && options.data.clusters.length > 1 && <label className="movements-select">Privada o lote<select value={cluster} onChange={e => setCluster(e.target.value)}><option value="">Todas</option>{options.data.clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      {s && <span className="movements-updated">{period === 'today' ? 'Se actualiza cada minuto' : `${dateText(s.range.from, { day: 'numeric', month: 'short' })} – ${dateText(new Date(new Date(s.range.to).getTime() - 1).toISOString(), { day: 'numeric', month: 'short' })}`}</span>}
    </section>
    <ErrorBox message={summary.error || options.error} retry={summary.refresh}/>

    {!s ? (summary.loading ? <Loading/> : null) : <>
      <section className="movements-kpis" aria-label="Resumen">
        <button type="button" className="kpi" onClick={() => pickKind('entries')}><span className="kpi-label"><i className="dot entries"/>Entradas</span><strong>{number(s.totals.entries)}</strong><small className={s.totals.entries >= s.totals.previous.entries ? 'up' : ''}>{change(s.totals.entries, s.totals.previous.entries)}{s.totals.previous.entries ? ` ${COMPARE[period]}` : ''}</small></button>
        <button type="button" className="kpi" onClick={() => pickKind('exits')}><span className="kpi-label"><i className="dot exits"/>Salidas</span><strong>{number(s.totals.exits)}</strong><small>{change(s.totals.exits, s.totals.previous.exits)}{s.totals.previous.exits ? ` ${COMPARE[period]}` : ''}</small></button>
        <a className="kpi kpi-inside" href="#movements-inside"><span className="kpi-label"><i className="dot live"/>Dentro ahora</span><strong>{number(s.totals.inside)}</strong><small>{s.totals.longStays ? `${s.totals.longStays} ${s.totals.longStays === 1 ? 'lleva' : 'llevan'} más de 12 horas` : 'Visitas con entrada sin salida'}</small></a>
        <button type="button" className="kpi" onClick={() => pickKind('denied')}><span className="kpi-label"><i className="dot denied"/>Rechazos</span><strong>{number(s.totals.denied)}</strong><small>{s.rejects[0] ? `${s.rejects[0].count} · ${REJECT[s.rejects[0].reason] ?? s.rejects[0].reason}` : 'Sin rechazos'}</small></button>
      </section>

      <div className="movements-row">
        <section className="panel movements-chart" aria-label="Flujo de visitas">
          <div className="movements-heading"><div><h2>{s.range.unit === 'hour' ? 'Flujo por hora' : 'Flujo por día'}</h2><p>{s.peak.hour !== null ? `Hora más concurrida: ${hourText(s.peak.hour)}` : 'Aún no hay movimientos en este periodo.'}{s.peak.weekday !== null ? ` · Día más concurrido: ${WEEKDAYS[s.peak.weekday]}` : ''}</p></div>
            <div className="legend"><span><i className="dot entries"/>Entradas</span><span><i className="dot exits"/>Salidas</span></div></div>
          <div className="chart-scroll"><div className="chart" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(var(--chart-col), 1fr))` }}>
            {buckets.map(b => <div key={b.key} className="chart-col" title={`${b.tip}: ${b.entries} entradas, ${b.exits} salidas`}>
              <div className="chart-bars"><span className="bar entries" style={{ transform: `scaleY(${b.entries / max})` }}/><span className="bar exits" style={{ transform: `scaleY(${b.exits / max})` }}/></div>
              <span className="chart-label"><span className="label-long">{b.label}</span><span className="label-short">{b.short}</span></span>
            </div>)}
          </div></div>
        </section>

        <section className="panel movements-inside" id="movements-inside" aria-label="Dentro ahora">
          <div className="movements-heading"><div><h2>Dentro ahora</h2><p>{s.totals.inside === 1 ? '1 visita' : `${number(s.totals.inside)} visitas`} con entrada sin salida.</p></div><Users size={20}/></div>
          {!s.inside.length ? <Empty icon={<Users/>} title="No hay visitas dentro" text="Aparecen aquí al registrar su entrada y salen al registrar su salida."/> :
            <ul className="inside-list">{s.inside.map(v => <li key={v.id}><div><strong>{v.guestName}</strong><span>{v.home}{v.kind === 'walkin' ? ' · sin pase' : ''} · entró {dateText(v.since, { hour: 'numeric', minute: '2-digit' })}</span></div><span className={'stay' + (v.longStay ? ' long' : '')}>{stay(v.since)}</span></li>)}</ul>}
          {s.totals.longStays > 0 && <p className="small muted">Las marcadas llevan más de 12 horas: pide a la caseta revisar si salieron sin registrarse.</p>}
        </section>
      </div>
    </>}

    <section className="panel movements-log" id="movements-log" aria-label="Bitácora">
      <div className="movements-heading wrap"><h2>Bitácora</h2>
        <form className="movements-search" onSubmit={(e: FormEvent) => { e.preventDefault(); setSearch(q.trim()); }}><Search size={16}/><input aria-label="Buscar en la bitácora" placeholder="Visitante o número de casa" value={q} onChange={e => { setQ(e.target.value); if (!e.target.value) setSearch(''); }} maxLength={80}/></form>
        <Button className="secondary" busy={exporting} disabled={!ready} onClick={() => void download()}><Download size={16}/> Descargar Excel</Button>
      </div>
      <div className="movements-chips" role="group" aria-label="Filtrar movimientos">{KINDS.map(k => <button key={k.id} type="button" className={kind === k.id ? 'active' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
      <ErrorBox message={log.error || exportError} retry={log.refresh}/>
      {log.loading && !log.data ? <Loading/> : !rows.length ? <Empty icon={<ShieldAlert/>} title={search || kind !== 'all' ? 'Nada con este filtro' : 'Sin movimientos'} text={search || kind !== 'all' ? 'Cambia el filtro o la búsqueda.' : 'Las entradas, salidas y rechazos de la caseta aparecerán aquí.'}/> : <>
        <div className="log-table"><table>
          <thead><tr><th>Hora</th><th>Movimiento</th><th>Visitante</th><th>Tipo</th><th>Destino</th><th>Autorizó</th><th>Caseta</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}>
            <td data-label="Hora" className="log-time">{dateText(r.at, s?.range.unit === 'hour' ? { hour: 'numeric', minute: '2-digit' } : undefined)}</td>
            <td data-label="Movimiento"><span className={'move ' + r.move.toLowerCase()}>{r.move === 'ENTRY' ? <><ArrowDownLeft size={13}/> Entrada</> : r.move === 'EXIT' ? <><ArrowUpRight size={13}/> Salida</> : 'Rechazo'}</span></td>
            <td data-label="Visitante" className="log-name">{r.guestName ?? '—'}{r.vehicle && <small>{r.vehicle}</small>}</td>
            <td data-label="Tipo">{r.kind === 'PASS' ? 'Pase QR' : `Sin pase · ${MOTIVE[r.motive ?? ''] ?? 'Visita'}`}{r.denial && <small className="danger-text">{REJECT[r.denial] ?? r.denial}</small>}</td>
            <td data-label="Destino">{r.home ?? '—'}</td>
            <td data-label="Autorizó">{r.by ?? '—'}</td>
            <td data-label="Caseta">{r.gate ?? '—'}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="log-footer"><span>Mostrando {number(rows.length)} de {number(log.data?.total ?? rows.length)} movimientos</span>{next !== null && <Button className="secondary" busy={moreBusy} onClick={() => void loadMore()}>Ver más</Button>}</div>
      </>}
    </section>

    {s && (mixTotal > 0 || s.topHomes.length > 0 || s.rejects.length > 0) && <div className="movements-summaries">
      <section className="panel"><h2>Tipo de acceso</h2>{!mixTotal ? <p className="muted">Sin entradas en este periodo.</p> : <>
        <div className="mix-bar">{s.kinds.map((k, i) => <span key={k.kind} style={{ width: `${k.count / mixTotal * 100}%`, background: MIX_COLORS[i % MIX_COLORS.length] }}/>)}</div>
        <ul className="mix-list">{s.kinds.map((k, i) => <li key={k.kind}><i style={{ background: MIX_COLORS[i % MIX_COLORS.length] }}/><span>{KIND_LABEL[k.kind] ?? k.kind}</span><strong>{Math.round(k.count / mixTotal * 100)}%</strong></li>)}</ul>
      </>}</section>
      <section className="panel"><h2>Casas con más visitas</h2>{!s.topHomes.length ? <p className="muted">Sin entradas en este periodo.</p> :
        <ul className="top-list">{s.topHomes.map(t => <li key={t.home}><div><span>{t.home}</span><strong>{number(t.count)}</strong></div><span className="top-bar"><i style={{ transform: `scaleX(${t.count / topMax})` }}/></span></li>)}</ul>}</section>
      <section className="panel"><h2>Rechazos por motivo</h2>{!s.rejects.length ? <p className="muted">Sin rechazos en este periodo.</p> :
        <ul className="reject-list">{s.rejects.map(r => <li key={r.reason}><span>{REJECT[r.reason] ?? r.reason}</span><strong>{number(r.count)}</strong></li>)}</ul>}</section>
    </div>}
    <p className="small muted movements-note">Solo se registran visitas (con pase QR o sin pase); los residentes no pasan por el escáner. No se muestran identificaciones y las placas aparecen abreviadas. Cada consulta y descarga de la bitácora queda registrada.</p>
  </div>;
}
