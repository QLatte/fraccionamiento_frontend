import { useEffect, useRef } from 'react';
import './AnimatedPhoneVolume.css';

type Props = { size?: number; strokeWidth?: number; className?: string };

/** Phone and staggered signal waves adapted from Its Hover's phone-volume icon. */
export default function AnimatedPhoneVolume({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const icon = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = icon.current;
    const trigger = svg?.closest('button, a');
    const inner = svg?.querySelector<SVGPathElement>('.phone-wave-inner');
    const outer = svg?.querySelector<SVGPathElement>('.phone-wave-outer');
    if (!trigger || !inner || !outer) return;

    let animations: Animation[] = [];
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animations.forEach(animation => animation.cancel());
      animations = [
        inner.animate([
          { transform: 'scale(.75)', opacity: .25 },
          { transform: 'scale(1.2)', opacity: 1 },
          { transform: 'scale(1)', opacity: 1 },
        ], { duration: 560, easing: 'ease-in-out' }),
        outer.animate([
          { transform: 'scale(.7)', opacity: .15 },
          { transform: 'scale(1.25)', opacity: 1 },
          { transform: 'scale(1)', opacity: 1 },
        ], { duration: 620, delay: 90, easing: 'ease-in-out', fill: 'backwards' }),
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

  return <svg ref={icon} className={`animated-phone-volume-icon ${className}`} aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={strokeWidth * (32 / 24)} strokeLinecap="square" strokeMiterlimit="10">
    <path d="m21.3832 18.2745-3.1744 3.9688c-3.4906-2.0516-6.3996-4.9606-8.4513-8.4513l3.9702-3.1756-3.8264-8.617-6.4617 1.6761c-.9444.2466-1.555 1.1606-1.4212 2.1274 1.7626 12.5517 11.6278 22.4169 24.1795 24.1795.9665.1332 1.8799-.4773 2.1264-1.4212l1.6758-6.4603-8.6168-3.8264Z"/>
    <path className="phone-wave-inner" d="M19 8c2.7614 0 5 2.2386 5 5"/>
    <path className="phone-wave-outer" d="M19 3c5.5228 0 10 4.4772 10 10"/>
  </svg>;
}
