import { useEffect, type RefObject } from 'react';

// Shared driver for the CSS-free animated icons (ported from lucide-animated without Motion):
// they play with the browser's Web Animations API when their button or link is hovered,
// pressed or focused, optionally once on mount and/or on a loop, and never with
// "reduce motion" on. Timing comes from the app's motion tokens.
export const EASE = 'cubic-bezier(.32, .72, 0, 1)';
export const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
export const WIGGLE = 'cubic-bezier(.45, 0, .55, 1)';

type Options = { autoplay?: boolean | number; every?: number };

export function useIconMotion(ref: RefObject<SVGSVGElement | null>, play: (svg: SVGSVGElement) => Animation[], { autoplay = false, every }: Options = {}) {
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let running: Animation[] = [];
    const start = () => {
      if (reduced()) return;
      running.forEach(a => a.cancel());
      running = play(svg);
    };
    const trigger = svg.closest('button, a');
    const hover = (event: Event) => { if ((event as PointerEvent).pointerType === 'mouse') start(); };
    trigger?.addEventListener('pointerenter', hover);
    trigger?.addEventListener('pointerdown', start);
    trigger?.addEventListener('focus', start);
    const timers: number[] = [];
    if (autoplay !== false) timers.push(window.setTimeout(start, typeof autoplay === 'number' ? autoplay : 0));
    if (every) timers.push(window.setInterval(() => { if (document.visibilityState === 'visible') start(); }, every));
    return () => {
      trigger?.removeEventListener('pointerenter', hover);
      trigger?.removeEventListener('pointerdown', start);
      trigger?.removeEventListener('focus', start);
      timers.forEach(t => { window.clearTimeout(t); window.clearInterval(t); });
      running.forEach(a => a.cancel());
    };
  }, [ref, play, autoplay, every]);
}

/** Draws a stroke from nothing; the path needs pathLength="1" and stroke-dasharray 1. */
export const draw = (el: Element, duration: number, delay = 0, easing = EASE, fill: FillMode = 'backwards') =>
  el.animate([{ strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 1, opacity: 1, offset: 0.01 }, { strokeDashoffset: 0, opacity: 1 }], { duration, delay, easing, fill });
