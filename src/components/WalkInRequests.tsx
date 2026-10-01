import { useCallback, useEffect, useState } from 'react';
import { BellRing, Check, IdCard, X } from 'lucide-react';
import { api } from '../api';
import { useMutation } from '../hooks';
import type { WalkInPending } from '../types';
import { countdown, idTypeLabel, reasonLabel } from '../walkins';
import { Button, ErrorBox } from './ui';

/**
 * Visitors waiting at the gate without a pass. Shown on every resident screen;
 * any household member can answer and the first answer wins.
 */
export function WalkInRequests({ propertyId }: { propertyId: string }) {
  const [requests, setRequests] = useState<WalkInPending[]>([]);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const decide = useMutation();

  const load = useCallback(async () => {
    try { setRequests((await api<{ data: WalkInPending[] }>(`/walk-ins/pending?propertyId=${propertyId}`)).data); }
    catch { /* Polling retries; an expired session is handled globally. */ }
  }, [propertyId]);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) void load(); };
    // Requests last 3 minutes, so poll often while the app is open; also refresh when it comes back to the front.
    const poll = window.setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  useEffect(() => {
    if (!requests.length) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [requests.length]);

  async function answer(request: WalkInPending, approve: boolean) {
    setAnswering(request.id); setDone(null);
    const result = await decide.run<{ status: string }>(`/walk-ins/${request.id}/decision`, 'POST', { propertyId, approve });
    setAnswering(null);
    if (result) setDone({ id: request.id, text: approve ? `Permitiste la entrada de ${request.guestName}.` : `Rechazaste la entrada de ${request.guestName}.` });
    else if (decide.code() === 'WALK_IN_ALREADY_DECIDED') setDone({ id: request.id, text: 'Otra persona de tu vivienda o la caseta ya respondió esta solicitud.' });
    void load();
  }

  if (!requests.length && !done) return null;
  return <div className="walkin-requests" aria-live="polite">
    {done && <div className="walkin-done" role="status"><Check size={18}/><span>{done.text}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setDone(null)}><X size={16}/></button></div>}
    {requests.filter(r => r.id !== done?.id).map(request => {
      const left = countdown(request.expiresAt, now);
      return <section className="walkin-card" key={request.id} aria-label={`Visita en la caseta: ${request.guestName}`}>
        <div className="walkin-card-head"><span className="walkin-card-icon"><BellRing size={20}/></span><div><span className="walkin-card-label">Visita en la caseta</span><h2>{request.guestName}</h2></div><span className="walkin-card-timer">{left ? `Responde en ${left}` : 'La caseta te llamará'}</span></div>
        <dl className="walkin-card-details">
          <div><dt>Motivo</dt><dd>{reasonLabel[request.reason]}</dd></div>
          <div><dt>Vehículo</dt><dd>{request.guestVehicle || 'Peatonal'}</dd></div>
          <div><dt>Identificación</dt><dd><IdCard size={15}/> {idTypeLabel[request.idType]} ··{request.idLast4} · revisada en caseta</dd></div>
        </dl>
        <div className="walkin-card-actions">
          <Button className="danger-outline" busy={answering === request.id && decide.busy} disabled={!!answering} onClick={() => void answer(request, false)}><X size={17}/> Rechazar</Button>
          <Button busy={answering === request.id && decide.busy} disabled={!!answering} onClick={() => void answer(request, true)}><Check size={17}/> Permitir</Button>
        </div>
      </section>;
    })}
    {decide.error && decide.code() !== 'WALK_IN_ALREADY_DECIDED' && <ErrorBox message={decide.error}/>}
  </div>;
}
