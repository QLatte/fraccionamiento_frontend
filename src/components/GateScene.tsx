import { useEffect, useRef } from 'react';

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type GateState = 'closed' | 'waiting' | 'open' | 'denied';

const SUNRISE = 5.5, SUNSET = 19.75; // the hours the scene treats as night's edges
/** Morning light, day, sunset or night, from the person's own clock. */
export function dayPhase(at: Date): DayPhase {
  const h = at.getHours() + at.getMinutes() / 60;
  return h < SUNRISE ? 'night' : h < 8 ? 'dawn' : h < 17.5 ? 'day' : h < SUNSET ? 'dusk' : 'night';
}

/**
 * Where the sun (rising on the left, setting on the right) or the moon stands right now: an arc
 * across the sky. Kept low enough to stay inside the wide, short window phones show.
 */
function orbPosition(at: Date) {
  const h = at.getHours() + at.getMinutes() / 60;
  const t = h >= SUNRISE && h < SUNSET ? (h - SUNRISE) / (SUNSET - SUNRISE) : ((h - SUNSET + 24) % 24) / (24 - SUNSET + SUNRISE);
  return { x: 150 + t * 500, y: 372 - Math.sin(Math.PI * t) * 150 };
}

const STARS: [number, number, number][] = [[150, 150, 1.6], [230, 240, 1.1], [300, 130, 1.3], [380, 215, 1], [455, 140, 1.7], [520, 260, 1.1], [590, 190, 1.4], [650, 250, 1], [270, 290, 1], [420, 300, 1.2], [560, 120, 1], [200, 110, 1.1], [340, 330, 1], [610, 320, 1.2], [180, 310, 1]];
// The neighbourhood: [x, width, wall height, roof height, roof color var, window columns].
const HOUSES: [number, number, number, number, string, number][] = [[176, 62, 44, 26, '--roof', 2], [246, 50, 58, 22, '--roof-2', 1], [304, 70, 40, 28, '--roof-sun', 2], [382, 54, 62, 24, '--roof', 1], [444, 60, 46, 26, '--roof-2', 2]];
const TREES: [number, number, number][] = [[150, 438, 15], [236, 440, 11], [372, 440, 12], [508, 438, 14], [640, 446, 17], [118, 452, 12]];

/**
 * The entrance of the fraccionamiento, drawn flat: sky with the sun or moon where the clock says,
 * hills, houses (windows lit at night), the caseta and its barrier arm.
 *
 * The scene answers what the person does: waiting for the passkey blinks the caseta's lamp amber,
 * a granted access turns it green and lifts the arm, a failure turns it red and the arm shakes.
 * On computers the layers drift a few pixels after the pointer (a spring, decorative only).
 */
export function GateScene({ now, gate }: { now: Date; gate: GateState }) {
  const root = useRef<SVGSVGElement>(null);
  const phase = dayPhase(now), orb = orbPosition(now);

  useEffect(() => {
    const svg = root.current;
    if (!svg || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layers = Array.from(svg.querySelectorAll<SVGGElement>('[data-depth]')).map(el => ({ el, depth: Number(el.dataset.depth) }));
    let tx = 0, ty = 0, x = 0, y = 0, frame = 0;
    // A spring toward the pointer: the layers arrive with a little lag instead of sticking to it.
    const tick = () => {
      x += (tx - x) * 0.07; y += (ty - y) * 0.07;
      for (const { el, depth } of layers) el.style.transform = `translate(${(x * depth).toFixed(2)}px, ${(y * depth * 0.5).toFixed(2)}px)`;
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(frame); };
  }, []);

  return <svg ref={root} className={`gate-scene ${phase} ${gate}`} viewBox="0 0 800 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="gs-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--sky-1)"/><stop offset="1" stopColor="var(--sky-2)"/></linearGradient>
      <clipPath id="gs-arm-clip"><rect x="262" y="446" width="262" height="12" rx="6"/></clipPath>
    </defs>
    <rect width="800" height="600" fill="url(#gs-sky)"/>

    <g data-depth="-10">
      <g className="gs-stars">{STARS.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r}/>)}</g>
      <circle className="gs-orb-glow" cx={orb.x} cy={orb.y} r="58"/>
      <circle className="gs-orb" cx={orb.x} cy={orb.y} r="30"/>
      <g className="gs-clouds">
        <g className="gs-cloud"><rect x="120" y="268" width="92" height="22" rx="11"/><rect x="146" y="254" width="50" height="24" rx="12"/></g>
        <g className="gs-cloud slow"><rect x="520" y="306" width="110" height="24" rx="12"/><rect x="552" y="290" width="56" height="26" rx="13"/></g>
      </g>
    </g>

    <g data-depth="-18">
      <path fill="var(--hill-1)" d="M0 418 Q150 340 330 398 T640 372 T800 396 V600 H0 Z"/>
    </g>

    <g data-depth="-28">
      <path fill="var(--hill-2)" d="M0 452 Q220 404 420 438 T800 426 V600 H0 Z"/>
      {HOUSES.map(([x, w, h, roof, color, cols], i) => <g key={i} className="gs-house">
        <rect x={x} y={446 - h} width={w} height={h + 6} fill="var(--wall)"/>
        <path d={`M${x - 5} ${446 - h} L${x + w / 2} ${446 - h - roof} L${x + w + 5} ${446 - h} Z`} fill={`var(${color})`}/>
        {Array.from({ length: cols }, (_, c) => <rect key={c} className="gs-window" x={x + (w / (cols + 1)) * (c + 1) - 6} y={446 - h + 11} width="12" height="13" rx="2"/>)}
        <rect x={x + w / 2 - 6} y={446 - 16} width="12" height="22" rx="2" fill="var(--door)"/>
      </g>)}
      {TREES.map(([x, y, r], i) => <g key={i}><rect x={x - 2} y={y} width="4" height={r + 8} fill="var(--trunk)"/><circle cx={x} cy={y} r={r} fill="var(--tree)"/></g>)}
    </g>

    <g data-depth="-40">
      <rect y="470" width="800" height="130" fill="var(--ground)"/>
      <path fill="var(--road)" d="M318 470 H482 L610 600 H190 Z"/>
      <path className="gs-road-line" d="M400 482 V600"/>
      {/* The caseta. */}
      <rect x="524" y="392" width="78" height="80" rx="4" fill="var(--wall)"/>
      <rect x="516" y="382" width="94" height="14" rx="4" fill="var(--roof)"/>
      <rect className="gs-window" x="538" y="408" width="34" height="26" rx="3"/>
      <rect x="580" y="430" width="14" height="42" rx="2" fill="var(--door)"/>
      <circle className="gs-lamp-glow" cx="563" cy="374" r="20"/>
      <circle className="gs-lamp" cx="563" cy="374" r="7"/>
      {/* The barrier: post, counterweight and the striped arm that lifts from its hinge. */}
      <rect x="514" y="432" width="14" height="40" rx="3" fill="var(--roof)"/>
      <g className="gs-arm">
        <rect x="518" y="443" width="26" height="18" rx="4" fill="var(--roof)"/>
        <rect x="262" y="446" width="262" height="12" rx="6" fill="#fff"/>
        <g clipPath="url(#gs-arm-clip)" fill="var(--sun)">{Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${276 + i * 38} 446 h18 l-10 12 h-18 Z`}/>)}</g>
        <circle cx="521" cy="452" r="5" fill="var(--sun)"/>
      </g>
    </g>
  </svg>;
}
