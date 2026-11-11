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
document.addEventListener('touchmove', event => { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });
createRoot(document.getElementById('root')!).render(<App/>);
