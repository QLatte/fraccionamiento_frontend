import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { AnimatedIconHandle } from './types';

const TrashIcon = lazy(() => import('./trash-icon'));

export default function AnimatedTrash({ size = 18 }: { size?: number }) {
  const host = useRef<HTMLSpanElement>(null);
  const icon = useRef<AnimatedIconHandle | null>(null);
  const attachIcon = useCallback((handle: AnimatedIconHandle | null) => {
    icon.current = handle;
    const button = host.current?.closest('button');
    if (handle && (button?.matches(':hover') || button?.matches(':focus-visible'))) handle.startAnimation();
  }, []);

  useEffect(() => {
    const button = host.current?.closest('button');
    if (!button) return;
    const start = () => icon.current?.startAnimation();
    const stop = () => icon.current?.stopAnimation();
    button.addEventListener('pointerenter', start);
    button.addEventListener('pointerleave', stop);
    button.addEventListener('pointerdown', start);
    button.addEventListener('focus', start);
    button.addEventListener('blur', stop);
    return () => {
      button.removeEventListener('pointerenter', start);
      button.removeEventListener('pointerleave', stop);
      button.removeEventListener('pointerdown', start);
      button.removeEventListener('focus', start);
      button.removeEventListener('blur', stop);
    };
  }, []);

  return <span ref={host} aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
    <Suspense fallback={<Trash2 size={size}/> }><TrashIcon ref={attachIcon} size={size} controlled/></Suspense>
  </span>;
}
