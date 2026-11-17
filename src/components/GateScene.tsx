import { useEffect, useRef, type ReactNode } from 'react';

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type GateState = 'closed' | 'waiting' | 'open' | 'denied';

const SUNRISE = 5.5, SUNSET = 19.75; // the hours the scene treats as night's edges
/** Morning light, day, sunset or night, from the person's own clock. */
export function dayPhase(at: Date): DayPhase {
  const h = at.getHours() + at.getMinutes() / 60;
  return h < SUNRISE ? 'night' : h < 8 ? 'dawn' : h < 17.5 ? 'day' : h < SUNSET ? 'dusk' : 'night';
}

/** Where the sun (rising on the left, setting on the right) or the moon stands right now. */
function orbPosition(at: Date) {
  const h = at.getHours() + at.getMinutes() / 60;
  const t = h >= SUNRISE && h < SUNSET ? (h - SUNRISE) / (SUNSET - SUNRISE) : ((h - SUNSET + 24) % 24) / (24 - SUNSET + SUNRISE);
  return { x: 150 + t * 500, y: 318 - Math.sin(Math.PI * t) * 150 };
}

const STARS: [number, number, number][] = [[150, 120, 1.6], [230, 200, 1.1], [300, 100, 1.3], [380, 175, 1], [455, 110, 1.7], [520, 220, 1.1], [590, 150, 1.4], [650, 210, 1], [270, 250, 1], [420, 260, 1.2], [560, 90, 1], [200, 80, 1.1], [340, 290, 1], [610, 280, 1.2], [180, 270, 1]];
// Houses: [x, base y, width, wall height, roof height, roof color var, window columns].
type House = [number, number, number, number, number, string, number];
// Far: small, at the end of the street. Mid: bigger, flanking it. The street itself stays clear.
const FAR: House[] = [[262, 384, 34, 24, 15, '--roof-2', 1], [304, 384, 40, 30, 16, '--roof', 2], [456, 384, 38, 28, 16, '--roof-sun', 2], [502, 384, 32, 22, 14, '--roof', 1]];
const MID: House[] = [[24, 412, 86, 60, 36, '--roof', 2], [124, 408, 78, 76, 32, '--roof-2', 2], [226, 404, 92, 58, 38, '--roof-sun', 2], [596, 406, 84, 64, 34, '--roof-2', 2], [694, 410, 90, 78, 36, '--roof', 2]];
const TREES: [number, number, number][] = [[212, 398, 13], [330, 396, 11], [586, 398, 14], [690, 400, 12], [12, 404, 15], [790, 402, 15]];

function Houses({ list }: { list: House[] }) {
  return <>{list.map(([x, base, w, h, roof, color, cols], i) => <g key={i}>
    <rect x={x} y={base - h} width={w} height={h + 4} fill="var(--wall)"/>
    <path d={`M${x - w * 0.08} ${base - h} L${x + w / 2} ${base - h - roof} L${x + w * 1.08} ${base - h} Z`} fill={`var(${color})`}/>
    {Array.from({ length: cols }, (_, c) => <rect key={c} className="gs-window" x={x + (w / (cols + 1)) * (c + 1) - w * 0.09} y={base - h + h * 0.2} width={w * 0.18} height={h * 0.26} rx={w * 0.025}/>)}
    <rect x={x + w / 2 - w * 0.09} y={base - h * 0.36} width={w * 0.18} height={h * 0.36 + 4} rx={w * 0.025} fill="var(--door)"/>
  </g>)}</>;
}
/** One depth layer: its own SVG, so the browser can move it on the compositor. */
function Layer({ name, depth, children }: { name: string; depth: number; children: ReactNode }) {
  return <svg className={`gs-layer gs-${name}`} data-depth={depth} viewBox="0 0 800 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">{children}</svg>;
}

/**
 * The entrance of the fraccionamiento from the driver's seat: your car's hood at the bottom, the
 * road ahead, the barrier down in front of you, the street going on between the houses. The sky
 * lives on the person's clock (sun or moon where it really is, lit windows at night).
 *
 * It is drawn as depth layers (sky, far, mid, road, gate, hood), each its own SVG, all sharing one
 * vanishing point where the street meets the horizon. Driving in is one camera move: every layer
 * scales from that point by a different amount (see Login.css), so the near gate sweeps past and
 * out of frame while the far houses barely grow. That difference is what reads as moving forward
 * instead of zooming into a picture.
 *
 * The caseta's lamp says the state: amber, blinking while the phone asks for the passkey, green
 * on access (the arm lifts), red on a failure (the arm shakes).
 * On computers the layers drift a few pixels after the pointer (a spring, decorative only).
 */
export function GateScene({ now, gate }: { now: Date; gate: GateState }) {
  const root = useRef<HTMLDivElement>(null);
  const phase = dayPhase(now), orb = orbPosition(now);

  useEffect(() => {
    const el = root.current;
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layers = Array.from(el.querySelectorAll<SVGSVGElement>('[data-depth]')).map(layer => ({ layer, depth: Number(layer.dataset.depth) }));
    let tx = 0, ty = 0, x = 0, y = 0, frame = 0;
    // A spring toward the pointer: the layers arrive with a little lag instead of sticking to it.
    // It writes `translate`, which composes with the `transform` the drive uses.
    const tick = () => {
      x += (tx - x) * 0.07; y += (ty - y) * 0.07;
      for (const { layer, depth } of layers) layer.style.translate = `${(x * depth).toFixed(2)}px ${(y * depth * 0.4).toFixed(2)}px`;
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth - 0.5; ty = e.clientY / window.innerHeight - 0.5;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(frame); };
  }, []);

  return <div ref={root} className={`gate-scene ${phase} ${gate}`} aria-hidden="true">
    <Layer name="sky" depth={-4}>
      <defs><linearGradient id="gs-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--sky-1)"/><stop offset=".72" stopColor="var(--sky-2)"/></linearGradient></defs>
      <rect x="-200" y="-400" width="1200" height="1000" fill="url(#gs-sky)"/>
      <g className="gs-stars">{STARS.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r}/>)}</g>
      <circle className="gs-orb-glow" cx={orb.x} cy={orb.y} r="58"/>
      <circle className="gs-orb" cx={orb.x} cy={orb.y} r="30"/>
      <g className="gs-cloud"><rect x="96" y="232" width="92" height="22" rx="11"/><rect x="122" y="218" width="50" height="24" rx="12"/></g>
      <g className="gs-cloud"><rect x="560" y="262" width="110" height="24" rx="12"/><rect x="592" y="246" width="56" height="26" rx="13"/></g>
    </Layer>

    <Layer name="far" depth={-9}>
      <path fill="var(--hill-1)" d="M-200 372 Q-20 330 150 300 T330 356 T640 322 T1000 352 V560 H-200 Z"/>
      <path fill="var(--hill-2)" d="M-200 396 Q120 352 400 380 T1000 372 V560 H-200 Z"/>
      <Houses list={FAR}/>
    </Layer>

    <Layer name="mid" depth={-16}>
      <Houses list={MID}/>
      {TREES.map(([x, y, r], i) => <g key={i}><rect x={x - 2} y={y} width="4" height={r + 8} fill="var(--trunk)"/><circle cx={x} cy={y} r={r} fill="var(--tree)"/></g>)}
    </Layer>

    <Layer name="road" depth={-22}>
      <rect x="-200" y="380" width="1200" height="200" fill="var(--ground)"/>
      {/* The street runs from the horizon to under your hood; it is what you drive on. */}
      <path fill="var(--road)" d="M386 380 H414 L690 560 H110 Z"/>
      <path className="gs-road-edge" d="M386 380 L110 560 M414 380 L690 560"/>
      <ellipse className="gs-headlights" cx="400" cy="486" rx="150" ry="40"/>
      <path className="gs-road-line" d="M400 388 V560"/>
    </Layer>

    <Layer name="gate" depth={-30}>
      <defs><clipPath id="gs-arm-clip"><rect x="296" y="413" width="200" height="14" rx="7"/></clipPath></defs>
      {/* The caseta, right at the road's edge. */}
      <rect x="494" y="318" width="84" height="124" rx="4" fill="var(--wall)"/>
      <rect x="484" y="304" width="104" height="18" rx="5" fill="var(--roof)"/>
      <rect className="gs-window" x="506" y="338" width="40" height="34" rx="4"/>
      <rect x="553" y="384" width="17" height="58" rx="3" fill="var(--door)"/>
      {/* The barrier: the fork it rests on, the post, the counterweight and the striped arm. */}
      <rect x="298" y="416" width="9" height="26" rx="3" fill="var(--roof)"/>
      {/* The post carries the signal light: it says the state, and it stays in view on phones. */}
      <rect x="484" y="394" width="12" height="48" rx="3" fill="var(--roof)"/>
      <rect x="475" y="360" width="30" height="38" rx="9" fill="var(--roof)"/>
      <circle className="gs-lamp-glow" cx="490" cy="379" r="22"/>
      <circle className="gs-lamp" cx="490" cy="379" r="8.5"/>
      <g className="gs-arm">
        <rect x="486" y="410" width="32" height="20" rx="5" fill="var(--roof)"/>
        <rect x="296" y="413" width="200" height="14" rx="7" fill="#fff"/>
        <g clipPath="url(#gs-arm-clip)" fill="var(--sun)">{Array.from({ length: 5 }, (_, i) => <path key={i} d={`M${312 + i * 38} 413 h19 l-11 14 h-19 Z`}/>)}</g>
        <circle cx="490" cy="420" r="5.5" fill="var(--sun)"/>
      </g>
    </Layer>

    {/* Your car: the hood, seen from the driver's seat. It never leaves the frame. */}
    <Layer name="hood" depth={-2}>
      <defs><linearGradient id="gs-hood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--car-light)"/><stop offset=".5" stopColor="var(--car)"/><stop offset="1" stopColor="var(--car-top)"/></linearGradient></defs>
      <path fill="url(#gs-hood)" d="M-200 600 V548 C80 494 260 480 400 480 C540 480 720 494 1000 548 V600 Z"/>
      <path className="gs-hood-shine" d="M150 512 C260 492 330 487 400 487 C470 487 540 492 650 512"/>
      <path className="gs-hood-crease" d="M400 484 V600"/>
    </Layer>
  </div>;
}
