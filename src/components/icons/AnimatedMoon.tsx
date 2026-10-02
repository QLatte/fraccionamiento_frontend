import { useEffect, useRef } from 'react';
import './AnimatedMoon.css';

/**
 * Path and motion follow the Its Hover moon icon: it tilts -15° and swells slightly.
 * Plays on hover of an `.icon-hover` ancestor, and once each time `play` changes.
 */
export default function AnimatedMoon({ size = 24, strokeWidth = 2, play }: { size?: number; strokeWidth?: number; play?: unknown }) {
  const icon = useRef<SVGSVGElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const svg = icon.current;
    if (!svg) return;
    svg.classList.remove('playing');
    void svg.getBoundingClientRect();
    svg.classList.add('playing');
  }, [play]);
  return <svg ref={icon} className="animated-moon" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" onAnimationEnd={() => icon.current?.classList.remove('playing')}>
    <path className="moon" d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>
  </svg>;
}
