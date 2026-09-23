import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let availablePrompt: InstallPrompt | null = null;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); availablePrompt = event as InstallPrompt; window.dispatchEvent(new Event('sica:install')); });
export function InstallButton() {
  const [prompt, setPrompt] = useState(availablePrompt); const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches);
  useEffect(() => { const update = () => setPrompt(availablePrompt); const finish = () => { setInstalled(true); availablePrompt = null; setPrompt(null); }; window.addEventListener('sica:install', update); window.addEventListener('appinstalled', finish); return () => { window.removeEventListener('sica:install', update); window.removeEventListener('appinstalled', finish); }; }, []);
  if (installed) return <span className="installed-label">Zentry está instalada</span>;
  return prompt ? <button className="install-button" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); availablePrompt = null; }}><Download size={17}/> Instalar Zentry</button> : <p className="small muted">Para instalar, abre el menú del navegador y elige “Instalar aplicación” o “Agregar a inicio”. En iPhone, usa Compartir en Safari.</p>;
}
export function UpdateNotice() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let canceled = false;
    navigator.serviceWorker.register('/sw.js').then(reg => { if (canceled) return; if (reg.waiting) setWaiting(reg.waiting); reg.addEventListener('updatefound', () => { const worker = reg.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller && !canceled) setWaiting(worker); }); }); }).catch(() => { /* Online use remains available if installation is blocked. */ });
    return () => { canceled = true; };
  }, []);
  if (!waiting) return null;
  return <div className="update-notice"><RefreshCw size={17}/><span>Hay una nueva versión de Zentry.</span><button onClick={() => { if (window.confirm('La actualización cerrará tu sesión y los formularios abiertos. ¿Actualizar ahora?')) { navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); waiting.postMessage({ type: 'ACTIVATE' }); } }}>Actualizar</button></div>;
}
