import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, errorText } from './api';
export function useQuery<T>(path: string | null, interval = 0) {
  const [state, setState] = useState<{ path: string | null; data?: T; error: string; loading: boolean }>({ path, error: '', loading: true });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    if (!path) { setState({ path, error: '', loading: false }); return; }
    const controller = new AbortController();
    setState(s => ({ path, data: s.path === path ? s.data : undefined, error: '', loading: true }));
    api<T>(path, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ path, data, error: '', loading: false }); })
      .catch(e => { if (!controller.signal.aborted) setState(s => ({ ...s, error: errorText(e), loading: false })); });
    return () => controller.abort();
  }, [path, version]);
  useEffect(() => { if (!interval) return; const id = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) refresh(); }, interval); return () => clearInterval(id); }, [interval, refresh]);
  return { data: state.path === path ? state.data : undefined, error: state.path === path ? state.error : '', loading: state.path !== path || state.loading, refresh };
}
export function useMutation() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const pending = useRef<{ signature: string; key: string; started: number } | null>(null);
  const locked = useRef(false);
  const lastCode = useRef('');
  async function run<T>(path: string, method: string, body?: unknown, extras: { token?: string; public?: boolean; station?: boolean } = {}): Promise<T | undefined> {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); lastCode.current = '';
    const signature = JSON.stringify([path, method, body]);
    if (!pending.current || pending.current.signature !== signature) pending.current = { signature, key: crypto.randomUUID(), started: Date.now() };
    if (Date.now() - pending.current.started >= 290000) { locked.current = false; setBusy(false); setError('No pudimos confirmar la acción a tiempo. Revisa el listado antes de iniciar una nueva operación.'); return; }
    try { const data = await api<T>(path, { method, body, key: pending.current.key, ...extras }); pending.current = null; return data ?? (true as T); }
    catch (e) { if (e instanceof ApiError) { lastCode.current = e.code; if (e.status >= 400 && e.status < 500) pending.current = null; } setError(errorText(e)); }
    finally { locked.current = false; setBusy(false); }
  }
  return { run, busy, error, code: () => lastCode.current, clear: () => setError('') };
}
export function useOnline() {
  const [online, set] = useState(navigator.onLine);
  useEffect(() => { const update = () => set(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  return online;
}
export const dateText = (value: string, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', options ?? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export function localInput(at = new Date()) { return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export const statusLabel = { ACTIVE: 'Activo', USED: 'Utilizado', REVOKED: 'Cancelado', EXPIRED: 'Vencido' };
export const typeLabel = { SINGLE_USE: 'Una visita', TEMPORARY: 'Por un periodo', RECURRING: 'Recurrente' };
export function extractToken(value: string) {
  const raw = value.trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(raw)) return raw;
  try { const url = new URL(raw); const token = url.pathname.match(/^\/p\/([A-Za-z0-9_-]{43})\/?$/)?.[1]; if (['https:', 'http:'].includes(url.protocol) && token) return token; } catch { /* raw token checked above */ }
  throw new Error('Este QR no contiene un pase Zentry válido.');
}
