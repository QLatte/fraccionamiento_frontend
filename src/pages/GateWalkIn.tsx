import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, PhoneCall, Search, UserX, XCircle } from 'lucide-react';
import { AnimatedCheck, AnimatedHourglass } from '../components/icons/AnimatedIcons';
import { Button, ErrorBox, Info, Loading, Modal } from '../components/ui';
import { api, errorText } from '../api';
import { useMutation } from '../hooks';
import type { GateProperty, IdDocumentType, WalkInReason, WalkInView } from '../types';
import { countdown, idTypeLabel, reasonLabel } from '../walkins';

const station = { public: true, station: true } as const;

/**
 * Visitor without a pass: the guard captures the visit, the household approves
 * from the app within 3 minutes, and after that (or if nobody has alerts on) the
 * guard calls and records who authorized by phone.
 */
export function GateWalkIn({ online, onClose, onFinished }: { online: boolean; onClose: () => void; onFinished: (granted: boolean | null) => void }) {
  const [view, setView] = useState<WalkInView | null>(null);
  const finished = view && view.status !== 'PENDING';
  const cancel = useMutation();

  function close() {
    if (view?.status === 'PENDING') {
      if (!window.confirm('La solicitud sigue esperando respuesta. ¿La visita se retiró? Se cancelará la solicitud.')) return;
      void cancel.run<WalkInView>(`/gate/scan/walk-ins/${view.id}/cancel`, 'POST', {}, station).then(value => { if (value) { onFinished(null); onClose(); } });
      return;
    }
    onClose();
  }

  return <Modal title={finished ? 'Resultado de la visita' : view ? 'Esperando autorización' : 'Visita sin pase'} onClose={close}>
    {!view ? <WalkInForm online={online} onCreated={setView}/> : <WalkInWait view={view} online={online} onChange={value => { setView(value); if (value.status !== 'PENDING') onFinished(value.status === 'APPROVED' ? true : value.status === 'REJECTED' ? false : null); }} onClose={close}/>}
    <ErrorBox message={cancel.error}/>
  </Modal>;
}

function WalkInForm({ online, onCreated }: { online: boolean; onCreated: (view: WalkInView) => void }) {
  const [homes, setHomes] = useState<GateProperty[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestVehicle, setGuestVehicle] = useState('');
  const [reason, setReason] = useState<WalkInReason>('VISIT');
  const [idType, setIdType] = useState<IdDocumentType>('INE');
  const [idLast4, setIdLast4] = useState('');
  const [idVerified, setIdVerified] = useState(false);
  const create = useMutation();

  useEffect(() => { api<{ data: GateProperty[] }>('/gate/scan/properties', station).then(r => setHomes(r.data)).catch(e => setLoadError(errorText(e))); }, []);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (homes ?? []).filter(h => !q || `${h.street} ${h.houseNumber}`.toLowerCase().includes(q)).slice(0, 8);
  }, [homes, search]);
  const selected = homes?.find(h => h.id === propertyId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = await create.run<WalkInView>('/gate/scan/walk-ins', 'POST', { propertyId, guestName: guestName.trim(), ...(guestVehicle.trim() ? { guestVehicle: guestVehicle.trim() } : {}), reason, idType, idLast4: idLast4.trim().toUpperCase(), idVerified }, station);
    if (value) onCreated(value);
  }

  if (!homes) return loadError ? <ErrorBox message={loadError}/> : <Loading/>;
  return <form className="walkin-form" onSubmit={submit}><fieldset disabled={create.busy}>
    <div className="field-label" id="walkin-home">Vivienda que visita</div>
    {selected ? <div className="walkin-selected"><strong>{selected.street} {selected.houseNumber}</strong><span>{selected.cluster.name}</span><button type="button" className="subtle-link" onClick={() => { setPropertyId(''); setSearch(''); }}>Cambiar</button></div> : <>
      <label className="search-field walkin-search"><Search size={17}/><input aria-labelledby="walkin-home" placeholder="Busca calle o número" value={search} onChange={e => setSearch(e.target.value)} autoFocus/></label>
      <div className="walkin-homes" role="listbox" aria-labelledby="walkin-home">{matches.map(h => <button type="button" role="option" aria-selected={false} key={h.id} onClick={() => setPropertyId(h.id)}><strong>{h.street} {h.houseNumber}</strong><span>{h.cluster.name}</span></button>)}{!matches.length && <p className="small muted">No hay viviendas que coincidan.</p>}</div>
    </>}
    <div className="field-grid"><label>Nombre del visitante<input required minLength={2} maxLength={120} value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Nombre completo"/></label><label>Placas <span className="optional">opcional</span><input maxLength={50} value={guestVehicle} onChange={e => setGuestVehicle(e.target.value.toUpperCase())} placeholder="ABC-123"/></label></div>
    <div className="field-label" id="walkin-reason">Motivo</div>
    <div className="walkin-reasons" role="group" aria-labelledby="walkin-reason">{(Object.keys(reasonLabel) as WalkInReason[]).map(r => <button type="button" key={r} className={reason === r ? 'selected' : ''} aria-pressed={reason === r} onClick={() => setReason(r)}>{reasonLabel[r]}</button>)}</div>
    <div className="field-grid"><label>Identificación<select value={idType} onChange={e => setIdType(e.target.value as IdDocumentType)}>{(Object.keys(idTypeLabel) as IdDocumentType[]).map(t => <option key={t} value={t}>{idTypeLabel[t]}</option>)}</select></label><label>Últimos 4 caracteres<input required inputMode="text" pattern="[A-Za-z0-9]{4}" minLength={4} maxLength={4} value={idLast4} onChange={e => setIdLast4(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} placeholder="1234"/></label></div>
    <label className="checkbox-label"><input type="checkbox" required checked={idVerified} onChange={e => setIdVerified(e.target.checked)}/><span>Revisé la identificación en persona y coincide con el visitante.</span></label>
    <Info>Solo se guardan los últimos 4 caracteres de la identificación. No retengas la credencial.</Info>
  </fieldset><ErrorBox message={create.error}/><div className="modal-actions"><Button type="submit" busy={create.busy} disabled={!propertyId || !online}>Pedir autorización a la vivienda</Button></div></form>;
}

function WalkInWait({ view, online, onChange, onClose }: { view: WalkInView; online: boolean; onChange: (view: WalkInView) => void; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [caller, setCaller] = useState('');
  const phone = useMutation();
  const pending = view.status === 'PENDING';

  // Poll for the household's answer and tick the countdown while waiting.
  useEffect(() => {
    if (!pending) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => { if (navigator.onLine) api<WalkInView>(`/gate/scan/walk-ins/${view.id}`, station).then(value => { if (value.status !== view.status || value.canCall !== view.canCall) onChange(value); }).catch(() => { /* Next poll retries. */ }); }, 2000);
    return () => { window.clearInterval(tick); window.clearInterval(poll); };
  }, [pending, view.id, view.status, view.canCall, onChange]);

  async function record(approve: boolean) {
    const value = await phone.run<WalkInView>(`/gate/scan/walk-ins/${view.id}/phone`, 'POST', { approve, authorizedBy: caller.trim() }, station);
    if (value) onChange(value);
  }

  const who = `${view.guestName} · ${reasonLabel[view.reason]}`;
  const home = view.property ? `${view.property.street} ${view.property.houseNumber}` : '';
  if (view.status === 'APPROVED') return <div className="walkin-result"><div className="result-symbol granted"><AnimatedCheck size={34}/></div><h2>Entrada autorizada</h2><p>{who} → {home}</p><p className="small">Autorizó: <strong>{view.authorizedBy}</strong> {view.method === 'APP' ? '(desde la app)' : '(por teléfono)'}</p><Button className="full" onClick={onClose}>Listo</Button><p className="small muted">Registra su salida desde la Bitácora cuando se retire.</p></div>;
  if (view.status === 'REJECTED') return <div className="walkin-result"><div className="result-symbol denied"><XCircle size={34}/></div><h2>No autorices el acceso</h2><p>{who} → {home}</p>{view.authorizedBy && <p className="small">Rechazó: <strong>{view.authorizedBy}</strong> {view.method === 'APP' ? '(desde la app)' : '(por teléfono)'}</p>}<Button className="full" onClick={onClose}>Listo</Button></div>;
  if (view.status === 'CANCELLED') return <div className="walkin-result"><div className="result-symbol denied"><UserX size={34}/></div><h2>Solicitud cancelada</h2><Button className="full" onClick={onClose}>Listo</Button></div>;

  const left = countdown(view.expiresAt, now);
  return <div className="walkin-wait">
    <div className="walkin-visitor"><strong>{who}</strong><span>{home}</span></div>
    {!view.canCall ? <div className="walkin-countdown" role="status"><AnimatedHourglass size={26} autoplay={400} every={2600}/><div><strong>{left ?? '0:00'}</strong><span>Esperando respuesta de la vivienda en la app · {view.notified === 1 ? '1 dispositivo avisado' : `${view.notified} dispositivos avisados`}</span></div></div>
      : <div className="walkin-call"><div className="walkin-call-head"><PhoneCall size={22}/><div><strong>{view.notified === 0 ? 'Esta vivienda no tiene avisos activados' : 'Nadie respondió en la app'}</strong><span>Llama a la vivienda y registra quién autorizó.</span></div></div>
        <label>Nombre de quien contestó<input value={caller} onChange={e => setCaller(e.target.value)} maxLength={80} placeholder="Ej. María López"/></label>
        <div className="walkin-call-actions"><Button disabled={caller.trim().length < 2 || !online} busy={phone.busy} onClick={() => void record(true)}><Check size={17}/> Autorizó la entrada</Button><Button className="danger-outline" disabled={caller.trim().length < 2 || !online} busy={phone.busy} onClick={() => void record(false)}><XCircle size={17}/> No autorizó</Button></div>
        <p className="small muted">Si alguien responde en la app mientras llamas, esa respuesta se mostrará aquí.</p>
      </div>}
    <ErrorBox message={phone.error}/>
    <div className="modal-actions"><Button className="secondary" onClick={onClose}>La visita se retiró</Button></div>
  </div>;
}
