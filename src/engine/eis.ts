// Equivalent circuit (EIS): an impedance spectrum fitted with an equivalent circuit, as NOVA or ZView do. The columns of
// the data chosen by their role — the frequency, the real part Z′ and the imaginary part Z″ (or −Z″; or |Z| and the
// phase) — guessed from their names but always shown and changed by hand; the circuit from a list or written in the
// circuit description code of Boukamp (series by juxtaposition, ( ) a parallel group, [ ] a series group inside it:
// R(RQ), R(Q[RW]), R(RC)(RC)); the elements R, C, L, Q (a constant-phase element, Y0 and n), W (semi-infinite
// Warburg, Y0), Wo and Ws (finite-length Warburg, open and short: R and T). The starting values guessed from the data
// (the intercepts, the apex of the arc); complex nonlinear least squares on Z′ and Z″ at once (Levenberg–Marquardt on
// the logarithms of the parameters: positive, any scale), weighted by the modulus, proportionally or not at all;
// points left out by the user. Pure: also used by the scripts.
import type { AnnotationItem } from '../types.ts';
import { levenbergMarquardt } from './lm.ts';
import { columnLetter } from './csv.ts';
import { column, findColumn, fmtNum, type Column, type Dataset } from './table.ts';

export type EisElemKind = 'R' | 'C' | 'L' | 'Q' | 'W' | 'Wo' | 'Ws';
export type EisParam = { name: string; value: number; fixed?: boolean };
export type EisData = {
  // the columns by their role ('' = guessed from the names); the form of the data: Z′ and Z″, or |Z| and the phase (°)
  form: 'reim' | 'polar';
  freq: string;
  re: string; // Z′, or |Z|
  im: string; // Z″ (or −Z″), or the phase (°)
  imSign: 'auto' | 'neg' | 'pos'; // the column holds −Z″ (neg) or Z″ (pos); auto: from its values
  freqUnit: 'Hz' | 'rad/s';
  circuit: string; // Boukamp's code
  params: EisParam[];
  weight: 'modulus' | 'proportional' | 'unit';
  excluded: number[]; // the rows left out of the fit
  labels: 'decades' | 'all' | 'none'; // the frequencies written beside the points
  values?: boolean; // and their Z′, −Z″
  // the graph shown: Nyquist, |Z| or the phase against the frequency, or both on two axes (Bode)
  view: 'nyquist' | 'mod' | 'phase' | 'bode';
  // the frequencies' labels moved by hand: their place (the corner they start from) in the units of the data of each
  // graph — Nyquist (Z′, −Z″), |Z| (f, |Z|), the phase (f, −phase) — by the row of the point
  labelAt?: Partial<Record<EisLabelView, Record<string, [number, number]>>>;
  // the circuit's figure: a white or transparent page, the fitted values written under the elements; its page (name,
  // dpi of the export)
  circuitBg?: 'white' | 'none';
  circuitValues?: boolean;
  circuitPage?: { name?: string; dpi?: number };
  // the fitted values' texts moved by hand on the circuit's figure (eis-v-<element>: their places, mm; their look)
  annotations?: AnnotationItem[];
  // the frequency ranges fitted (Hz; none: all the points); each range fitted on its own too, with a circuit of its own
  // (absent: the node's) — partial fits, their values then the starts of the whole circuit
  ranges?: EisRangeSpec[];
  rangeFits?: boolean;
  // the fit at every change (absent: yes), or only on Start fit: then the settings fitted kept (fitWith), and the
  // result stays as it was until the next Start fit
  autoFit?: boolean;
  fitWith?: EisFitSettings;
  sheet?: string;
};
export type EisLabelView = 'nyquist' | 'mod' | 'phase';
export type EisRangeSpec = { lo: number; hi: number; circuit?: string };
// the settings a fit depends on (kept at Start fit)
export const EIS_FIT_KEYS = ['form', 'freq', 're', 'im', 'imSign', 'freqUnit', 'circuit', 'params', 'weight', 'excluded', 'ranges', 'rangeFits'] as const;
export type EisFitSettings = Partial<Pick<EisData, (typeof EIS_FIT_KEYS)[number]>>;
export const fitSettingsOf = (d: EisData): EisFitSettings => JSON.parse(JSON.stringify(Object.fromEntries(EIS_FIT_KEYS.map((k) => [k, d[k]]))));
// a frequency in the ranges (none: every one)
export const inRanges = (f: number, ranges: EisRangeSpec[] | undefined) => !ranges?.length || ranges.some((r) => f >= Math.min(r.lo, r.hi) * (1 - 1e-9) && f <= Math.max(r.lo, r.hi) * (1 + 1e-9));
export const rangeText = (r: EisRangeSpec) => `${fmtFreq(Math.min(r.lo, r.hi))} – ${fmtFreq(Math.max(r.lo, r.hi))}`;

export const EIS_CIRCUITS: [string, string][] = [
  ['R(RC)', 'Randles, simplified: R_s + R_ct ∥ C_dl'],
  ['R(RQ)', 'R_s + R_ct ∥ CPE'],
  ['R(C[RW])', 'Randles: R_s + C_dl ∥ (R_ct + W)'],
  ['R(Q[RW])', 'Randles with a CPE: R_s + Q_dl ∥ (R_ct + W)'],
  ['R(RQ)(RQ)', 'two time constants: R_s + R₁ ∥ Q₁ + R₂ ∥ Q₂'],
  ['R(Q[R(RQ)])', 'a coating: R_s + Q_c ∥ (R_po + R_ct ∥ Q_dl)'],
  ['R(RQ)W', 'R_s + R ∥ CPE + W (diffusion)'],
  ['R(RQ)Wo', 'R_s + R ∥ CPE + finite Warburg (open)'],
  ['RL(RQ)', 'R_s + L + R ∥ CPE (an inductive lead)'],
  ['RWo', 'supercapacitor, porous electrode (de Levie): R_s + Wo'],
  ['R(RQ)WC', 'supercapacitor: R_s + R_ct ∥ CPE + W + C_L'],
];

// ---- complex numbers ----
type Cx = [number, number];
const add = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const inv = (a: Cx): Cx => {
  const d = a[0] * a[0] + a[1] * a[1];
  return [a[0] / d, -a[1] / d];
};
const div = (a: Cx, b: Cx): Cx => mul(a, inv(b));
// (jω)^n = ω^n (cos nπ/2 + j sin nπ/2)
const jwPow = (w: number, n: number): Cx => [w ** n * Math.cos((n * Math.PI) / 2), w ** n * Math.sin((n * Math.PI) / 2)];
const csqrt = (a: Cx): Cx => {
  const r = Math.hypot(a[0], a[1]);
  const re = Math.sqrt((r + a[0]) / 2);
  const im = Math.sign(a[1] || 1) * Math.sqrt(Math.max(0, (r - a[0]) / 2));
  return [re, im];
};
const ctanh = (a: Cx): Cx => {
  // tanh(x + jy) = (sinh 2x + j sin 2y) / (cosh 2x + cos 2y), kept finite for large x
  if (a[0] > 20) return [1, 0];
  const [x2, y2] = [2 * a[0], 2 * a[1]];
  const d = Math.cosh(x2) + Math.cos(y2);
  return [Math.sinh(x2) / d, Math.sin(y2) / d];
};

// ---- the circuit: elements in series and parallel groups ----
export type EisElem = { kind: EisElemKind; id: string; params: string[] };
export type EisTree = { t: 'elem'; e: EisElem } | { t: 'series' | 'parallel'; items: EisTree[] };
const UNITS: Record<string, string> = { R: 'Ω', C: 'F', L: 'H', Y0Q: 'S·sⁿ', n: '', Y0W: 'S·s^½', T: 's' };
const paramNames = (kind: EisElemKind, id: string): string[] =>
  kind === 'Q' ? [`${id} Y0`, `${id} n`] : kind === 'W' ? [`${id} Y0`] : kind === 'Wo' || kind === 'Ws' ? [`${id} R`, `${id} T`] : [id];
export const paramUnit = (name: string): string => {
  const [id, part] = name.split(' ');
  if (part === 'n') return UNITS.n;
  if (part === 'Y0') return id.startsWith('W') ? UNITS.Y0W : UNITS.Y0Q;
  if (part === 'T') return UNITS.T;
  if (part === 'R') return UNITS.R;
  return UNITS[id.replace(/\d+$/, '')] ?? '';
};

// the code read: “R(RQ)”, “R(Q[RW])”; elements may carry their numbers (R1, Q2) — else numbered by kind in order
export function parseCircuit(code: string): { tree: EisTree; elems: EisElem[] } | string {
  const s = code.replace(/\s+/g, '');
  if (!s) return 'Write the circuit (Boukamp’s code: R(RQ), R(Q[RW]) …) or choose one.';
  let i = 0;
  const count: Record<string, number> = {};
  const elems: EisElem[] = [];
  // the numbers written (R1, Q2): an element without one takes the next number of its kind not written
  const written = new Set([...s.matchAll(/(Wo|Ws|CPE|R|C|L|Q|W)(\d+)/gi)].map((m) => `${({ CPE: 'Q', WO: 'Wo', WS: 'Ws' } as Record<string, string>)[m[1].toUpperCase()] ?? m[1].toUpperCase()}${m[2]}`));
  const seq = (close: string, kind: 'series' | 'parallel'): EisTree | string => {
    const items: EisTree[] = [];
    while (i < s.length && s[i] !== close) {
      const ch = s[i];
      if (ch === '(' || ch === '[') {
        i++;
        const g = seq(ch === '(' ? ')' : ']', ch === '(' ? 'parallel' : 'series');
        if (typeof g === 'string') return g;
        if (s[i] !== (ch === '(' ? ')' : ']')) return `A “${ch}” is not closed.`;
        i++;
        items.push(g);
        continue;
      }
      const m = /^(Wo|Ws|CPE|R|C|L|Q|W)(\d*)/i.exec(s.slice(i));
      if (!m) return `Not an element at “${s.slice(i, i + 6)}”: R, C, L, Q (CPE), W, Wo, Ws.`;
      i += m[0].length;
      let kind = m[1].toUpperCase();
      if (kind === 'CPE') kind = 'Q';
      if (kind === 'WO') kind = 'Wo';
      if (kind === 'WS') kind = 'Ws';
      const k = kind as EisElemKind;
      let id = `${k}${m[2]}`;
      if (!m[2]) {
        do count[k] = (count[k] ?? 0) + 1;
        while (written.has(`${k}${count[k]}`));
        id = `${k}${count[k]}`;
      }
      if (elems.some((e) => e.id === id)) return `Two elements named ${id}.`;
      const e: EisElem = { kind: k, id, params: paramNames(k, id) };
      elems.push(e);
      items.push({ t: 'elem', e });
    }
    if (!items.length) return 'An empty group ( ) or [ ].';
    return items.length === 1 ? items[0] : { t: kind, items };
  };
  const tree = seq('', 'series');
  if (typeof tree === 'string') return tree;
  if (i < s.length) return `An unexpected “${s[i]}”.`;
  return { tree, elems };
}

function elemZ(e: EisElem, p: Record<string, number>, w: number): Cx {
  const v = (k: number) => p[e.params[k]];
  switch (e.kind) {
    case 'R':
      return [v(0), 0];
    case 'C':
      return inv([0, w * v(0)]);
    case 'L':
      return [0, w * v(0)];
    case 'Q':
      return inv(mul([v(0), 0], jwPow(w, v(1))));
    case 'W':
      return inv(mul([v(0), 0], jwPow(w, 0.5)));
    case 'Wo':
    case 'Ws': {
      const s = csqrt([0, w * v(1)]);
      const t = ctanh(s);
      // Ws (short): R tanh(√(jωT)) / √(jωT); Wo (open): R coth(√(jωT)) / √(jωT)
      return mul([v(0), 0], e.kind === 'Ws' ? div(t, s) : inv(mul(t, s)));
    }
  }
}
function nodeZ(nd: EisTree, p: Record<string, number>, w: number): Cx {
  if (nd.t === 'elem') return elemZ(nd.e, p, w);
  if (nd.t === 'series') return nd.items.reduce((z, it) => add(z, nodeZ(it, p, w)), [0, 0] as Cx);
  return inv(nd.items.reduce((y, it) => add(y, inv(nodeZ(it, p, w))), [0, 0] as Cx));
}
export const circuitZ = (tree: EisTree, p: Record<string, number>, w: number): Cx => nodeZ(tree, p, w);

// ---- the circuit edited on its drawing: a part found by its path (the places of its groups, from the top), elements
// added in series or in parallel to it, replaced, deleted; written back as code with the elements' numbers, so their
// parameters keep their names ----
export type EisPath = number[];
export const elemsOf = (t: EisTree): EisElem[] => (t.t === 'elem' ? [t.e] : t.items.flatMap(elemsOf));
export const nodeAt = (t: EisTree, p: EisPath): EisTree | undefined => p.reduce<EisTree | undefined>((n, k) => (n && n.t !== 'elem' ? n.items[k] : undefined), t);
// a series in a series (a parallel group in a parallel one) is one group; a group of one is its item
function normal(t: EisTree): EisTree {
  if (t.t === 'elem') return t;
  const items = t.items.map(normal).flatMap((it) => (it.t === t.t ? it.items : [it]));
  return items.length === 1 ? items[0] : { t: t.t, items };
}
function replaceAt(t: EisTree, p: EisPath, f: (n: EisTree) => EisTree | null): EisTree | null {
  if (!p.length) return f(t);
  if (t.t === 'elem') return t;
  const items = t.items.flatMap((it, k) => {
    if (k !== p[0]) return [it];
    const n = replaceAt(it, p.slice(1), f);
    return n ? [n] : [];
  });
  return items.length ? normal({ t: t.t, items }) : null;
}
export function newElem(kind: EisElemKind, tree: EisTree | null): EisTree {
  const used = new Set(tree ? elemsOf(tree).map((e) => e.id) : []);
  let k = 1;
  while (used.has(`${kind}${k}`)) k++;
  const id = `${kind}${k}`;
  return { t: 'elem', e: { kind, id, params: paramNames(kind, id) } };
}
export type EisEdit = 'series' | 'parallel' | 'replace' | 'delete';
export function editCircuit(tree: EisTree | null, path: EisPath, op: EisEdit, kind: EisElemKind): EisTree | null {
  if (!tree) return op === 'delete' ? null : newElem(kind, null);
  const e = newElem(kind, tree);
  if (op === 'delete') return replaceAt(tree, path, () => null);
  if (op === 'replace') return replaceAt(tree, path, () => e);
  return replaceAt(tree, path, (n) => normal({ t: op, items: [n, e] }));
}
// an element dropped on a part of the circuit (dragged on its drawing): on its left or right side in series with it
// (before, after), above or below in parallel with it, on its middle in its place; a new one of the palette (its kind)
// or one already there moved (its id: it keeps its name and parameters; on the middle of another element the two
// change places)
export type EisSide = 'left' | 'right' | 'top' | 'bottom' | 'center';
export const elemPath = (t: EisTree, id: string, p: EisPath = []): EisPath | null => {
  if (t.t === 'elem') return t.e.id === id ? p : null;
  for (let k = 0; k < t.items.length; k++) {
    const q = elemPath(t.items[k], id, [...p, k]);
    if (q) return q;
  }
  return null;
};
const without = (t: EisTree, node: EisTree): EisTree | null => {
  if (t === node) return null;
  if (t.t === 'elem') return t;
  const items = t.items.flatMap((it) => {
    const n = without(it, node);
    return n ? [n] : [];
  });
  return items.length ? normal({ t: t.t, items }) : null;
};
const swapped = (t: EisTree, a: EisTree, b: EisTree): EisTree => (t === a ? b : t === b ? a : t.t === 'elem' ? t : { t: t.t, items: t.items.map((it) => swapped(it, a, b)) });
const beside = (n: EisTree, e: EisTree, side: EisSide): EisTree => normal({ t: side === 'left' || side === 'right' ? 'series' : 'parallel', items: side === 'left' || side === 'top' ? [e, n] : [n, e] });
export function dropInto(tree: EisTree | null, target: EisPath, side: EisSide, what: EisElemKind | { id: string }): EisTree | null {
  if (!tree) return typeof what === 'string' ? newElem(what, null) : null;
  const tgt = nodeAt(tree, target);
  if (!tgt) return tree;
  if (typeof what === 'string') {
    const e = newElem(what, tree);
    return replaceAt(tree, target, (n) => (side === 'center' ? e : beside(n, e, side)));
  }
  const at = elemPath(tree, what.id);
  const src = at ? nodeAt(tree, at) : undefined;
  if (!src || src === tgt) return tree;
  if (side === 'center') return tgt.t === 'elem' ? swapped(tree, src, tgt) : tree;
  // (put beside the target first — the paths still hold — then the element taken from its old place)
  const placed = replaceAt(tree, target, (n) => beside(n, { ...src }, side));
  return placed ? without(placed, src) : null;
}

// a parallel split and join put on the drawing (split: on the left of an element, join: on the right of one on the same
// line in series): the elements between them — a part of a series group (a … b), or one part whole — become the first
// branch of a parallel group whose second branch is an element dropped there (new, or moved from its place)
export type EisRange = { path: EisPath; a?: number; b?: number };
export function rangeOf(tree: EisTree, splitId: string, joinId: string): EisRange | string {
  const ps = elemPath(tree, splitId);
  const pj = elemPath(tree, joinId);
  if (!ps || !pj) return 'The split or the join is on no element.';
  let L = 0;
  while (L < ps.length && L < pj.length && ps[L] === pj[L]) L++;
  if (L === ps.length && L === pj.length) return { path: ps };
  const at = ps.slice(0, L);
  const n = nodeAt(tree, at);
  if (n?.t !== 'series') return 'The split and the join must be on one line in series, not on two branches of a parallel group.';
  const [a, b] = [Math.min(ps[L], pj[L]), Math.max(ps[L], pj[L])];
  return a === 0 && b === n.items.length - 1 ? { path: at } : { path: at, a, b };
}
export function withBranch(tree: EisTree, range: EisRange, what: EisElemKind | { id: string } | EisTree): EisTree | null {
  let src: EisTree | undefined;
  let e: EisTree;
  if (typeof what === 'string') e = newElem(what, tree);
  else if ('t' in what) e = what;
  else {
    const at = elemPath(tree, what.id);
    src = at ? nodeAt(tree, at) : undefined;
    if (!src) return tree;
    e = { ...src };
  }
  const placed = replaceAt(tree, range.path, (n) => {
    if (range.a === undefined || range.b === undefined || n.t !== 'series') return normal({ t: 'parallel', items: [n, e] });
    const part = n.items.slice(range.a, range.b + 1);
    const first: EisTree = part.length === 1 ? part[0] : { t: 'series', items: part };
    return normal({ t: 'series', items: [...n.items.slice(0, range.a), { t: 'parallel', items: [first, e] }, ...n.items.slice(range.b + 1)] });
  });
  return placed && src ? without(placed, src) : placed;
}
// the empty branch while it waits for its element (drawn dashed: “drop here”)
export const SLOT_ID = '…';

// Boukamp's code: series by juxtaposition, ( ) a parallel group, [ ] a series inside it; ids: with the elements'
// numbers (R1(R2Q1)), else only their kinds (R(RQ))
export function writeCircuit(t: EisTree | null, ids = true): string {
  const w = (n: EisTree, inPar: boolean): string => {
    if (n.t === 'elem') return ids ? n.e.id : n.e.kind;
    if (n.t === 'parallel') return `(${n.items.map((it) => w(it, true)).join('')})`;
    const s = n.items.map((it) => w(it, false)).join('');
    return inPar ? `[${s}]` : s;
  };
  return t ? w(t, false) : '';
}
// an element shorted (its impedance 0) or open (infinite): the circuit left, or wholly shorted / open
type Cut = EisTree | 'short' | 'open';
function cutElem(n: EisTree, id: string, as: 'short' | 'open'): Cut {
  if (n.t === 'elem') return n.e.id === id ? as : n;
  const parts = n.items.map((it) => cutElem(it, id, as));
  const [stop, drop] = n.t === 'series' ? (['open', 'short'] as const) : (['short', 'open'] as const);
  if (parts.includes(stop)) return stop;
  const keep = parts.filter((q): q is EisTree => q !== drop);
  return keep.length ? normal({ t: n.t, items: keep }) : drop;
}

// ---- the circuit drawn (mm, y down): the classic symbols — a zigzag resistor, a capacitor's two plates, a CPE's two
// bent plates, an inductor's loops, a Warburg's box — elements in series side by side, parallel groups stacked between
// two rails; its number over each element, the fitted values (optional) under it ----
export type CircuitPiece = { d: string; fill?: boolean; dash?: boolean };
// value: the fitted values of an element (its id), one text of a line each — moved by hand in the circuit's figure
export type CircuitText = { x: number; y: number; text: string; anchor: 'bc' | 'tc' | 'c'; size: number; value?: string };
export type CircuitDrawing = { w: number; h: number; pieces: CircuitPiece[]; texts: CircuitText[]; elems: { id: string; path: EisPath; x0: number; y0: number; x1: number; y1: number }[]; groups: { path: EisPath; x0: number; y0: number; x1: number; y1: number }[] };
const f2 = (v: number) => +v.toFixed(3);
const textW = (s: string, pt: number) => s.length * pt * 0.52 * 0.3528; // mm, about
export function drawCircuit(tree: EisTree, values?: Record<string, number>, slot?: string): CircuitDrawing {
  const ID_PT = 7;
  const VAL_PT = 5.5;
  const SYM = 10; // the symbol's length, mm
  const GAP = 2.5; // a wire between two parts in series
  const VGAP = 2; // between the branches of a parallel group
  const RAIL = 3; // a parallel group's wires out to its rails
  const valueLines = (e: EisElem) => (values ? e.params.map((p) => `${e.params.length > 1 ? `${p.split(' ')[1]} ` : ''}${fmtNum(values[p], 3)}${paramUnit(p) ? ` ${paramUnit(p)}` : ''}`) : []);
  type Box = { w: number; h: number; wy: number; put: (x: number, y: number, out: CircuitDrawing) => void };
  const sym = (kind: EisElemKind, x: number, y: number): CircuitPiece[] => {
    const [a, b] = [x, x + SYM];
    const m = x + SYM / 2;
    const P = (s: string, fill?: boolean) => ({ d: s, ...(fill ? { fill } : {}) });
    switch (kind) {
      case 'R': {
        const n = 6;
        const [z0, z1] = [a + 1.5, b - 1.5];
        const pts = Array.from({ length: n + 1 }, (_, k) => `${f2(z0 + ((z1 - z0) * k) / n)} ${f2(k === 0 || k === n ? y : y + (k % 2 ? -1.4 : 1.4))}`);
        return [P(`M ${a} ${y} L ${z0} ${y} L ${pts.join(' L ')} L ${b} ${y}`)];
      }
      case 'C':
        return [P(`M ${a} ${y} L ${f2(m - 0.8)} ${y} M ${f2(m + 0.8)} ${y} L ${b} ${y} M ${f2(m - 0.8)} ${f2(y - 2.4)} L ${f2(m - 0.8)} ${f2(y + 2.4)} M ${f2(m + 0.8)} ${f2(y - 2.4)} L ${f2(m + 0.8)} ${f2(y + 2.4)}`)];
      case 'Q':
        // two plates bent towards the right (>>): the constant-phase element
        return [P(`M ${a} ${y} L ${f2(m - 0.7)} ${y} M ${f2(m + 1.1)} ${y} L ${b} ${y} M ${f2(m - 1.6)} ${f2(y - 2.4)} L ${f2(m - 0.7)} ${y} L ${f2(m - 1.6)} ${f2(y + 2.4)} M ${f2(m + 0.2)} ${f2(y - 2.4)} L ${f2(m + 1.1)} ${y} L ${f2(m + 0.2)} ${f2(y + 2.4)}`)];
      case 'L': {
        const n = 4;
        const r = (SYM - 3) / n / 2;
        let s = `M ${a} ${y} L ${a + 1.5} ${y}`;
        for (let k = 0; k < n; k++) s += ` a ${f2(r)} ${f2(r)} 0 0 1 ${f2(2 * r)} 0`;
        return [P(`${s} L ${b} ${y}`)];
      }
      default:
        return [P(`M ${a} ${y} L ${f2(m - 3.2)} ${y} M ${f2(m + 3.2)} ${y} L ${b} ${y} M ${f2(m - 3.2)} ${f2(y - 2)} L ${f2(m + 3.2)} ${f2(y - 2)} L ${f2(m + 3.2)} ${f2(y + 2)} L ${f2(m - 3.2)} ${f2(y + 2)} Z`)];
    }
  };
  const box = (n: EisTree, path: EisPath): Box => {
    if (n.t === 'elem' && n.e.id === slot) {
      // the empty branch: a dashed box to drop an element in
      const [w, h, wy] = [SYM + 4, 8.8, 6.27];
      return {
        w,
        h,
        wy,
        put: (x, y, out) => {
          out.pieces.push({ d: `M ${f2(x)} ${f2(y + wy)} L ${f2(x + 1)} ${f2(y + wy)} M ${f2(x + w - 1)} ${f2(y + wy)} L ${f2(x + w)} ${f2(y + wy)}` }, { d: `M ${f2(x + 1)} ${f2(y + 2)} L ${f2(x + w - 1)} ${f2(y + 2)} L ${f2(x + w - 1)} ${f2(y + h - 0.5)} L ${f2(x + 1)} ${f2(y + h - 0.5)} Z`, dash: true });
          out.texts.push({ x: f2(x + w / 2), y: f2(y + (h + 1.5) / 2), text: 'drop here', anchor: 'c', size: 5.5 });
          out.elems.push({ id: n.e.id, path, x0: f2(x), y0: f2(y), x1: f2(x + w), y1: f2(y + h) });
        },
      };
    }
    if (n.t === 'elem') {
      const vals = valueLines(n.e);
      const w = Math.max(SYM, textW(n.e.id, ID_PT) + 1, ...vals.map((s) => textW(s, VAL_PT) + 1));
      const top = ID_PT * 0.3528 + 1.2; // its number over it
      const h = top + 2.6 + (vals.length ? 3.1 + vals.length * VAL_PT * 0.3528 * 1.15 : 2.6);
      return {
        w,
        h,
        wy: top + 2.6,
        put: (x, y, out) => {
          const sx = x + (w - SYM) / 2;
          const wy = y + top + 2.6;
          out.pieces.push({ d: `M ${f2(x)} ${f2(wy)} L ${f2(sx)} ${f2(wy)} M ${f2(sx + SYM)} ${f2(wy)} L ${f2(x + w)} ${f2(wy)}` }, ...sym(n.e.kind, f2(sx), f2(wy)));
          out.texts.push({ x: f2(x + w / 2), y: f2(wy - 2.9), text: n.e.id, anchor: 'bc', size: ID_PT });
          if (n.e.kind === 'W' || n.e.kind === 'Wo' || n.e.kind === 'Ws') out.texts.push({ x: f2(x + w / 2), y: f2(wy), text: n.e.kind, anchor: 'c', size: 5.5 });
          if (vals.length) out.texts.push({ x: f2(x + w / 2), y: f2(wy + 3.1), text: vals.join('\n'), anchor: 'tc', size: VAL_PT, value: n.e.id });
          out.elems.push({ id: n.e.id, path, x0: f2(x), y0: f2(y), x1: f2(x + w), y1: f2(y + h) });
        },
      };
    }
    const parts = n.items.map((it, k) => box(it, [...path, k]));
    if (n.t === 'series') {
      const wy = Math.max(...parts.map((p) => p.wy));
      const h = wy + Math.max(...parts.map((p) => p.h - p.wy));
      const w = parts.reduce((s, p) => s + p.w, 0) + GAP * (parts.length - 1);
      return {
        w,
        h,
        wy,
        put: (x, y, out) => {
          let cx = x;
          parts.forEach((p, k) => {
            p.put(cx, y + wy - p.wy, out);
            cx += p.w;
            if (k < parts.length - 1) out.pieces.push({ d: `M ${f2(cx)} ${f2(y + wy)} L ${f2(cx + GAP)} ${f2(y + wy)}` });
            cx += GAP;
          });
          if (path.length) out.groups.push({ path, x0: f2(x - 0.6), y0: f2(y - 0.6), x1: f2(x + w + 0.6), y1: f2(y + h + 0.6) });
        },
      };
    }
    const inner = Math.max(...parts.map((p) => p.w));
    const w = inner + 2 * RAIL;
    const h = parts.reduce((s, p) => s + p.h, 0) + VGAP * (parts.length - 1);
    let acc = 0;
    const wys = parts.map((p) => {
      const v = acc + p.wy;
      acc += p.h + VGAP;
      return v;
    });
    const wy = (wys[0] + wys[wys.length - 1]) / 2;
    return {
      w,
      h,
      wy,
      put: (x, y, out) => {
        let cy = y;
        parts.forEach((p) => {
          const px = x + RAIL + (inner - p.w) / 2;
          p.put(px, cy, out);
          const m = f2(cy + p.wy);
          out.pieces.push({ d: `M ${f2(x)} ${m} L ${f2(px)} ${m} M ${f2(px + p.w)} ${m} L ${f2(x + w)} ${m}` });
          cy += p.h + VGAP;
        });
        out.pieces.push({ d: `M ${f2(x)} ${f2(y + wys[0])} L ${f2(x)} ${f2(y + wys[wys.length - 1])} M ${f2(x + w)} ${f2(y + wys[0])} L ${f2(x + w)} ${f2(y + wys[wys.length - 1])}` });
        out.groups.push({ path, x0: f2(x - 0.6), y0: f2(y - 0.6), x1: f2(x + w + 0.6), y1: f2(y + h + 0.6) });
      },
    };
  };
  const LEAD = 4;
  const MARGIN = 2;
  const b = box(tree, []);
  const out: CircuitDrawing = { w: f2(b.w + 2 * LEAD + 2 * MARGIN), h: f2(b.h + 2 * MARGIN), pieces: [], texts: [], elems: [], groups: [] };
  const [x, y] = [MARGIN + LEAD, MARGIN];
  const wy = f2(y + b.wy);
  b.put(x, y, out);
  // the leads and the two terminals (small open circles)
  const r = 0.6;
  out.pieces.push({ d: `M ${f2(MARGIN + r * 2)} ${wy} L ${f2(x)} ${wy} M ${f2(x + b.w)} ${wy} L ${f2(out.w - MARGIN - r * 2)} ${wy}` });
  for (const cx of [MARGIN + r, out.w - MARGIN - r]) out.pieces.push({ d: `M ${f2(cx - r)} ${wy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z` });
  return out;
}

// ---- the data: the columns by their role ----
const NAME_RE = {
  freq: /freq|^f\b|^f\s*\(|hz|ω|omega|rad\/s/i,
  re: /z['′’]?\s*re|re\s*z|real|^z['′’](?!['′’])|z\s*'(?!')|zre|z_re|^re\b/i,
  im: /z['′’]{2}|z″|z''|im\s*z|imag|zim|z_im|^im\b|-z|−z/i,
  mod: /\|z\||mod|magn|^z\s*\(|zmod/i,
  phase: /phase|phi|φ|θ|angle|arg/i,
};
// the column guessed for a role: the first named so (its name tells), else by its place (then shown as such: to check)
export type EisGuess = { freq?: Column; a?: Column; b?: Column; by: { freq: 'name' | 'place'; a: 'name' | 'place'; b: 'name' | 'place' } };
export function guessColumns(cols: Column[], form: EisData['form']): EisGuess {
  const num = cols.filter((c) => !c.text);
  const find = (re: RegExp, not: Column[] = []) => num.find((c) => !not.includes(c) && re.test(c.name));
  const rest = (not: (Column | undefined)[]) => num.find((c) => !not.includes(c));
  const fn = find(NAME_RE.freq);
  const freq = fn ?? num[0];
  const [an, bn] = form === 'polar' ? [find(NAME_RE.mod, [freq]), undefined] : [undefined, find(NAME_RE.im, [freq])];
  const a2 = an ?? (form === 'polar' ? undefined : find(NAME_RE.re, [freq, ...(bn ? [bn] : [])]));
  const b2 = bn ?? (form === 'polar' ? find(NAME_RE.phase, [freq, ...(a2 ? [a2] : [])]) : undefined);
  const a = a2 ?? rest([freq, b2]);
  const b = b2 ?? rest([freq, a]);
  return { freq, a, b, by: { freq: fn ? 'name' : 'place', a: a2 ? 'name' : 'place', b: b2 ? 'name' : 'place' } };
}
// the frequencies given as ω = 2πf: they lie on an even logarithmic grid (n points a decade) or are round numbers
// only once divided by 2π (0.628319 = 2π · 0.1)
const evenLog = (xs: number[]) => {
  const ok = (x: number, n: number) => Math.abs(Math.log10(x) - Math.round(n * Math.log10(x)) / n) < 5e-4;
  const round = (x: number) => {
    const m = x / 10 ** Math.floor(Math.log10(x));
    return Math.abs(m * 100 - Math.round(m * 100)) < 1e-3;
  };
  return xs.every(round) || Array.from({ length: 20 }, (_, k) => k + 1).some((n) => xs.every((x) => ok(x, n)));
};
export function looksAngular(values: ArrayLike<number>): boolean {
  const xs = Array.from(values)
    .filter((v) => Number.isFinite(v) && v > 0)
    .slice(0, 40);
  return xs.length >= 3 && !evenLog(xs) && evenLog(xs.map((v) => v / (2 * Math.PI)));
}

// a column as it is shown: its letter and its name (a column without a name: its letter only); chosen by its name, or
// by its place (#k) when it has none or another column has the same
export const colLabel = (cols: Column[], c: Column) => {
  const k = cols.indexOf(c);
  const letter = k >= 0 ? columnLetter(k) : '';
  return c.name.trim() && c.name.trim() !== letter ? (letter ? `${letter} · ${c.name}` : c.name) : letter || '(no name)';
};
export const colKey = (cols: Column[], c: Column) => (c.name.trim() && cols.filter((q) => q.name === c.name).length === 1 ? c.name : `#${cols.indexOf(c)}`);
export type EisPoints = { f: number[]; w: number[]; re: number[]; im: number[]; rows: number[] }; // im: Z″ (negative for a capacitive arc)
export function eisPoints(ds: Dataset, d: EisData): { pts: EisPoints; cols: { freq: Column; a: Column; b: Column }; signNote: string } | string {
  const cols = ds.columns;
  const g = guessColumns(cols, d.form);
  const pick = (name: string, guess?: Column) => (/^#\d+$/.test(name) ? cols[Number(name.slice(1))] : name ? findColumn(cols, name) : guess);
  const freq = pick(d.freq, g.freq);
  const a = pick(d.re, g.a);
  const b = pick(d.im, g.b);
  const need = d.form === 'polar' ? ['the frequency', '|Z|', 'the phase'] : ['the frequency', 'Z′', 'Z″ (or −Z″)'];
  const miss = [freq, a, b].map((c, k) => (c ? '' : need[k])).filter(Boolean);
  if (miss.length) return `Choose the columns: ${miss.join(', ')}.`;
  const pts: EisPoints = { f: [], w: [], re: [], im: [], rows: [] };
  for (let i = 0; i < freq!.values.length; i++) {
    const [fv, av, bv] = [freq!.values[i], a!.values[i], b!.values[i]];
    if (!Number.isFinite(fv) || !Number.isFinite(av) || !Number.isFinite(bv) || fv <= 0) continue;
    const f = d.freqUnit === 'rad/s' ? fv / (2 * Math.PI) : fv;
    const [re, im] = d.form === 'polar' ? [av * Math.cos((bv * Math.PI) / 180), av * Math.sin((bv * Math.PI) / 180)] : [av, bv];
    pts.f.push(f);
    pts.w.push(2 * Math.PI * f);
    pts.re.push(re);
    pts.im.push(im);
    pts.rows.push(i);
  }
  if (pts.f.length < 3) return 'Fewer than 3 points with a frequency, Z′ and Z″.';
  // the sign of Z″: a capacitive cell has Z″ < 0; a column of mostly positive values holds −Z″ (or a phase of −Z)
  let signNote = '';
  const pos = pts.im.filter((v) => v > 0).length > pts.im.length / 2;
  const neg = d.imSign === 'neg' || (d.imSign === 'auto' && pos);
  if (neg) {
    pts.im = pts.im.map((v) => -v);
    signNote = d.form === 'polar' ? 'the phase taken as that of −Z (mostly positive)' : `“${colLabel(cols, b!)}” taken as −Z″ (mostly positive)`;
  } else signNote = d.form === 'polar' ? '' : `“${colLabel(cols, b!)}” taken as Z″`;
  return { pts, cols: { freq: freq!, a: a!, b: b! }, signNote };
}

// ---- the starting values guessed from the data: R₀ the high-frequency intercept, the arcs' resistances share the
// width of the spectrum (low − high frequency Z′), their capacitances from the apex (1 / (2π f R)), spread a decade
// apart for several arcs; n = 0.9; the Warburg from the low-frequency tail ----
export function guessParams(tree: EisTree, elems: EisElem[], pts: EisPoints): Record<string, number> {
  const n = pts.f.length;
  const byF = pts.f.map((_, i) => i).sort((a, b) => pts.f[b] - pts.f[a]);
  const hi = byF[0];
  const lo = byF[n - 1];
  const rHi = Math.max(1e-6, Math.min(...byF.slice(0, Math.max(1, Math.round(n / 10))).map((i) => pts.re[i])));
  // the arc: from the high frequencies down, the first maximum of −Z″ (a diffusion tail rises after it, so not the
  // highest), and the minimum after it where the arc ends (else the lowest frequency)
  const y = byF.map((i) => -pts.im[i]);
  const w = Math.max(1, Math.round(n / 25));
  const isMax = (k: number) => y[k] > 0 && y.slice(Math.max(0, k - w), k + w + 1).every((v) => v <= y[k]);
  let peak = -1;
  for (let k = w; k < n - w && peak < 0; k++) if (isMax(k)) peak = k;
  if (peak < 0) peak = y.reduce((b, v, k) => (v > y[b] ? k : b), 0);
  let end = n - 1;
  for (let k = peak + w; k < n - w; k++)
    if (y.slice(k - w, k + w + 1).every((v) => v >= y[k])) {
      end = k;
      break;
    }
  const rLo = Math.max(rHi * 1.01, pts.re[byF[end]]);
  const fApex = pts.f[byF[peak]];
  // the resistances in series at the top: the first is R₀; the others, and those in parallel groups, share the rest
  const top = tree.t === 'series' ? tree.items : [tree];
  const r0 = top.find((it) => it.t === 'elem' && it.e.kind === 'R');
  const others = elems.filter((e) => e.kind === 'R' && !(r0?.t === 'elem' && r0.e === e));
  const share = (rLo - rHi) / Math.max(1, others.length);
  const p: Record<string, number> = {};
  let arc = 0;
  for (const e of elems) {
    const fk = fApex / 10 ** arc;
    switch (e.kind) {
      case 'R':
        p[e.params[0]] = r0?.t === 'elem' && r0.e === e ? rHi : Math.max(share, rHi * 0.1, 1e-6);
        break;
      case 'C':
        p[e.params[0]] = 1 / (2 * Math.PI * fk * Math.max(share, 1e-6));
        arc++;
        break;
      case 'Q':
        p[e.params[0]] = 1 / (2 * Math.PI * fk * Math.max(share, 1e-6));
        p[e.params[1]] = 0.9;
        arc++;
        break;
      case 'L':
        p[e.params[0]] = Math.max(1e-9, Math.abs(pts.im[hi]) / pts.w[hi]);
        break;
      case 'W':
        p[e.params[0]] = 1 / (Math.max(1e-6, Math.hypot(pts.re[lo] - rHi, pts.im[lo])) * Math.sqrt(pts.w[lo]));
        break;
      case 'Wo':
      case 'Ws':
        p[e.params[0]] = Math.max(share, 1e-6);
        p[e.params[1]] = 1 / pts.w[lo];
        break;
    }
  }
  return p;
}

// ---- the fit ----
export type EisResult = {
  elems: EisElem[];
  tree: EisTree;
  params: { name: string; value: number; se: number; unit: string; fixed: boolean }[];
  chi2: number; // the weighted sum of squares
  redChi2: number;
  // R² of the fit (on the values, not weighted): Z′ and Z″ together, and each of them
  r2: { all: number; re: number; im: number };
  n: number; // the points fitted
  fitted: boolean; // (false: every parameter fixed, the circuit only simulated)
};
// the parameters of the circuit: the stored ones by name, the others guessed (or the guess for all)
export function startParams(elems: EisElem[], tree: EisTree, stored: EisParam[], pts: EisPoints | null): EisParam[] {
  const g = pts ? guessParams(tree, elems, pts) : {};
  return elems.flatMap((e) =>
    e.params.map((name) => {
      const s = stored.find((q) => q.name === name);
      return s && Number.isFinite(s.value) ? s : { name, value: g[name] ?? (name.endsWith(' n') ? 0.9 : 1), ...(s?.fixed ? { fixed: true } : {}) };
    }),
  );
}

// only: nothing fitted, the circuit with its starts (before a first Start fit)
export function fitCircuit(tree: EisTree, elems: EisElem[], params: EisParam[], pts: EisPoints, use: boolean[], weight: EisData['weight'], only = false): EisResult {
  const names = params.map((q) => q.name);
  const free = only ? [] : params.map((q, k) => (q.fixed ? -1 : k)).filter((k) => k >= 0);
  const isN = (k: number) => names[k].endsWith(' n');
  // the free parameters as their logarithms (n as itself, kept in 0 … 1)
  const toX = (k: number, v: number) => (isN(k) ? v : Math.log(Math.max(v, 1e-300)));
  const fromX = (k: number, x: number) => (isN(k) ? x : Math.exp(x));
  const idx = pts.f.map((_, i) => i).filter((i) => use[i]);
  const values = (x: number[]) => {
    const p: Record<string, number> = {};
    params.forEach((q) => (p[q.name] = q.value));
    free.forEach((k, j) => (p[names[k]] = fromX(k, x[j])));
    return p;
  };
  const res = (x: number[]) => {
    const p = values(x);
    const r = new Float64Array(idx.length * 2);
    idx.forEach((i, j) => {
      const z = circuitZ(tree, p, pts.w[i]);
      const mod = Math.hypot(pts.re[i], pts.im[i]) || 1;
      const [wr, wi] = weight === 'modulus' ? [mod, mod] : weight === 'proportional' ? [Math.abs(pts.re[i]) || mod, Math.abs(pts.im[i]) || mod] : [1, 1];
      r[2 * j] = (z[0] - pts.re[i]) / wr;
      r[2 * j + 1] = (z[1] - pts.im[i]) / wi;
    });
    for (let k = 0; k < r.length; k++) if (!Number.isFinite(r[k])) r[k] = 1e150;
    return r;
  };
  const x0 = free.map((k) => toX(k, params[k].value));
  const clamp = (x: number[]) => x.map((v, j) => (isN(free[j]) ? Math.min(1, Math.max(0, v)) : Math.min(700, Math.max(-700, v))));
  const fit = free.length && idx.length * 2 > free.length ? levenbergMarquardt(res, x0, clamp, 500) : null;
  const x = fit?.p ?? x0;
  const p = values(x);
  const r = res(x);
  let chi2 = 0;
  for (const v of r) chi2 += v * v;
  const dof = Math.max(1, idx.length * 2 - free.length);
  const zs = idx.map((i) => circuitZ(tree, p, pts.w[i]));
  const r2of = (part: 0 | 1) => {
    const ys = idx.map((i) => (part ? pts.im[i] : pts.re[i]));
    const mean = ys.reduce((s, v) => s + v, 0) / (ys.length || 1);
    return { res: ys.reduce((s, v, j) => s + (v - zs[j][part]) ** 2, 0), tot: ys.reduce((s, v) => s + (v - mean) ** 2, 0) };
  };
  const [qr, qi] = [r2of(0), r2of(1)];
  const r2 = { all: 1 - (qr.res + qi.res) / (qr.tot + qi.tot || 1), re: qr.tot ? 1 - qr.res / qr.tot : NaN, im: qi.tot ? 1 - qi.res / qi.tot : NaN };
  return {
    elems,
    tree,
    params: params.map((q, k) => {
      const j = free.indexOf(k);
      const sx = j >= 0 && fit ? fit.sigma[j] : NaN;
      // (the error of the logarithm: relative — σ_p = p σ_ln p)
      const se = j < 0 ? NaN : isN(k) ? sx : p[q.name] * sx;
      return { name: q.name, value: p[q.name], se, unit: paramUnit(q.name), fixed: !!q.fixed };
    }),
    chi2,
    redChi2: chi2 / dof,
    r2,
    n: idx.length,
    fitted: !!fit,
  };
}

// the elements the fit has no use for: shorted (impedance → 0) or taken out (→ ∞), the circuit's impedance is the same
// at every point fitted (to 0.1 %) — a parameter run away (W1 Y0 → 10³⁰⁴); the circuit without it proposed. A CPE whose
// n went to 1 is a capacitor, to 0 a resistor.
export function fitWarnings(res: EisResult, pts: EisPoints, use: boolean[]): string[] {
  const p: Record<string, number> = Object.fromEntries(res.params.map((q) => [q.name, q.value]));
  const ws = pts.w.filter((_, i) => use[i]);
  const z0 = ws.map((w) => circuitZ(res.tree, p, w));
  const same = (t: EisTree) => ws.every((w, j) => {
    const z = circuitZ(t, p, w);
    return Math.hypot(z[0] - z0[j][0], z[1] - z0[j][1]) <= 1e-3 * Math.hypot(z0[j][0], z0[j][1]);
  });
  const out: string[] = [];
  const shown = (e: EisElem) => e.params.map((q) => `${q} = ${fmtNum(p[q], 3)}`).join(', ');
  for (const e of res.elems) {
    const found = (['short', 'open'] as const).find((as) => {
      const t = cutElem(res.tree, e.id, as);
      return typeof t === 'object' && same(t);
    });
    if (found) {
      const t = cutElem(res.tree, e.id, found) as EisTree;
      out.push(`${e.id} is not needed: its impedance → ${found === 'short' ? '0' : '∞'} over the spectrum (${shown(e)}); try ${writeCircuit(t, false)}.`);
      continue;
    }
    if (e.kind === 'Q') {
      const n = p[e.params[1]];
      if (n >= 0.995) out.push(`${e.id} n → 1 (${fmtNum(n, 4)}): ${e.id} is a capacitor — C would do.`);
      else if (n <= 0.005) out.push(`${e.id} n → 0 (${fmtNum(n, 4)}): ${e.id} is a resistor — R would do.`);
    }
  }
  return out;
}

// the impedance of the circuit over a frequency range (log spaced: `per` points a decade)
export function simulate(tree: EisTree, p: Record<string, number>, fMin: number, fMax: number, per = 20): { f: number[]; re: number[]; im: number[] } {
  const [a, b] = [Math.log10(fMin), Math.log10(fMax)];
  const n = Math.max(2, Math.round((b - a) * per) + 1);
  const out = { f: [] as number[], re: [] as number[], im: [] as number[] };
  for (let k = 0; k < n; k++) {
    const f = 10 ** (a + ((b - a) * k) / (n - 1));
    const z = circuitZ(tree, p, 2 * Math.PI * f);
    out.f.push(f);
    out.re.push(z[0]);
    out.im.push(z[1]);
  }
  return out;
}

// the points whose frequency is written: the one nearest every decade (decades), every one, or none
export function labelledPoints(f: number[], mode: EisData['labels']): number[] {
  if (mode === 'none') return [];
  if (mode === 'all') return f.map((_, i) => i);
  const out = new Set<number>();
  const dec = new Set(f.map((v) => Math.round(Math.log10(v))));
  for (const k of dec) {
    let best = -1;
    f.forEach((v, i) => {
      if (best < 0 || Math.abs(Math.log10(v) - k) < Math.abs(Math.log10(f[best]) - k)) best = i;
    });
    if (best >= 0 && Math.abs(Math.log10(f[best]) - k) < 0.15) out.add(best);
  }
  return [...out].sort((a, b) => a - b);
}
export const fmtFreq = (f: number) => (f >= 1e6 ? `${fmtNum(f / 1e6, 3)} MHz` : f >= 1e3 ? `${fmtNum(f / 1e3, 3)} kHz` : f >= 1 ? `${fmtNum(f, 3)} Hz` : f >= 1e-3 ? `${fmtNum(f * 1e3, 3)} mHz` : `${fmtNum(f, 3)} Hz`);

// ---- the node: the fit and its tables ----
export type EisOut = {
  pts: EisPoints;
  cols: { freq: Column; a: Column; b: Column };
  signNote: string;
  result: EisResult;
  curve: { f: number[]; re: number[]; im: number[] };
  fit: { re: number[]; im: number[] }; // at the measured frequencies
  parameters: Dataset;
  fitted: Dataset;
  ranges: Dataset; // the fits per range: a row per parameter
  rangeFits: EisRangeFit[];
  use: boolean[]; // the points in the fit as set now (in a range, not left out)
  inRange: boolean[];
  fittedYet: boolean; // (Start fit: false before the first one)
  outdated: boolean; // (Start fit: the settings changed since)
  summary: string[];
  warnings: string[];
};
export type EisRangeFit = { range: EisRangeSpec; circuit: string; result?: EisResult; curve?: { f: number[]; re: number[]; im: number[] }; error?: string };
// the points of a part of a spectrum
function subset(pts: EisPoints, keep: boolean[]): EisPoints {
  const on = (a: number[]) => a.filter((_, i) => keep[i]);
  return { f: on(pts.f), w: on(pts.w), re: on(pts.re), im: on(pts.im), rows: on(pts.rows) };
}
export function runEis(ds: Dataset, d0: EisData): EisOut | string {
  // the fit on demand: the settings of the last Start fit (none yet: the circuit with its starts, not fitted)
  const manual = d0.autoFit === false;
  const d: EisData = manual && d0.fitWith ? { ...d0, ...d0.fitWith } : d0;
  const only = manual && !d0.fitWith;
  const outdated = manual && !!d0.fitWith && JSON.stringify(fitSettingsOf(d0)) !== JSON.stringify(fitSettingsOf(d));
  const shown = eisPoints(ds, d0);
  if (typeof shown === 'string') return shown;
  const got = d === d0 ? shown : eisPoints(ds, d);
  if (typeof got === 'string') return got;
  const parsed = parseCircuit(d.circuit);
  if (typeof parsed === 'string') return parsed;
  const { pts } = got;
  const { tree, elems } = parsed;
  const params = startParams(elems, tree, d.params, pts);
  const ex = new Set(d.excluded);
  const inR = pts.f.map((f) => inRanges(f, d.ranges));
  const use = pts.rows.map((r, i) => !ex.has(r) && inR[i]);
  if (use.filter(Boolean).length < 2) return d.ranges?.length ? 'Fewer than 2 points in the ranges (and not left out).' : 'Fewer than 2 points left in the fit.';
  const result = fitCircuit(tree, elems, params, pts, use, d.weight, only);
  // each range on its own, with its circuit (the node's: its starts too; another: guessed from the range's points)
  const code = d.circuit.replace(/\s+/g, '');
  const rangeFits: EisRangeFit[] = d.rangeFits
    ? (d.ranges ?? []).map((range): EisRangeFit => {
        const circuit = range.circuit?.replace(/\s+/g, '') || code;
        const pc = parseCircuit(circuit);
        if (typeof pc === 'string') return { range, circuit, error: pc };
        const keep = pts.rows.map((r, i) => !ex.has(r) && inRanges(pts.f[i], [range]));
        if (keep.filter(Boolean).length < 2) return { range, circuit, error: 'fewer than 2 points in it' };
        const sub = subset(pts, keep);
        const res = fitCircuit(pc.tree, pc.elems, startParams(pc.elems, pc.tree, circuit === code ? d.params : [], sub), sub, sub.f.map(() => true), d.weight, only);
        const pr = Object.fromEntries(res.params.map((q) => [q.name, q.value]));
        return { range, circuit, result: res, curve: simulate(pc.tree, pr, Math.min(range.lo, range.hi), Math.max(range.lo, range.hi), 25) };
      })
    : [];
  const p: Record<string, number> = Object.fromEntries(result.params.map((q) => [q.name, q.value]));
  const fitAt = (at: EisPoints) => {
    const out = { re: [] as number[], im: [] as number[] };
    at.w.forEach((w) => {
      const z = circuitZ(tree, p, w);
      out.re.push(z[0]);
      out.im.push(z[1]);
    });
    return out;
  };
  const fit = fitAt(pts);
  const fMin = Math.min(...pts.f);
  const fMax = Math.max(...pts.f);
  const curve = simulate(tree, p, fMin, fMax, 25);
  const num = (name: string, v: number[]) => column(name, Float64Array.from(v));
  const txt = (name: string, v: string[]) => column(name, new Float64Array(v.length).fill(NaN), v);
  const r6 = (v: number) => (Number.isFinite(v) ? +v.toPrecision(6) : NaN);
  const parameters: Dataset = {
    name: 'circuit parameters',
    columns: [
      { ...txt('Parameter', result.params.map((q) => q.name)), role: 'label' },
      num('Value', result.params.map((q) => r6(q.value))),
      num('± (SE)', result.params.map((q) => r6(q.se))),
      num('Error (%)', result.params.map((q) => r6((100 * q.se) / Math.abs(q.value)))),
      txt('Unit', result.params.map((q) => q.unit)),
      txt('Fixed', result.params.map((q) => (q.fixed ? 'yes' : ''))),
    ],
  };
  const fitted: Dataset = {
    name: 'circuit fitted',
    columns: [
      { ...num('Frequency (Hz)', pts.f), role: 'x' },
      num("Z' (Ω)", pts.re),
      { ...num("-Z'' (Ω)", pts.im.map((v) => -v)), role: 'y' },
      num("Z' fit (Ω)", fit.re.map(r6)),
      num("-Z'' fit (Ω)", fit.im.map((v) => r6(-v))),
      num('|Z| (Ω)', pts.re.map((v, i) => Math.hypot(v, pts.im[i]))),
      num('|Z| fit (Ω)', fit.re.map((v, i) => r6(Math.hypot(v, fit.im[i])))),
      num('Phase (°)', pts.re.map((v, i) => (Math.atan2(pts.im[i], v) * 180) / Math.PI)),
      num('Phase fit (°)', fit.re.map((v, i) => r6((Math.atan2(fit.im[i], v) * 180) / Math.PI))),
      num("Residual Z' (Ω)", fit.re.map((v, i) => r6(pts.re[i] - v))),
      num("Residual Z'' (Ω)", fit.im.map((v, i) => r6(pts.im[i] - v))),
      txt('Used', use.map((u, i) => (u ? 'yes' : ex.has(pts.rows[i]) ? 'left out' : 'outside the ranges'))),
    ],
  };
  const { r2 } = result;
  const summary = [
    `${d.circuit.replace(/\s+/g, '')}: ${result.n} points fitted${ex.size ? ` (${pts.f.length - result.n} left out)` : ''}, weighted by ${d.weight}; χ² = ${fmtNum(result.chi2, 4)}, reduced χ² = ${fmtNum(result.redChi2, 4)}; R² = ${fmtNum(r2.all, 6)} (Z′ ${fmtNum(r2.re, 5)}, Z″ ${fmtNum(r2.im, 5)}).`,
    ...result.params.map((q) => `${q.name} = ${fmtNum(q.value, 5)}${Number.isFinite(q.se) ? ` ± ${fmtNum(q.se, 2)}` : q.fixed ? ' (fixed)' : ''}${q.unit ? ` ${q.unit}` : ''}`),
  ];
  // the statistics of the fit under the parameters (their names in the first column)
  const stats: [string, number][] = [
    ['χ²', result.chi2],
    ['reduced χ²', result.redChi2],
    ['R²', r2.all],
    ["R² Z'", r2.re],
    ["R² Z''", r2.im],
    ['points', result.n],
  ];
  const withStats = parameters.columns.map((c, k) => (k === 0 ? { ...txt(c.name, [...(c.text ?? []), ...stats.map((s) => s[0])]), role: c.role } : k === 1 ? num(c.name, [...c.values, ...stats.map((s) => r6(s[1]))]) : c.text ? txt(c.name, [...c.text, ...stats.map(() => '')]) : num(c.name, [...c.values, ...stats.map(() => NaN)])));
  const warnings = only ? [] : fitWarnings(result, pts, use);
  if (only) summary.unshift('Not fitted yet: Start fit fits the circuit (it is drawn with its starts).');
  if (outdated) warnings.push('The settings changed since the last fit: Start fit fits again.');
  for (const rf of rangeFits) {
    if (!rf.result) warnings.push(`Range ${rangeText(rf.range)} (${rf.circuit}): ${rf.error}.`);
    else summary.push(`Range ${rangeText(rf.range)}, ${rf.circuit}: ${rf.result.n} points, R² = ${fmtNum(rf.result.r2.all, 5)}; ${rf.result.params.map((q) => `${q.name} = ${fmtNum(q.value, 4)}${q.unit ? ` ${q.unit}` : ''}`).join(', ')}`);
  }
  const rows = rangeFits.flatMap((rf) => (rf.result ? rf.result.params.map((q) => ({ rf, q })) : []));
  const ranges: Dataset = {
    name: 'circuit fits per range',
    columns: [
      { ...txt('Range', rows.map(({ rf }) => rangeText(rf.range))), role: 'label' },
      txt('Circuit', rows.map(({ rf }) => rf.circuit)),
      txt('Parameter', rows.map(({ q }) => q.name)),
      num('Value', rows.map(({ q }) => r6(q.value))),
      num('± (SE)', rows.map(({ q }) => r6(q.se))),
      txt('Unit', rows.map(({ q }) => q.unit)),
      num('R²', rows.map(({ rf }) => r6(rf.result!.r2.all))),
    ],
  };
  // the points as set now (shown while the settings are being changed)
  const sEx = new Set(d0.excluded);
  const inRange = shown.pts.f.map((f) => inRanges(f, d0.ranges));
  const useNow = shown.pts.rows.map((r, i) => !sEx.has(r) && inRange[i]);
  return { pts: shown.pts, cols: shown.cols, signNote: shown.signNote, result, curve, fit: shown.pts === pts ? fit : fitAt(shown.pts), parameters: { ...parameters, columns: withStats }, fitted, ranges, rangeFits, use: useNow, inRange, fittedYet: !only, outdated, summary, warnings };
}
