import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import { Button } from './ui';

// The photo is sent as a JPEG of at most this many pixels on its long side: the text of an
// INE stays legible and the request stays small (the API accepts up to 400 KB).
const MAX_SIDE = 1024;
const MAX_LENGTH = 500_000; // data URL characters, ≈ 370 KB

/** Draws an image or video frame scaled down and returns it as a JPEG data URL. */
function toJpeg(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.75, 0.6, 0.45]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_LENGTH) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.3);
}

/**
 * Photo of the visitor's ID with the station's camera. Opens the rear camera inline; if the
 * browser cannot, it falls back to the phone's camera app. `value` is the JPEG data URL.
 */
export function IdPhotoCapture({ value, onChange }: { value: string; onChange: (photo: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (value) return;
    let canceled = false;
    let stream: MediaStream | undefined;
    setLive(false);
    if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador no puede abrir la cámara aquí.'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then(async source => {
        if (canceled) { source.getTracks().forEach(track => track.stop()); return; }
        stream = source;
        video.current!.srcObject = source;
        await video.current!.play();
        if (!canceled) { setLive(true); setError(''); }
      })
      .catch(() => { if (!canceled) setError('No se pudo abrir la cámara. Permite el acceso o usa la cámara del equipo.'); });
    return () => { canceled = true; stream?.getTracks().forEach(track => track.stop()); };
  }, [value]);

  function shoot() {
    const el = video.current;
    if (!el || el.readyState < 2) return;
    onChange(toJpeg(el, el.videoWidth, el.videoHeight));
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { onChange(toJpeg(image, image.naturalWidth, image.naturalHeight)); URL.revokeObjectURL(url); };
    image.onerror = () => { setError('No se pudo leer la foto. Tómala de nuevo.'); URL.revokeObjectURL(url); };
    image.src = url;
  }

  if (value) return <div className="id-capture">
    <img className="id-capture-photo" src={value} alt="Foto de la identificación de la visita"/>
    <Button className="secondary" onClick={() => onChange('')}><RotateCcw size={16}/> Repetir foto</Button>
  </div>;
  return <div className="id-capture">
    {error ? <div className="id-capture-fallback"><p>{error}</p></div> : <div className="id-capture-view">
      <video ref={video} className={live ? 'live' : ''} muted playsInline aria-label="Cámara para la foto de la identificación"/>
      <div className="id-capture-guide" aria-hidden="true"/>
    </div>}
    {error ? <label className="button"><Camera size={17}/> Tomar foto con la cámara<input type="file" accept="image/*" capture="environment" onChange={pick} hidden/></label>
      : <Button onClick={shoot} disabled={!live}><Camera size={17}/> Tomar foto</Button>}
  </div>;
}
