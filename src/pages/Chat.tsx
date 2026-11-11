import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Camera, Copy, CornerUpLeft, ImageOff, MessagesSquare, Pin, PinOff, SendHorizontal, ShieldCheck, UsersRound, VolumeX, X } from 'lucide-react';
import { api, apiFile, apiUpload, ApiError, errorText } from '../api';
import { compressPhoto, openChatStream, type ChatMessage, type ChatPage, type ChatPerson, type StreamState } from '../chat';
import { Button, Empty, ErrorBox, Info, Loading, Modal, toneOf } from '../components/ui';
import TrashIcon from '../components/icons/AnimatedTrash';
import './Chat.css';

const time = (at: string) => new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(at));
function dayLabel(at: string) {
  const d = new Date(at), today = new Date(), yesterday = new Date(Date.now() - 86400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Hoy';
  if (same(d, yesterday)) return 'Ayer';
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}
const mutedText = (until: string | null) => !until ? '' : until === 'indefinite' ? 'hasta que un representante lo quite' : `hasta el ${new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(until))}`;
const firstName = (name: string) => name.split(' ')[0];
const merge = (list: ChatMessage[], message: ChatMessage) => list.some(m => m.id === message.id) ? list.map(m => m.id === message.id ? message : m) : [...list, message].sort((a, b) => a.seq - b.seq);

/** Shows a protected photo: it needs the session, so it is downloaded and shown from memory. */
function ChatPhoto({ clusterId, id, onOpen }: { clusterId: string; id: string; onOpen?: (url: string) => void }) {
  const [url, setUrl] = useState(''); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true, made = '';
    apiFile(`/chat/${clusterId}/photos/${id}`).then(blob => { made = URL.createObjectURL(blob); if (alive) setUrl(made); else URL.revokeObjectURL(made); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [clusterId, id]);
  if (failed) return <span className="chat-photo missing"><ImageOff size={20}/> Foto no disponible</span>;
  return <button type="button" className="chat-photo" aria-label="Ver foto" disabled={!url} onClick={e => { e.stopPropagation(); if (url) onOpen?.(url); }}>{url ? <img src={url} alt=""/> : <span className="skeleton-block"/>}</button>;
}

export function Chat({ clusterId, unread = 0, onRead, onBack }: { clusterId: string; unread?: number; onRead?: () => void; onBack?: () => void }) {
  const [page, setPage] = useState<ChatPage | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinned, setPinned] = useState<ChatMessage | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(''); const [forbidden, setForbidden] = useState(false);
  const [state, setState] = useState<StreamState>('connecting');
  const [olderBusy, setOlderBusy] = useState(false);
  const [text, setText] = useState(''); const [reply, setReply] = useState<ChatMessage | null>(null);
  const [photo, setPhoto] = useState<{ id?: string; preview: string; busy: boolean; error?: string } | null>(null);
  const [sending, setSending] = useState(false); const [sendError, setSendError] = useState('');
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState(''); const [people, setPeople] = useState(false);
  const [version, setVersion] = useState(0);
  const list = useRef<HTMLDivElement>(null); const input = useRef<HTMLTextAreaElement>(null); const file = useRef<HTMLInputElement>(null);
  const lastSeq = useRef(0); const readSeq = useRef(0); const stick = useRef(true); const listHeight = useRef(0); const restore = useRef<number | null>(null);
  // Where «Mensajes nuevos» goes: fixed when the chat opens, so it does not jump while reading.
  const [firstUnread, setFirstUnread] = useState<string | null>(null);
  const me = page?.me;

  useEffect(() => {
    let alive = true;
    setPage(null); setError(''); setForbidden(false);
    api<ChatPage>(`/chat/${clusterId}/messages`).then(p => {
      if (!alive) return;
      setPage(p); setMessages(p.data); setPinned(p.pinned); setHasMore(p.hasMore);
      lastSeq.current = p.data.at(-1)?.seq ?? 0;
      const others = p.data.filter(m => m.author.id !== p.me.userId && !m.deleted);
      setFirstUnread(unread > 0 && others.length ? others[Math.max(0, others.length - unread)].id : null);
    }).catch(e => { if (!alive) return; if (e instanceof ApiError && e.code === 'CHAT_FORBIDDEN') setForbidden(true); else setError(errorText(e)); });
    return () => { alive = false; };
    // `unread` is only read when the chat opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, version]);

  // Live messages, once the first page is in.
  const loaded = !!page;
  useEffect(() => {
    if (!loaded) return;
    return openChatStream(clusterId, () => lastSeq.current, ({ type, message }) => {
      if (type === 'message') lastSeq.current = Math.max(lastSeq.current, message.seq);
      setMessages(list => type === 'update' && !list.some(m => m.id === message.id) ? list : merge(list, message));
      setPinned(current => message.pinned ? message : current?.id === message.id ? null : current);
    }, setState);
  }, [clusterId, loaded]);

  // Marks as read what is on screen while the app is visible.
  const markRead = useCallback(() => {
    const seq = lastSeq.current;
    if (!seq || seq <= readSeq.current || document.visibilityState !== 'visible' || !stick.current) return;
    readSeq.current = seq;
    api(`/chat/${clusterId}/read`, { method: 'POST', body: { seq } }).then(() => onRead?.()).catch(() => { readSeq.current = 0; });
  }, [clusterId, onRead]);
  useEffect(() => { const id = setTimeout(markRead, 600); return () => clearTimeout(id); }, [messages, markRead]);
  useEffect(() => { document.addEventListener('visibilitychange', markRead); return () => document.removeEventListener('visibilitychange', markRead); }, [markRead]);

  // Keeps the view at the bottom for new messages, and in place when older ones load above.
  useLayoutEffect(() => {
    const el = list.current; if (!el) return;
    if (restore.current !== null) { el.scrollTop = el.scrollHeight - restore.current; restore.current = null; return; }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, loaded]);
  useEffect(() => {
    const el = list.current; if (!el) return;
    const observer = new ResizeObserver(() => { listHeight.current = el.clientHeight; if (stick.current) el.scrollTop = el.scrollHeight; });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loaded]);
  async function loadOlder() {
    if (olderBusy || !hasMore || !messages.length) return;
    setOlderBusy(true);
    try {
      const older = await api<ChatPage>(`/chat/${clusterId}/messages?before=${messages[0].seq}`);
      restore.current = list.current ? list.current.scrollHeight - list.current.scrollTop : null;
      setMessages(list => [...older.data.filter(o => !list.some(m => m.id === o.id)), ...list]); setHasMore(older.hasMore);
    } catch (e) { setError(errorText(e)); } finally { setOlderBusy(false); }
  }
  function onScroll() {
    const el = list.current!;
    // A resize (the keyboard opening) also fires scroll; only the person's own scrolling counts.
    if (el.clientHeight !== listHeight.current) { listHeight.current = el.clientHeight; if (stick.current) el.scrollTop = el.scrollHeight; return; }
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current) markRead();
    if (el.scrollTop < 120) void loadOlder();
  }

  async function pickPhoto(chosen: File | undefined) {
    if (!chosen) return;
    if (!chosen.type.startsWith('image/')) { setSendError('Solo puedes enviar fotos.'); return; }
    const preview = URL.createObjectURL(chosen);
    setPhoto({ preview, busy: true }); setSendError('');
    try {
      const blob = await compressPhoto(chosen);
      const uploaded = await apiUpload<{ id: string }>(`/chat/${clusterId}/photos`, blob, chosen.name);
      setPhoto(p => p?.preview === preview ? { ...p, id: uploaded.id, busy: false } : p);
    } catch (e) { setPhoto(p => p?.preview === preview ? { ...p, busy: false, error: errorText(e) } : p); }
  }
  function clearPhoto() { if (photo) URL.revokeObjectURL(photo.preview); setPhoto(null); if (file.current) file.current.value = ''; }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (sending || photo?.busy || (!body && !photo?.id)) return;
    setSending(true); setSendError('');
    try {
      const sent = await api<ChatMessage>(`/chat/${clusterId}/messages`, { method: 'POST', body: { body, ...(photo?.id ? { photoId: photo.id } : {}), ...(reply ? { replyToId: reply.id } : {}) } });
      stick.current = true; lastSeq.current = Math.max(lastSeq.current, sent.seq);
      setMessages(list => merge(list, sent)); setText(''); setReply(null); clearPhoto(); setFirstUnread(null);
      input.current?.focus();
    } catch (err) {
      setSendError(errorText(err));
      if (err instanceof ApiError && err.code === 'CHAT_MUTED') setVersion(v => v + 1);
    } finally { setSending(false); }
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on a computer; on a phone the key adds a line, and the button sends.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); void send(); }
  }
  useLayoutEffect(() => { const el = input.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; }, [text]);

  function jumpTo(id: string) {
    const el = list.current?.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  const rows = useMemo(() => {
    const out: ({ kind: 'day'; key: string; label: string } | { kind: 'new'; key: string } | { kind: 'msg'; key: string; m: ChatMessage; first: boolean; last: boolean })[] = [];
    messages.forEach((m, i) => {
      const prev = messages[i - 1], next = messages[i + 1];
      const day = new Date(m.createdAt).toDateString();
      if (!prev || new Date(prev.createdAt).toDateString() !== day) out.push({ kind: 'day', key: 'd' + m.id, label: dayLabel(m.createdAt) });
      if (m.id === firstUnread) out.push({ kind: 'new', key: 'n' + m.id });
      const near = (a?: ChatMessage, b?: ChatMessage) => !!a && !!b && a.author.id === b.author.id && Math.abs(+new Date(a.createdAt) - +new Date(b.createdAt)) < 5 * 60_000 && new Date(a.createdAt).toDateString() === new Date(b.createdAt).toDateString() && b.id !== firstUnread;
      out.push({ kind: 'msg', key: m.id, m, first: !near(prev, m), last: !near(m, next) });
    });
    return out;
  }, [messages, firstUnread]);

  if (forbidden) return <section className="panel"><Empty icon={<MessagesSquare/>} title="El chat es para los propietarios" text="El chat de la privada reúne a los propietarios de cada casa. Si eres propietario y no lo ves, pide a administración que revise tu vivienda."/></section>;
  if (!page) return error ? <section className="panel"><ErrorBox message={error} retry={() => setVersion(v => v + 1)}/></section> : <section className="chat"><Loading rows={5}/></section>;

  const canSend = !me?.mutedUntil;
  return <section className="chat" aria-label={`Chat de ${page.cluster.name}`}>
    <header className="chat-head">
      {onBack && <button type="button" className="icon-button chat-back" aria-label="Volver" onClick={onBack}><ArrowLeft size={22}/></button>}
      <span className="chat-head-icon"><MessagesSquare size={20}/></span>
      <div><h1>{page.cluster.type === 'PRIVADA' ? 'Privada ' : ''}{page.cluster.name}</h1><p><span className={'chat-state ' + state}/>{state === 'live' ? 'En vivo · solo propietarios' : state === 'connecting' ? 'Conectando…' : 'Sin conexión'}{me?.representative && <span className="chat-rep"> · <ShieldCheck size={13}/> Representante</span>}</p></div>
      <button type="button" className="icon-button" aria-label="Vecinos del chat" onClick={() => setPeople(true)}><UsersRound size={19}/></button>
    </header>
    {pinned && <button type="button" className="chat-pinned" onClick={() => jumpTo(pinned.id)}><Pin size={16}/><span><small>Mensaje fijado · {firstName(pinned.author.name)}</small><strong>{pinned.body || 'Foto'}</strong></span></button>}
    <div className="chat-list" ref={list} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
      {hasMore ? <div className="chat-older">{olderBusy ? 'Cargando mensajes anteriores…' : <button type="button" onClick={() => void loadOlder()}>Ver mensajes anteriores</button>}</div>
        : <div className="chat-start"><MessagesSquare size={22}/><strong>Inicio de la conversación</strong><span>Ves los mensajes de los últimos 30 días antes de tu llegada. Solo los propietarios de la privada participan.</span></div>}
      {rows.map(row => row.kind === 'day' ? <div key={row.key} className="chat-day"><span>{row.label}</span></div>
        : row.kind === 'new' ? <div key={row.key} className="chat-new"><span>Mensajes nuevos</span></div>
        : <Bubble key={row.key} m={row.m} mine={row.m.author.id === me?.userId} first={row.first} last={row.last} clusterId={clusterId} onSelect={() => !row.m.deleted && setSelected(row.m)} onJump={jumpTo} onPhoto={setViewer}/>)}
      {!messages.length && <div className="chat-empty"><strong>Aún no hay mensajes</strong><span>Saluda a tus vecinos o comparte algo de la privada.</span></div>}
    </div>
    <ErrorBox message={error}/>
    {canSend ? <form className="chat-compose" onSubmit={send}>
      {(reply || photo) && <div className="chat-attach">
        {reply && <div className="chat-reply-chip"><CornerUpLeft size={15}/><span><small>Respondiendo a {firstName(reply.author.name)}</small>{reply.body || 'Foto'}</span><button type="button" className="icon-button" aria-label="Cancelar respuesta" onClick={() => setReply(null)}><X size={16}/></button></div>}
        {photo && <div className={'chat-photo-chip' + (photo.error ? ' error' : '')}><img src={photo.preview} alt=""/><span>{photo.error ?? (photo.busy ? 'Subiendo foto…' : 'Foto lista')}</span><button type="button" className="icon-button" aria-label="Quitar foto" onClick={clearPhoto}><X size={16}/></button></div>}
      </div>}
      {sendError && <p className="chat-send-error" role="alert">{sendError}</p>}
      <div className="chat-compose-row">
        <input ref={file} type="file" accept="image/*" hidden onChange={e => void pickPhoto(e.target.files?.[0])}/>
        <button type="button" className="icon-button chat-camera" aria-label="Adjuntar foto" disabled={!!photo} onClick={() => file.current?.click()}><Camera size={20}/></button>
        <textarea ref={input} rows={1} maxLength={2000} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} placeholder="Mensaje" aria-label="Mensaje" enterKeyHint="send"/>
        <button type="submit" className="chat-send" aria-label="Enviar" disabled={sending || !!photo?.busy || (!text.trim() && !photo?.id)}><SendHorizontal size={19}/></button>
      </div>
    </form> : <div className="chat-muted"><VolumeX size={18}/><span>Un representante te silenció {mutedText(me!.mutedUntil)}. Puedes leer, pero no escribir.</span></div>}

    {selected && <MessageActions m={selected} mine={selected.author.id === me?.userId} representative={!!me?.representative} clusterId={clusterId} onClose={() => setSelected(null)}
      onReply={() => { setReply(selected); setSelected(null); input.current?.focus(); }}
      onChanged={m => { setMessages(list => merge(list, m)); setPinned(current => m.pinned ? m : current?.id === m.id ? null : current); setSelected(null); }}/>}
    {viewer && <Modal title="Foto" onClose={() => setViewer('')}><img className="attach-full" src={viewer} alt="Foto enviada al chat"/></Modal>}
    {people && <People clusterId={clusterId} representative={!!me?.representative} myId={me!.userId} onClose={() => setPeople(false)}/>}
  </section>;
}

function Bubble({ m, mine, first, last, clusterId, onSelect, onJump, onPhoto }: { m: ChatMessage; mine: boolean; first: boolean; last: boolean; clusterId: string; onSelect: () => void; onJump: (id: string) => void; onPhoto: (url: string) => void }) {
  return <div className={['chat-row', mine ? 'mine' : '', first ? 'first' : '', last ? 'last' : ''].filter(Boolean).join(' ')} data-id={m.id}>
    {!mine && <span className={'chat-avatar' + (last ? ' ' + toneOf(m.author.id) : '')} aria-hidden="true">{last ? m.author.name.slice(0, 1) : ''}</span>}
    <div className={'chat-bubble' + (m.deleted ? ' deleted' : '') + (m.photo && !m.body ? ' photo-only' : '')} role={m.deleted ? undefined : 'button'} tabIndex={m.deleted ? undefined : 0} aria-haspopup={m.deleted ? undefined : 'dialog'} onClick={onSelect} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onSelect(); }}>
      {!mine && first && <span className={'chat-author ' + toneOf(m.author.id)}>{m.author.name}{m.author.home && <small> · Casa {m.author.home}</small>}</span>}
      {m.replyTo && <button type="button" className="chat-quote" onClick={e => { e.stopPropagation(); onJump(m.replyTo!.id); }}><strong>{firstName(m.replyTo.author)}</strong><span>{m.replyTo.preview}</span></button>}
      {m.photo && <ChatPhoto clusterId={clusterId} id={m.photo.id} onOpen={onPhoto}/>}
      {m.deleted ? <p className="chat-text"><TrashIcon size={14}/> Mensaje eliminado</p> : m.body && <p className="chat-text">{m.body}</p>}
      <span className="chat-meta">{m.pinned && <Pin size={11} aria-label="Fijado"/>}{time(m.createdAt)}</span>
    </div>
  </div>;
}

function MessageActions({ m, mine, representative, clusterId, onClose, onReply, onChanged }: { m: ChatMessage; mine: boolean; representative: boolean; clusterId: string; onClose: () => void; onReply: () => void; onChanged: (m: ChatMessage) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false); const [copied, setCopied] = useState(false);
  async function act(path: string, body: unknown) {
    setBusy(true); setError('');
    try { onChanged(await api<ChatMessage>(`/chat/${clusterId}/messages/${m.id}/${path}`, { method: 'POST', body })); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <Modal title={confirm ? '¿Eliminar este mensaje?' : 'Mensaje'} onClose={() => { if (!busy) onClose(); }}>
    <div className="chat-action-preview"><small>{m.author.name} · {time(m.createdAt)}</small><p>{m.body || 'Foto'}</p></div>
    {confirm ? <>
      <Info>{mine ? 'Tus vecinos verán «Mensaje eliminado» en su lugar.' : 'Como representante puedes quitar mensajes que no respeten las reglas de la privada. Se verá «Mensaje eliminado».'}</Info>
      <ErrorBox message={error}/>
      <div className="modal-actions"><Button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>Conservar</Button><Button className="danger" busy={busy} onClick={() => void act('delete', {})}><TrashIcon size={17}/> Eliminar</Button></div>
    </> : <>
      <div className="chat-actions">
        <button type="button" onClick={onReply}><CornerUpLeft size={18}/> Responder</button>
        {m.body && <button type="button" onClick={() => { void navigator.clipboard?.writeText(m.body!).then(() => setCopied(true)); }}><Copy size={18}/> {copied ? 'Copiado' : 'Copiar texto'}</button>}
        {representative && <button type="button" disabled={busy} onClick={() => void act('pin', { pinned: !m.pinned })}>{m.pinned ? <><PinOff size={18}/> Quitar de fijados</> : <><Pin size={18}/> Fijar arriba</>}</button>}
        {(mine || representative) && <button type="button" className="danger-text" onClick={() => setConfirm(true)}><TrashIcon size={18}/> Eliminar</button>}
      </div>
      <ErrorBox message={error}/>
    </>}
  </Modal>;
}

const muteOptions = [{ label: '1 hora', minutes: 60 }, { label: '24 horas', minutes: 1440 }, { label: '7 días', minutes: 10080 }, { label: 'Hasta que lo quite', minutes: null }];
function People({ clusterId, representative, myId, onClose }: { clusterId: string; representative: boolean; myId: string; onClose: () => void }) {
  const [list, setList] = useState<ChatPerson[] | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const [muting, setMuting] = useState<ChatPerson | null>(null);
  const load = useCallback(() => { api<{ data: ChatPerson[] }>(`/chat/${clusterId}/people`).then(r => setList(r.data)).catch(e => setError(errorText(e))); }, [clusterId]);
  useEffect(load, [load]);
  async function mute(person: ChatPerson, minutes: number | null) {
    setBusy(person.userId); setError('');
    try { await api(`/chat/${clusterId}/mutes`, { method: 'POST', body: { userId: person.userId, minutes } }); setMuting(null); load(); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  async function unmute(person: ChatPerson) {
    setBusy(person.userId); setError('');
    try { await api(`/chat/${clusterId}/mutes/${person.userId}`, { method: 'DELETE' }); load(); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  return <Modal title={muting ? `Silenciar a ${firstName(muting.name)}` : 'Vecinos del chat'} onClose={() => { if (!busy) { if (muting) setMuting(null); else onClose(); } }}>
    {muting ? <>
      <p className="small muted">No podrá escribir durante este tiempo, pero sí leer. Úsalo solo si alguien no respeta las reglas de la privada.</p>
      <div className="chat-actions">{muteOptions.map(o => <button key={o.label} type="button" disabled={!!busy} onClick={() => void mute(muting, o.minutes)}><VolumeX size={18}/> {o.label}</button>)}</div>
      <ErrorBox message={error}/>
      <div className="modal-actions"><Button className="secondary" disabled={!!busy} onClick={() => setMuting(null)}>Cancelar</Button></div>
    </> : <>
      <ErrorBox message={error}/>
      {!list ? <Loading rows={4}/> : <ul className="chat-people">{list.map(p => <li key={p.userId}>
        <span className={'chat-avatar ' + toneOf(p.userId)}>{p.name.slice(0, 1)}</span>
        <span><strong>{p.name}{p.userId === myId && ' (tú)'}</strong><small>Casa {p.home}{p.representative && ' · Representante'}{p.mutedUntil && ` · Silenciado ${mutedText(p.mutedUntil)}`}</small></span>
        {representative && !p.representative && p.userId !== myId && (p.mutedUntil
          ? <Button className="secondary" busy={busy === p.userId} onClick={() => void unmute(p)}>Quitar silencio</Button>
          : <button type="button" className="icon-button" aria-label={`Silenciar a ${p.name}`} onClick={() => setMuting(p)}><VolumeX size={18}/></button>)}
      </li>)}</ul>}
      {!representative && <p className="small muted">Los representantes de la privada, elegidos por administración, pueden fijar mensajes, quitar mensajes y silenciar a quien no respete las reglas.</p>}
    </>}
  </Modal>;
}
