import { useEffect, useRef, useState } from 'react';
import { useAnimate } from 'motion/react-mini';
import './Splash.css';

// The app tells the splash when its first screen is mounted (see AppReady).
let appReady = false;
const listeners = new Set<() => void>();
export function markAppReady() { if (appReady) return; appReady = true; listeners.forEach(listener => listener()); }

const sessionKey = 'zentry:splash-shown';
const MAX_WAIT_MS = 6000; // never trap anyone behind the animation if the app does not signal readiness

/** Show once per session, never on the public pass link (the visitor needs the QR instantly). */
export function shouldShowSplash() {
  if (location.pathname.startsWith('/p/')) return false;
  try { if (sessionStorage.getItem(sessionKey)) return false; sessionStorage.setItem(sessionKey, '1'); } catch { /* Show it; storage is optional. */ }
  return true;
}

// Strong ease-out (moves at once, settles softly) and a gentle overshoot for the tile landing.
const OUT = [0.23, 1, 0.32, 1] as const;
const LAND = [0.34, 1.36, 0.64, 1] as const;
// Staggered delays (what Motion's stagger does), written here so the splash only pulls in the 2 KB mini animate.
const stagger = (step: number, { startDelay = 0, from }: { startDelay?: number; from?: 'center' } = {}) =>
  (i: number, total: number) => startDelay + step * (from === 'center' ? Math.abs(i - (total - 1) / 2) : i);

/**
 * Opening animation built from the Zentry mark itself: the tile lands, its QR draws in
 * (the three corners trace themselves, then the modules), a sun scan line sweeps once like
 * the gate reading a pass, and the name rises letter by letter. About 1.4 s; seen once per
 * session, so it can afford a little delight.
 *
 * Motion's mini animate runs on the Web Animations API, off the main thread: the splash plays
 * exactly while the app is loading, when the main thread is busiest. Only transform, opacity,
 * filter and stroke-dashoffset animate.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [leaving, setLeaving] = useState(false);
  const left = useRef(false);

  useEffect(() => {
    // The splash now covers the screen: drop the petrol placeholder painted by index.html.
    document.documentElement.classList.remove('boot-splash');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let introDone = false, cancelled = false;
    let cap = 0;

    async function leave() {
      if (left.current || cancelled) return;
      left.current = true; setLeaving(true);
      // Exit faster than the entrance: the app is ready, get out of the way.
      if (!reduced) animate('.splash-mark', { transform: ['scale(1)', 'scale(1.06)'], opacity: [1, 0] }, { duration: 0.26, ease: OUT });
      await animate(scope.current!, { opacity: [1, 0] }, { duration: reduced ? 0.2 : 0.34, ease: OUT, delay: reduced ? 0 : 0.06 });
      if (!cancelled) onDone();
    }
    const maybeLeave = () => { if (introDone && appReady) void leave(); };

    async function intro() {
      if (reduced) {
        // Reduced motion: the mark simply appears, no movement.
        await animate('.splash-mark', { opacity: [0, 1] }, { duration: 0.3 });
      } else {
        // 1. The tile lands (never from nothing: from 0.88 with opacity).
        animate('.splash-tile', { transform: ['scale(0.88)', 'scale(1)'], opacity: [0, 1] }, { duration: 0.5, ease: LAND });
        // 2. The three corners trace themselves, then their centers settle in.
        animate('.qr-corner', { strokeDashoffset: [1, 0] }, { duration: 0.46, ease: OUT, delay: stagger(0.07, { startDelay: 0.16 }) });
        animate('.qr-eye', { transform: ['scale(0.4)', 'scale(1)'], opacity: [0, 1] }, { duration: 0.32, ease: OUT, delay: stagger(0.07, { startDelay: 0.42 }) });
        // 3. The modules fill in from the center outward.
        animate('.qr-bit', { strokeDashoffset: [1, 0], opacity: [0, 1] }, { duration: 0.3, ease: OUT, delay: stagger(0.035, { startDelay: 0.5, from: 'center' }) });
        // 4. One scan sweep in sun color, like the gate reading a pass.
        animate('.splash-scan', { transform: ['translateY(-8%)', 'translateY(108%)'], opacity: [0, 1, 1, 0] }, { duration: 0.62, ease: [0.65, 0, 0.35, 1], delay: 0.72 });
        // 5. The name rises letter by letter; a little blur bridges each letter in. The sun dot lands last.
        animate('.splash-letter', { transform: ['translateY(10px)', 'translateY(0)'], opacity: [0, 1], filter: ['blur(4px)', 'blur(0px)'] }, { duration: 0.42, ease: OUT, delay: stagger(0.035, { startDelay: 0.62 }) });
        await animate('.splash-dot', { transform: ['scale(0.5)', 'scale(1)'], opacity: [0, 1] }, { duration: 0.36, ease: LAND, delay: 0.98 });
      }
      introDone = true; maybeLeave();
    }

    void intro();
    cap = window.setTimeout(() => void leave(), MAX_WAIT_MS);
    listeners.add(maybeLeave);
    return () => { cancelled = true; listeners.delete(maybeLeave); window.clearTimeout(cap); };
  }, [animate, onDone, scope]);

  return <div ref={scope} className={'splash' + (leaving ? ' splash-leaving' : '')} aria-hidden="true">
    <div className="splash-mark">
      <div className="splash-tile">
        {/* The Zentry mark (same glyph as the logo). pathLength=1 lets each stroke draw in by its dash offset. */}
        <svg className="splash-qr" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="square">
          <path className="qr-corner" pathLength={1} d="M3 3h9v9H3z"/>
          <path className="qr-corner" pathLength={1} d="M20 3h9v9h-9z"/>
          <path className="qr-corner" pathLength={1} d="M3 20h9v9H3z"/>
          <rect className="qr-eye" x="6.5" y="6.5" width="2" height="2" fill="currentColor" stroke="none"/>
          <rect className="qr-eye" x="23.5" y="6.5" width="2" height="2" fill="currentColor" stroke="none"/>
          <rect className="qr-eye" x="6.5" y="23.5" width="2" height="2" fill="currentColor" stroke="none"/>
          <path className="qr-bit" pathLength={1} d="M16 7V10"/>
          <path className="qr-bit" pathLength={1} d="M3 16H7"/>
          <path className="qr-bit" pathLength={1} d="M13 16H18V20H16"/>
          <path className="qr-bit qr-sun" pathLength={1} d="M22 16H26"/>
          <path className="qr-bit" pathLength={1} d="M22 16V23H29"/>
          <path className="qr-bit" pathLength={1} d="M16 25V29H23V27"/>
          <path className="qr-bit" pathLength={1} d="M27 20h2v2h-2z"/>
        </svg>
        <span className="splash-scan"/>
      </div>
      <div className="splash-name" aria-label="Zentry">
        {'Zentry'.split('').map((c, i) => <span key={i} className="splash-letter">{c}</span>)}<span className="splash-dot">.</span>
      </div>
    </div>
  </div>;
}

/** Rendered inside the app's Suspense boundary: it mounts only once the first screen's code has loaded. */
export function AppReady() {
  useEffect(() => { markAppReady(); }, []);
  return null;
}
