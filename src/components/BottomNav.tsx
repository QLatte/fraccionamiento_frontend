import type { CSSProperties } from 'react';
import { Smartphone } from 'lucide-react';
import AnimatedQr from './icons/AnimatedQr';
import AnimatedHome from './icons/AnimatedHome';
import AnimatedAlignCenter, { afterMenuIconAnimation } from './icons/AnimatedAlignCenter';
import AnimatedUserPlus from './icons/AnimatedUserPlus';
import AnimatedPhoneVolume from './icons/AnimatedPhoneVolume';
import AnimatedRefresh from './icons/AnimatedRefresh';
import './BottomNav.css';

type Props = {
  path: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'GUARD' | 'RESIDENT';
  menuOpen: boolean;
  onNavigate: (path: string) => void;
  onMore: (trigger: HTMLButtonElement) => void;
};

export function BottomNav({ path, role, menuOpen, onNavigate, onMore }: Props) {
  const items = role === 'SUPERADMIN' ? [
    { path: '/plataforma', label: 'Plataforma', Icon: AnimatedHome },
    { path: '/admin/invitaciones', label: 'Invitaciones', Icon: AnimatedUserPlus },
    { path: '/admin/dispositivos', label: 'Casetas', Icon: AnimatedPhoneVolume },
    { path: '/admin/estado', label: 'Estado', Icon: AnimatedRefresh },
  ] : (role === 'ADMIN') ? [
    { path: '/admin/invitaciones', label: 'Invitaciones', Icon: AnimatedUserPlus },
    { path: '/admin/dispositivos', label: 'Dispositivos', Icon: AnimatedPhoneVolume },
    { path: null, label: 'Más', Icon: AnimatedAlignCenter },
  ] : [
    { path: '/', label: 'Inicio', Icon: AnimatedHome },
    { path: '/pases', label: 'Mis pases', Icon: AnimatedQr },
    { path: '/dispositivos', label: 'Dispositivos', Icon: Smartphone },
    { path: null, label: 'Más', Icon: AnimatedAlignCenter },
  ];
  const current = items.findIndex(item => item.path === path);
  const activeIndex = menuOpen && (role !== 'ADMIN' && role !== 'SUPERADMIN') || current < 0 ? items.length - 1 : current;
  // Equally spaced centers within the bar's 12px side padding.
  const offset = 12 - 24 * (activeIndex + .5) / items.length;
  const style = {
    '--nav-columns': items.length,
    '--nav-center': `calc(${(activeIndex + .5) * 100 / items.length}% ${offset < 0 ? '-' : '+'} ${Math.abs(offset)}px)`,
  } as CSSProperties;

  return (
    <nav className="mobile-nav" aria-label="Navegación móvil" style={style} inert={menuOpen}>
      <div className="mobile-nav-surface" aria-hidden="true">
        <span className="mobile-nav-fill mobile-nav-fill-left"/>
        <svg className="mobile-nav-notch" viewBox="0 0 112 84" preserveAspectRatio="none" focusable="false">
          <path d="M0 0 C12 0 14 4 20 16 C27 31 38 39 56 39 C74 39 85 31 92 16 C98 4 100 0 112 0 V84 H0 Z" fill="currentColor"/>
        </svg>
        <span className="mobile-nav-fill mobile-nav-fill-right"/>
      </div>
      {items.map(({ path: destination, label, Icon }, index) => (
        <button
          key={destination ?? 'more'}
          type="button"
          className={`mobile-nav-item${activeIndex === index ? ' active' : ''}`}
          aria-current={destination === path ? 'page' : undefined}
          aria-label={destination === null ? 'Más opciones' : destination === '/admin/dispositivos' ? 'Dispositivos de caseta' : destination === '/admin/estado' ? 'Estado del sistema' : label}
          aria-expanded={destination === null ? menuOpen : undefined}
          aria-controls={destination === null ? 'main-navigation' : undefined}
          aria-haspopup={destination === null ? 'dialog' : undefined}
          onClick={event => {
            if (destination === null) {
              const trigger = event.currentTarget;
              afterMenuIconAnimation(() => onMore(trigger));
            } else onNavigate(destination);
          }}
        >
          <span className="mobile-nav-icon" aria-hidden="true"><Icon size={25} strokeWidth={activeIndex === index ? 2.2 : 1.7}/></span>
          <span className="mobile-nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
