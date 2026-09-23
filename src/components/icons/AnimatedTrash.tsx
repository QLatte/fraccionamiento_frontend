import { lazy, Suspense } from 'react';
import { Trash2 } from 'lucide-react';

const TrashIcon = lazy(() => import('./trash-icon'));

export default function AnimatedTrash({ size = 18 }: { size?: number }) {
  return <Suspense fallback={<Trash2 size={size} aria-hidden="true"/>}><TrashIcon size={size} aria-hidden="true"/></Suspense>;
}
