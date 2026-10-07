import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import { Camera, CameraOff, Check, ClipboardPaste, LoaderCircle, Pause, WifiOff, XCircle } from 'lucide-react';
import { Button, ErrorBox } from '../components/ui';
import { lockPageScroll } from '../components/lockPageScroll';
import { fadeOutCopy } from '../components/modalExit';
import type { ScanResult } from '../types';

/**
 * Live QR reader. The stream stays open while mounted; `paused` only stops decoding,
 * so a result dialog or another dialog never makes the guard reopen the camera.
 */
export function CameraReader({ onRead, paused, onError }: { onRead: (raw: string) => void; paused: boolean; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onRead, onError, paused });
  callbacks.current = { onRead, onError, paused };
  const [live, setLive] = useState(false);

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
      if (!callbacks.current.paused && at - last > 160 && el && el.readyState >= 2 && ctx && document.visibilityState === 'visible') {
        last = at;
        canvas.width = Math.min(el.videoWidth, 640);
        canvas.height = Math.round(el.videoHeight * canvas.width / el.videoWidth);
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) callbacks.current.onRead(code.data);
      }
      frame = requestAnimationFrame(tick);
    }
    if (!navigator.mediaDevices?.getUserMedia) callbacks.current.onError('Este navegador no puede abrir la cámara. Abre Zentry con HTTPS o pega el enlace del pase.');
    else navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then(async source => {
        if (canceled) { source.getTracks().forEach(track => track.stop()); return; }
        stream = source;
        video.current!.srcObject = source;
        await video.current!.play();
        if (!canceled) { setLive(true); frame = requestAnimationFrame(tick); }
      })
      .catch(() => { if (!canceled) callbacks.current.onError('No se pudo abrir la cámara. Permite el acceso en el navegador o pega el enlace del pase.'); });
    return () => { canceled = true; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); };
  }, []);

  return <video ref={video} className={live ? 'live' : ''} muted playsInline aria-label="Cámara para escanear pases"/>;
}

type StageProps = {
  cameraOn: boolean; online: boolean; busy: boolean; paused: boolean; directionName: string; notice: string; noticeLeaving: boolean; cameraError: string;
  onStart: () => void; onStop: () => void; onRead: (raw: string) => void; onCameraError: (message: string) => void;
};

/** The camera area: start button when off, live view with a scan guide when on. */
export function ScanStage({ cameraOn, online, busy, paused, directionName, notice, noticeLeaving, cameraError, onStart, onStop, onRead, onCameraError }: StageProps) {
  const live = cameraOn && online && !cameraError;
  return <div className={'scan-stage' + (live ? ' on' : '') + (busy ? ' busy' : '')}>
    {live && <CameraReader onRead={onRead} paused={paused || busy} onError={onCameraError}/>}
    {live ? <>
      <div className="scan-guide" aria-hidden="true"><i/><i/><i/><i/><span className="scan-line"/></div>
      <div className="scan-status" role="status">{busy ? <><LoaderCircle className="spin" size={16}/> Validando {directionName}…</> : <><span className="scan-dot"/> Escaneando {directionName}</>}</div>
      <button type="button" className="scan-pause" onClick={onStop} aria-label="Apagar cámara"><Pause size={18}/></button>
    </> : <div className="scan-idle">
      {!online ? <><WifiOff size={30}/><h3>Sin conexión</h3><p>Sin conexión no se autorizan accesos. La cámara vuelve sola al reconectar.</p></>
        : cameraError ? <><CameraOff size={30}/><h3>No se pudo abrir la cámara</h3><p>{cameraError}</p><Button onClick={onStart}><Camera size={18}/> Reintentar</Button></>
        : <><span className="scan-idle-icon"><Camera size={30}/></span><h3>Activa el escáner</h3><p>La cámara se queda encendida: solo acerca cada QR al recuadro.</p><Button onClick={onStart}><Camera size={18}/> Activar escáner</Button></>}
    </div>}
    {notice && <div className={'scan-toast' + (noticeLeaving ? ' leaving' : '')} role="alert">{notice}</div>}
  </div>;
}

function Sheet({ label, tone, onClose, children }: { label: string; tone: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const unlock = lockPageScroll();
    try { el.showModal(); } catch (error) { unlock(); throw error; }
    return () => { fadeOutCopy(el); el.close(); unlock(); };
  }, []);
  return createPortal(<dialog ref={ref} className={`modal scan-dialog ${tone}`} aria-label={label} onCancel={e => { e.preventDefault(); onClose(); }}>{children}</dialog>, document.body);
}

const AUTO_CLOSE_MS = 8000;

/** Result of a reading. Granted closes itself so the next visitor can be scanned; a touch keeps it open. */
export function ResultDialog({ result, error, direction, retrying, online, onNext, onRetry }: {
  result: ScanResult | null; error: string; direction: 'ENTRY' | 'EXIT'; retrying: boolean; online: boolean; onNext: () => void; onRetry: () => void;
}) {
  const granted = !!result;
  const [holding, setHolding] = useState(!granted || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const next = useRef(onNext);
  next.current = onNext;
  useEffect(() => {
    if (holding) return;
    const id = window.setTimeout(() => next.current(), AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [holding]);
  const title = granted ? (direction === 'ENTRY' ? 'Entrada autorizada' : 'Salida registrada') : direction === 'EXIT' ? 'No se registró la salida' : 'No autorices el acceso';
  return <Sheet label={title} tone={granted ? 'granted' : 'denied'} onClose={onNext}>
    <div className="scan-dialog-body" onPointerDown={() => setHolding(true)}>
      <div className="scan-dialog-hero" aria-live="assertive">
        <span className="scan-dialog-symbol">{granted ? <Check size={38} strokeWidth={2.6}/> : <XCircle size={38}/>}</span>
        <h2>{title}</h2>
        {granted && <p className="scan-dialog-guest">{result.guestName}</p>}
      </div>
      {granted ? <dl className="scan-dialog-details">
        <div><dt>Destino</dt><dd>{result.property.street} {result.property.houseNumber}</dd></div>
        <div><dt>Vehículo</dt><dd>{result.guestVehicle || 'Peatonal'}</dd></div>
        <div><dt>Invitó</dt><dd>{result.residentName}</dd></div>
      </dl> : <div className="scan-dialog-error"><ErrorBox message={error}/></div>}
      <div className="scan-dialog-actions">
        {!granted && <Button className="secondary" disabled={!online} busy={retrying} onClick={onRetry}>Reintentar lectura</Button>}
        <Button autoFocus onClick={onNext}>{granted ? 'Siguiente visita' : 'Leer otro pase'}</Button>
      </div>
      {granted && <div className="scan-dialog-timer" aria-hidden="true">{holding ? <small>Se queda abierto hasta que toques «Siguiente visita».</small> : <span className="scan-dialog-progress" style={{ animationDuration: `${AUTO_CLOSE_MS}ms` }}/>}</div>}
    </div>
  </Sheet>;
}

/** Fallback for a QR the camera cannot read (cracked screen, glare): paste the pass link. */
export function ManualDialog({ directionName, busy, online, onSubmit, onClose }: { directionName: string; busy: boolean; online: boolean; onSubmit: (raw: string) => void; onClose: () => void }) {
  const [value, setValue] = useState('');
  function submit(e: FormEvent) { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }
  return <Sheet label="Pegar enlace del pase" tone="manual" onClose={onClose}>
    <div className="modal-top"><h2>Pegar enlace</h2><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><XCircle size={20}/></button></div>
    <form className="modal-content" onSubmit={submit}>
      <label>Enlace o token del pase<input autoFocus inputMode="url" autoComplete="off" placeholder="https://…/p/…" value={value} onChange={e => setValue(e.target.value)}/><small>Si la cámara no lee el QR, pide al visitante el enlace que recibió.</small></label>
      <Button type="submit" className="full" disabled={!value.trim() || !online} busy={busy}><ClipboardPaste size={17}/> Validar {directionName}</Button>
    </form>
  </Sheet>;
}
