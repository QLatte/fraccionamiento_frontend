import { useEffect, useRef } from 'react';
import './AnimatedX.css';

type Props = {
  onClose: () => void;
  label?: string;
  className?: string;
  size?: number;
};

/** Close control based on the two independently moving strokes of Its Hover's X icon. */
export default function AnimatedX({ onClose, label = 'Cerrar', className = '', size = 24 }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const timeout = useRef<number | undefined>(undefined);
  const pointerType = useRef<string | undefined>(undefined);
  const closing = useRef(false);

  useEffect(() => () => window.clearTimeout(timeout.current), []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (pointerType.current === 'touch' || pointerType.current === 'pen') {
      button.current?.setAttribute('data-pressed', 'true');
      timeout.current = window.setTimeout(onClose, 210);
    } else {
      onClose();
    }
  };

  return <button
    ref={button}
    type="button"
    className={`icon-button animated-x-button ${className}`}
    aria-label={label}
    onPointerDown={event => { pointerType.current = event.pointerType; event.currentTarget.dataset.pressed = 'true'; }}
    onPointerUp={event => { if (event.pointerType === 'mouse') delete event.currentTarget.dataset.pressed; }}
    onPointerCancel={event => { pointerType.current = undefined; delete event.currentTarget.dataset.pressed; }}
    onClick={close}
  >
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path className="x-line-1" d="M18 6 6 18"/>
      <path className="x-line-2" d="M6 6 18 18"/>
    </svg>
  </button>;
}
