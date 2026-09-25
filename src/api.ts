let token: string | null = null;
export function setToken(value: string | null) { token = value; }
const base = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const messages: Record<string, string> = {
  DENIED_USED: 'Este pase ya fue utilizado.', DENIED_REVOKED: 'El residente canceló este pase.', DENIED_EXPIRED: 'El pase está fuera de su horario de acceso.', DENIED_NOT_FOUND: 'El pase no es válido para esta caseta.', DENIED_RATE_LIMITED: 'Se alcanzó el límite de lecturas. Espera un minuto.',
  UNAUTHENTICATED: 'La sesión terminó o no se pudo verificar. Vuelve a ingresar.', INVALID_CHALLENGE: 'La solicitud de acceso venció. Inténtalo de nuevo.', INVALID_ENROLLMENT: 'La invitación venció o ya se utilizó. Solicita una nueva.', INVALID_WEBAUTHN: 'No se pudo verificar tu llave de acceso. Inténtalo de nuevo.',
  DEVICE_LIMIT_REACHED: 'Tu vivienda ya tiene dos dispositivos registrados. Contacta a administración.', NOT_PROPERTY_MEMBER: 'Ya no tienes acceso a esta vivienda. Actualiza tu sesión.', IDEMPOTENCY_CONFLICT: 'Esta acción cambió durante el reintento. Revisa los datos y vuelve a abrir el formulario.', INVALID_GATE_DEVICE: 'Este dispositivo no está autorizado en la caseta.', AUTH_RATE_LIMITED: 'Demasiados intentos. Espera un minuto para volver a ingresar.',
};
export function errorText(error: unknown): string {
  if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name)) return 'La operación se canceló o no recibió permiso. Puedes intentarlo de nuevo.';
  return error instanceof Error ? error.message : 'No se pudo completar la acción. Inténtalo de nuevo.';
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; key?: string; token?: string; public?: boolean; station?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  if (!navigator.onLine) throw new ApiError(0, 'OFFLINE', 'No tienes conexión. Vuelve a intentarlo cuando estés en línea.');
  const auth = options.public ? null : options.token ?? token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(base + path, { method: options.method ?? 'GET', cache: 'no-store', credentials: options.station ? 'include' : 'omit', signal: controller.signal,
      headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(options.key ? { 'Idempotency-Key': options.key } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && auth && !options.token && !options.public) window.dispatchEvent(new Event('sica:expired'));
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
