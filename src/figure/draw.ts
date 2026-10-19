// Pure helpers of the figure drawing (no React): rich text (a markup: x^{2}, \alpha …), text widths, symbol
// paths, dashes, arrow heads.
import type { Curve, Dash, ResolvedText, SymbolShape } from './spec.ts';
import { maxOf } from '../engine/minmax.ts';

// ---- rich text ----
// x^{2} x_{i} x^2 · \alpha … \Omega, \pm \times \deg \AA … (SYMBOLS) · \bold{…} \italic{…} \underline{…} \overline{…}
// \size{12}{…} \size{+2}{…} \color{red}{…} \font{Times}{…} · \\ a new line · \{ \} \^ \_ \\ \% the characters themselves.
export const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ϵ', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  pm: '±', mp: '∓', times: '×', cdot: '·', div: '÷', deg: '°', degree: '°', circ: '∘', AA: 'Å', angstrom: 'Å', micro: 'µ', ohm: 'Ω', permil: '‰', celsius: '℃',
  infty: '∞', approx: '≈', sim: '∼', simeq: '≃', equiv: '≡', propto: '∝', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', ll: '≪', gg: '≫',
  rightarrow: '→', to: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', uparrow: '↑', downarrow: '↓', rightleftharpoons: '⇌',
  partial: '∂', nabla: '∇', sqrt: '√', int: '∫', oint: '∮', sum: '∑', prod: '∏', prime: '′', dprime: '″', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ',
  cdots: '⋯', ldots: '…', dots: '…', bullet: '•', star: '⋆', dagger: '†', perp: '⊥', parallel: '∥', in: '∈', notin: '∉', cap: '∩', cup: '∪', subset: '⊂', forall: '∀', exists: '∃', langle: '⟨', rangle: '⟩', emptyset: '∅',
  ',': ' ', ' ': ' ', '%': '%', '#': '#', '&': '&', $: '$', '{': '{', '}': '}', '^': '^', _: '_', '\\': '\n',
};
// The symbol picker of the text fields: groups of characters inserted as they are.
export const SYMBOL_GROUPS: [string, string][] = [
  ['Greek', 'αβγδεζηθικλμνξπρστυφχψω'],
  ['Greek capitals', 'ΓΔΘΛΞΠΣΥΦΨΩ'],
  ['Operators', '±∓×·÷√∞≈∼≃≡∝≤≥≠≪≫∂∇∫∑∏′″'],
  ['Arrows', '→←↔⇒⇐↑↓⇌'],
  ['Units', '°ÅµΩ‰℃ℏℓ'],
  ['Other', '…⋯•⋆†⊥∥∈∩∪⊂∀∃⟨⟩∅'],
];

export type Run = { t: string; bold: boolean; italic: boolean; underline: boolean; overline: boolean; scale: number; shift: number; color?: string; font?: string; size?: number; sizeDelta: number };
type State = Omit<Run, 't'>;
const BASE: State = { bold: false, italic: false, underline: false, overline: false, scale: 1, shift: 0, sizeDelta: 0 };
const sameStyle = (a: State, b: State) =>
  a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.overline === b.overline && a.scale === b.scale && a.shift === b.shift && a.sizeDelta === b.sizeDelta && a.size === b.size && a.color === b.color && a.font === b.font;

// Lines of runs (each run one style).
export function parseRich(src: string): Run[][] {
  const lines: Run[][] = [[]];
  let i = 0;
  const push = (t: string, st: State) => {
    const parts = t.split('\n');
    parts.forEach((p, k) => {
      if (k > 0) lines.push([]);
      if (!p) return;
      const line = lines[lines.length - 1];
      const last = line[line.length - 1];
      if (last && sameStyle(last, st)) last.t += p;
      else line.push({ t: p, ...st });
    });
  };
  // reads {…} (or one character / one command when there are no braces) as a group in the given state
  const group = (st: State) => {
    if (src[i] === '{') {
      i++;
      seq(st, '}');
      i++;
    } else if (src[i] === '\\') one(st);
    else if (i < src.length) push(src[i++], st);
  };
  const arg = (): string => {
    if (src[i] !== '{') return '';
    const end = src.indexOf('}', i);
    if (end < 0) return '';
    const a = src.slice(i + 1, end);
    i = end + 1;
    return a;
  };
  const one = (st: State) => {
    // at a backslash
    const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
    if (!m) {
      push(src[i++], st);
      return;
    }
    const cmd = m[1];
    i += m[0].length;
    if (cmd in SYMBOLS && !/^(bold|textbf|italic|textit|emph|underline|overline|size|color|font)$/.test(cmd)) {
      push(SYMBOLS[cmd], st);
      if (/^[A-Za-z]+$/.test(cmd) && src[i] === ' ') i++; // "\alpha x": the space only ends the command
      return;
    }
    switch (cmd) {
      case 'bold':
      case 'textbf':
        return group({ ...st, bold: true });
      case 'italic':
      case 'textit':
      case 'emph':
        return group({ ...st, italic: true });
      case 'underline':
        return group({ ...st, underline: true });
      case 'overline':
        return group({ ...st, overline: true });
      case 'size': {
        const a = arg().trim();
        const v = Number(a);
        return group(/^[+-]/.test(a) && Number.isFinite(v) ? { ...st, sizeDelta: st.sizeDelta + v } : Number.isFinite(v) && v > 0 ? { ...st, size: v, sizeDelta: 0 } : st);
      }
      case 'color':
        return group({ ...st, color: arg().trim() || st.color });
      case 'font':
        return group({ ...st, font: arg().trim() || st.font });
      default:
        push(`\\${cmd}`, st);
    }
  };
  const seq = (st: State, until?: string) => {
    while (i < src.length) {
      const ch = src[i];
      if (until && ch === until) return;
      if (ch === '\\') one(st);
      else if ((ch === '^' || ch === '_') && i + 1 < src.length) {
        i++;
        group({ ...st, scale: st.scale * 0.7, shift: st.shift + (ch === '^' ? -0.4 : 0.22) * st.scale });
      } else if (ch === '{') {
        i++;
        seq(st, '}');
        i++;
      } else push(src[i++], st);
    }
  };
  seq(BASE);
  return lines;
}

const charEm = (ch: string) => (/[ilI.,:;'|!’ ]/.test(ch) ? 0.28 : /[mwMW@]/.test(ch) ? 0.86 : /[A-Z0-9#%&]/.test(ch) ? 0.64 : /[Ͱ-Ͽ]/.test(ch) ? 0.6 : 0.54);
export const runSize = (r: Run, base: number) => Math.max(0.5, (r.size ?? base) + r.sizeDelta) * r.scale;
// Width (pt) of each line and the line height, roughly (no measuring in the DOM: the drawing is the same everywhere).
export function richMetrics(text: string, st: ResolvedText): { widths: number[]; width: number; lines: number; lineHeight: number } {
  const lines = parseRich(text);
  const widths = lines.map((l) => l.reduce((a, r) => a + [...r.t].reduce((b, ch) => b + charEm(ch), 0) * runSize(r, st.size) * (r.bold || st.bold ? 1.07 : 1), 0));
  return { widths, width: Math.max(0, maxOf(widths)), lines: lines.length, lineHeight: st.size * 1.2 };
}
// Text of a markup without the markup (tooltips, names).
export const plainText = (text: string) => parseRich(text).map((l) => l.map((r) => r.t).join('')).join(' ');

// ---- symbols: paths of width `s` centred at 0, 0 ----
const f = (v: number) => +v.toFixed(2);
// The path of a symbol of width `s` centred at (cx, cy) — many of them make one path.
export function symbolPath(shape: SymbolShape, s: number, cx = 0, cy = 0): string {
  const r = s / 2;
  const P = (x: number, y: number) => `${f(cx + x)},${f(cy + y)}`;
  const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => P(x, y)).join('L')}Z`;
  const regular = (n: number, rr: number, rot: number) => poly(Array.from({ length: n }, (_, k): [number, number] => [rr * Math.cos(rot + (2 * Math.PI * k) / n), rr * Math.sin(rot + (2 * Math.PI * k) / n)]));
  switch (shape) {
    case 'circle':
      return `M${P(-r, 0)}A${f(r)},${f(r)} 0 1,0 ${P(r, 0)}A${f(r)},${f(r)} 0 1,0 ${P(-r, 0)}Z`;
    case 'square':
      return poly([[-r * 0.9, -r * 0.9], [r * 0.9, -r * 0.9], [r * 0.9, r * 0.9], [-r * 0.9, r * 0.9]]);
    case 'triangle':
      return poly([[0, -r * 1.08], [r * 1.05, r * 0.75], [-r * 1.05, r * 0.75]]);
    case 'triangleDown':
      return poly([[0, r * 1.08], [r * 1.05, -r * 0.75], [-r * 1.05, -r * 0.75]]);
    case 'triangleLeft':
      return poly([[-r * 1.08, 0], [r * 0.75, -r * 1.05], [r * 0.75, r * 1.05]]);
    case 'triangleRight':
      return poly([[r * 1.08, 0], [-r * 0.75, -r * 1.05], [-r * 0.75, r * 1.05]]);
    case 'diamond':
      return poly([[0, -r * 1.2], [r * 0.95, 0], [0, r * 1.2], [-r * 0.95, 0]]);
    case 'pentagon':
      return regular(5, r * 1.08, -Math.PI / 2);
    case 'hexagon':
      return regular(6, r * 1.02, 0);
    case 'cross':
      return `M${P(-r * 0.8, -r * 0.8)}L${P(r * 0.8, r * 0.8)}M${P(-r * 0.8, r * 0.8)}L${P(r * 0.8, -r * 0.8)}`;
    case 'plus':
      return `M${P(-r, 0)}L${P(r, 0)}M${P(0, -r)}L${P(0, r)}`;
    case 'star':
      return poly(Array.from({ length: 10 }, (_, k): [number, number] => {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.45 : r * 1.1;
        return [rr * Math.cos(a), rr * Math.sin(a)];
      }));
  }
}
export const lineOnly = (shape: SymbolShape) => shape === 'cross' || shape === 'plus';

export function dashArray(d: Dash, w: number): string | undefined {
  const u = Math.max(w, 0.5);
  switch (d) {
    case 'dash':
      return `${4 * u} ${2.5 * u}`;
    case 'longdash':
      return `${8 * u} ${3 * u}`;
    case 'shortdash':
      return `${2 * u} ${2 * u}`;
    case 'dot':
      return `${u} ${1.8 * u}`;
    case 'dashdot':
      return `${4 * u} ${1.8 * u} ${u} ${1.8 * u}`;
    case 'dashdotdot':
      return `${4 * u} ${1.6 * u} ${u} ${1.6 * u} ${u} ${1.6 * u}`;
    default:
      return undefined;
  }
}

export const hasLine = (c: Curve) => c.style.mode !== 'scatter';
export const hasSymbols = (c: Curve) => c.style.mode === 'scatter' || c.style.mode === 'linesymbol';

// A smooth path through points: monotone cubic (Fritsch–Carlson) when x increases or decreases throughout — no overshoot
// between the points — else Catmull–Rom.
export function splinePath(px: number[], py: number[]): string {
  const n = px.length;
  if (n < 3) return px.map((x, k) => `${k ? 'L' : 'M'}${x.toFixed(2)},${py[k].toFixed(2)}`).join('');
  const dx = px.slice(1).map((x, k) => x - px[k]);
  const monotone = dx.every((d) => d > 0) || dx.every((d) => d < 0);
  let d = `M${px[0].toFixed(2)},${py[0].toFixed(2)}`;
  if (monotone) {
    const s = dx.map((h, k) => (py[k + 1] - py[k]) / h);
    const m = new Array<number>(n);
    m[0] = s[0];
    m[n - 1] = s[n - 2];
    for (let k = 1; k < n - 1; k++) m[k] = s[k - 1] * s[k] <= 0 ? 0 : (3 * (dx[k - 1] + dx[k])) / ((2 * dx[k] + dx[k - 1]) / s[k - 1] + (dx[k] + 2 * dx[k - 1]) / s[k]);
    for (let k = 0; k < n - 1; k++) {
      const h = dx[k] / 3;
      d += `C${(px[k] + h).toFixed(2)},${(py[k] + m[k] * h).toFixed(2)} ${(px[k + 1] - h).toFixed(2)},${(py[k + 1] - m[k + 1] * h).toFixed(2)} ${px[k + 1].toFixed(2)},${py[k + 1].toFixed(2)}`;
    }
    return d;
  }
  for (let k = 0; k < n - 1; k++) {
    const [x0, y0] = [px[Math.max(0, k - 1)], py[Math.max(0, k - 1)]];
    const [x3, y3] = [px[Math.min(n - 1, k + 2)], py[Math.min(n - 1, k + 2)]];
    d += `C${(px[k] + (px[k + 1] - x0) / 6).toFixed(2)},${(py[k] + (py[k + 1] - y0) / 6).toFixed(2)} ${(px[k + 1] - (x3 - px[k]) / 6).toFixed(2)},${(py[k + 1] - (y3 - py[k]) / 6).toFixed(2)} ${px[k + 1].toFixed(2)},${py[k + 1].toFixed(2)}`;
  }
  return d;
}
