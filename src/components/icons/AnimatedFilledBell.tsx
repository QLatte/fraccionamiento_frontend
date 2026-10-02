import { useEffect, useRef } from 'react';
import './AnimatedFilledBell.css';

/**
 * Paths and motion follow the Its Hover filled-bell icon: the bell swings and the
 * clapper follows a beat later. Rings on hover of an `.icon-hover` ancestor, and
 * once each time `ring` changes (e.g. when alerts are turned on).
 */
// strokeWidth is accepted (and ignored: the bell is filled) so it can sit in icon lists next to line icons.
export default function AnimatedFilledBell({ size = 24, ring }: { size?: number; strokeWidth?: number; ring?: unknown }) {
  const icon = useRef<SVGSVGElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const svg = icon.current;
    if (!svg) return;
    // Restart the CSS animation: remove the class, force a reflow, add it back.
    svg.classList.remove('ringing');
    void svg.getBoundingClientRect();
    svg.classList.add('ringing');
  }, [ring]);
  return <svg ref={icon} className="animated-filled-bell" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" onAnimationEnd={event => { if ((event.target as Element).classList.contains('bell')) icon.current?.classList.remove('ringing'); }}>
    <path className="below-circle" d="M14.235 19c.865 0 1.322 1.024 .745 1.668a3.992 3.992 0 0 1 -2.98 1.332a3.992 3.992 0 0 1 -2.98 -1.332c-.552 -.616 -.158 -1.579 .634 -1.661l.11 -.006h4.471z"/>
    <path className="bell" d="M12 2c1.358 0 2.506 .903 2.875 2.141l.046 .171l.008 .043a8.013 8.013 0 0 1 4.024 6.069l.028 .287l.019 .289v2.931l.021 .136a3 3 0 0 0 1.143 1.847l.167 .117l.162 .099c.86 .487 .56 1.766 -.377 1.864l-.116 .006h-16c-1.028 0 -1.387 -1.364 -.493 -1.87a3 3 0 0 0 1.472 -2.063l.021 -.143l.001 -2.97a8 8 0 0 1 3.821 -6.454l.248 -.146l.01 -.043a3.003 3.003 0 0 1 2.562 -2.29l.182 -.017l.176 -.004z"/>
  </svg>;
}
