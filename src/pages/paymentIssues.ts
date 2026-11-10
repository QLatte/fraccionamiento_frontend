// Why a payment task or provider event needs review, in words a treasurer can act on.
// Stripe refusals arrive as `STRIPE_REQUEST_FAILED:<status>:<code or type>:<param>`.

export type PaymentIssue = { text: string; /** Retrying the same request will fail again until the cause is fixed. */ fixFirst: boolean };

const KIND: Record<string, string> = { CHECKOUT: 'Pago con tarjeta', CUSTOMER: 'Datos SPEI', CUSTOMER_LINK: 'Vincular cliente de Stripe', DEPOSIT: 'Depósito SPEI', REFUND: 'Devolución' };
export const taskKind = (kind: string) => KIND[kind] ?? kind;

const RETURN_URL = 'La dirección de regreso de Stripe no es válida. Revisa APP_ORIGIN en el servidor (Render).';

function stripeIssue(status: number, code: string, param: string): PaymentIssue {
  if (status === 401 || code === 'api_key_expired') return { text: 'La llave de Stripe del servidor no es válida o venció. Revisa BILLING_STRIPE_SECRET_KEY en Render.', fixFirst: true };
  if (status === 403 || code === 'permission_error') return { text: 'La llave de Stripe no tiene permiso sobre la cuenta del fraccionamiento. Revisa la cuenta en BILLING_STRIPE_ACCOUNTS_JSON.', fixFirst: true };
  if (status === 429 || code === 'rate_limit') return { text: 'Stripe recibió demasiadas solicitudes. Se reintentará sola en un momento.', fixFirst: false };
  if (status >= 500 || code === 'api_error') return { text: 'Stripe tuvo una falla temporal. Se reintentará sola.', fixFirst: false };
  if (code === 'idempotency_key_in_use' || code === 'idempotency_error') return { text: 'Stripe estaba procesando la misma solicitud. Reintenta en unos minutos.', fixFirst: false };
  if (param === 'success_url' || param === 'cancel_url' || code === 'url_invalid') return { text: RETURN_URL, fixFirst: true };
  if (code === 'resource_missing' && param === 'customer') return { text: 'Stripe no encuentra el cliente de esta casa. Suele pasar si cambiaron la llave o la cuenta de Stripe después de generar la CLABE de la casa.', fixFirst: true };
  if (code === 'resource_missing') return { text: `Stripe no encuentra ${param ? `«${param}»` : 'el recurso solicitado'}.`, fixFirst: true };
  if (code === 'amount_too_small') return { text: 'El importe es menor al mínimo que acepta Stripe.', fixFirst: true };
  if (code === 'amount_too_large') return { text: 'El importe supera el máximo que acepta Stripe.', fixFirst: true };
  if (code === 'payment_method_unactivated' || code === 'payment_method_not_available') return { text: 'La cuenta del fraccionamiento en Stripe no tiene activado este medio de pago.', fixFirst: true };
  if (code.startsWith('account_') || code === 'testmode_charges_only' || code === 'livemode_mismatch') return { text: 'La cuenta del fraccionamiento en Stripe no está lista para esta operación (alta incompleta o fuera de modo de prueba).', fixFirst: true };
  if (code.startsWith('parameter_')) return { text: param ? `Stripe rechazó el dato «${param}» de la solicitud.` : 'Stripe rechazó un dato de la solicitud.', fixFirst: true };
  return { text: `Stripe rechazó la solicitud (${code || 'sin código'}${param ? `, dato «${param}»` : ''}).`, fixFirst: status >= 400 && status < 500 };
}

const KNOWN: Record<string, PaymentIssue> = {
  STRIPE_REQUEST_FAILED: { text: 'Stripe rechazó la solicitud. Este registro es anterior a que se guardara el motivo: usa «Reintentar» una vez para obtenerlo, o búscalo en Stripe → Desarrolladores → Registros.', fixFirst: false },
  IDEMPOTENCY_WINDOW_EXPIRED: { text: 'Pasaron más de 23 horas sin respuesta segura de Stripe. Verifica en Stripe si la operación existe y vincúlala; no se puede repetir.', fixFirst: true },
  PAYER_REVOKED: { text: 'Quien pidió el pago ya no es el titular financiero de la casa.', fixFirst: true },
  CUSTOMER_NOT_READY: { text: 'La casa aún no tiene sus datos SPEI listos.', fixFirst: false },
  PROVIDER_UNAVAILABLE: { text: 'No se pudo hablar con Stripe o su respuesta no fue la esperada. Se reintentará.', fixFirst: false },
  PAYMENT_MISMATCH: { text: 'El importe, la moneda o la casa del pago no coinciden con la solicitud. No se acreditó nada.', fixFirst: true },
  UNMATCHED_PAYMENT: { text: 'Stripe reporta un pago que no corresponde a ninguna solicitud de Zentry.', fixFirst: true },
  UNMATCHED_DEPOSIT: { text: 'Llegó un depósito que no corresponde a ninguna casa o no está en MXN. El dinero se conserva sin acreditar.', fixFirst: true },
  INVALID_DEPOSIT: { text: 'Stripe reportó un depósito sin importe o fecha válidos.', fixFirst: true },
  DEPOSIT_IDENTITY_MISMATCH: { text: 'Stripe contradice un depósito ya registrado.', fixFirst: true },
  DEPOSIT_CONSUMPTION_MISMATCH: { text: 'El cobro del depósito en Stripe no coincide con los depósitos acreditados.', fixFirst: true },
  LEGACY_DEPOSIT_UNCERTAIN: { text: 'Depósito anterior a la última actualización: verifica en Stripe si ya se registró antes de acreditarlo.', fixFirst: true },
  PAYMENT_REFERENCE_COLLISION: { text: 'Ya existe un pago manual con la misma referencia. Resuelve si es el mismo ingreso o uno distinto.', fixFirst: true },
  CUSTOMER_SCOPE_MISMATCH: { text: 'Ese cliente de Stripe pertenece a otra casa.', fixFirst: true },
  REFUND_MISMATCH: { text: 'La devolución de Stripe no corresponde a este pago o importe.', fixFirst: true },
  REFUND_FAILED: { text: 'Stripe reporta que la devolución falló.', fixFirst: true },
  CASH_REFUND_UNAVAILABLE: { text: 'El proveedor no permite devolver fondos sin consumir.', fixFirst: true },
  STRIPE_SPEI_UNAVAILABLE: { text: 'Stripe no habilitó SPEI para la cuenta del fraccionamiento.', fixFirst: true },
  STRIPE_MODE_MISMATCH: { text: 'Stripe respondió fuera del modo de prueba. Se rechazó por seguridad.', fixFirst: true },
  DISPUTE_PRINCIPAL_MISMATCH: { text: 'Los movimientos del contracargo en Stripe no cuadran con el pago.', fixFirst: true },
};

export function paymentIssue(code: string | null): PaymentIssue | null {
  if (!code) return null;
  const [base, status, stripeCode = '', param = ''] = code.split(':');
  if (base === 'STRIPE_REQUEST_FAILED' && status) return stripeIssue(Number(status), stripeCode, param);
  return KNOWN[code] ?? { text: `Requiere revisión (${code}).`, fixFirst: false };
}
