import { useCallback, useRef } from 'react';
import { draw, EASE, SPRING, useIconMotion, WIGGLE } from './iconMotion';
import './AnimatedIcons.css';

// Icons ported from lucide-animated (MIT) to the Web Animations API: same geometry and
// motion, no Motion dependency. See iconMotion.ts for when they play.
type Props = { size?: number; strokeWidth?: number; className?: string; autoplay?: boolean | number; every?: number };
const svgProps = (size: number, strokeWidth: number, className: string) => ({
  'aria-hidden': true as const, width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: `animated-icon ${className}`,
});

const FINGERPRINT = [
  'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4', 'M14 13.12c0 2.38 0 6.38-1 8.88', 'M17.29 21.02c.12-.6.43-2.3.5-3.02', 'M2 12a10 10 0 0 1 18-6', 'M2 16h.01',
  'M21.8 16c.2-2 .131-5.354 0-6', 'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2', 'M8.65 22c.21-.66.45-1.32.57-2', 'M9 6.8a6 6 0 0 1 9 5.2v2',
];
/** Fingerprint whose ridges are traced over their faint outline, like a sensor reading it. */
export function AnimatedFingerprint({ size = 24, strokeWidth = 2, className = '', autoplay, every }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const play = useCallback((svg: SVGSVGElement) => [...svg.querySelectorAll('.ridge')].map((el, i) => draw(el, 1400, i * 40, WIGGLE)), []);
  useIconMotion(ref, play, { autoplay, every });
  return <svg ref={ref} {...svgProps(size, strokeWidth, `animated-fingerprint ${className}`)}>
    {FINGERPRINT.map(d => <path key={d} d={d} className="ridge-base"/>)}
    {FINGERPRINT.map(d => <path key={'r' + d} d={d} className="ridge" pathLength={1}/>)}
  </svg>;
}

/** Check mark drawn in; meant for a circle the parent already shows (success badges). */
export function AnimatedCheck({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  // Starts hidden and stays drawn (fill both), so it never flashes before being drawn.
  const play = useCallback((svg: SVGSVGElement) => [draw(svg.querySelector('.check')!, 420, 200, EASE, 'both')], []);
  useIconMotion(ref, play, { autoplay: true });
  return <svg ref={ref} {...svgProps(size, strokeWidth, className)}><path className="check draw from-hidden" pathLength={1} d="M20 6 9 17l-5-5"/></svg>;
}

/** Hourglass that turns over; with `every` it keeps turning while someone waits. */
export function AnimatedHourglass({ size = 24, strokeWidth = 2, className = '', autoplay, every }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const play = useCallback((svg: SVGSVGElement) => [svg.querySelector('.glass')!.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }], { duration: 700, easing: SPRING })], []);
  useIconMotion(ref, play, { autoplay, every });
  return <svg ref={ref} {...svgProps(size, strokeWidth, className)}>
    <g className="glass">
      <path d="M5 22h14"/><path d="M5 2h14"/>
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/>
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
    </g>
  </svg>;
}

/** Paper plane that takes off, leaving a dashed loop behind it. */
export function AnimatedSend({ size = 24, strokeWidth = 2, className = '', autoplay, every }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const play = useCallback((svg: SVGSVGElement) => [
    svg.querySelector('.plane')!.animate([{ transform: 'translate(0, 0) scale(1)' }, { transform: 'translate(3px, -3px) scale(.8)', offset: 0.5 }, { transform: 'translate(0, 0) scale(1)' }], { duration: 900, easing: EASE }),
    svg.querySelector('.trail')!.animate([{ opacity: 0, transform: 'translate(-3px, 3px)' }, { opacity: 1, transform: 'translate(0, 0)', offset: 0.55 }, { opacity: 0, transform: 'translate(1px, -1px)' }], { duration: 1000, delay: 100, easing: EASE }),
  ], []);
  useIconMotion(ref, play, { autoplay, every });
  return <svg ref={ref} {...svgProps(size, strokeWidth, `animated-send ${className}`)}>
    <g className="plane">
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/>
      <path d="m21.854 2.147-10.94 10.939"/>
    </g>
    <path className="trail" strokeWidth={1} strokeDasharray="2 2" d="M -3 28 C -0.5 26.8 1.6 24.6 3.3 22 C 4.8 19.7 5.2 17.6 4.2 16.1 C 3.2 14.7 1.4 14.5 0.3 15.8 C -0.9 17.2 -0.6 19.4 1.2 20.4 C 3.4 21.5 6.4 19.4 9 15.8"/>
  </svg>;
}

/** Trend line drawn left to right, then its arrow head, with a small nudge in its direction. */
export function AnimatedTrend({ direction, size = 16, strokeWidth = 2.2, className = '', autoplay = 250 }: Props & { direction: 'up' | 'down' }) {
  const ref = useRef<SVGSVGElement>(null);
  const play = useCallback((svg: SVGSVGElement) => [
    draw(svg.querySelector('.line')!, 400, 0, EASE),
    draw(svg.querySelector('.head')!, 300, 300, EASE),
    svg.animate([{ transform: 'translate(0, 0)' }, { transform: `translate(2px, ${direction === 'up' ? -2 : 2}px)` }, { transform: 'translate(0, 0)' }], { duration: 500, delay: 250, easing: WIGGLE }),
  ], [direction]);
  useIconMotion(ref, play, { autoplay });
  const up = direction === 'up';
  return <svg ref={ref} {...svgProps(size, strokeWidth, className)}>
    <polyline className="line draw" pathLength={1} points={up ? '22 7 13.5 15.5 8.5 10.5 2 17' : '22 17 13.5 8.5 8.5 13.5 2 7'}/>
    <polyline className="head draw" pathLength={1} points={up ? '16 7 22 7 22 13' : '16 17 22 17 22 11'}/>
  </svg>;
}
