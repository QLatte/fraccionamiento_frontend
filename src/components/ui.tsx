import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { AlertCircle, ArrowRight, Check, LoaderCircle, QrCode, X } from 'lucide-react';
import type { Status } from '../types';
import { statusLabel } from '../hooks';
export function Brand({ light = false, onHome }: { light?: boolean; onHome?: () => void }) { return <a className={`brand ${light ? 'light' : ''}`} href="/" onClick={onHome ? e => { e.preventDefault(); onHome(); } : undefined}><span className="brand-mark"><QrCode size={25}/></span><span>SICA<span className="brand-dot">.</span></span></a>; }
export function Button({ children, className = '', busy, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) { return <button {...props} disabled={props.disabled || busy} className={`button ${className}`}>{busy && <LoaderCircle className="spin" size={17}/>} {children}</button>; }
export function ErrorBox({ message, retry }: { message?: string; retry?: () => void }) { if (!message) return null; return <div className="error-box" role="alert"><AlertCircle size={18}/><span>{message}</span>{retry && <button onClick={retry}>Reintentar</button>}</div>; }
export function Badge({ status }: { status: Status }) { return <span className={`badge ${status.toLowerCase()}`}><span/>{statusLabel[status]}</span>; }
export function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin" size={23}/><span>Cargando información…</span></div>; }
export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text: string; action?: ReactNode }) { return <div className="empty"><div className="empty-icon">{icon ?? <QrCode/>}</div><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current!; el.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { el.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}><div className="modal-top"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20}/></button></div>{children}</dialog>;
}
export function PageHeader({ eyebrow, title, text, action }: { eyebrow?: string; title: string; text: string; action?: ReactNode }) { return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{text}</p></div>{action}</div>; }
export function Info({ children }: { children: ReactNode }) { return <div className="info-box">{children}</div>; }
export function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) { return <div className="help-step"><span>{n}</span><div><h3>{title}</h3><p>{children}</p></div></div>; }
export function Success({ children }: { children: ReactNode }) { return <div className="success-inline" role="status"><Check size={18}/>{children}</div>; }
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowRight size={16}/></button>; }
