export function BrainMark({ size = 34 }: { size?: number }) {
  // Two hemispheres drawn as stacked index-card arcs: knowledge, filed.
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="var(--ink)" />
      <path d="M20 9c-5 0-9 3.6-9 8.4 0 2 .7 3.6 1.8 4.9-.5.9-.8 1.9-.8 3 0 3.4 2.9 5.7 6.3 5.7H20" fill="none" stroke="var(--paper)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20 9c5 0 9 3.6 9 8.4 0 2-.7 3.6-1.8 4.9.5.9.8 1.9.8 3 0 3.4-2.9 5.7-6.3 5.7H20" fill="none" stroke="var(--signal)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20 9v22M15 17h5M20 24h5" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
