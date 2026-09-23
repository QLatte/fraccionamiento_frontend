import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Share2, ShieldCheck } from 'lucide-react';
import { Button, ErrorBox, Brand } from './ui';
import { errorText, api } from '../api';
import { extractToken, useOnline } from '../hooks';
export function SharePass({ url, name }: { url: string; name?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null); const [error, setError] = useState(''); const [copied, setCopied] = useState(false); const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); QRCode.toCanvas(canvas.current, url, { width: 300, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#123c4a', light: '#ffffff' } }).then(() => setReady(true)).catch(() => setError('No se pudo generar el QR. Comparte el enlace.')); }, [url]);
  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError('No se pudo copiar automáticamente. Selecciona y copia el enlace que aparece abajo.'); } }
  async function share() { try { if (navigator.share) await navigator.share({ title: 'Tu pase de acceso · Zentry', text: 'Presenta este pase al llegar a la caseta.', url }); else await copy(); } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(errorText(e)); } }
  function download() { if (!canvas.current || !ready) return; const a = document.createElement('a'); a.download = 'pase-zentry.png'; a.href = canvas.current.toDataURL('image/png'); a.click(); }
  return <div className="share-pass"><div className="qr-ticket"><div className="ticket-label">Pase de visita</div><h3>{name ?? 'Te damos la bienvenida'}</h3><canvas ref={canvas} aria-label="Código QR de acceso" role="img"/><div className="ticket-bottom"><ShieldCheck size={17}/> Presenta este QR en la caseta</div></div><div className="share-buttons"><Button onClick={share}><Share2 size={17}/> Compartir pase</Button><Button className="secondary" disabled={!ready} onClick={download}><Download size={17}/> Descargar QR</Button></div><label className="copy-label">Enlace del pase<div className="input-action"><input aria-label="Enlace del pase" value={url} readOnly onFocus={e => e.target.select()}/><button onClick={copy} aria-label="Copiar enlace">{copied ? <Check size={18}/> : <Copy size={18}/>}</button></div></label><p className="copy-feedback" role="status">{copied ? 'Enlace copiado. Ya puedes enviarlo a tu visitante.' : ''}</p><ErrorBox message={error}/><p className="muted small">Compártelo únicamente con tu visitante. La caseta comprobará su vigencia al llegar.</p></div>;
}
export function PublicPass() {
  const online = useOnline(); const [connected, setConnected] = useState<boolean | null>(null);
  const path = location.pathname; let token = ''; try { token = extractToken(location.origin + path); } catch { /* invalid view */ }
  useEffect(() => { if (online) api('/health', { public: true }).then(() => setConnected(true)).catch(() => setConnected(false)); }, [online]);
  return <div className="public-pass-page"><Brand/><div className="public-card"><h1>Tu pase de visita</h1><p>Muestra este QR en la caseta. El personal confirmará tu acceso al llegar.</p>{token ? <SharePass url={`${location.origin}/p/${token}`}/> : <ErrorBox message="El enlace está incompleto o no es válido. Pide al residente que te comparta el pase de nuevo."/>}{(!online || connected === false) && <div className="info-box">Puedes mostrar este QR sin conexión. La caseta necesita conexión para validar tu acceso.</div>}</div><p className="public-footer">Zentry. Te damos la bienvenida.</p></div>;
}
