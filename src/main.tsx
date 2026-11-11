import { createRoot } from 'react-dom/client';
import App from './App';
import './tailwind.css';
import './styles.css';
// After a deploy, an open tab may request a screen chunk the server no longer has.
// Reload once to pick up the new version; the flag prevents a reload loop.
window.addEventListener('vite:preloadError', event => {
  try {
    if (sessionStorage.getItem('zentry:chunk-reload')) return;
    sessionStorage.setItem('zentry:chunk-reload', '1');
  } catch { return; }
  event.preventDefault();
  location.reload();
});
// Allow another recovery only after this load has been stable for a while.
window.setTimeout(() => { try { sessionStorage.removeItem('zentry:chunk-reload'); } catch { /* optional */ } }, 15_000);
// The app behaves like a native one on phones: no pinch or double-tap zoom. iOS Safari ignores
// user-scalable=no in the viewport tag, so its pinch gestures are cancelled here.
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, event => event.preventDefault(), { passive: false });
// On phones, while the on-screen keyboard is up the floating dock would sit right on top of it and
// cover what is being typed: <html> gets .keyboard-open so the dock steps aside. --vvh is the
// height left above the keyboard, so the chat can fit in it.
{
  const root = document.documentElement, touch = matchMedia('(pointer: coarse)');
  const noKeyboard = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'hidden', 'image'];
  const typing = (el: Element | null) => !!el && (el.matches('textarea, [contenteditable="true"]') || (el instanceof HTMLInputElement && !noKeyboard.includes(el.type) && !el.readOnly));
  document.addEventListener('focusin', event => { if (touch.matches && typing(event.target as Element)) root.classList.add('keyboard-open'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!typing(document.activeElement)) root.classList.remove('keyboard-open'); }, 50));
  const viewport = window.visualViewport;
  const fit = () => {
    if (!viewport) return;
    // Both live on <html> and inherit everywhere, so they are only written when they change.
    const height = `${Math.round(viewport.height)}px`, top = `${Math.round(viewport.offsetTop)}px`;
    if (root.style.getPropertyValue('--vvh') !== height) root.style.setProperty('--vvh', height);
    // iOS can shift the visible area down when the keyboard opens; full-screen views follow it.
    if (root.style.getPropertyValue('--vvt') !== top) root.style.setProperty('--vvt', top);
    // iOS scrolls the page up to show the field; in the chat everything already fits above the keyboard.
    if (root.classList.contains('keyboard-open') && document.querySelector('.chat-page')) window.scrollTo(0, 0);
  };
  viewport?.addEventListener('resize', fit); viewport?.addEventListener('scroll', fit); fit();
}
createRoot(document.getElementById('root')!).render(<App/>);
