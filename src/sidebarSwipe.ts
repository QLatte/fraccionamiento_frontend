import { useEffect, useRef, type RefObject } from 'react';

const DECIDE = 12; // px before deciding whether the finger moves sideways or scrolls
const phone = () => window.matchMedia('(max-width: 1024px)').matches;

// A sideways swipe inside something that scrolls sideways (a table, a tab strip) belongs to it.
function scrollsSideways(target: EventTarget | null) {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) return true;
    const overflow = getComputedStyle(el).overflowX;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

/**
 * Opens the side menu by sliding a finger left to right anywhere on the screen (it follows the
 * finger), and closes it by sliding back. The swipe does not need to start at the screen edge,
 * which is where the phone's own «back» gesture lives.
 */
export function useSidebarSwipe(sidebar: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;
    let mode: 'undecided' | 'drag' | 'ignore' = 'ignore';
    let width = 300, dx = 0, lastX = 0, lastT = 0, speed = 0;
    const el = () => sidebar.current;
    const place = (offset: number) => {
      const s = el(); if (!s) return;
      s.style.transition = 'none'; s.style.visibility = 'visible';
      s.style.transform = `translateX(${offset}px)`;
    };
    const release = () => { const s = el(); if (!s) return; s.style.transition = ''; s.style.visibility = ''; s.style.transform = ''; };

    function down(e: TouchEvent) {
      mode = 'ignore';
      if (!phone() || e.touches.length !== 1 || document.querySelector('dialog[open]')) return;
      // With the menu open, any swipe can close it; with it closed, not inside sideways scrollers.
      if (!openRef.current && scrollsSideways(e.target)) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp }; lastX = t.clientX; lastT = e.timeStamp; dx = 0; speed = 0;
      width = el()?.offsetWidth || 300;
      mode = 'undecided';
    }
    function move(e: TouchEvent) {
      if (mode === 'ignore' || !start) return;
      const t = e.touches[0];
      const x = t.clientX - start.x, y = t.clientY - start.y;
      if (mode === 'undecided') {
        if (Math.abs(x) < DECIDE && Math.abs(y) < DECIDE) return;
        const sideways = Math.abs(x) > Math.abs(y) * 1.3;
        const right = openRef.current ? x < 0 : x > 0;
        if (!sideways || !right) { mode = 'ignore'; return; }
        mode = 'drag';
      }
      e.preventDefault(); // the page must not scroll while the menu follows the finger
      if (e.timeStamp > lastT) speed = (t.clientX - lastX) / (e.timeStamp - lastT);
      lastX = t.clientX; lastT = e.timeStamp;
      dx = x;
      place(openRef.current ? Math.min(0, x) : Math.min(0, -width + x));
    }
    function up() {
      if (mode !== 'drag') { mode = 'ignore'; return; }
      mode = 'ignore';
      const opening = !openRef.current;
      const done = opening ? dx > width * 0.35 || (speed > 0.35 && dx > 30) : -dx > width * 0.35 || (speed < -0.35 && dx < -30);
      const next = opening ? done : !done;
      setOpen(next);
      // Once React has applied the new state, let the CSS transition finish from where the finger left it.
      requestAnimationFrame(() => requestAnimationFrame(release));
    }
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
    return () => {
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', up);
      release();
    };
  }, [sidebar, setOpen]);
}
