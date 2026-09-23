import { useEffect, useRef } from 'react';
import './AnimatedSlidersHorizontal.css';

type Props = { size?: number; strokeWidth?: number; className?: string };

/** Keep the mobile sidebar visible long enough for the slider gesture to finish. */
export function afterSlidersAnimation(navigate: () => void) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) navigate();
  else window.setTimeout(navigate, 720);
}

/** Three staggered horizontal sliders adapted from Its Hover's icon. */
export default function AnimatedSlidersHorizontal({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const icon = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = icon.current;
    const trigger = svg?.closest('button, a');
    if (!svg || !trigger) return;

    const knobs = Array.from(svg.querySelectorAll<SVGLineElement>('.slider-knob'));
    let animations: Animation[] = [];
    const start = (continuous = false) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animations.forEach(animation => animation.cancel());
      animations = knobs.map((knob, index) => knob.animate([
        { transform: 'translateX(0)' },
        { transform: `translateX(${index === 1 ? 4 : -4}px)` },
        { transform: 'translateX(0)' },
      ], { duration: 580, delay: index * 65, iterations: continuous ? Infinity : 1, easing: 'ease-in-out' }));
    };
    const hover = (event: PointerEvent) => { if (event.pointerType === 'mouse') start(true); };
    const leave = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        animations.forEach(animation => animation.cancel());
        animations = [];
      }
    };
    const activate = () => start();

    trigger.addEventListener('pointerenter', hover as EventListener);
    trigger.addEventListener('pointerleave', leave as EventListener);
    trigger.addEventListener('pointerdown', activate);
    trigger.addEventListener('focus', activate);
    trigger.addEventListener('click', activate);
    return () => {
      trigger.removeEventListener('pointerenter', hover as EventListener);
      trigger.removeEventListener('pointerleave', leave as EventListener);
      trigger.removeEventListener('pointerdown', activate);
      trigger.removeEventListener('focus', activate);
      trigger.removeEventListener('click', activate);
      animations.forEach(animation => animation.cancel());
    };
  }, []);

  return <svg ref={icon} className={`animated-sliders-horizontal-icon ${className}`} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5h18M3 12h18M3 19h18"/>
    <line className="slider-knob" x1="14" y1="3" x2="14" y2="7"/>
    <line className="slider-knob" x1="8" y1="10" x2="8" y2="14"/>
    <line className="slider-knob" x1="16" y1="17" x2="16" y2="21"/>
  </svg>;
}
