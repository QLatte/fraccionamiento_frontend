import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken } from './api';
import type { CreatedPass, Identity, Page, Property, SessionResult } from './types';
type Auth = { links: Record<string, CreatedPass>; rememberPass: (pass: CreatedPass) => void; forgetPass: (id: string) => void; identity: Identity | null; properties: Property[]; property: Property | null; select: (id: string) => void; accept: (session: SessionResult) => Promise<void>; logout: () => Promise<void>; switchProfile: (profile: 'RESIDENT' | 'ADMIN' | 'SUPERADMIN', clusterId?: string) => Promise<void>; expired: boolean };
const Context = createContext<Auth>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [links, setLinks] = useState<Record<string, CreatedPass>>({});
  const [identity, setIdentity] = useState<Identity | null>(null); const [properties, setProperties] = useState<Property[]>([]); const [selected, setSelected] = useState(''); const [expired, setExpired] = useState(false);
  const clear = useCallback(() => { setToken(null); setIdentity(null); setProperties([]); setSelected(''); setLinks({}); }, []);
  useEffect(() => { const expire = () => { clear(); setExpired(true); }; window.addEventListener('sica:expired', expire); return () => window.removeEventListener('sica:expired', expire); }, [clear]);
  useEffect(() => { if (!identity) return; const delay = Math.max(0, new Date(identity.session.expiresAt).getTime() - Date.now()); const timer = setTimeout(() => { clear(); setExpired(true); }, delay); return () => clearTimeout(timer); }, [identity, clear]);
  async function accept(session: SessionResult) {
    setToken(session.accessToken);
    try { const [me, homes] = await Promise.all([api<Identity>('/auth/me'), api<Page<Property>>('/properties')]); setIdentity(me); setProperties(homes.data); setSelected(me.session.propertyId); setExpired(false);
      try { localStorage.setItem('sica:login', JSON.stringify({ email: me.user.email, propertyId: me.session.propertyId })); } catch { /* storage optional */ }
    } catch (e) { clear(); throw e; }
  }
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); } finally { clear(); } }
  async function switchProfile(profile: 'RESIDENT' | 'ADMIN' | 'SUPERADMIN', clusterId?: string) { const session = await api<SessionResult>('/auth/context', { method: 'POST', body: JSON.stringify({ profile, clusterId }) }); await accept(session); }
  return <Context.Provider value={{ links, rememberPass: pass => setLinks(old => ({ ...old, [pass.id]: pass })), forgetPass: id => setLinks(old => { const next = { ...old }; delete next[id]; return next; }), identity, properties, property: properties.find(p => p.id === selected) ?? properties[0] ?? null, select: setSelected, accept, logout, switchProfile, expired }}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
