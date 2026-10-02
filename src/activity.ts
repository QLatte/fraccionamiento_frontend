import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { ActivityItem } from './types';

// Last time this device opened Actividad for a household. A per-device convenience
// for the unread dot; the feed itself always comes from the server.
const seenKey = (propertyId: string) => `zentry:activity-seen:${propertyId}`;
const SEEN_EVENT = 'zentry:activity-seen';

export function lastSeen(propertyId: string) {
  try { return localStorage.getItem(seenKey(propertyId)); } catch { return null; }
}
export function markSeen(propertyId: string, at: string) {
  try { localStorage.setItem(seenKey(propertyId), at); } catch { /* The dot just stays until next visit. */ }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** How many activity events arrived since this device last opened Actividad. */
export function useActivityUnread(propertyId: string | undefined) {
  const [count, setCount] = useState(0);
  const load = useCallback(async () => {
    if (!propertyId) return setCount(0);
    const since = lastSeen(propertyId);
    // Never opened here: no badge for 30 days of history, just start counting from now.
    if (!since) { markSeen(propertyId, new Date().toISOString()); return setCount(0); }
    try { setCount((await api<{ data: ActivityItem[] }>(`/activity?propertyId=${propertyId}&since=${encodeURIComponent(since)}`)).data.length); }
    catch { /* Keep the last count; polling retries. */ }
  }, [propertyId]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) void load(); };
    const poll = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener(SEEN_EVENT, load as EventListener);
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', refresh); window.removeEventListener(SEEN_EVENT, load as EventListener); };
  }, [load]);
  return count;
}
