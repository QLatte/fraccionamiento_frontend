import { useEffect, useRef } from 'react';
import './AnimatedTrash.css';

/** The lid and bin paths follow the Its Hover trash icon. */
export default function AnimatedTrash({ size = 18 }: { size?: number }) {
  const icon = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = icon.current;
    const button = svg?.closest('button');
    if (!svg || !button) return;

    let release: number | undefined;
    const press = () => {
      window.clearTimeout(release);
      svg.dataset.pressed = 'true';
    };
    const lift = () => {
      window.clearTimeout(release);
      release = window.setTimeout(() => { delete svg.dataset.pressed; }, 420);
    };

    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', lift);
    button.addEventListener('pointercancel', lift);
    return () => {
      window.clearTimeout(release);
      button.removeEventListener('pointerdown', press);
      button.removeEventListener('pointerup', lift);
      button.removeEventListener('pointercancel', lift);
    };
  }, []);

  return <svg ref={icon} className="animated-trash-icon" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path className="trash-lid-lower" d="M4 7l16 0"/>
    <path d="M10 11l0 6"/>
    <path d="M14 11l0 6"/>
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/>
    <path className="trash-lid-upper" d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>
  </svg>;
}
