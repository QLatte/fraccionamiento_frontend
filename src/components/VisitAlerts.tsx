import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Smartphone } from 'lucide-react';
import { ErrorBox } from './ui';
import { LiquidToggle } from './LiquidToggle';
import { errorText } from '../api';
import { disablePush, enablePush, pushRegistration, pushSubscribed, pushSupport } from '../push';

/** Lets a resident turn push alerts on this phone on or off (shown in Mi perfil → Avisos). */
export function VisitAlerts({ propertyId }: { propertyId: string }) {
  const support = pushSupport();
  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const denied = support === 'ok' && Notification.permission === 'denied';

  useEffect(() => {
    if (support !== 'ok') return;
    let current = true;
    setReady(false); setError('');
    (async () => {
      // Without a service worker (development build) there is nothing to offer.
      if (!await pushRegistration()) return;
      const subscribed = Notification.permission === 'granted' ? await pushSubscribed(propertyId).catch(() => false) : false;
      if (current) { setOn(subscribed); setReady(true); }
    })();
    return () => { current = false; };
  }, [propertyId, support]);

  async function toggle() {
    setBusy(true); setError('');
    try { if (on) { await disablePush(propertyId); setOn(false); } else { await enablePush(propertyId); setOn(true); } }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (support === 'unsupported' || (support === 'ok' && !ready)) return null;
  const Icon = support === 'install' ? Smartphone : denied ? BellOff : on ? BellRing : Bell;
  const text = support === 'install'
    ? 'En iPhone, primero instala Zentry: toca Compartir en Safari y elige «Agregar a inicio». Luego ábrela desde tu pantalla de inicio.'
    : denied ? 'Las notificaciones están bloqueadas para Zentry. Actívalas en los ajustes del navegador o del teléfono.'
    : on ? 'Te avisaremos en este teléfono cuando una visita de tu vivienda entre y cuando salga.'
    : 'Recibe un aviso en este teléfono cuando una visita de tu vivienda entre y cuando salga del fraccionamiento.';
  return <section className={'panel visit-alerts' + (on ? ' on' : '')} aria-label="Avisos de visitas">
    <span className="visit-alerts-icon"><Icon size={22}/></span>
    <div><h2>Avisos en este teléfono</h2><p>{text}</p><ErrorBox message={error}/></div>
    {support === 'ok' && !denied && <LiquidToggle checked={on} busy={busy} label="Avisos en este teléfono" onChange={() => void toggle()}/>}
  </section>;
}
