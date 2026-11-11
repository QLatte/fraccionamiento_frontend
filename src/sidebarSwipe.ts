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
// Where the menu is right now, also halfway through its opening or closing transition.
const currentOffset = (el: HTMLElement) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;

/**
 * Opens the side menu by sliding a finger left to right anywhere on the screen, and closes it by
 * sliding back. While the finger is down the menu and the dimmed background follow it 1:1; on
 * release it finishes where the swipe was heading (a quick flick is enough). It can be caught
 * mid-animation. The swipe does not need to start at the screen edge, where the phone's own
 * «back» gesture lives.
 */
export function useSidebarSwipe(sidebar: RefObject<HTMLElement | null>, scrim: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let mode: 'undecided' | 'drag' | 'ignore' = 'ignore';
    let width = 300, base = 0, offset = 0, lastX = 0, lastT = 0, speed = 0;
    const place = (value: number) => {
      const s = sidebar.current, b = scrim.current; if (!s) return;
      offset = Math.max(-width, Math.min(0, value));
      s.style.transition = 'none'; s.style.visibility = 'visible'; s.style.transform = `translateX(${offset}px)`;
      if (b) { b.style.transition = 'none'; b.style.visibility = 'visible'; b.style.opacity = String(1 + offset / width); }
    };
    const release = () => {
      for (const el of [sidebar.current, scrim.current]) if (el) { el.style.transition = ''; el.style.visibility = ''; el.style.transform = ''; el.style.opacity = ''; }
    };

    function down(e: TouchEvent) {
      mode = 'ignore';
      const s = sidebar.current;
      if (!s || !phone() || e.touches.length !== 1 || document.querySelector('dialog[open]')) return;
      width = s.offsetWidth || 300;
      base = currentOffset(s);
      const visible = base > -width + 1;
      // With the menu showing, any swipe moves it; with it hidden, not inside sideways scrollers.
      if (!visible && scrollsSideways(e.target)) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY }; lastX = t.clientX; lastT = e.timeStamp; speed = 0;
      mode = 'undecided';
      // Caught mid-animation: hold it where it is instead of letting it jump.
      if (visible && base < -1) place(base);
    }
    function move(e: TouchEvent) {
      if (mode === 'ignore' || !start) return;
      const t = e.touches[0];
      const x = t.clientX - start.x, y = t.clientY - start.y;
      if (mode === 'undecided') {
        if (Math.abs(x) < DECIDE && Math.abs(y) < DECIDE) return;
        const sideways = Math.abs(x) > Math.abs(y) * 1.3;
        // Closed: only a swipe to the right opens. Open: only a swipe to the left closes. Halfway: either.
        const allowed = base <= -width + 1 ? x > 0 : base >= -1 ? x < 0 : true;
        if (!sideways || !allowed) { mode = 'ignore'; if (base < -1 && base > -width + 1) settle(); return; }
        mode = 'drag';
      }
      e.preventDefault(); // the page must not scroll while the menu follows the finger
      if (e.timeStamp > lastT) speed = 0.8 * ((t.clientX - lastX) / (e.timeStamp - lastT)) + 0.2 * speed;
      lastX = t.clientX; lastT = e.timeStamp;
      place(base + x);
    }
    // Finishes toward where the swipe was heading: position plus a short projection of its speed.
    function settle() {
      const projected = offset + speed * 180;
      const next = projected > -width / 2;
      if (next !== openRef.current) setOpen(next);
      // Once React has applied the state, the CSS transition finishes from where the finger left it.
      requestAnimationFrame(() => requestAnimationFrame(release));
    }
    function up() {
      const was = mode; mode = 'ignore';
      if (was === 'drag') settle();
      else if (was === 'undecided' && base < -1 && base > -width + 1) { offset = base; speed = 0; settle(); }
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
  }, [sidebar, scrim, setOpen]);
}
