let financialEpoch = 0;
let financialBlocked = false;
const financialListeners = new Set<() => void>();
export const financialState = () => `${financialEpoch}:${financialBlocked}`;
export const subscribeFinancial = (listener: () => void) => { financialListeners.add(listener); return () => { financialListeners.delete(listener); }; };
export function invalidateFinancial(blocked = false) { financialEpoch++; financialBlocked = blocked; financialListeners.forEach(listener => listener()); }
window.addEventListener('offline', () => invalidateFinancial(true));
window.addEventListener('online', () => invalidateFinancial());
window.addEventListener('pagehide', () => invalidateFinancial(true));
window.addEventListener('pageshow', () => invalidateFinancial());
let token: string | null = null;
export function setToken(value: string | null) { if (token !== value) invalidateFinancial(); token = value; }
// The fraccionamiento a superadmin is administering. Admin requests always name exactly one;
// a community admin's requests are fixed to theirs by the API.
let adminCommunity: string | null = null;
export function setAdminCommunity(value: string | null) { if (adminCommunity !== value) invalidateFinancial(); adminCommunity = value; }
function scoped(path: string) {
  if (!adminCommunity || !(path.startsWith('/admin/') || path.startsWith('/billing/') || path.startsWith('/gate/gates')) || path.includes('communityId=')) return path;
  return path + (path.includes('?') ? '&' : '?') + 'communityId=' + encodeURIComponent(adminCommunity);
}
const base = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const messages: Record<string, string> = {
  DENIED_USED: 'Este pase ya fue utilizado.', DENIED_REVOKED: 'El residente canceló este pase.', DENIED_EXPIRED: 'El pase está fuera de su horario de acceso.', DENIED_NOT_FOUND: 'El pase no es válido para esta caseta.', DENIED_RATE_LIMITED: 'Se alcanzó el límite de lecturas. Espera un minuto.',
  WALK_IN_ALREADY_DECIDED: 'Esta solicitud ya fue respondida.', WALK_IN_EXPIRED: 'La solicitud venció. Si la visita sigue en la caseta, el guardia te llamará.',WALK_IN_WAITING: 'Espera la respuesta de la vivienda antes de llamar.', WALK_IN_NOT_INSIDE: 'Esta visita no tiene una entrada abierta.', WALK_IN_NOT_FOUND: 'La solicitud ya no está disponible.', WALKIN_REJECTED: 'La vivienda no autorizó la entrada.', WALKIN_CANCELLED: 'La solicitud se canceló.', WALKIN_PENDING: 'Esperando respuesta de la vivienda.',
  DENIED_TOO_SOON: 'Este pase entró hace menos de 10 minutos. Si es otra persona, regístrala como visita sin pase.', EXIT_NOT_RECORDED: 'La caseta ya no registra salidas. Recarga la app de caseta.', ID_PHOTO_REQUIRED: 'Falta la foto de la identificación. Recarga la app de caseta si no aparece la opción.', ID_PHOTO_NOT_FOUND: 'La foto ya no está disponible: se borran a los 30 días.',
  UNAUTHENTICATED: 'La sesión terminó o no se pudo verificar. Vuelve a ingresar.', INVALID_CHALLENGE: 'La solicitud de acceso venció. Inténtalo de nuevo.', INVALID_ENROLLMENT: 'La invitación venció o ya se utilizó. Solicita una nueva.', INVALID_WEBAUTHN: 'No se pudo verificar tu llave de acceso. Inténtalo de nuevo.',
NOT_PROPERTY_MEMBER: 'Ya no tienes acceso a esta vivienda. Actualiza tu sesión.', IDEMPOTENCY_CONFLICT: 'Esta acción cambió durante el reintento. Revisa los datos y vuelve a abrir el formulario.', INVALID_GATE_DEVICE: 'Este dispositivo no está autorizado en la caseta.', AUTH_RATE_LIMITED: 'Demasiados intentos. Espera un minuto para volver a ingresar.',
};
export const codeText = (code: string): string | undefined => messages[code];
export function errorText(error: unknown): string {
  if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name)) return 'La operación se canceló o no recibió permiso. Puedes intentarlo de nuevo.';
  return error instanceof Error ? error.message : 'No se pudo completar la acción. Inténtalo de nuevo.';
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; key?: string; token?: string; public?: boolean; station?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const epoch = financialEpoch, financial = path.startsWith('/billing/');
  if (financial && financialBlocked) throw new ApiError(403, 'FINANCIAL_CONTEXT_INVALID', 'Actualiza la sesión para consultar finanzas.');
  if (!navigator.onLine) throw new ApiError(0, 'OFFLINE', 'No tienes conexión. Vuelve a intentarlo cuando estés en línea.');
  const auth = options.public ? null : options.token ?? token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch((options.station ? '/api/v1' : base) + scoped(path), { method: options.method ?? 'GET', cache: 'no-store', credentials: options.station ? 'include' : 'omit', signal: controller.signal,
      headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(options.key ? { 'Idempotency-Key': options.key } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (financial && epoch !== financialEpoch) throw new DOMException('Contexto financiero cambiado', 'AbortError');
    if (financial && [401, 403].includes(response.status)) {
      // Headers already establish revocation; never wait for a slow/error response body to clear private data.
      invalidateFinancial(true);
      if (response.status === 401 && auth && auth === token && !options.token && !options.public) window.dispatchEvent(new Event('sica:expired'));
      throw new ApiError(response.status, 'FINANCIAL_CONTEXT_INVALID', 'Ya no tienes autorización para consultar esta información financiera.');
    }
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => null);
    if (financial && epoch !== financialEpoch) throw new DOMException('Contexto financiero cambiado', 'AbortError');
    if (!response.ok) {
      // A profile switch revokes the previous token; a request still in flight with it must not end the new session.
      if (response.status === 401 && auth && auth === token && !options.token && !options.public) window.dispatchEvent(new Event('sica:expired'));
      throw new ApiError(response.status, data?.error?.code ?? 'REQUEST_FAILED', messages[data?.error?.code] ?? data?.error?.message ?? 'El servidor no pudo completar la solicitud.');
    }
    if (data === null) throw new ApiError(502, 'INVALID_RESPONSE', 'La respuesta del servidor no es válida.');
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK', 'No pudimos confirmar la respuesta. Reintenta la misma acción; evitaremos duplicarla.');
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}
