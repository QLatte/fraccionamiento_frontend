import { useEffect, useRef } from 'react';
import './AnimatedHistoryCircle.css';

type Props = { size?: number; strokeWidth?: number; className?: string };

/** Rewind circle and clock hand adapted from Its Hover's history-circle icon. */
export default function AnimatedHistoryCircle({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const icon = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = icon.current;
    const trigger = svg?.closest('button, a');
    const circle = svg?.querySelector<SVGPathElement>('.history-circle');
    const hand = svg?.querySelector<SVGPathElement>('.history-clock-hand');
    if (!trigger || !circle || !hand) return;

    const length = circle.getTotalLength();
    circle.style.strokeDasharray = `${length}`;
    let animations: Animation[] = [];
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animations.forEach(animation => animation.cancel());
      animations = [
        circle.animate([
          { transform: 'rotate(0deg)', strokeDashoffset: 0 },
          { transform: 'rotate(-45deg)', strokeDashoffset: length * .25 },
          { transform: 'rotate(0deg)', strokeDashoffset: 0 },
        ], { duration: 680, easing: 'ease-in-out' }),
        hand.animate([
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-30deg)' },
          { transform: 'rotate(0deg)' },
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

  return <svg ref={icon} className={`animated-history-circle-icon ${className}`} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path className="history-clock-hand" d="M12 8v4l2 2"/>
    <path className="history-circle" d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/>
  </svg>;
}
