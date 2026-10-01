import { useEffect, useState } from 'react';
import './Splash.css';

// The app tells the splash when its first screen is mounted (see AppReady).
let appReady = false;
const listeners = new Set<() => void>();
export function markAppReady() { if (appReady) return; appReady = true; listeners.forEach(listener => listener()); }

const sessionKey = 'zentry:splash-shown';
const INTRO_MS = 2450;   // house draws → roof lifts → QR emerges and settles → name slides up
const EXIT_MS = 750;     // the dark backdrop drains and uncovers the app
const MAX_WAIT_MS = 6000;

/** Show once per session, never on the public pass link (the visitor needs the QR instantly). */
export function shouldShowSplash() {
  if (location.pathname.startsWith('/p/')) return false;
  try { if (sessionStorage.getItem(sessionKey)) return false; sessionStorage.setItem(sessionKey, '1'); } catch { /* Show it; storage is optional. */ }
  return true;
}

// A small, stylised QR (not scannable): finder patterns plus a few modules on a 21×21 grid.
const QR_MODULES = [
  [8, 1], [10, 1], [12, 1], [9, 3], [11, 3], [8, 5], [12, 5], [1, 8], [3, 8], [5, 8], [8, 8], [10, 8], [13, 8], [15, 8], [18, 8],
  [9, 9], [11, 10], [14, 10], [17, 10], [19, 10], [2, 10], [4, 11], [8, 11], [12, 12], [15, 12], [18, 12], [1, 12], [6, 12],
  [9, 13], [13, 14], [16, 14], [19, 14], [8, 15], [11, 15], [15, 16], [17, 16], [9, 17], [12, 17], [19, 17], [10, 19], [13, 19], [16, 19], [18, 19],
];
const QR_ACCENTS = new Set(['11,10', '15,16', '9,13']);

function QrMark() {
  const finder = (x: number, y: number) => <g key={`${x}-${y}`}><rect x={x + 0.5} y={y + 0.5} width="6" height="6" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1"/><rect x={x + 2} y={y + 2} width="3" height="3" rx=".8" fill="currentColor"/></g>;
  return <svg className="splash-qr-code" viewBox="0 0 21 21" aria-hidden="true">
    {finder(0, 0)}{finder(14, 0)}{finder(0, 14)}
    {QR_MODULES.map(([x, y]) => <rect key={`${x},${y}`} className={QR_ACCENTS.has(`${x},${y}`) ? 'splash-qr-accent' : undefined} x={x + 0.06} y={y + 0.06} width=".88" height=".88" rx=".24"/>)}
  </svg>;
}

/**
 * Opening animation, replacing the loading spinner on app launch: a line-drawn
 * house opens its roof like a box, a QR emerges and bounces into the center as
 * the house fades, then the app name slides up. The backdrop then drains away.
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
        <svg className="splash-house" viewBox="0 0 120 120" aria-hidden="true">
          <g className="splash-roof"><path pathLength="1" d="M18 62 L60 26 L102 62"/><path className="splash-chimney" pathLength="1" d="M82 44 V30 H90 V51"/></g>
          <g className="splash-body"><path pathLength="1" d="M28 58 V96 Q28 102 34 102 H86 Q92 102 92 96 V58"/><path className="splash-door" pathLength="1" d="M52 102 V82 Q52 78 56 78 H64 Q68 78 68 82 V102"/></g>
        </svg>
        <div className="splash-qr"><QrMark/></div>
      </div>
      <div className="splash-name-clip"><span className="splash-name">Zentry<span className="splash-dot">.</span></span></div>
    </div>
  </div>;
}

/** Rendered inside the app's Suspense boundary: it mounts only once the first screen's code has loaded. */
export function AppReady() {
  useEffect(() => { markAppReady(); }, []);
  return null;
}
