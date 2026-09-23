import { useEffect, useRef } from 'react';
import './AnimatedClock.css';

type Props = { size?: number; strokeWidth?: number; className?: string };

/** Clock geometry and rotating hands adapted from Its Hover's clock icon. */
export default function AnimatedClock({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const icon = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = icon.current;
    const trigger = svg?.closest('button, a');
    const hands = svg?.querySelector<SVGPathElement>('.clock-hands');
    if (!trigger || !hands) return;

    let animation: Animation | undefined;
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animation?.cancel();
      animation = hands.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(360deg)' },
      ], { duration: 900, easing: 'ease-in-out' });
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

  return <svg ref={icon} className={`animated-clock-icon ${className}`} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0"/>
    <path className="clock-hands" d="M12 7v5l3 3"/>
  </svg>;
}
