import { api } from './api';

// Web Push for visit entry/exit alerts. iPhone only allows it once Zentry is
// installed on the home screen (iOS 16.4+); other browsers support it in a tab.
export type PushSupport = 'ok' | 'install' | 'unsupported';

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function pushSupport(): PushSupport {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok';
  return isIOS() && !standalone() ? 'install' : 'unsupported';
}

/** The service worker is only registered in production builds. */
export async function pushRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

function keyBytes(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - base64url.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
function sameKey(current: ArrayBuffer | null, expected: Uint8Array) {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((b, i) => b === expected[i]);
}

export async function pushSubscribed(propertyId: string) {
  const subscription = await (await pushRegistration())?.pushManager.getSubscription();
  if (!subscription) return false;
  const status = await api<{ subscribed: boolean }>(`/push/subscriptions?propertyId=${propertyId}&endpoint=${encodeURIComponent(subscription.endpoint)}`);
  return status.subscribed;
}

/** Must run from a tap: browsers only show the permission prompt after a user gesture. */
export async function enablePush(propertyId: string) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('No diste permiso para mostrar notificaciones. Puedes activarlo en los ajustes del navegador.');
  const registration = await pushRegistration();
  if (!registration) throw new Error('Los avisos solo funcionan en la app publicada. Recarga Zentry e inténtalo de nuevo.');
  const { publicKey } = await api<{ publicKey: string | null }>('/push/key');
  if (!publicKey) throw new Error('Los avisos aún no están configurados en el servidor.');
  const key = keyBytes(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  // A subscription created with another server key cannot receive our messages.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) { await subscription.unsubscribe(); subscription = null; }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const { endpoint, keys } = subscription.toJSON();
  await api('/push/subscriptions', { method: 'POST', body: { propertyId, subscription: { endpoint, keys } } });
}

/** Stops alerts on this device: for one home, or for all of them (used on logout). */
export async function disablePush(propertyId?: string) {
  const subscription = await (await pushRegistration())?.pushManager.getSubscription();
  if (!subscription) return;
  await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint, ...(propertyId ? { propertyId } : {}) } });
}
