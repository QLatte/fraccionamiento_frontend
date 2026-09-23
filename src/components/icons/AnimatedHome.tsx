import { useEffect, useRef } from 'react';
import './AnimatedHome.css';

type Props = { size?: number; strokeWidth?: number; className?: string };

/** House paths and roof/body/door sequence adapted from Its Hover's home icon. */
export default function AnimatedHome({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const icon = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = icon.current;
    const trigger = svg?.closest('button, a');
    if (!svg || !trigger) return;

    const roof = svg.querySelector<SVGPathElement>('.home-roof');
    const house = svg.querySelector<SVGPathElement>('.home-house');
    const door = svg.querySelector<SVGPathElement>('.home-door');
    if (!roof || !house || !door) return;

    let animations: Animation[] = [];
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animations.forEach(animation => animation.cancel());
      animations = [
        roof.animate([
          { transform: 'translateY(-4px)', opacity: .4 },
          { transform: 'translateY(0)', opacity: 1 },
        ], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }),
        house.animate([
          { transform: 'scale(.84)' },
          { transform: 'scale(1.07)' },
          { transform: 'scale(1)' },
        ], { duration: 540, easing: 'ease-out' }),
        door.animate([
          { transform: 'scaleY(0)', opacity: .3 },
          { transform: 'scaleY(1)', opacity: 1 },
        ], { duration: 360, delay: 210, easing: 'ease-out', fill: 'backwards' }),
      ];
    };
    const hover = (event: PointerEvent) => { if (event.pointerType === 'mouse') start(); };

    trigger.addEventListener('pointerenter', hover as EventListener);
    trigger.addEventListener('pointerdown', start);
    trigger.addEventListener('focus', start);
    return () => {
      trigger.removeEventListener('pointerenter', hover as EventListener);
      trigger.removeEventListener('pointerdown', start);
      trigger.removeEventListener('focus', start);
      animations.forEach(animation => animation.cancel());
    };
  }, []);

  return <svg ref={icon} className={`animated-home-icon ${className}`} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path className="home-roof" d="M5 12h-2l9-9 9 9h-2"/>
    <path className="home-house" d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>
    <path className="home-door" d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/>
  </svg>;
}
