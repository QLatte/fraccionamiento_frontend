import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ClipboardPaste, DoorOpen, History, ScanLine, UserPlus, ShieldCheck, Users, RotateCw } from 'lucide-react';
import { Button, Empty, ErrorBox, Loading, PageHeader } from '../components/ui';
import { dateText, extractToken, useMutation, useOnline } from '../hooks';
import { api, ApiError, codeText, errorText } from '../api';
import type { GateLog, GateStation, ScanResult } from '../types';
import { GateWalkIn } from './GateWalkIn';
import { ManualDialog, ResultDialog, ScanStage } from './GateScanner';
import AnimatedArrowRightDashed from '../components/icons/AnimatedArrowRightDashed';
import AnimatedArrowLeftDashed from '../components/icons/AnimatedArrowLeftDashed';

const stationModeKey = 'zentry:gate-station';
// The scanner stays on across reloads once a guard turns it on.
const cameraKey = 'zentry:gate-camera';
// After a result closes, the same QR is ignored this long: the visitor may still be holding it up.
const SAME_QR_COOLDOWN_MS = 4000;

type GateView = 'scan' | 'log';
const gateViewKey = 'zentry:gate-view';

// Loaded once for the whole station so the "inside" count stays current while scanning.
function useShiftLog(enabled: boolean, online: boolean, version: number) {
  const [log, setLog] = useState<GateLog | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setLog(await api<GateLog>('/gate/scan/log', { public: true, station: true })); setError(''); setUpdatedAt(new Date()); }
    // An expired permit is renewed by the station check; the next refresh recovers.
    catch (cause) { if (!(cause instanceof ApiError && cause.code === 'GATE_SESSION_REQUIRED')) setError(errorText(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (enabled && online) void load(); }, [enabled, load, online, version]);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) void load(); }, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, load]);
  return { log, error, loading, updatedAt, load };
}

// Floating "liquid glass" navbar: a frosted capsule whose pill slides to the active section.
function GateNav({ view, onChange, inside }: { view: GateView; onChange: (view: GateView) => void; inside?: number }) {
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const bar = nav.current;
    if (!bar) return;
    const place = () => {
      const active = bar.querySelector<HTMLElement>('.gate-nav-item.active');
      if (active) setPill({ x: active.offsetLeft, width: active.offsetWidth });
    };
    place();
    // Labels change width (count badge, fonts loading), so re-measure on resize.
    const observer = new ResizeObserver(place);
    bar.querySelectorAll('.gate-nav-item').forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [view, inside]);
  const items: { id: GateView; label: string; Icon: typeof ScanLine }[] = [{ id: 'scan', label: 'Escanear', Icon: ScanLine }, { id: 'log', label: 'Bitácora', Icon: History }];
  return <nav ref={nav} className="gate-nav" role="tablist" aria-label="Secciones de caseta">
    {pill && <span className="gate-nav-pill" aria-hidden="true" style={{ transform: `translateX(${pill.x}px)`, width: pill.width }}/>}
    {items.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" id={`gate-tab-${id}`} aria-controls="gate-view" aria-selected={view === id} className={'gate-nav-item' + (view === id ? ' active' : '')} onClick={() => onChange(id)}>
      <Icon size={18}/><span>{label}</span>{id === 'log' && inside !== undefined && <span className="gate-nav-count" aria-label={`${inside} visitas dentro`}>{inside}</span>}
    </button>)}
  </nav>;
}

function ShiftLog({ log, error, loading, updatedAt, load, online, exiting, onExit }: ReturnType<typeof useShiftLog> & { online: boolean; exiting: string | null; onExit: (id: string) => Promise<void> }) {
  // Narrow screens show one list at a time; wide screens show both side by side.
  const [tab, setTab] = useState<'inside' | 'recent'>('inside');
  const time = (value: string | Date) => dateText(typeof value === 'string' ? value : value.toISOString(), { hour: '2-digit', minute: '2-digit' });
  return <div className="shift-log">
    <div className="shift-log-toolbar">
      <p>Visitas dentro del fraccionamiento y lecturas de este equipo en las últimas 12 horas.{updatedAt && <><br/>Última actualización: {time(updatedAt)}</>}</p>
      <Button className="secondary small-button" onClick={() => void load()} disabled={!online} busy={loading}><RotateCw size={15}/> Actualizar</Button>
    </div>
    <ErrorBox message={error} retry={() => void load()}/>
    <div className="tabs shift-log-tabs" role="tablist" aria-label="Listas de la bitácora">
      <button role="tab" aria-selected={tab === 'inside'} className={tab === 'inside' ? 'active' : ''} onClick={() => setTab('inside')}>Dentro ahora{log ? ` (${log.inside.length})` : ''}</button>
      <button role="tab" aria-selected={tab === 'recent'} className={tab === 'recent' ? 'active' : ''} onClick={() => setTab('recent')}>Últimas lecturas</button>
    </div>
    {!log ? (error ? null : <Loading/>) : <div className="shift-log-grid">
      <section className={'panel' + (tab === 'inside' ? '' : ' narrow-hidden')} aria-label="Visitas dentro">
        <div className="panel-heading"><div><h2>Dentro ahora</h2><p>{log.inside.length === 1 ? '1 visita con entrada sin salida.' : `${log.inside.length} visitas con entrada sin salida.`}</p></div><Users/></div>
        {!log.inside.length ? <Empty icon={<Users/>} title="No hay visitas dentro" text="Las visitas aparecen aquí al registrar su entrada y salen al registrar su salida."/> :
          <div className="device-list">{log.inside.map(row => <div className="device-row" key={row.id}><div>{row.kind === 'walkin' && <span className="badge expired"><span/>Sin pase</span>}<h3>{row.guestName}</h3><p>{row.property.street} {row.property.houseNumber} · {row.guestVehicle || 'Peatonal'}</p><small>Entró el {dateText(row.since)}{row.authorizedBy ? ` · Autorizó ${row.authorizedBy}` : ''}</small></div>
            {/* Walk-ins have no QR to scan on the way out. */}
            {row.kind === 'walkin' && <Button className="secondary small-button" disabled={!online || !!exiting} busy={exiting === row.id} onClick={() => void onExit(row.id)}>Registrar salida</Button>}</div>)}</div>}
      </section>
      <section className={'panel' + (tab === 'recent' ? '' : ' narrow-hidden')} aria-label="Últimas lecturas">
        <div className="panel-heading"><div><h2>Últimas lecturas</h2><p>Entradas, salidas y rechazos de este equipo.</p></div><History/></div>
        {!log.recent.length ? <Empty icon={<History/>} title="Sin lecturas recientes" text="Las lecturas de este equipo aparecerán aquí."/> :
          <div className="device-list">{log.recent.map(row => {
            const granted = row.result === 'GRANTED';
            const walkIn = row.kind === 'walkin';
            const label = granted ? (row.direction === 'ENTRY' ? 'Entrada' : 'Salida') : walkIn ? (row.result === 'WALKIN_PENDING' ? 'Esperando respuesta' : row.result === 'WALKIN_CANCELLED' ? 'Cancelada' : 'Entrada rechazada') : row.direction === 'ENTRY' ? 'Entrada rechazada' : 'Salida rechazada';
            const tone = granted ? (row.direction === 'EXIT' ? ' used' : '') : row.result === 'WALKIN_PENDING' || row.result === 'WALKIN_CANCELLED' ? ' expired' : ' revoked';
            return <div className="device-row" key={row.id}><div><span className={'badge' + tone}><span/>{label}{walkIn ? ' · sin pase' : ''}</span><h3>{row.guestName ?? 'Pase no reconocido'}</h3>{row.property && <p>{row.property.street} {row.property.houseNumber}</p>}<small>{time(row.timestamp)}{row.authorizedBy ? ` · Autorizó ${row.authorizedBy}` : ''}{granted ? '' : ' · ' + (codeText(row.result) ?? 'Lectura rechazada.')}</small></div></div>;
          })}</div>}
      </section>
    </div>}
  </div>;
}

export function Gate() {
  const [station, setStation] = useState<GateStation | null>(null);
  const [checking, setChecking] = useState(true);
  const [stationError, setStationError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pairToken, setPairToken] = useState(() => {
    try {
      const legacy = JSON.parse(localStorage.getItem('sica:gate') ?? '{}') as { device?: unknown };
      return typeof legacy.device === 'string' && /^[A-Za-z0-9_-]{43}$/.test(legacy.device) ? legacy.device : '';
    } catch { return ''; }
  });
  const [cameraOn, setCameraOn] = useState(() => { try { return localStorage.getItem(cameraKey) === '1'; } catch { return false; } });
  const [cameraError, setCameraError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeLeaving, setNoticeLeaving] = useState(false);
  const [manual, setManual] = useState(false);
  const [direction, setDirection] = useState<'ENTRY' | 'EXIT'>('ENTRY');
  const directionName = direction === 'ENTRY' ? 'entrada' : 'salida';
  const [result, setResult] = useState<ScanResult | null>(null);
  const [attempt, setAttempt] = useState<{ token: string; direction: 'ENTRY' | 'EXIT' } | null>(null);
  const [logVersion, setLogVersion] = useState(0);
  const [view, setView] = useState<GateView>(() => {
    try { return localStorage.getItem(gateViewKey) === 'log' ? 'log' : 'scan'; } catch { return 'scan'; }
  });
  const pair = useMutation();
  const scan = useMutation();
  const online = useOnline();
  const shiftLog = useShiftLog(!!station, online, logVersion);
  const [walkIn, setWalkIn] = useState(false);
  const exit = useMutation();
  const [exiting, setExiting] = useState<string | null>(null);
  const scanning = useRef(false);
  const cooldown = useRef<{ raw: string; until: number } | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const showing = !!result || (!!attempt && !!scan.error && !scan.busy);

  async function exitWalkIn(id: string) {
    setExiting(id);
    if (await exit.run(`/gate/scan/walk-ins/${id}/exit`, 'POST', {}, { public: true, station: true })) setLogVersion(v => v + 1);
    setExiting(null);
  }

  function openView(next: GateView) {
    setView(next);
    try { localStorage.setItem(gateViewKey, next); } catch { /* The scanner is the default view. */ }
  }

  function switchCamera(on: boolean) {
    setCameraOn(on); setCameraError('');
    try { localStorage.setItem(cameraKey, on ? '1' : '0'); } catch { /* The guard turns it on again after a reload. */ }
  }

  // Browsers only allow audio after a tap; the first touch anywhere on the station unlocks it.
  function unlockAudio() {
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* Sound is optional. */ }
  }
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  }, []);
  function signal(granted: boolean) {
    try { navigator.vibrate?.(granted ? 90 : [140, 90, 140]); } catch { /* Vibration is optional. */ }
    const ctx = audio.current;
    if (!ctx) return;
    (granted ? [880] : [330, 330]).forEach((frequency, index) => {
      const tone = ctx.createOscillator(); const gain = ctx.createGain();
      tone.frequency.value = frequency; gain.gain.value = 0.15;
      tone.connect(gain).connect(ctx.destination);
      const at = ctx.currentTime + index * 0.25;
      tone.start(at); tone.stop(at + 0.16);
    });
  }

  useEffect(() => {
    setNoticeLeaving(false);
    if (!notice) return;
    // The notice slides away before it is removed.
    const leave = window.setTimeout(() => setNoticeLeaving(true), 2400);
    const id = window.setTimeout(() => setNotice(''), 2600);
    return () => { window.clearTimeout(leave); window.clearTimeout(id); };
  }, [notice]);

  const refreshStation = useCallback(async () => {
    try {
      const value = await api<GateStation>('/gate/station', { public: true, station: true });
      try { localStorage.setItem(stationModeKey, '1'); } catch { /* Direct /caseta remains available when storage is disabled. */ }
      setStation(value);
      setStationError('');
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
        setStation(null);
        setStationError(cause.status === 403 ? errorText(cause) : '');
      } else setStationError(errorText(cause));
      return false;
    } finally { setChecking(false); }
  }, []);

  useEffect(() => {
    void refreshStation();
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) void refreshStation(); };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [refreshStation]);

  async function activate(event: FormEvent) {
    event.preventDefault();
    setStationError('');
    const pending = await pair.run<GateStation>('/gate/pair', 'POST', { deviceToken: pairToken.trim() }, { public: true, station: true });
    if (!pending) return;
    setConfirming(true);
    try {
      await api<GateStation>('/gate/confirm', { method: 'POST', public: true, station: true });
      const value = await api<GateStation>('/gate/station', { public: true, station: true });
      try { localStorage.removeItem('sica:gate'); localStorage.setItem(stationModeKey, '1'); } catch { /* Optional browser storage. */ }
      setStation(value); setPairToken('');
    } catch (cause) {
      setStationError(errorText(cause));
    } finally { setConfirming(false); }
  }

  async function read(raw: string, retry = false) {
    if (scanning.current || !station || !online) return;
    if (!retry && (showing || walkIn)) return;
    // A QR that is still in view after its result closed is ignored until it leaves the camera.
    if (!retry && cooldown.current?.raw === raw && Date.now() < cooldown.current.until) { cooldown.current.until = Math.max(cooldown.current.until, Date.now() + SAME_QR_COOLDOWN_MS); return; }
    let token: string;
    try { token = extractToken(raw); }
    catch (cause) {
      // Any QR in view is read continuously: report a foreign code once, not every frame.
      cooldown.current = { raw, until: Date.now() + SAME_QR_COOLDOWN_MS };
      setNotice(errorText(cause)); signal(false); return;
    }
    scanning.current = true;
    setManual(false); setNotice('');
    const action = retry && attempt ? attempt : { token, direction };
    // While its result is on screen, the same QR is never read again.
    cooldown.current = { raw, until: Number.POSITIVE_INFINITY };
    setAttempt(action);
    setResult(null);
    let value = await scan.run<ScanResult>('/gate/scan', 'POST', action, { public: true, station: true });
    // The scan permit lapses while the station sleeps; renew it and retry once.
    if (!value && scan.code() === 'GATE_SESSION_REQUIRED' && await refreshStation()) value = await scan.run<ScanResult>('/gate/scan', 'POST', action, { public: true, station: true });
    if (value) setResult(value);
    else void refreshStation();
    signal(!!value);
    setLogVersion(v => v + 1);
    scanning.current = false;
  }

  // Choosing a movement is a deliberate new reading, even for the QR still in front of the camera.
  function changeDirection(next: 'ENTRY' | 'EXIT') { setDirection(next); cooldown.current = null; }

  function next() {
    if (cooldown.current) cooldown.current = { raw: cooldown.current.raw, until: Date.now() + SAME_QR_COOLDOWN_MS };
    setResult(null); setAttempt(null); scan.clear();
  }

  return <div className={'gate-station' + (station ? ' has-nav' : '')}>
    {(!station || view === 'log') && <PageHeader title={station ? 'Bitácora' : 'Caseta'} text={station ? 'Consulta quién sigue dentro y las lecturas recientes de este equipo.' : 'Vincula este equipo para escanear los pases de las visitas.'}/>}
    {checking && !station ? <Loading/> : !station ? <section className="panel setup-panel">
      <div className="setup-symbol"><DoorOpen size={31}/></div>
      <h2>Vincula este equipo una sola vez</h2>
      <p>Administración debe generar una clave para este equipo. Después, cualquier turno podrá usar el escáner sin iniciar sesión.</p>
      <form onSubmit={activate}>
        <label>Clave de vinculación<input required type="password" autoComplete="off" minLength={43} maxLength={43} value={pairToken} onChange={event => setPairToken(event.target.value)} placeholder="Pega la clave que entregó administración"/></label>
        <ErrorBox message={stationError || pair.error}/>
        <Button className="full" type="submit" busy={pair.busy || confirming} disabled={!online}><ShieldCheck size={18}/> Vincular equipo</Button>
      </form>
    </section> : <>
      <div className="gate-session compact">
        <div><span className={'connection-dot ' + (online ? '' : 'offline')}/><strong>{station.gate.label}</strong><span>{station.label} · {online ? 'Equipo autorizado' : 'Sin conexión'}</span></div>
      </div>
      <ErrorBox message={stationError}/>
      <GateNav view={view} onChange={openView} inside={shiftLog.log?.inside.length}/>
      {walkIn && <GateWalkIn online={online} onClose={() => setWalkIn(false)} onFinished={granted => { if (granted !== null) signal(granted); setLogVersion(v => v + 1); }}/>}
      {manual && <ManualDialog directionName={directionName} busy={scan.busy} online={online} onClose={() => setManual(false)} onSubmit={raw => void read(raw)}/>}
      {showing && attempt && <ResultDialog key={attempt.token + attempt.direction} result={result} error={scan.error} direction={attempt.direction} retrying={scan.busy} online={online} onNext={next} onRetry={() => void read(attempt.token, true)}/>}
      <div id="gate-view" role="tabpanel" aria-labelledby={view === 'scan' ? 'gate-tab-scan' : 'gate-tab-log'}>
      {view === 'log' ? <><ShiftLog {...shiftLog} online={online} exiting={exiting} onExit={exitWalkIn}/><ErrorBox message={exit.error}/></> : <div className="scan-screen">
        <nav className={`direction-nav ${direction === 'ENTRY' ? 'entry-active' : 'exit-active'}`} aria-label="Movimiento del visitante">
          <span className="direction-nav-surface" aria-hidden="true">
            <span className="direction-nav-fill direction-nav-fill-left"/>
            <span className="direction-nav-notch-track">
              <svg className="direction-nav-notch" viewBox="0 0 112 84" preserveAspectRatio="none">
                <path d="M0 0 C12 0 14 4 20 16 C27 31 38 39 56 39 C74 39 85 31 92 16 C98 4 100 0 112 0 V84 H0 Z" fill="currentColor"/>
              </svg>
            </span>
            <span className="direction-nav-fill direction-nav-fill-right"/>
          </span>
          <button type="button" disabled={scan.busy} className={direction === 'ENTRY' ? 'selected' : ''} aria-pressed={direction === 'ENTRY'} onClick={() => changeDirection('ENTRY')}>
            <span className="direction-nav-icon"><AnimatedArrowRightDashed size={21}/></span><span className="direction-nav-label"><strong>Entrada</strong><small>La visita llega</small></span>
          </button>
          <button type="button" disabled={scan.busy} className={direction === 'EXIT' ? 'selected' : ''} aria-pressed={direction === 'EXIT'} onClick={() => changeDirection('EXIT')}>
            <span className="direction-nav-icon"><AnimatedArrowLeftDashed size={21}/></span><span className="direction-nav-label"><strong>Salida</strong><small>La visita se retira</small></span>
          </button>
        </nav>
        <ScanStage cameraOn={cameraOn} online={online} busy={scan.busy} paused={showing || manual || walkIn} directionName={directionName} notice={notice} noticeLeaving={noticeLeaving} cameraError={cameraError}
          onStart={() => { unlockAudio(); switchCamera(true); }} onStop={() => switchCamera(false)} onRead={raw => void read(raw)} onCameraError={setCameraError}/>
        <div className="scan-actions">
          <Button className="secondary" disabled={!online} onClick={() => { unlockAudio(); setManual(true); }}><ClipboardPaste size={17}/> Pegar enlace</Button>
          <Button className="secondary" disabled={!online} onClick={() => { unlockAudio(); setWalkIn(true); }}><UserPlus size={17}/> Visita sin pase</Button>
        </div>
      </div>}
      </div>
    </>}
  </div>;
}
