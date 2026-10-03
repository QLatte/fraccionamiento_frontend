import { useEffect, useState } from 'react';
import './Splash.css';

// The app tells the splash when its first screen is mounted (see AppReady).
let appReady = false;
const listeners = new Set<() => void>();
export function markAppReady() { if (appReady) return; appReady = true; listeners.forEach(listener => listener()); }

const sessionKey = 'zentry:splash-shown';
const INTRO_MS = 2600;   // house appears → roof opens → QR rises out toward the camera → name lights up
const EXIT_MS = 750;     // the dark backdrop drains and uncovers the app
const MAX_WAIT_MS = 6000;

/** Show once per session, never on the public pass link (the visitor needs the QR instantly). */
export function shouldShowSplash() {
  if (location.pathname.startsWith('/p/')) return false;
  try { if (sessionStorage.getItem(sessionKey)) return false; sessionStorage.setItem(sessionKey, '1'); } catch { /* Show it; storage is optional. */ }
  return true;
}

// A stylised QR (decorative, not scannable): finder patterns plus a few modules on a 21×21 grid.
const QR_MODULES = [
  [8, 1], [10, 1], [12, 1], [9, 3], [11, 3], [8, 5], [12, 5], [1, 8], [3, 8], [5, 8], [8, 8], [10, 8], [13, 8], [15, 8], [18, 8],
  [9, 9], [11, 10], [14, 10], [17, 10], [19, 10], [2, 10], [4, 11], [8, 11], [12, 12], [15, 12], [18, 12], [1, 12], [6, 12],
  [9, 13], [13, 14], [16, 14], [19, 14], [8, 15], [11, 15], [15, 16], [17, 16], [9, 17], [12, 17], [19, 17], [10, 19], [13, 19], [16, 19], [18, 19],
];
const QR_ACCENTS = new Set(['11,10', '15,16', '9,13']);

function QrMark() {
  const finder = (x: number, y: number) => <g key={`${x}-${y}`}><rect className="splash-qr-ring" x={x + 0.5} y={y + 0.5} width="6" height="6" rx="1.6"/><rect x={x + 2} y={y + 2} width="3" height="3" rx=".8"/></g>;
  return <svg className="splash-qr-code" viewBox="0 0 21 21" aria-hidden="true">
    {finder(0, 0)}{finder(14, 0)}{finder(0, 14)}
    {QR_MODULES.map(([x, y]) => <rect key={`${x},${y}`} className={QR_ACCENTS.has(`${x},${y}`) ? 'splash-qr-accent' : undefined} x={x + 0.06} y={y + 0.06} width=".88" height=".88" rx=".24"/>)}
  </svg>;
}

/**
 * Minimal isometric house (2.5D, flat shading). Front-bottom corner at (100,165);
 * right wall runs along (0.866,-0.5)·70, left wall along (-0.866,-0.5)·60, walls 55 high,
 * gable roof with its ridge parallel to the right wall. The roof is two slopes hinged on
 * their eaves: they swing open (Splash.css) and light pours out of the house.
 */
function IsoHouse() {
  return <svg className="splash-house" viewBox="0 0 200 200" aria-hidden="true">
    <defs>
      <linearGradient id="splash-left" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b7d91"/><stop offset="1" stopColor="#1d5a6c"/></linearGradient>
      <linearGradient id="splash-right" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a4c5c"/><stop offset="1" stopColor="#123c4a"/></linearGradient>
      <linearGradient id="splash-roof" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0f3140"/><stop offset="1" stopColor="#0b2632"/></linearGradient>
      <radialGradient id="splash-inside-glow" cx=".5" cy=".55" r=".6"><stop offset="0" stopColor="#e6fffb"/><stop offset=".5" stopColor="#5fe3d0"/><stop offset="1" stopColor="#1d6f7f"/></radialGradient>
      <linearGradient id="splash-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#bffcf3" stopOpacity=".95"/><stop offset=".45" stopColor="#5fe3d0" stopOpacity=".35"/><stop offset="1" stopColor="#5fe3d0" stopOpacity="0"/></linearGradient>
    </defs>
    <ellipse className="splash-house-shadow" cx="104" cy="168" rx="70" ry="18"/>
    {/* Top of the walls: the lit inside, hidden under the roof until it opens. */}
    <path className="splash-inside" fill="url(#splash-inside-glow)" d="M100 110 L160.6 75 L108.6 45 L48 80 Z"/>
    {/* Left wall with the gable end (faces the viewer's left). */}
    <path fill="url(#splash-left)" d="M100 165 L48 135 L48 80 L74 65 L100 110 Z"/>
    {/* Right wall (faces the viewer's right). */}
    <path fill="url(#splash-right)" d="M100 165 L160.6 130 L160.6 75 L100 110 Z"/>
    <path className="splash-window" d="M66 112 L80 120 L80 104 L66 96 Z"/>
    <path className="splash-door" d="M123 151.7 L137.6 143.3 L137.6 107.3 L123 115.7 Z"/>
    {/* Back slope, drawn upright; it starts folded flat (invisible) and lifts open. */}
    <path className="splash-roof-back splash-roof-lit" d="M44 83 L112 44 L112 1.6 L44 40.6 Z"/>
    <path className="splash-beam" fill="url(#splash-beam)" d="M52 82 L100 108 L158 76 L150 -46 L60 -46 Z"/>
    {/* Front slope with its warm eave line; its underside lights up as it tips toward us. */}
    <g className="splash-roof-front">
      <path fill="url(#splash-roof)" d="M96 113 L164 74 L138 29 L70 68 Z"/>
      <path className="splash-roof-glow" d="M96 113 L164 74 L138 29 L70 68 Z"/>
      <path className="splash-eave" d="M96 113 L164 74"/>
      <path className="splash-ridge" d="M70 68 L138 29"/>
    </g>
    <circle className="splash-spark" cx="88" cy="70" r="1.6"/>
    <circle className="splash-spark" cx="118" cy="62" r="1.2"/>
    <circle className="splash-spark" cx="104" cy="76" r="1.8"/>
    <circle className="splash-spark" cx="128" cy="70" r="1.1"/>
  </svg>;
}

/**
 * Opening animation, replacing the loading spinner on app launch: a minimal
 * isometric house opens its roof, light pours out and a holographic QR rises from
 * inside toward the camera while the house sinks back, then the name lights up below.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let introDone = false;
    let exitTimer = 0;
    const leave = () => {
      if (exitTimer) return;
      setLeaving(true);
      exitTimer = window.setTimeout(onDone, reduced ? 250 : EXIT_MS);
    };
    const maybeLeave = () => { if (introDone && appReady) leave(); };
    const intro = window.setTimeout(() => { introDone = true; maybeLeave(); }, reduced ? 400 : INTRO_MS);
    // Never trap the user behind the animation if the app fails to signal readiness.
    const cap = window.setTimeout(leave, MAX_WAIT_MS);
    listeners.add(maybeLeave);
    return () => { listeners.delete(maybeLeave); window.clearTimeout(intro); window.clearTimeout(cap); window.clearTimeout(exitTimer); };
  }, [onDone, reduced]);

  return <div className={'splash' + (leaving ? ' splash-leaving' : '')} aria-hidden="true">
    <div className="splash-fill"/>
    <div className="splash-content">
      <div className="splash-stage">
        <div className="splash-house-wrap"><IsoHouse/></div>
        <div className="splash-qr"><span className="splash-qr-shine"/><QrMark/></div>
      </div>
      <div className="splash-name"><span className="splash-name-text">Zentry<span className="splash-dot">.</span></span></div>
    </div>
  </div>;
}

/** Rendered inside the app's Suspense boundary: it mounts only once the first screen's code has loaded. */
export function AppReady() {
  useEffect(() => { markAppReady(); }, []);
  return null;
}
