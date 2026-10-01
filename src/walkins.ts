import type { IdDocumentType, WalkInReason } from './types';

export const reasonLabel: Record<WalkInReason, string> = { VISIT: 'Visita', DELIVERY: 'Repartidor', SERVICE: 'Servicio o técnico', OTHER: 'Otro motivo' };
export const idTypeLabel: Record<IdDocumentType, string> = { INE: 'INE', LICENSE: 'Licencia', PASSPORT: 'Pasaporte', OTHER: 'Otra identificación' };

/** "2:41" left until `expiresAt`, or null once the wait is over. */
export function countdown(expiresAt: string, now = Date.now()) {
  const left = Math.ceil((new Date(expiresAt).getTime() - now) / 1000);
  return left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : null;
}
