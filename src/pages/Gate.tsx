import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import jsQR from 'jsqr';
import { Camera, Check, ClipboardPaste, DoorOpen, History, ScanLine, ShieldCheck, Users, XCircle, RotateCw } from 'lucide-react';
import { Button, Empty, ErrorBox, Info, Loading, PageHeader } from '../components/ui';
import { dateText, extractToken, useMutation, useOnline } from '../hooks';
import { api, ApiError, codeText, errorText } from '../api';
import type { GateLog, GateStation, ScanResult } from '../types';
import AnimatedQr from '../components/icons/AnimatedQr';
import AnimatedArrowRightDashed from '../components/icons/AnimatedArrowRightDashed';
import AnimatedArrowLeftDashed from '../components/icons/AnimatedArrowLeftDashed';

const stationModeKey = 'zentry:gate-station';

function CameraReader({ onRead }: { onRead: (raw: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const callback = useRef(onRead);
  callback.current = onRead;

  useEffect(() => {
    let canceled = false;
    let stream: MediaStream | undefined;
    let frame = 0;
    let last = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    function tick(at: number) {
      if (canceled) return;
      const el = video.current;
      if (at - last > 200 && el && el.readyState >= 2 && ctx && document.visibilityState === 'visible') {
        last = at;
        canvas.width = Math.min(el.videoWidth, 640);
        canvas.height = Math.round(el.videoHeight * canvas.width / el.videoWidth);
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (code) { callback.current(code.data); return; }
      }
      frame = requestAnimationFrame(tick);
    }
    if (!navigator.mediaDevices?.getUserMedia) setError('Este navegador no puede abrir la cámara. Usa un enlace o abre Zentry con HTTPS.');
    else navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then(async source => {
        if (canceled) { source.getTracks().forEach(track => track.stop()); return; }
        stream = source;
        video.current!.srcObject = source;
        await video.current!.play();
        if (!canceled) frame = requestAnimationFrame(tick);
      })
      .catch(() => { if (!canceled) setError('No se pudo abrir la cámara. Permite el acceso o pega el enlace del pase.'); });
    return () => { canceled = true; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); };
  }, []);

  return <><div className="camera-view"><video ref={video} muted playsInline aria-label="Cámara para escanear pases"/><div className="camera-guide"><i/><i/><i/><i/></div><span>Coloca el QR dentro del recuadro</span></div><ErrorBox message={error}/></>;
}

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

function ShiftLog({ log, error, loading, updatedAt, load, online }: ReturnType<typeof useShiftLog> & { online: boolean }) {
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
          <div className="device-list">{log.inside.map(row => <div className="device-row" key={row.id}><div><h3>{row.guestName}</h3><p>{row.property.street} {row.property.houseNumber} · {row.guestVehicle || 'Peatonal'}</p><small>Entró el {dateText(row.since)}</small></div></div>)}</div>}
      </section>
      <section className={'panel' + (tab === 'recent' ? '' : ' narrow-hidden')} aria-label="Últimas lecturas">
        <div className="panel-heading"><div><h2>Últimas lecturas</h2><p>Entradas, salidas y rechazos de este equipo.</p></div><History/></div>
        {!log.recent.length ? <Empty icon={<History/>} title="Sin lecturas recientes" text="Las lecturas de este equipo aparecerán aquí."/> :
          <div className="device-list">{log.recent.map(row => {
            const granted = row.result === 'GRANTED';
            return <div className="device-row" key={row.id}><div><span className={'badge' + (granted ? (row.direction === 'EXIT' ? ' used' : '') : ' revoked')}><span/>{granted ? (row.direction === 'ENTRY' ? 'Entrada' : 'Salida') : row.direction === 'ENTRY' ? 'Entrada rechazada' : 'Salida rechazada'}</span><h3>{row.guestName ?? 'Pase no reconocido'}</h3>{row.property && <p>{row.property.street} {row.property.houseNumber}</p>}<small>{time(row.timestamp)}{granted ? '' : ' · ' + (codeText(row.result) ?? 'Lectura rechazada.')}</small></div></div>;
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
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState('');
  const [direction, setDirection] = useState<'ENTRY' | 'EXIT'>('ENTRY');
  const directionName = direction === 'ENTRY' ? 'entrada' : 'salida';
  const [result, setResult] = useState<ScanResult | null>(null);
  const [attempt, setAttempt] = useState<{ token: string; direction: 'ENTRY' | 'EXIT' } | null>(null);
  const [error, setError] = useState('');
  const [logVersion, setLogVersion] = useState(0);
  const [view, setView] = useState<GateView>(() => {
    try { return localStorage.getItem(gateViewKey) === 'log' ? 'log' : 'scan'; } catch { return 'scan'; }
  });
  const pair = useMutation();
  const scan = useMutation();
  const online = useOnline();
  const shiftLog = useShiftLog(!!station, online, logVersion);

  function openView(next: GateView) {
    setView(next);
    if (next === 'log') setCamera(false);
    try { localStorage.setItem(gateViewKey, next); } catch { /* The scanner is the default view. */ }
  }
  const scanning = useRef(false);
  const resultPanel = useRef<HTMLElement>(null);
  const audio = useRef<AudioContext | null>(null);

  // Browsers only allow audio after a tap, so the context is opened from the scan buttons.
  function unlockAudio() {
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* Sound is optional. */ }
  }
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

  useEffect(() => { if (!station || !online) setCamera(false); }, [station, online]);
  useEffect(() => {
    if ((result || scan.error) && window.matchMedia('(max-width: 1200px)').matches) {
      resultPanel.current?.focus({ preventScroll: true });
      resultPanel.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  }, [result, scan.error]);

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
    setError('');
    let token: string;
    try { token = extractToken(raw); }
    catch (cause) { setCamera(false); setError(errorText(cause)); return; }
    scanning.current = true;
    setCamera(false);
    const action = retry && attempt ? attempt : { token, direction };
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

  function reset() { setResult(null); setAttempt(null); setManual(''); setError(''); scan.clear(); }

  return <div className={'gate-station' + (station ? ' has-nav' : '')}>
    <PageHeader title={station && view === 'log' ? 'Bitácora' : 'Caseta'} text={station && view === 'log' ? 'Consulta quién sigue dentro y las lecturas recientes de este equipo.' : 'Escanea un pase y registra claramente si la visita entra o sale.'}/>
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
      <div className="gate-session">
        <div><span className={'connection-dot ' + (online ? '' : 'offline')}/><strong>{station.gate.label}</strong><span>{station.label} · {online ? 'Equipo autorizado' : 'Sin conexión'}</span></div>
        <Button className="secondary small-button" onClick={() => void refreshStation()} disabled={!online}><RotateCw size={15}/> Comprobar conexión</Button>
      </div>
      <ErrorBox message={stationError}/>
      <GateNav view={view} onChange={openView} inside={shiftLog.log?.inside.length}/>
      <div id="gate-view" role="tabpanel" aria-labelledby={view === 'scan' ? 'gate-tab-scan' : 'gate-tab-log'}>
      {view === 'log' ? <ShiftLog {...shiftLog} online={online}/> : <>
      <div className="gate-layout">
        <section className="panel scanner-panel">
          <div className="panel-heading"><div><h2>¿Qué movimiento vas a registrar?</h2><p>Selecciona una opción antes de leer el QR.</p></div><ScanLine/></div>
          <nav className={`direction-nav ${direction === 'ENTRY' ? 'entry-active' : 'exit-active'}`} aria-label="Movimiento del visitante">
            <span className="direction-nav-fill direction-nav-fill-left" aria-hidden="true"/>
            <svg className="direction-nav-notch" viewBox="0 0 112 84" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 0 C12 0 14 4 20 16 C27 31 38 39 56 39 C74 39 85 31 92 16 C98 4 100 0 112 0 V84 H0 Z" fill="currentColor"/>
            </svg>
            <span className="direction-nav-fill direction-nav-fill-right" aria-hidden="true"/>
            <button type="button" disabled={scan.busy || !!attempt} className={direction === 'ENTRY' ? 'selected' : ''} aria-pressed={direction === 'ENTRY'} onClick={() => setDirection('ENTRY')}>
              <span className="direction-nav-icon"><AnimatedArrowRightDashed size={21}/></span><span className="direction-nav-label"><strong>Entrada</strong><small>La visita llega</small></span>
            </button>
            <button type="button" disabled={scan.busy || !!attempt} className={direction === 'EXIT' ? 'selected' : ''} aria-pressed={direction === 'EXIT'} onClick={() => setDirection('EXIT')}>
              <span className="direction-nav-icon"><AnimatedArrowLeftDashed size={21}/></span><span className="direction-nav-label"><strong>Salida</strong><small>La visita se retira</small></span>
            </button>
          </nav>
          {camera && online ? <CameraReader onRead={raw => void read(raw)}/> : <div className="scanner-placeholder">
            <div className="scan-frame"><AnimatedQr size={56} strokeWidth={1.3}/></div>
            <h3>{scan.busy ? `Validando ${directionName}…` : attempt ? 'Lectura completada' : `Listo para registrar ${directionName}`}</h3>
            <p>{online ? `Lee el QR del visitante para registrar su ${directionName}.` : 'Recupera la conexión para continuar.'}</p>
            <Button disabled={!online || scan.busy || !!attempt} onClick={() => { unlockAudio(); setCamera(true); }}><Camera size={18}/> Escanear {directionName}</Button>
          </div>}
          {camera && <Button className="secondary full" onClick={() => setCamera(false)}>Cerrar cámara</Button>}
          <div className="manual-entry"><span>También puedes pegar el enlace</span><form onSubmit={event => { event.preventDefault(); unlockAudio(); void read(manual); }}><input aria-label="Enlace o token del pase" placeholder="https://…/p/…" value={manual} onChange={event => setManual(event.target.value)} disabled={!!attempt || scan.busy}/><Button type="submit" className="secondary" disabled={!manual || !!attempt || !online} busy={scan.busy}><ClipboardPaste size={17}/> Validar {directionName}</Button></form></div>
          <ErrorBox message={error}/>
        </section>
        <aside ref={resultPanel} tabIndex={-1} aria-label="Resultado de la lectura" className="panel scan-result" aria-live="polite" aria-atomic="true">
          {result ? <><div className="result-symbol granted"><Check size={34}/></div><h2>{attempt?.direction === 'ENTRY' ? 'Entrada autorizada' : 'Salida registrada'}</h2><p>Confirma los datos del visitante.</p><dl className="details"><div><dt>Visitante</dt><dd>{result.guestName}</dd></div><div><dt>Vehículo</dt><dd>{result.guestVehicle || 'Peatonal'}</dd></div><div><dt>Destino</dt><dd>{result.property.street} {result.property.houseNumber}</dd></div><div><dt>Residente</dt><dd>{result.residentName}</dd></div><div><dt>Movimiento</dt><dd>{attempt?.direction === 'ENTRY' ? 'Entrada' : 'Salida'}</dd></div></dl><Button className="full" onClick={reset}>Siguiente visita</Button><p className="small muted">Esta pantalla no acciona una barrera automáticamente.</p></> :
            scan.error ? <><div className="result-symbol denied"><XCircle size={34}/></div><h2>{attempt?.direction === 'EXIT' ? 'No se registró la salida' : 'No autorices el acceso'}</h2><ErrorBox message={scan.error}/><div className="stack"><Button className="secondary" disabled={!online} busy={scan.busy} onClick={() => attempt && void read(attempt.token, true)}>Reintentar esta lectura</Button><Button onClick={reset}>Leer otro pase</Button></div></> :
            <Empty icon={<ShieldCheck/>} title={scan.busy ? 'Comprobando acceso' : 'El resultado aparecerá aquí'} text="La caseta revisa la vigencia, la vivienda y el estado del pase antes de autorizar."/>}
        </aside>
      </div>
      <Info>Sin conexión no se autorizan accesos. Si una respuesta se pierde, reintenta la misma lectura para evitar duplicarla.</Info>
      </>}
      </div>
    </>}
  </div>;
}
