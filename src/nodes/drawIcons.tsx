// The Figure Drawing editor's own icons, where Lucide has none: drawn in its style (a 24 grid, round line ends, the
// colour of the text).
import type { ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';

const Own = ({ children, size = 16, strokeWidth = 1.75 }: { children: ReactNode } & LucideProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
// a polygon of uneven sides (the regular one: Lucide's hexagon)
export const Polygon = (p: LucideProps) => (
  <Own {...p}>
    <path d="M4 15 7 5l9-2 5 9-6 9-9-2Z" />
  </Own>
);
export const Polyline = (p: LucideProps) => (
  <Own {...p}>
    <path d="M3 18 8 8l5 7 4-10 4 4" />
  </Own>
);
export const CurvedArrow = (p: LucideProps) => (
  <Own {...p}>
    <path d="M4 18C6 8 13 5 19 7" />
    <path d="m15 4 4 3-3 4" />
  </Own>
);
export const ElbowArrow = (p: LucideProps) => (
  <Own {...p}>
    <path d="M3 6h8v12h9" />
    <path d="m17 15 3 3-3 3" />
  </Own>
);
export const Equilibrium = (p: LucideProps) => (
  <Own {...p}>
    <path d="M3 9h18l-5-4" />
    <path d="M21 15H3l5 4" />
  </Own>
);
export const Retro = (p: LucideProps) => (
  <Own {...p}>
    <path d="M3 9.5h14M3 14.5h14" />
    <path d="m15 5 6 7-6 7" />
  </Own>
);
export const Arc = (p: LucideProps) => (
  <Own {...p}>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
  </Own>
);
export const Bracket = (p: LucideProps) => (
  <Own {...p}>
    <path d="M4 17V8h16v9" />
    <path d="M10.5 4.5h3" />
  </Own>
);
export const Brace = (p: LucideProps) => (
  <Own {...p}>
    <path d="M3 17c0-3 2-3 4.5-3H9c2 0 3-1 3-4 0 3 1 4 3 4h1.5c2.5 0 4.5 0 4.5 3" />
  </Own>
);

