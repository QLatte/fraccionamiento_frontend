import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, ChevronDown, CircleHelp, Home, LogOut, MapPin, Menu, ScanLine, Settings2, ShieldCheck, Smartphone, WifiOff, X } from 'lucide-react';
import { AuthProvider, useAuth } from './auth';
import { useOnline, useQuery } from './hooks';
import type { Notification, Page } from './types';
import { Brand, Button, Empty, PageHeader, Step } from './components/ui';
import { PublicPass } from './components/SharePass';
import { BottomNav } from './components/BottomNav';
import AnimatedQr from './components/icons/AnimatedQr';
import { Login } from './pages/Login';
import { Passes } from './pages/Passes';
import { Devices } from './pages/Devices';
import { Gate } from './pages/Gate';
import { Admin } from './pages/Admin';
import { InstallButton, UpdateNotice } from './pwa';
function usePath() { const [path, set] = useState(location.pathname); useEffect(() => { const update = () => set(location.pathname); window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update); }, []); return { path, navigate: (next: string) => { if (next !== location.pathname) history.pushState(null, '', next); set(location.pathname); window.scrollTo(0, 0); } }; }
export default function App() { return <ErrorBoundary><AuthProvider><Router/></AuthProvider></ErrorBoundary>; }
function Router() {
  const { path, navigate } = usePath(); const online = useOnline(); const { identity } = useAuth();
  return <><UpdateNotice/>{!online && <div className="offline-bar" role="status"><WifiOff size={17}/> Sin conexión. Puedes abrir la app; las acciones estarán disponibles al reconectarte.</div>}{path.startsWith('/p/') ? <PublicPass/> : !identity ? <Login/> : <Shell path={path} navigate={navigate}/>}</>;
}
function Shell({ path, navigate }: { path: string; navigate: (p: string) => void }) {
  const { identity, properties, property, select, logout } = useAuth(); const [mobile, setMobile] = useState(false); const online = useOnline();
  const sidebar = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1025px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobile(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const previous = menuTrigger.current ?? document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLButtonElement>('.mobile-close')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobile(false); return; }
      if (event.key !== 'Tab') return;
      const items = Array.from(sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select') ?? [])
        .filter(element => element.getClientRects().length > 0);
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [mobile]);
  const alerts = useQuery<Page<Notification>>(property ? `/auth/devices/notifications?propertyId=${property.id}` : null, 30000);
  const role = identity!.user.globalRole; const nav = [{ path: '/', label: 'Inicio', Icon: Home }, { path: '/pases', label: 'Mis pases', Icon: AnimatedQr }, { path: '/dispositivos', label: 'Dispositivos', Icon: Smartphone }, ...(role !== 'HOUSEHOLD_USER' ? [{ path: '/caseta', label: 'Caseta', Icon: ScanLine }] : []), ...(role === 'ADMIN' ? [{ path: '/admin', label: 'Administración', Icon: Settings2 }] : [])];
  function go(p: string) { setMobile(false); navigate(p); requestAnimationFrame(() => document.getElementById('main')?.focus()); }
  return <div className="app-layout"><a href="#main" className="skip-link">Ir al contenido</a>{mobile && <button className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setMobile(false)}/>}<aside ref={sidebar} id="main-navigation" role={mobile ? 'dialog' : undefined} aria-modal={mobile || undefined} aria-label="Menú de Zentry" className={`sidebar ${mobile ? 'open' : ''}`}><div className="sidebar-brand"><Brand onHome={() => go('/')}/><button className="icon-button mobile-close" aria-label="Cerrar menú" onClick={() => setMobile(false)}><X/></button></div><div className="community-label"><span className="connection-dot"/> Tu comunidad</div><nav aria-label="Navegación principal">{nav.map(({ path: p, label, Icon }) => <button key={p} className={path === p ? 'active' : ''} aria-current={path === p ? 'page' : undefined} onClick={() => go(p)}><Icon size={20}/>{label}{path === p && <span className="nav-dot"/>}</button>)}</nav><div className="sidebar-install"><div className="install-art"><Smartphone size={29}/><span><ShieldCheck size={15}/></span></div><h3>Zentry en tu teléfono</h3><p>Instala Zentry en tu teléfono y abre la app con un toque.</p><InstallButton/></div><div className="sidebar-bottom"><button onClick={() => go('/ayuda')} className={path === '/ayuda' ? 'active' : ''}><CircleHelp size={19}/> Ayuda y primeros pasos</button><button onClick={() => void logout().catch(() => {})}><LogOut size={19}/> Cerrar sesión</button><div className="sidebar-user"><span className="avatar">{identity!.user.fullName.slice(0, 1)}</span><span><strong>{identity!.user.fullName}</strong><small>{role === 'ADMIN' ? 'Administración' : role === 'GUARD' ? 'Personal de caseta' : 'Residente'}</small></span></div></div></aside>
    <div className="app-main" inert={mobile}><header className="topbar"><button className="icon-button menu-button" aria-label="Abrir menú" aria-expanded={mobile} aria-controls="main-navigation" onClick={event => { menuTrigger.current = event.currentTarget; setMobile(true); }}><Menu/></button><div className="property-select"><MapPin size={19}/><div><span>Tu vivienda</span><select aria-label="Seleccionar vivienda" value={property?.id ?? ''} onChange={e => { select(e.target.value); setMobile(false); }}>{properties.map(p => <option key={p.id} value={p.id}>{p.street} {p.houseNumber} · {p.cluster.name}</option>)}</select></div><ChevronDown size={15}/></div><div className="topbar-actions"><span className="online-label"><span className={`connection-dot ${online ? '' : 'offline'}`}/>{online ? 'En línea' : 'Sin conexión'}</span><button className="notification-button" aria-label={`Avisos de seguridad${alerts.data?.data.length ? ': ' + alerts.data.data.length : ''}`} onClick={() => go('/dispositivos')}><Bell size={20}/>{!!alerts.data?.data.length && <i/>}</button><span className="avatar top-avatar">{identity!.user.fullName.slice(0, 1)}</span></div></header><main id="main" tabIndex={-1} key={property?.id}>
    <div key={path} className={path === '/' ? undefined : 'page-enter'}>
      {!property ? <Empty title="No hay viviendas disponibles" text="Contacta a administración para revisar tus membresías."/> : path === '/' || path === '/pases' ? <Passes key={path} home={path === '/'} navigate={go}/> : path === '/dispositivos' ? <Devices/> : path === '/caseta' && role !== 'HOUSEHOLD_USER' ? <Gate/> : path === '/admin' && role === 'ADMIN' ? <Admin/> : path === '/ayuda' ? <Help/> : <Empty title="Esta página no está disponible" text="Vuelve al inicio para continuar." action={<Button onClick={() => go('/')}>Ir al inicio</Button>}/>}
    </div>
    <footer className="app-footer"><span>Zentry. Acceso a tu comunidad.</span><span><ShieldCheck size={13}/> Cada visita, con tranquilidad.</span></footer></main></div><BottomNav path={path} role={role} menuOpen={mobile} onNavigate={go} onMore={trigger => { menuTrigger.current = trigger; setMobile(true); }}/></div>;
}
function Help() { return <><PageHeader title="Ayuda y primeros pasos" text="Todo lo que necesitas para usar Zentry, paso a paso."/><div className="help-grid"><section className="panel help-content"><h2>Tu primera invitación</h2><Step n="01" title="Crea el pase">En Mis pases, toca Crear pase. Escribe el nombre del visitante y, si viene en auto, sus placas.</Step><Step n="02" title="Elige cuándo puede entrar">Usa Una visita para un solo acceso, Por un periodo para varias entradas o Recurrente para visitas habituales.</Step><Step n="03" title="Comparte la bienvenida">Revisa los datos, crea el pase y comparte el enlace o descarga el QR. Guarda el enlace: solo se entrega al crear el pase.</Step><Step n="04" title="Recibe con tranquilidad">Tu visitante presenta el QR en la caseta. Si los planes cambian, puedes cancelar el pase desde su detalle.</Step></section><section className="panel help-content"><h2>Preguntas frecuentes</h2><details open><summary>¿Puedo usar Zentry sin internet?</summary><p>La app instalada puede abrir su interfaz y mostrar un QR desde su enlace. Crear, consultar, cancelar o validar pases requiere conexión. Nunca se autoriza una visita sin comprobarla en el servidor.</p></details><details><summary>¿Por qué tengo que volver a ingresar?</summary><p>Las sesiones son cortas para proteger tu acceso. Usa tu llave de acceso cuando termine la sesión. No necesitas una contraseña.</p></details><details><summary>¿Perdí el enlace de un pase?</summary><p>El QR original no se recupera del listado. Si no lo compartiste o guardaste, cancela el pase y crea otro.</p></details><details><summary>¿Cambié de teléfono?</summary><p>Pide a administración una invitación de recuperación. Después de verificar tu identidad podrás registrar una llave en el nuevo dispositivo.</p></details><details><summary>¿Qué significa “se está sincronizando”?</summary><p>Tu cambio ya se guardó. La caseta recibirá la actualización; un pase cancelado no vuelve a autorizar accesos durante esta espera.</p></details><h3 className="install-heading">Instala Zentry</h3><InstallButton/></section></div></>; }
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> { state = { error: false }; static getDerivedStateFromError() { return { error: true }; } render() { return this.state.error ? <div className="fatal"><Brand/><h1>No pudimos abrir esta pantalla.</h1><p>Recarga la aplicación para volver a ingresar.</p><Button onClick={() => location.reload()}>Recargar Zentry</Button></div> : this.props.children; } }
