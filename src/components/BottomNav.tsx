import type { CSSProperties } from 'react';
import { ScanLine, Smartphone } from 'lucide-react';
import AnimatedQr from './icons/AnimatedQr';
import AnimatedHome from './icons/AnimatedHome';
import AnimatedAlignCenter, { afterMenuIconAnimation } from './icons/AnimatedAlignCenter';
import './BottomNav.css';

type Props = {
  path: string;
  role: 'ADMIN' | 'GUARD' | 'HOUSEHOLD_USER';
  menuOpen: boolean;
  onNavigate: (path: string) => void;
  onMore: (trigger: HTMLButtonElement) => void;
};

export function BottomNav({ path, role, menuOpen, onNavigate, onMore }: Props) {
  const items = [
    { path: '/', label: 'Inicio', Icon: AnimatedHome },
    { path: '/pases', label: 'Mis pases', Icon: AnimatedQr },
    role === 'HOUSEHOLD_USER'
      ? { path: '/dispositivos', label: 'Dispositivos', Icon: Smartphone }
      : { path: '/caseta', label: 'Caseta', Icon: ScanLine },
    { path: null, label: 'Más', Icon: AnimatedAlignCenter },
  ];
  const current = items.findIndex(item => item.path === path);
  const activeIndex = menuOpen || current < 0 ? 3 : current;
  // Four equally spaced centers within the bar's 12px side padding.
  const offset = 9 - activeIndex * 6;
  const style = {
    '--nav-center': `calc(${(activeIndex + .5) * 25}% ${offset < 0 ? '-' : '+'} ${Math.abs(offset)}px)`,
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
          aria-label={destination === null ? 'Más opciones' : label}
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
