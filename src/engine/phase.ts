// Binary phase diagrams computed from a thermodynamic model, and the lever rule.
//
// Two components A and B, x the mole fraction of B. A solid solution and a liquid, each ideal (Ω = 0), regular or
// subregular (Redlich–Kister with two terms: Ω = Ω₀ + Ω₁ (1 − 2x), Ω₁ making it lean to one side):
//   G_S(x) = RT [x ln x + (1 − x) ln(1 − x)] + x (1 − x) Ω_S(x)
//   G_L(x) = (1 − x) ΔG_A(T) + x ΔG_B(T) + RT [x ln x + (1 − x) ln(1 − x)] + x (1 − x) Ω_L(x)
// with the pure solids as reference and ΔG_i(T) = ΔH_i (1 − T / Tm_i) (the heat capacities of solid and liquid equal).
// At a temperature the stable state of every composition is on the lower convex hull of the two curves: where the
// hull follows a curve, one phase; where it bridges a gap (a common tangent), two phases — the tie line, its ends the
// compositions of the two phases, the amounts by the lever rule. A large Ω_S opens a gap in the solid (α and β): with
// the liquid, a eutectic. Pure: no page.

export const R_GAS = 8.314462618;
// K, J/mol; omegaL1, omegaS1: the asymmetric terms (absent: 0)
export type PhaseModel = { tmA: number; tmB: number; hA: number; hB: number; omegaL: number; omegaS: number; omegaL1?: number; omegaS1?: number };
export type Phase = 'S' | 'L';

const xlnx = (x: number) => (x > 0 ? x * Math.log(x) : 0);
const mix = (x: number, T: number) => R_GAS * T * (xlnx(x) + xlnx(1 - x));
const dGA = (m: PhaseModel, T: number) => m.hA * (1 - T / m.tmA);
const dGB = (m: PhaseModel, T: number) => m.hB * (1 - T / m.tmB);
// the interaction parameters of a phase (Ω₀, Ω₁)
const om = (m: PhaseModel, p: Phase): [number, number] => (p === 'S' ? [m.omegaS, m.omegaS1 ?? 0] : [m.omegaL, m.omegaL1 ?? 0]);
export function gibbs(m: PhaseModel, p: Phase, x: number, T: number): number {
  const [o0, o1] = om(m, p);
  const ex = x * (1 - x) * (o0 + o1 * (1 - 2 * x));
  return p === 'S' ? mix(x, T) + ex : (1 - x) * dGA(m, T) + x * dGB(m, T) + mix(x, T) + ex;
}
// the first and second derivatives in x (inside 0 … 1)
function d1(m: PhaseModel, p: Phase, x: number, T: number): number {
  const [o0, o1] = om(m, p);
  const base = R_GAS * T * Math.log(x / (1 - x)) + (1 - 2 * x) * (o0 + o1 * (1 - 2 * x)) - 2 * o1 * x * (1 - x);
  return p === 'S' ? base : base - dGA(m, T) + dGB(m, T);
}
const d2 = (m: PhaseModel, p: Phase, x: number, T: number) => {
  const [o0, o1] = om(m, p);
  return (R_GAS * T) / (x * (1 - x)) - 2 * o0 - 6 * o1 * (1 - 2 * x);
};

// A piece of the equilibrium at a temperature: one phase from a to b, or a tie line from (a, pa) to (b, pb)
export type Seg = { a: number; b: number; pa: Phase; pb: Phase; tie: boolean };

// the common tangent of two points refined (Newton on the equal slopes and the line through both), from the grid's ends
function refineTie(m: PhaseModel, T: number, s: Seg, step: number): Seg {
  let [a, b] = [s.a, s.b];
  const lo = 1e-12;
  for (let it = 0; it < 40; it++) {
    const A = Math.min(1 - lo, Math.max(lo, a));
    const B = Math.min(1 - lo, Math.max(lo, b));
    const ga = gibbs(m, s.pa, A, T);
    const gb = gibbs(m, s.pb, B, T);
    const sa = d1(m, s.pa, A, T);
    const sb = d1(m, s.pb, B, T);
    const r1 = sa - sb;
    const r2 = sa * (B - A) - (gb - ga);
    const j11 = d2(m, s.pa, A, T);
    const j12 = -d2(m, s.pb, B, T);
    const j21 = d2(m, s.pa, A, T) * (B - A);
    const j22 = sa - sb;
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-300) break;
    const da = (r1 * j22 - j12 * r2) / det;
    const db = (j11 * r2 - j21 * r1) / det;
    a = A - da;
    b = B - db;
    if (Math.abs(da) < 1e-13 && Math.abs(db) < 1e-13) break;
  }
  // kept only when it stays by the grid's estimate (else the grid's ends)
  if (!(Math.abs(a - s.a) <= 2 * step && Math.abs(b - s.b) <= 2 * step && a < b)) return s;
  return { ...s, a, b };
}

// The equilibrium at T: the lower hull of the two curves on a grid of n steps (the tie lines refined), left to right
export function equilibrium(m: PhaseModel, T: number, n = 2000): Seg[] {
  const g = new Float64Array(n + 1);
  const ph: Phase[] = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    const s = gibbs(m, 'S', x, T);
    const l = gibbs(m, 'L', x, T);
    g[i] = Math.min(s, l);
    ph[i] = s <= l ? 'S' : 'L';
  }
  // the lower hull (monotone chain): a turn that is not to the left is dropped
  const h: number[] = [];
  for (let i = 0; i <= n; i++) {
    while (h.length >= 2) {
      const [o, a] = [h[h.length - 2], h[h.length - 1]];
      const cross = (a - o) * (g[i] - g[o]) - (g[a] - g[o]) * (i - o);
      if (cross <= 0) h.pop();
      else break;
    }
    h.push(i);
  }
  const segs: Seg[] = [];
  const step = 1 / n;
  for (let k = 0; k + 1 < h.length; k++) {
    const [ia, ib] = [h[k], h[k + 1]];
    if (ib - ia === 1 && ph[ia] === ph[ib]) {
      const last = segs[segs.length - 1];
      if (last && !last.tie && last.pa === ph[ia] && Math.abs(last.b - ia * step) < 1e-12) last.b = ib * step;
      else segs.push({ a: ia * step, b: ib * step, pa: ph[ia], pb: ph[ia], tie: false });
    } else {
      const t = refineTie(m, T, { a: ia * step, b: ib * step, pa: ph[ia], pb: ph[ib], tie: true }, step);
      // the single-phase pieces next to it end where it starts
      const last = segs[segs.length - 1];
      if (last && !last.tie) last.b = t.a;
      segs.push(t);
    }
  }
  // a single-phase piece starts where the tie line before it ends
  for (let k = 1; k < segs.length; k++) if (!segs[k].tie && segs[k - 1].tie) segs[k].a = segs[k - 1].b;
  return segs;
}

// ---- the names of the phases ----

// the solid's two ends named α and β (a gap in the solid reaching the liquid: a eutectic), or α₁ and α₂ below a gap
// that closes under the solidus (one solid α above it); without a gap, one solid α
export type Names = { L: string; a: string; b: string; a1: string; a2: string; one: string };
export const NAMES: Names = { L: 'L', a: 'α', b: 'β', a1: 'α₁', a2: 'α₂', one: 'α' };

// ---- the diagram ----

export type Row = { T: number; segs: Seg[] };
// labels: where its name is written — in every piece large enough (the widest row of the piece)
export type Region = { key: string; phases: string[]; polys: [number, number][][]; labels: [number, number][] };
export type Boundary = { key: 'liquidus' | 'solidus' | 'solvus'; pts: [number, number][] };
export type Invariant = { T: number; kind: 'eutectic' | 'peritectic' | 'invariant'; xs: [number, number, number]; phases: [string, string, string] };
export type Diagram = { rows: Row[]; regions: Region[]; boundaries: Boundary[]; invariants: Invariant[]; tMin: number; tMax: number; gap: 'none' | 'eutectic' | 'solid'; nameOf: (p: Phase, x: number, T: number) => string };

// a row's signature: its pieces in order, by their phases (a change between two rows: something appears or goes)
const sig = (segs: Seg[]) => segs.map((s) => (s.tie ? `${s.pa}${s.pb}` : s.pa)).join('|');

export function phaseDiagram(m: PhaseModel, opts: { tMin?: number; tMax?: number; rows?: number; names?: Partial<Names> } = {}): Diagram {
  const N: Names = { ...NAMES, ...opts.names };
  const hiTm = Math.max(m.tmA, m.tmB);
  const loTm = Math.min(m.tmA, m.tmB);
  const span = hiTm - loTm || hiTm * 0.2;
  const tMax = opts.tMax ?? hiTm + 0.12 * span + 10;
  // the lowest temperature: under where the liquid is gone, by a third of the range
  let tMin = opts.tMin;
  if (tMin === undefined) {
    let lowL = loTm;
    for (let T = loTm; T > 0.05 * loTm; T -= (loTm - 0.05 * loTm) / 120) {
      if (equilibrium(m, T, 400).some((s) => s.pa === 'L' || s.pb === 'L')) lowL = T;
      else break;
    }
    tMin = Math.max(1, lowL - 0.35 * (tMax - lowL));
  }
  const n = opts.rows ?? 260;
  const Ts = new Set<number>(Array.from({ length: n + 1 }, (_, k) => tMin! + ((tMax - tMin!) * k) / n));
  // rows next to the melting points and to every change (found by bisection): the regions meet there
  const at = (T: number) => equilibrium(m, T);
  const base = [...Ts].sort((a, b) => a - b).map((T) => ({ T, segs: at(T) }));
  const changes: number[] = [];
  for (let k = 0; k + 1 < base.length; k++) {
    if (sig(base[k].segs) === sig(base[k + 1].segs)) continue;
    let [lo, hi] = [base[k].T, base[k + 1].T];
    const s0 = sig(base[k].segs);
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      if (sig(at(mid)) === s0) lo = mid;
      else hi = mid;
    }
    changes.push((lo + hi) / 2);
  }
  const eps = (tMax - tMin) * 1e-6;
  for (const c of [...changes, m.tmA, m.tmB]) for (const d of [-eps, eps]) if (c + d > tMin && c + d < tMax) Ts.add(c + d);
  const rows: Row[] = [...Ts].sort((a, b) => a - b).map((T) => base.find((r) => r.T === T) ?? { T, segs: at(T) });

  // the gap of the solid: a tie of two solids at some temperature; with the liquid next to it (a eutectic) or under
  // the solidus only
  const ssRows = rows.filter((r) => r.segs.some((s) => s.tie && s.pa === 'S' && s.pb === 'S'));
  const gapTop = ssRows.length ? ssRows[ssRows.length - 1].T : -Infinity;
  // the solids on either side of the gap: split at the middle of its tie line at the top of the gap
  const topTie = ssRows.length ? ssRows[ssRows.length - 1].segs.find((s) => s.tie && s.pa === 'S' && s.pb === 'S')! : null;
  const split = topTie ? (topTie.a + topTie.b) / 2 : 0.5;
  const liquidAt = (r: Row) => r.segs.some((s) => s.pa === 'L' || s.pb === 'L');
  const gap: Diagram['gap'] = !ssRows.length ? 'none' : rows.some((r) => r.T > gapTop && r.T < gapTop + 3 * (tMax - tMin) / n && liquidAt(r)) ? 'eutectic' : 'solid';
  const nameOf = (p: Phase, x: number, T: number): string => {
    if (p === 'L') return N.L;
    if (gap === 'none') return N.one;
    if (gap === 'eutectic') return x < split ? N.a : N.b;
    return T > gapTop + eps * 2 ? N.one : x < split ? N.a1 : N.a2;
  };

  // the regions: the span of every set of phases in every row, stacked into polygons
  const order = [N.L, N.a, N.a1, N.one, N.a2, N.b];
  const keyOf = (ps: string[]) => [...new Set(ps)].sort((p, q) => order.indexOf(p) - order.indexOf(q)).join(' + ');
  type Open = { pts: { T: number; a: number; b: number }[]; done: boolean };
  const open = new Map<string, Open[]>();
  for (const r of rows) {
    // the spans of the row; a set of phases met twice (α + L on both sides of a minimum) kept apart: key#k
    const here = new Map<string, { a: number; b: number }>();
    const seen = new Map<string, number>();
    for (const s of r.segs) {
      const ps = s.tie ? [nameOf(s.pa, s.a, r.T), nameOf(s.pb, s.b, r.T)] : [nameOf(s.pa, (s.a + s.b) / 2, r.T)];
      const base = keyOf(ps);
      const prev = here.get(`${base}#${seen.get(base) ?? 0}`);
      // the next piece of the same phases right after this one (a single phase cut by the grid) joins it
      if (prev && Math.abs(prev.b - s.a) < 1e-9) {
        prev.b = s.b;
        continue;
      }
      const k = prev ? (seen.get(base) ?? 0) + 1 : (seen.get(base) ?? 0);
      seen.set(base, k);
      here.set(`${base}#${k}`, { a: s.a, b: s.b });
    }
    for (const [key, list] of open) {
      const cur = list[list.length - 1];
      if (!cur.done && !here.has(key)) cur.done = true;
    }
    for (const [key, sp] of here) {
      const list = open.get(key) ?? [];
      const cur = list[list.length - 1];
      if (cur && !cur.done) cur.pts.push({ T: r.T, ...sp });
      else list.push({ pts: [{ T: r.T, ...sp }], done: false });
      open.set(key, list);
    }
  }
  const regions: Region[] = [];
  for (const [kk, list] of open) {
    const key = kk.replace(/#\d+$/, '');
    const polys = list.filter((o) => o.pts.length >= 2).map((o) => [...o.pts.map((p): [number, number] => [p.a, p.T]), ...[...o.pts].reverse().map((p): [number, number] => [p.b, p.T])]);
    if (!polys.length) continue;
    // its labels: the middle of the widest row of every piece of at least 1 % of the diagram
    const labels: [number, number][] = [];
    for (const o of list.filter((q) => q.pts.length >= 2)) {
      let area = 0;
      for (let i = 1; i < o.pts.length; i++) area += ((o.pts[i].b - o.pts[i].a + o.pts[i - 1].b - o.pts[i - 1].a) / 2) * (o.pts[i].T - o.pts[i - 1].T);
      if (area < 0.01 * (tMax - tMin)) continue;
      const inner = o.pts.slice(Math.floor(o.pts.length * 0.15), Math.ceil(o.pts.length * 0.85));
      const wide = (inner.length ? inner : o.pts).reduce((w, p) => (p.b - p.a > w.b - w.a ? p : w));
      labels.push([(wide.a + wide.b) / 2, wide.T]);
    }
    regions.push({ key, phases: key.split(' + '), polys, labels });
  }

  // the boundaries: the ends of the tie lines, by kind and side
  const curves = new Map<string, { key: Boundary['key']; pts: [number, number][] }>();
  const addPt = (id: string, key: Boundary['key'], x: number, T: number) => {
    const c = curves.get(id) ?? { key, pts: [] };
    c.pts.push([x, T]);
    curves.set(id, c);
  };
  for (const r of rows)
    for (const s of r.segs) {
      if (!s.tie) continue;
      if (s.pa === 'S' && s.pb === 'S') {
        // the two ends of the gap in the solid
        addPt('solvus-a', 'solvus', s.a, r.T);
        addPt('solvus-b', 'solvus', s.b, r.T);
      } else {
        const [xs, xl] = s.pa === 'S' ? [s.a, s.b] : [s.b, s.a];
        // the side of the solid (left of the liquid: A's side)
        const sd = xs < xl ? 'A' : 'B';
        addPt(`solidus-${sd}`, 'solidus', xs, r.T);
        addPt(`liquidus-${sd}`, 'liquidus', xl, r.T);
      }
    }
  // the melting points close the liquidus and solidus at the edges
  for (const [id, c] of curves) {
    if (c.key === 'solvus') continue;
    const sd = id.endsWith('A') ? 'A' : 'B';
    const tm = sd === 'A' ? m.tmA : m.tmB;
    if (tm >= tMin && tm <= tMax) c.pts.push([sd === 'A' ? 0 : 1, tm]);
  }
  // every curve in the order of the temperature, cut where it jumps (two branches of one kind apart)
  const rowStep = (tMax - tMin) / n;
  const boundaries: Boundary[] = [];
  for (const c of curves.values()) {
    const pts = c.pts.sort((p, q) => p[1] - q[1]);
    let cur: [number, number][] = [];
    for (const p of pts) {
      const last = cur[cur.length - 1];
      if (last && (Math.abs(p[0] - last[0]) > 0.08 || p[1] - last[1] > 3 * rowStep)) {
        if (cur.length >= 2) boundaries.push({ key: c.key, pts: cur });
        cur = [];
      }
      cur.push(p);
    }
    if (cur.length >= 2) boundaries.push({ key: c.key, pts: cur });
  }

  // the invariants: a change between rows where three phases meet (two tie lines above, one below, or the reverse)
  const invariants: Invariant[] = [];
  for (const T of changes) {
    const up = at(T + eps).filter((s) => s.tie);
    const dn = at(T - eps).filter((s) => s.tie);
    // the tie lines by their two phases: those found on one side only changed
    const key = (s: Seg) => `${nameOf(s.pa, s.a, T)}/${nameOf(s.pb, s.b, T)}`;
    const dnK = new Set(dn.map(key));
    const upK = new Set(up.map(key));
    const changed = [...up.filter((s) => !dnK.has(key(s))), ...dn.filter((s) => !upK.has(key(s)))];
    const ends = changed.flatMap((s) => [
      { x: s.a, p: nameOf(s.pa, s.a, T) },
      { x: s.b, p: nameOf(s.pb, s.b, T) },
    ]);
    const names = [...new Set(ends.map((e) => e.p))];
    if (names.length < 3) continue;
    // the three compositions: the lowest, the highest, and the one between
    const sorted = ends.sort((p, q) => p.x - q.x);
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    const mid = sorted.find((e) => e.p !== lo.p && e.p !== hi.p) ?? sorted[1];
    // inside the diagram only (two melting points at the same temperature are not a reaction)
    if (Math.min(lo.x, mid.x, hi.x) < 1e-4 || Math.max(lo.x, mid.x, hi.x) > 1 - 1e-4) continue;
    const kind: Invariant['kind'] = mid.p === N.L ? 'eutectic' : lo.p === N.L || hi.p === N.L ? 'peritectic' : 'invariant';
    invariants.push({ T, kind, xs: [lo.x, mid.x, hi.x], phases: [lo.p, mid.p, hi.p] });
  }
  return { rows, regions, boundaries, invariants, tMin, tMax, gap, nameOf };
}

// ---- the lever rule ----

export type Lever = { T: number; x: number; phases: { name: string; x: number; f: number }[] };
// The phases at a composition x and a temperature: one phase (all of it), or two at the ends of the tie line and their
// amounts (the lever rule: f_α = (x_β − x) / (x_β − x_α))
export function lever(m: PhaseModel, x: number, T: number, nameOf: Diagram['nameOf']): Lever {
  const segs = equilibrium(m, T);
  const s = segs.find((q) => x >= q.a - 1e-12 && x <= q.b + 1e-12) ?? segs[segs.length - 1];
  if (!s.tie) return { T, x, phases: [{ name: nameOf(s.pa, x, T), x, f: 1 }] };
  const fb = (x - s.a) / (s.b - s.a);
  return {
    T,
    x,
    phases: [
      { name: nameOf(s.pa, s.a, T), x: s.a, f: 1 - fb },
      { name: nameOf(s.pb, s.b, T), x: s.b, f: fb },
    ],
  };
}

// ---- cooling an alloy ----

export type Cooling = { T: number[]; frac: Record<string, number[]>; comp: Record<string, number[]>; liquidus?: number; solidus?: number; atInvariant?: { T: number; above: Lever; below: Lever } };
// The phases of an alloy x from tHi down to tLo (every `step`), at equilibrium: the amount and the composition of each;
// the liquidus (the first solid) and the solidus (the last liquid), by bisection; what is there just above and just
// below an invariant it crosses (the primary phase and the eutectic)
export function cooling(m: PhaseModel, x: number, d: Diagram, tHi: number, tLo: number, steps = 300): Cooling {
  const names = [...new Set(d.regions.flatMap((r) => r.phases))];
  const out: Cooling = { T: [], frac: Object.fromEntries(names.map((p) => [p, []])), comp: Object.fromEntries(names.map((p) => [p, []])) };
  for (let k = 0; k <= steps; k++) {
    const T = tHi - ((tHi - tLo) * k) / steps;
    const lv = lever(m, x, T, d.nameOf);
    out.T.push(T);
    for (const p of names) {
      const e = lv.phases.find((q) => q.name === p);
      out.frac[p].push(e ? e.f : 0);
      out.comp[p].push(e ? e.x : NaN);
    }
  }
  const liquid = (T: number) => lever(m, x, T, d.nameOf).phases;
  const L = d.nameOf('L', 0.5, tHi);
  const onlyL = (T: number) => {
    const ps = liquid(T);
    return ps.length === 1 && ps[0].name === L;
  };
  const anyL = (T: number) => liquid(T).some((p) => p.name === L && p.f > 1e-9);
  const bisect = (f: (T: number) => boolean, hiOk: boolean): number | undefined => {
    let [lo, hi] = [tLo, tHi];
    if (f(hi) !== hiOk || f(lo) === hiOk) return undefined;
    for (let it = 0; it < 60; it++) {
      const mid = (lo + hi) / 2;
      if (f(mid) === hiOk) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  out.liquidus = bisect(onlyL, true);
  out.solidus = bisect(anyL, true);
  const inv = d.invariants.find((v) => x > Math.min(...v.xs) && x < Math.max(...v.xs) && v.T < tHi && v.T > tLo);
  if (inv) {
    const e = (tHi - tLo) * 1e-6;
    out.atInvariant = { T: inv.T, above: lever(m, x, inv.T + e, d.nameOf), below: lever(m, x, inv.T - e, d.nameOf) };
  }
  return out;
}
