import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { dateText } from '../hooks';
import { Button, ErrorBox, Info, Success } from '../components/ui';

export function Secret({ title, value, expiresAt }: { title: string; value: string; expiresAt?: string }) {
  const [copied, setCopied] = useState(false); const [error, setError] = useState(''); const [expired, setExpired] = useState(false);
  useEffect(() => { if (!expiresAt) return; const id = setTimeout(() => setExpired(true), Math.max(0, new Date(expiresAt).getTime() - Date.now())); return () => clearTimeout(id); }, [expiresAt]);
  async function copy() { try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setError('Selecciona y copia el valor manualmente.'); } }
  return <div className="secret-card"><Success>{title}</Success>{expired ? <Info>Esta invitación ya venció. Genera una nueva.</Info> : <><label>{expiresAt ? 'Enlace de activación' : 'Clave del dispositivo'}<textarea value={value} readOnly rows={3} onFocus={e => e.target.select()}/></label><Button className="secondary" onClick={copy}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copiado' : 'Copiar'}</Button>{expiresAt && <p className="small">Vence el {dateText(expiresAt)}.</p>}<p className="small muted">Entrega este dato por un canal verificado. No podrás recuperarlo al salir de esta pantalla.</p></>}<ErrorBox message={error}/></div>;
}
