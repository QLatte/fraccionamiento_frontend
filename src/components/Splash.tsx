import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import AnimatedQr from './icons/AnimatedQr';
import './Splash.css';

// The app tells the splash when its first screen is mounted (see AppReady).
let appReady = false;
const listeners = new Set<() => void>();
export function markAppReady() { if (appReady) return; appReady = true; listeners.forEach(listener => listener()); }

const sessionKey = 'zentry:splash-shown';
const INTRO_MS = 2100;   // logo in → color wave → name reveal
const EXIT_MS = 750;     // wave drains and uncovers the app
const MAX_WAIT_MS = 6000;

/** Show once per session, never on the public pass link (the visitor needs the QR instantly). */
export function shouldShowSplash() {
  if (location.pathname.startsWith('/p/')) return false;
  try { if (sessionStorage.getItem(sessionKey)) return false; sessionStorage.setItem(sessionKey, '1'); } catch { /* Show it; storage is optional. */ }
  return true;
}

/**
 * Opening animation, replacing the loading spinner on app launch:
 * the mark appears, the brand color rises like a wave, the name slides out of
 * the mark, then the wave drains to uncover the first screen.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const word = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The mark starts centered on its own; shift it by half the name's width so it lands next to it.
  useLayoutEffect(() => {
    const width = word.current?.getBoundingClientRect().width ?? 0;
    root.current?.style.setProperty('--splash-shift', `${(width + 14) / 2}px`);
  }, []);

  useEffect(() => {
    const started = Date.now();
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
    const cap = window.setTimeout(leave, Math.max(MAX_WAIT_MS - (Date.now() - started), 0));
    listeners.add(maybeLeave);
    return () => { listeners.delete(maybeLeave); window.clearTimeout(intro); window.clearTimeout(cap); window.clearTimeout(exitTimer); };
  }, [onDone, reduced]);

  return <div ref={root} className={'splash' + (leaving ? ' splash-leaving' : '')} aria-hidden="true">
    <div className="splash-fill"/>
    <div className="splash-brand">
      <span className="splash-mark"><span className="splash-mark-bg"/><AnimatedQr size={36}/></span>
      <span className="splash-word-clip"><span ref={word} className="splash-word">Zentry<span className="splash-dot">.</span></span></span>
    </div>
  </div>;
}

/** Rendered inside the app's Suspense boundary: it mounts only once the first screen's code has loaded. */
export function AppReady() {
  useEffect(() => { markAppReady(); }, []);
  return null;
}
