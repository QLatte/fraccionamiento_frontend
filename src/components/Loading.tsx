import type { CSSProperties } from 'react';
import { ShieldCheck } from 'lucide-react';

type LoaderSize = 'button' | 'panel' | 'screen';
type LoadingProps = { label?: string; detail?: string };

export function SegmentedLoader({ size = 'panel' }: { size?: LoaderSize }) {
  return (
    <span className={`sica-loader sica-loader--${size}`} aria-hidden="true">
      <span className="sica-loader-rotor">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} className="sica-loader-segment" style={{ '--segment': index } as CSSProperties}/>
        ))}
      </span>
      {size !== 'button' && <span className="sica-loader-mark"><ShieldCheck size={22}/></span>}
    </span>
  );
}

export function LoadingIndicator({ label = 'Cargando información', detail }: LoadingProps) {
  return (
    <div className="sica-loading-panel" role="status" aria-live="polite" aria-atomic="true">
      <div className="sica-loading-card">
        <SegmentedLoader/>
        <p className="sica-loading-label">{label}</p>
        {detail && <p className="sica-loading-detail">{detail}</p>}
      </div>
    </div>
  );
}

export function LoadingScreen({ label = 'Abriendo SICA', detail }: LoadingProps) {
  return (
    <div className="sica-loading-screen" role="status" aria-live="polite" aria-atomic="true">
      <div className="sica-loading-card">
        <span className="sica-loading-brand">SICA</span>
        <SegmentedLoader size="screen"/>
        <p className="sica-loading-label">{label}</p>
        {detail && <p className="sica-loading-detail">{detail}</p>}
      </div>
    </div>
  );
}
