import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

function AppReady() {
  useEffect(() => {
    const startup = document.getElementById('sica-startup');
    if (!startup) return;
    const remove = () => startup.remove();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { remove(); return; }
    // The app has committed. Release interaction immediately; only the exit fades.
    startup.inert = true;
    startup.setAttribute('aria-hidden', 'true');
    startup.classList.add('is-leaving');
    startup.addEventListener('transitionend', remove, { once: true });
    const fallback = window.setTimeout(remove, 260);
    return () => {
      window.clearTimeout(fallback);
      startup.removeEventListener('transitionend', remove);
      remove();
    };
  }, []);
  return <App/>;
}

createRoot(document.getElementById('root')!).render(<AppReady/>);
