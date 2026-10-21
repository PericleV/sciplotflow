// Small pictures of the choices in the properties panels: line styles, arrow heads, arrow bodies and routes, line ends
// and corners, text boxes. Drawn in the text's colour (currentColor), 28 × 14 px unless said.
import type { ArrowBody, ArrowHead, Dash, SymbolShape } from '../figure/spec.ts';
import type { Elbow } from '../figure/shapes.ts';
import { dashArray, lineOnly, symbolPath } from '../figure/draw.ts';
import type { ReactNode } from 'react';

const S = ({ w = 28, h = 14, children }: { w?: number; h?: number; children: ReactNode }) => (
  <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke="currentColor" strokeLinecap="butt" aria-hidden="true">
    {children}
  </svg>
);

export const DashIcon = ({ dash }: { dash: Dash }) => (
  <S>
    <line x1="1" y1="7" x2="27" y2="7" strokeWidth="1.6" strokeDasharray={dashArray(dash, 1.6)} />
  </S>
);

// a head at the right end of a short line (start: at its left)
export function HeadIcon({ head, start }: { head: ArrowHead; start?: boolean }) {
  const g = (() => {
    switch (head) {
      case 'triangle':
        return <path d="M18 3 L27 7 L18 11 Z" fill="currentColor" stroke="none" />;
      case 'stealth':
        return <path d="M17 2.5 L27 7 L17 11.5 L20 7 Z" fill="currentColor" stroke="none" />;
      case 'open':
        return <path d="M19 2.5 L27 7 L19 11.5" strokeWidth="1.4" strokeLinejoin="miter" />;
      case 'bar':
        return <line x1="26" y1="2" x2="26" y2="12" strokeWidth="1.6" />;
      case 'circle':
        return <circle cx="23" cy="7" r="3.6" fill="currentColor" stroke="none" />;
      case 'diamond':
        return <path d="M18 7 L22.5 2.5 L27 7 L22.5 11.5 Z" fill="currentColor" stroke="none" />;
      case 'square':
        return <rect x="19.5" y="3.5" width="7" height="7" fill="currentColor" stroke="none" />;
      case 'half':
        return <path d="M18 2.5 L27 7 L18 7 Z" fill="currentColor" stroke="none" />;
      default:
        return null;
    }
  })();
  const end = head === 'none' ? 27 : head === 'open' || head === 'bar' ? 26 : 20;
  return (
    <S>
      <g transform={start ? 'translate(28 0) scale(-1 1)' : undefined}>
        <line x1="1" y1="7" x2={end} y2="7" strokeWidth="1.4" />
        {g}
      </g>
    </S>
  );
}

export function BodyIcon({ body }: { body: ArrowBody }) {
  switch (body) {
    case 'double':
      return (
        <S>
          <line x1="1" y1="5" x2="22" y2="5" strokeWidth="1.2" />
          <line x1="1" y1="9" x2="22" y2="9" strokeWidth="1.2" />
          <path d="M20 2 L27 7 L20 12" strokeWidth="1.2" />
        </S>
      );
    case 'tapered':
      return (
        <S>
          <path d="M1 6.6 L19 4.5 L19 9.5 L1 7.4 Z M19 2.5 L27 7 L19 11.5 Z" fill="currentColor" stroke="none" />
        </S>
      );
    case 'wavy':
      return (
        <S>
          <path d="M1 7 q2.5 -4 5 0 t5 0 t5 0 t5 0" strokeWidth="1.2" />
          <path d="M20 3.5 L27 7 L20 10.5 Z" fill="currentColor" stroke="none" />
        </S>
      );
    case 'zigzag':
      return (
        <S>
          <path d="M1 7 L3.5 4 L6 10 L8.5 4 L11 10 L13.5 4 L16 10 L18.5 7 L21 7" strokeWidth="1.1" strokeLinejoin="miter" />
          <path d="M20 3.5 L27 7 L20 10.5 Z" fill="currentColor" stroke="none" />
        </S>
      );
    case 'equilibrium':
    case 'eqRight':
    case 'eqLeft': {
      const [top, bot] = body === 'eqRight' ? [[1, 27], [7, 21]] : body === 'eqLeft' ? [[7, 21], [1, 27]] : [[1, 27], [1, 27]];
      return (
        <S>
          <path d={`M${top[0]} 5 L${top[1]} 5 L${top[1] - 5} 1.5`} strokeWidth="1.2" />
          <path d={`M${bot[1]} 9 L${bot[0]} 9 L${bot[0] + 5} 12.5`} strokeWidth="1.2" />
        </S>
      );
    }
    case 'retro':
      return (
        <S>
          <line x1="1" y1="4.5" x2="21" y2="4.5" strokeWidth="1.2" />
          <line x1="1" y1="9.5" x2="21" y2="9.5" strokeWidth="1.2" />
          <path d="M18 1 L26 7 L18 13" strokeWidth="1.2" />
        </S>
      );
    default:
      return (
        <S>
          <line x1="1" y1="7" x2="20" y2="7" strokeWidth="1.4" />
          <path d="M19 3 L27 7 L19 11 Z" fill="currentColor" stroke="none" />
        </S>
      );
  }
}

export function RouteIcon({ route }: { route: 'line' | Elbow }) {
  const d = { line: 'M3 12 Q12 1 25 3', hv: 'M3 3 L25 3 L25 12', vh: 'M3 2 L3 12 L25 12', hvh: 'M2 3 L14 3 L14 11 L26 11', vhv: 'M3 1 L3 7 L25 7 L25 13' }[route];
  return (
    <S>
      <path d={d} strokeWidth="1.4" strokeLinejoin="round" />
    </S>
  );
}

// a thick line's end against a dashed guide where the line ends: flat stops there, round and square go past it
export function CapIcon({ cap }: { cap: 'butt' | 'round' | 'square' }) {
  return (
    <S w={18} h={16}>
      <line x1="0" y1="8" x2="10" y2="8" strokeWidth="9" strokeLinecap={cap} opacity="0.55" />
      <line x1="10" y1="1" x2="10" y2="15" strokeWidth="0.9" strokeDasharray="1.5 1.2" />
    </S>
  );
}

// two thick lines meeting at a corner: pointed, rounded or cut
export function JoinIcon({ join }: { join: 'miter' | 'round' | 'bevel' }) {
  return (
    <S w={18} h={16}>
      <path d="M2 15 L9 4 L16 15" strokeWidth="5.5" strokeLinejoin={join} strokeMiterlimit={10} opacity="0.65" />
    </S>
  );
}

export function BoxIcon({ box }: { box: 'none' | 'fill' | 'border' | 'both' }) {
  return (
    <S>
      {box !== 'none' && <rect x="2.5" y="1.5" width="23" height="11" rx="2" fill={box === 'fill' || box === 'both' ? 'currentColor' : 'none'} fillOpacity="0.22" stroke={box === 'border' || box === 'both' ? 'currentColor' : 'none'} strokeWidth="1.1" />}
      <text x="14" y="10" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">
        Aa
      </text>
    </S>
  );
}

// a symbol of the points (the curves' styles)
export function SymbolIcon({ shape }: { shape: SymbolShape }) {
  const line = lineOnly(shape);
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
      <path d={symbolPath(shape, 12, 9, 9)} fill={line ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={line ? 1.6 : 0.8} strokeLinejoin="round" />
    </svg>
  );
}
