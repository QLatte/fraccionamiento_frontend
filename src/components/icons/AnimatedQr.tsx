import { useEffect, useRef } from 'react';
import './AnimatedQr.css';

type Props = { size?: number; strokeWidth?: number; className?: string };

export default function AnimatedQr({ size = 24, strokeWidth = 2, className = '' }: Props) {
  const icon = useRef<SVGSVGElement>(null);
  const width = strokeWidth * (32 / 24);

  useEffect(() => {
    const svg = icon.current;
    if (!svg) return;
    const trigger = svg.closest('button, a');
    let release: number | undefined;
    const start = () => {
      window.clearTimeout(release);
      svg.dataset.active = 'true';
    };
    const stop = () => {
      window.clearTimeout(release);
      delete svg.dataset.active;
    };
    const pressEnd = () => {
      window.clearTimeout(release);
      release = window.setTimeout(stop, 650);
    };
    const leave = (event: PointerEvent) => { if (event.pointerType === 'mouse') stop(); };

    if (!trigger) {
      start();
      release = window.setTimeout(stop, 850);
      return () => window.clearTimeout(release);
    }

    trigger.addEventListener('pointerenter', start);
    trigger.addEventListener('pointerleave', leave as EventListener);
    trigger.addEventListener('pointerdown', start);
    trigger.addEventListener('pointerup', pressEnd);
    trigger.addEventListener('pointercancel', stop);
    trigger.addEventListener('focus', start);
    trigger.addEventListener('blur', stop);
    return () => {
      window.clearTimeout(release);
      trigger.removeEventListener('pointerenter', start);
      trigger.removeEventListener('pointerleave', leave as EventListener);
      trigger.removeEventListener('pointerdown', start);
      trigger.removeEventListener('pointerup', pressEnd);
      trigger.removeEventListener('pointercancel', stop);
      trigger.removeEventListener('focus', start);
      trigger.removeEventListener('blur', stop);
    };
  }, []);

  return <svg ref={icon} className={`animated-qr-icon ${className}`} aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="square">
    <rect className="qr-scan" x="2" y="0" width="28" height="2" fill="currentColor" stroke="none"/>
    <rect className="qr-corner" x="3" y="3" width="9" height="9"/>
    <rect className="qr-corner" x="3" y="20" width="9" height="9"/>
    <rect className="qr-corner" x="20" y="3" width="9" height="9"/>
    <rect className="qr-module" x="27" y="20" width="2" height="2"/>
    <rect className="qr-module" x="16" y="27" width="2" height="2"/>
    <path className="qr-module" d="M3 16H7"/>
    <path className="qr-module" d="M13 16H18M22 16V23H29M22 16H26M22 16H18M18 16V20H16"/>
    <path className="qr-module" d="M16 7V10"/>
    <path className="qr-module" d="M16 25V29H23V27"/>
    <path className="qr-module" d="M29.01 29H29"/>
    <rect className="qr-center" x="24" y="7" width="1" height="1"/>
    <rect className="qr-center" x="7" y="7" width="1" height="1"/>
    <rect className="qr-center" x="7" y="24" width="1" height="1"/>
  </svg>;
}
