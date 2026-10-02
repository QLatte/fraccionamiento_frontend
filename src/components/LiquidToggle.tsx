import { useEffect, useRef, useState } from 'react';
import './LiquidToggle.css';

/**
 * Switch with a "liquid glass" thumb: the drop stretches while it slides and
 * settles with a spring. Accessible as role="switch"; only transform/opacity animate.
 */
export function LiquidToggle({ checked, onChange, label, disabled = false, busy = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean; busy?: boolean }) {
  const [moving, setMoving] = useState(false);
  const timer = useRef(0);
  const first = useRef(true);
  // Replay the stretch whenever the state flips (including after an async save), not on first render.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setMoving(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMoving(false), 520);
    return () => window.clearTimeout(timer.current);
  }, [checked]);
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-busy={busy || undefined} disabled={disabled || busy}
    className={'liquid-toggle' + (checked ? ' on' : '') + (moving ? ' moving' : '') + (busy ? ' busy' : '')} onClick={() => onChange(!checked)}>
    <span className="liquid-toggle-track" aria-hidden="true"><span className="liquid-toggle-fill"/></span>
    <span className="liquid-toggle-thumb" aria-hidden="true"><span className="liquid-toggle-drop"/></span>
  </button>;
}
