import { useEffect, useRef } from 'react';
import './AnimatedUserPlus.css';

type Props = { size?: number; strokeWidth?: number; className?: string };

/** Avatar and rotating plus geometry adapted from Its Hover's user-plus icon. */
export default function AnimatedUserPlus({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const icon = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = icon.current;
    const trigger = svg?.closest('button, a');
    const avatar = svg?.querySelector<SVGGElement>('.user-plus-avatar');
    const plus = svg?.querySelector<SVGGElement>('.user-plus-sign');
    if (!trigger || !avatar || !plus) return;

    let animations: Animation[] = [];
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animations.forEach(animation => animation.cancel());
      animations = [
        avatar.animate([
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-2px) scale(1.1)' },
          { transform: 'translateY(0) scale(1)' },
        ], { duration: 500, easing: 'ease-in-out' }),
        plus.animate([
          { transform: 'rotate(0deg) scale(1)' },
          { transform: 'rotate(90deg) scale(1.3)' },
          { transform: 'rotate(0deg) scale(1)' },
        ], { duration: 560, easing: 'ease-in-out' }),
      ];
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

  return <svg ref={icon} className={`animated-user-plus-icon ${className}`} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <g className="user-plus-avatar">
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0"/>
      <path d="M6 21v-2a4 4 0 0 1 4-4h4"/>
    </g>
    <g className="user-plus-sign">
      <path d="M16 19h6"/>
      <path d="M19 16v6"/>
    </g>
  </svg>;
}
