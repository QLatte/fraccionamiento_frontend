import { useEffect, useRef } from 'react';
import './AnimatedAlignCenter.css';

type Props = { size?: number; strokeWidth?: number; className?: string };

/** Let the three-line gesture finish before the menu covers its trigger. */
export function afterMenuIconAnimation(open: () => void) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) open();
  else window.setTimeout(open, 450);
}

/** Centered line geometry and staggered scale motion adapted from Its Hover. */
export default function AnimatedAlignCenter({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const icon = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = icon.current;
    const trigger = svg?.closest('button, a');
    if (!svg || !trigger) return;

    const lines = Array.from(svg.querySelectorAll<SVGPathElement>('path'));
    let animations: Animation[] = [];
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animations.forEach(animation => animation.cancel());
      animations = lines.map((line, index) => line.animate([
        { transform: 'scaleX(1)' },
        { transform: `scaleX(${[.6, 1.45, .7][index]})` },
        { transform: 'scaleX(1)' },
      ], { duration: 330, delay: index * 55, easing: 'ease-in-out' }));
    };
    const hover = (event: PointerEvent) => { if (event.pointerType === 'mouse') start(); };

    trigger.addEventListener('pointerenter', hover as EventListener);
    trigger.addEventListener('pointerdown', start);
    trigger.addEventListener('focus', start);
    trigger.addEventListener('click', start);
    return () => {
      trigger.removeEventListener('pointerenter', hover as EventListener);
      trigger.removeEventListener('pointerdown', start);
      trigger.removeEventListener('focus', start);
      trigger.removeEventListener('click', start);
      animations.forEach(animation => animation.cancel());
    };
  }, []);

  return <svg ref={icon} className={`animated-align-center-icon ${className}`} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16"/>
    <path d="M8 12h8"/>
    <path d="M6 18h12"/>
  </svg>;
}
