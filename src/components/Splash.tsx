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

// Strong ease-out (moves at once, settles softly); the iOS drawer curve for the gate leaves.
const OUT = [0.23, 1, 0.32, 1] as const;
const GATE = [0.32, 0.72, 0, 1] as const;

// A stylised QR (decorative, not scannable) on a 21×21 grid: three finder patterns and loose modules.
const MODULES: [number, number][] = [
  [8, 1], [10, 1], [12, 1], [9, 3], [11, 3], [8, 5], [12, 5], [1, 8], [3, 8], [5, 8], [8, 8], [10, 8], [13, 8], [15, 8], [18, 8],
  [9, 9], [11, 10], [14, 10], [17, 10], [19, 10], [2, 10], [4, 11], [8, 11], [12, 12], [15, 12], [18, 12], [1, 12], [6, 12],
  [9, 13], [13, 14], [16, 14], [19, 14], [8, 15], [11, 15], [15, 16], [17, 16], [9, 17], [12, 17], [19, 17], [10, 19], [13, 19], [16, 19], [18, 19],
  [10, 6], [14, 4], [16, 2], [19, 5], [3, 15], [5, 18], [6, 16],
];
const ACCENTS = new Set(['11,10', '15,16', '9,13']);
const FINDERS: [number, number][] = [[0, 0], [14, 0], [0, 14]];
// Every piece of the code with its centre, so motion can be ordered by distance from the middle.
const PIECES = [
  ...FINDERS.map(([x, y]) => ({ kind: 'finder' as const, x, y, cx: x + 3.5, cy: y + 3.5 })),
  ...MODULES.map(([x, y]) => ({ kind: 'module' as const, x, y, cx: x + 0.5, cy: y + 0.5 })),
];
// Deterministic scatter (same on every render and in both gate leaves).
function scatter(i: number) {
  let s = ((i + 1) * 2654435761) >>> 0;
  const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  const angle = r() * Math.PI * 2, far = 18 + r() * 22; // grid units (one unit ≈ 8 px on screen)
  return { dx: Math.cos(angle) * far, dy: Math.sin(angle) * far, rot: (r() - 0.5) * 220, scale: 0.4 + r() * 0.5 };
}
const distance = (p: { cx: number; cy: number }) => Math.hypot(p.cx - 10.5, p.cy - 10.5);

/** The Zentry code (decorative QR) shared by the splash and the login. */
export function ZentryCode({ className = '' }: { className?: string }) {
  return <svg className={'zentry-code ' + className} viewBox="0 0 21 21" aria-hidden="true">
    {PIECES.map((p, i) => p.kind === 'finder'
      ? <g key={i} className="zc-piece zc-finder" data-i={i}>
          <rect x={p.x + 0.5} y={p.y + 0.5} width="6" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1"/>
          <rect x={p.x + 2} y={p.y + 2} width="3" height="3" rx=".7" fill="currentColor"/>
        </g>
      : <rect key={i} className={'zc-piece zc-module' + (ACCENTS.has(`${p.x},${p.y}`) ? ' zc-accent' : '')} data-i={i} x={p.x + 0.07} y={p.y + 0.07} width=".86" height=".86" rx=".24"/>)}
  </svg>;
}

/** What each gate leaf shows: the whole scene, cut in half by the leaf. */
function Scene() {
  return <div className="splash-scene">
    <div className="splash-stage">
      <div className="splash-code-wrap"><ZentryCode className="splash-code"/><span className="splash-scan"/></div>
      <div className="splash-name">{'Zentry'.split('').map((c, i) => <span key={i} className="splash-letter" data-i={i}>{c}</span>)}<span className="splash-dot">.</span></div>
    </div>
  </div>;
}

/**
 * Opening animation, about «access»: scattered pieces fly in from all over the screen and lock
 * into a QR code; a sun scan line reads it and a wave of light runs through it (access granted);
 * the name rises. Then the screen opens like a gate: light through the seam, two leaves part and
 * reveal the app. ~1.6 s in, ~0.55 s out; seen once per session.
 *
 * Motion's mini animate runs on the Web Animations API, off the main thread, which matters
 * because the splash plays while the app loads. Only transform, opacity, filter and fill animate.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [leaving, setLeaving] = useState(false);
  const left = useRef(false);

  useEffect(() => {
    // The splash now covers the screen: drop the petrol placeholder painted by index.html.
    document.documentElement.classList.remove('boot-splash');
    const root = scope.current!;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const all = (selector: string) => Array.from(root.querySelectorAll<Element>(selector));
    const index = (el: Element) => Number(el.getAttribute('data-i'));
    let introDone = false, cancelled = false;

    async function leave() {
      if (left.current || cancelled) return;
      left.current = true; setLeaving(true);
      if (reduced) { await animate(root, { opacity: [1, 0] }, { duration: 0.25 }); if (!cancelled) onDone(); return; }
      // Light slips through the seam, then the two leaves part like a gate.
      animate('.splash-seam', { transform: ['scaleY(0)', 'scaleY(1)'], opacity: [0, 1, 0] }, { duration: 0.5, ease: OUT });
      animate('.splash-leaf-left', { transform: ['translateX(0)', 'translateX(-101%)'] }, { duration: 0.55, ease: GATE, delay: 0.08 });
      await animate('.splash-leaf-right', { transform: ['translateX(0)', 'translateX(101%)'] }, { duration: 0.55, ease: GATE, delay: 0.08 });
      if (!cancelled) onDone();
    }
    const maybeLeave = () => { if (introDone && appReady) void leave(); };

    async function intro() {
      if (reduced) {
        await animate('.splash-stage', { opacity: [0, 1] }, { duration: 0.3 });
      } else {
        // 1. Pieces fly in from all over and lock into place, the middle first.
        for (const el of all('.zc-piece')) {
          const i = index(el), p = PIECES[i], s = scatter(i);
          animate(el, {
            transform: [`translate(${s.dx}px, ${s.dy}px) rotate(${s.rot}deg) scale(${s.scale})`, 'translate(0px, 0px) rotate(0deg) scale(1)'],
            opacity: [0, 1],
          }, { duration: p.kind === 'finder' ? 0.62 : 0.55, ease: OUT, delay: 0.05 + distance(p) * 0.028 });
        }
        // 2. One scan sweep reads the code...
        animate('.splash-scan', { transform: ['translateY(-6%)', 'translateY(106%)'], opacity: [0, 1, 1, 0] }, { duration: 0.6, ease: [0.65, 0, 0.35, 1], delay: 0.62 });
        // ...and a wave of sun light runs through it from the middle: access granted.
        for (const el of all('.zc-module:not(.zc-accent)')) {
          animate(el, { fill: ['#f2f6f8', '#f3cf86', '#f2f6f8'] }, { duration: 0.46, ease: OUT, delay: 0.95 + distance(PIECES[index(el)]) * 0.022 });
        }
        // 3. The name rises letter by letter; a little blur bridges each letter in. The sun dot lands last.
        for (const el of all('.splash-letter')) {
          animate(el, { transform: ['translateY(12px)', 'translateY(0px)'], opacity: [0, 1], filter: ['blur(5px)', 'blur(0px)'] }, { duration: 0.44, ease: OUT, delay: 0.9 + index(el) * 0.04 });
        }
        await animate('.splash-dot', { transform: ['scale(0.4)', 'scale(1.15)', 'scale(1)'], opacity: [0, 1, 1] }, { duration: 0.4, ease: OUT, delay: 1.22 });
      }
      introDone = true; maybeLeave();
    }

    void intro();
    const cap = window.setTimeout(() => void leave(), MAX_WAIT_MS);
    listeners.add(maybeLeave);
    return () => { cancelled = true; listeners.delete(maybeLeave); window.clearTimeout(cap); };
  }, [animate, onDone, scope]);

  return <div ref={scope} className={'splash' + (leaving ? ' splash-leaving' : '')} aria-hidden="true">
    {/* Two leaves, each showing half of the same scene: they part at the end like a gate. */}
    <div className="splash-leaf splash-leaf-left"><Scene/></div>
    <div className="splash-leaf splash-leaf-right"><Scene/></div>
    <span className="splash-seam"/>
  </div>;
}

/** Rendered inside the app's Suspense boundary: it mounts only once the first screen's code has loaded. */
export function AppReady() {
  useEffect(() => { markAppReady(); }, []);
  return null;
}
