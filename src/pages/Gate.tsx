import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import jsQR from 'jsqr';
import { Camera, Check, ClipboardPaste, DoorOpen, ScanLine, ShieldCheck, XCircle, RotateCw } from 'lucide-react';
import { Button, Empty, ErrorBox, Info, Loading, PageHeader } from '../components/ui';
import { extractToken, useMutation, useOnline } from '../hooks';
import { api, ApiError, errorText } from '../api';
import type { GateStation, ScanResult } from '../types';
import AnimatedQr from '../components/icons/AnimatedQr';

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
  const [result, setResult] = useState<ScanResult | null>(null);
  const [attempt, setAttempt] = useState<{ token: string; direction: 'ENTRY' | 'EXIT' } | null>(null);
  const [error, setError] = useState('');
  const pair = useMutation();
  const scan = useMutation();
  const online = useOnline();
  const scanning = useRef(false);
  const resultPanel = useRef<HTMLElement>(null);

  const refreshStation = useCallback(async () => {
    try {
      const value = await api<GateStation>('/gate/station', { public: true, station: true });
      try { localStorage.setItem(stationModeKey, '1'); } catch { /* Direct /caseta remains available when storage is disabled. */ }
      setStation(value);
      setStationError('');
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
        setStation(null);
        setStationError(cause.status === 403 ? errorText(cause) : '');
      } else setStationError(errorText(cause));
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
    const value = await scan.run<ScanResult>('/gate/scan', 'POST', action, { public: true, station: true });
    if (value) setResult(value);
    else void refreshStation();
    scanning.current = false;
  }

  function reset() { setResult(null); setAttempt(null); setManual(''); setError(''); scan.clear(); }

  return <div className="gate-station">
    <PageHeader title="Caseta" text="Comprueba cada visita antes de autorizar su entrada."/>
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
      <div className="gate-layout">
        <section className="panel scanner-panel">
          <div className="panel-heading"><div><h2>Validar un pase</h2><p>Una lectura por cada acceso.</p></div><ScanLine/></div>
          <div className="direction-toggle">{(['ENTRY', 'EXIT'] as const).map(value => <button disabled={scan.busy || !!attempt} key={value} className={direction === value ? 'selected' : ''} aria-pressed={direction === value} onClick={() => setDirection(value)}>{value === 'ENTRY' ? 'Entrada' : 'Salida'}</button>)}</div>
          {camera && online ? <CameraReader onRead={raw => void read(raw)}/> : <div className="scanner-placeholder">
            <div className="scan-frame"><AnimatedQr size={56} strokeWidth={1.3}/></div>
            <h3>{scan.busy ? 'Validando el pase…' : attempt ? 'Lectura completada' : 'Listo para recibir visitas'}</h3>
            <p>{online ? 'Abre la cámara o pega el enlace de un pase.' : 'Recupera la conexión para continuar.'}</p>
            <Button disabled={!online || scan.busy || !!attempt} onClick={() => setCamera(true)}><Camera size={18}/> Abrir cámara</Button>
          </div>}
          {camera && <Button className="secondary full" onClick={() => setCamera(false)}>Cerrar cámara</Button>}
          <div className="manual-entry"><span>También puedes pegar el enlace</span><form onSubmit={event => { event.preventDefault(); void read(manual); }}><input aria-label="Enlace o token del pase" placeholder="https://…/p/…" value={manual} onChange={event => setManual(event.target.value)} disabled={!!attempt || scan.busy}/><Button type="submit" className="secondary" disabled={!manual || !!attempt || !online} busy={scan.busy}><ClipboardPaste size={17}/> Validar</Button></form></div>
          <ErrorBox message={error}/>
        </section>
        <aside ref={resultPanel} tabIndex={-1} aria-label="Resultado de la lectura" className="panel scan-result" aria-live="polite" aria-atomic="true">
          {result ? <><div className="result-symbol granted"><Check size={34}/></div><h2>Acceso autorizado</h2><p>Confirma los datos del visitante.</p><dl className="details"><div><dt>Visitante</dt><dd>{result.guestName}</dd></div><div><dt>Vehículo</dt><dd>{result.guestVehicle || 'Peatonal'}</dd></div><div><dt>Destino</dt><dd>{result.property.street} {result.property.houseNumber}</dd></div><div><dt>Residente</dt><dd>{result.residentName}</dd></div><div><dt>Movimiento</dt><dd>{attempt?.direction === 'ENTRY' ? 'Entrada' : 'Salida'}</dd></div></dl><Button className="full" onClick={reset}>Siguiente visita</Button><p className="small muted">Esta pantalla no acciona una barrera automáticamente.</p></> :
            scan.error ? <><div className="result-symbol denied"><XCircle size={34}/></div><h2>No autorices el acceso</h2><ErrorBox message={scan.error}/><div className="stack"><Button className="secondary" disabled={!online} busy={scan.busy} onClick={() => attempt && void read(attempt.token, true)}>Reintentar esta lectura</Button><Button onClick={reset}>Leer otro pase</Button></div></> :
            <Empty icon={<ShieldCheck/>} title={scan.busy ? 'Comprobando acceso' : 'El resultado aparecerá aquí'} text="La caseta revisa la vigencia, la vivienda y el estado del pase antes de autorizar."/>}
        </aside>
      </div>
      <Info>Sin conexión no se autorizan accesos. Si una respuesta se pierde, reintenta la misma lectura para evitar duplicarla.</Info>
    </>}
  </div>;
}
