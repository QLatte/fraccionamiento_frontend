import { useEffect, useRef } from 'react';
import './AnimatedRefresh.css';

type Props = { size?: number; strokeWidth?: number; className?: string };

/** Two-arrow shape and rotation adapted from Its Hover's refresh icon. */
export default function AnimatedRefresh({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const icon = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = icon.current;
    const trigger = svg?.closest('button, a');
    if (!svg || !trigger) return;

    let animation: Animation | undefined;
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animation?.cancel();
      animation = svg.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(180deg)' },
        { transform: 'rotate(360deg)' },
      ], { duration: 760, easing: 'ease-in-out' });
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
      animation?.cancel();
    };
  }, []);

  return <svg ref={icon} className={`animated-refresh-icon ${className}`} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"/>
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"/>
  </svg>;
}
