import { base, currentToken } from './api';

export type ChatMessage = {
  id: string; seq: number; clusterId: string; createdAt: string;
  author: { id: string; name: string; home: string | null };
  body: string | null; photo: { id: string; mime: string; size: number } | null;
  deleted: boolean; pinned: boolean;
  replyTo: { id: string; author: string; preview: string } | null;
};
export type ChatRoom = { clusterId: string; name: string; type: string; unread: number; last: { author: string; preview: string; at: string } | null };
export type ChatPage = { data: ChatMessage[]; hasMore: boolean; pinned: ChatMessage | null; me: { userId: string; representative: boolean; mutedUntil: string | null }; cluster: { id: string; name: string; type: string } };
export type ChatPerson = { userId: string; name: string; home: string; representative: boolean; mutedUntil: string | null };
export type StreamEvent = { type: 'message' | 'update'; message: ChatMessage };
export type StreamState = 'connecting' | 'live' | 'offline';

/**
 * Live messages of a privada over Server-Sent Events. EventSource cannot send the session
 * header, so the stream is read with fetch. It reconnects on its own and resumes after the
 * last message received, so nothing is lost while the phone was asleep or offline.
 */
export function openChatStream(clusterId: string, after: () => number, onEvent: (event: StreamEvent) => void, onState: (state: StreamState) => void) {
  let stopped = false, live = false, controller: AbortController | null = null, retry = 1000, timer: ReturnType<typeof setTimeout> | undefined;
  async function connect() {
    if (stopped) return;
    if (!navigator.onLine) { onState('offline'); return; }
    onState('connecting');
    controller = new AbortController();
    try {
      const token = currentToken();
      const response = await fetch(`${base}/chat/${clusterId}/stream?after=${after()}`, { cache: 'no-store', credentials: 'omit', signal: controller.signal, headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (response.status === 401) { window.dispatchEvent(new Event('sica:expired')); stopped = true; onState('offline'); return; }
      // 403: no longer an owner of this privada; nothing to reconnect to.
      if (response.status === 403) { stopped = true; onState('offline'); return; }
      if (!response.ok || !response.body) throw new Error('stream');
      onState('live'); live = true; retry = 1000;
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          let type = 'message', data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) type = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (data && (type === 'message' || type === 'update')) { try { onEvent({ type, message: JSON.parse(data) }); } catch { /* A broken event is skipped. */ } }
        }
      }
    } catch { /* Network error or aborted: reconnect below. */ }
    live = false;
    if (stopped) return;
    onState('connecting');
    timer = setTimeout(connect, retry); retry = Math.min(retry * 2, 15000);
  }
  const online = () => { clearTimeout(timer); retry = 1000; controller?.abort(); void connect(); };
  const offline = () => { controller?.abort(); onState('offline'); };
  // A phone that comes back from the background reconnects right away.
  const visible = () => { if (document.visibilityState === 'visible' && !stopped && !live) online(); };
  window.addEventListener('online', online); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', visible);
  void connect();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); window.removeEventListener('online', online); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
}

/** Shrinks a photo before upload: phone photos are several MB and the chat shows them small. */
export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}
