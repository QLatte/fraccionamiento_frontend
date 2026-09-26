import './AnimatedArrowDashed.css';

/** Paths follow the Its Hover arrow-narrow-left-dashed icon. */
export default function AnimatedArrowLeftDashed({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return <svg className="animated-arrow-dashed left" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <g className="arrow-group">
      <path d="M5 12h6m3 0h1.5m3 0h.5"/>
      <path d="M5 12l4 4"/>
      <path d="M5 12l4 -4"/>
    </g>
  </svg>;
}
