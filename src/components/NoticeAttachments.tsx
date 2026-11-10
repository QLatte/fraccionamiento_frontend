import { useEffect, useRef, useState } from 'react';
import { FileText, LoaderCircle, Paperclip, X } from 'lucide-react';
import { apiFile, apiUpload, errorText } from '../api';
import { Modal } from './ui';

// Images and PDFs of a comunicado. Files are protected (they need the session), so they are
// fetched and shown from memory, never through a public link.
export type Attachment = { id: string; name: string; mime: string; size: number };
export const MAX_FILES = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

export const sizeText = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const isImage = (mime: string) => mime.startsWith('image/');

/** Phone photos weigh several MB: shrink to 1600 px JPEG before uploading. Keeps the original when that is smaller. */
async function compress(file: File): Promise<Blob> {
  if (!isImage(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

type Upload = { key: string; name: string; status: 'uploading' | 'ready' | 'error'; preview?: string; attachment?: Attachment; error?: string };

/** Picks, compresses and uploads files right away; `onChange` gets the ids ready to publish and whether any is still uploading. */
export function AttachmentPicker({ onChange }: { onChange: (ids: string[], busy: boolean) => void }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { onChange(uploads.filter(u => u.status === 'ready').map(u => u.attachment!.id), uploads.some(u => u.status === 'uploading')); }, [uploads]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => uploads.forEach(u => u.preview && URL.revokeObjectURL(u.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (key: string, patch: Partial<Upload>) => setUploads(list => list.map(u => u.key === key ? { ...u, ...patch } : u));
  async function add(files: FileList | null) {
    const room = MAX_FILES - uploads.filter(u => u.status !== 'error').length;
    for (const file of Array.from(files ?? []).slice(0, Math.max(0, room))) {
      const key = crypto.randomUUID();
      setUploads(list => [...list, { key, name: file.name, status: 'uploading', preview: isImage(file.type) ? URL.createObjectURL(file) : undefined }]);
      try {
        if (!ACCEPT.split(',').includes(file.type)) throw new Error('Solo imágenes (JPG, PNG o WebP) y archivos PDF.');
        const body = await compress(file);
        if (body.size > MAX_BYTES) throw new Error('Cada archivo puede pesar hasta 5 MB.');
        const attachment = await apiUpload<Attachment>('/admin/notices/attachments', body, body === file ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg');
        update(key, { status: 'ready', attachment });
      } catch (e) { update(key, { status: 'error', error: errorText(e) }); }
    }
    if (input.current) input.current.value = '';
  }
  const full = uploads.filter(u => u.status !== 'error').length >= MAX_FILES;
  return <div className="attach-picker">
    {!!uploads.length && <ul className="attach-uploads">{uploads.map(u => <li key={u.key} className={u.status}>
      {u.preview ? <img src={u.preview} alt=""/> : <span className="attach-icon"><FileText size={20}/></span>}
      <span><strong>{u.name}</strong><small>{u.status === 'uploading' ? 'Subiendo…' : u.status === 'error' ? u.error : sizeText(u.attachment!.size)}</small></span>
      {u.status === 'uploading' ? <LoaderCircle className="spin" size={18}/> : <button type="button" className="icon-button" aria-label={`Quitar ${u.name}`} onClick={() => setUploads(list => list.filter(x => x.key !== u.key))}><X size={17}/></button>}
    </li>)}</ul>}
    {!full && <label className="attach-add"><Paperclip size={17}/> Adjuntar imagen o PDF<input ref={input} type="file" accept={ACCEPT} multiple onChange={e => void add(e.target.files)}/></label>}
    <small className="muted">Hasta {MAX_FILES} archivos de 5 MB. Las fotos se comprimen solas.</small>
  </div>;
}

/** A notice's files: images as thumbnails (tap to enlarge), PDFs as cards that open the document. */
export function AttachmentList({ attachments, pathFor }: { attachments: Attachment[]; pathFor: (id: string) => string }) {
  const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState('');
  if (!attachments.length) return null;
  async function openPdf(a: Attachment) {
    setError('');
    // Open the tab during the tap (popup blockers), then point it at the file once it arrives.
    const tab = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await apiFile(pathFor(a.id)));
      if (tab) tab.location.href = url;
      else { const link = document.createElement('a'); link.href = url; link.download = a.name; link.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { tab?.close(); setError(errorText(e)); }
  }
  return <div className="attach-list">
    <div className="attach-images">{attachments.filter(a => isImage(a.mime)).map(a => <Thumb key={a.id} attachment={a} path={pathFor(a.id)} onOpen={(url) => setViewing({ url, name: a.name })}/>)}</div>
    {attachments.filter(a => !isImage(a.mime)).map(a => <button key={a.id} type="button" className="attach-file" onClick={() => void openPdf(a)}>
      <span className="attach-icon"><FileText size={20}/></span><span><strong>{a.name}</strong><small>PDF · {sizeText(a.size)}</small></span><span className="attach-open">Abrir</span>
    </button>)}
    {error && <small className="danger-text">{error}</small>}
    {viewing && <Modal title={viewing.name} onClose={() => setViewing(null)}><img className="attach-full" src={viewing.url} alt={viewing.name}/></Modal>}
  </div>;
}

function Thumb({ attachment, path, onOpen }: { attachment: Attachment; path: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState(''), [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true, created = '';
    apiFile(path).then(blob => { created = URL.createObjectURL(blob); if (alive) setUrl(created); else URL.revokeObjectURL(created); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [path]);
  return <button type="button" className="attach-thumb" disabled={!url} aria-label={`Ver ${attachment.name}`} onClick={() => onOpen(url)}>
    {url ? <img src={url} alt={attachment.name}/> : failed ? <small>No se pudo cargar</small> : <span className="skeleton" style={{ width: '100%', height: '100%' }}/>}
  </button>;
}
