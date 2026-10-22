// Pick points: values read off a curve by rules — at X = …, at Y = …, the maximum, the minimum, the rows where a
// condition holds. The place found is a fractional row: every column can be read there. A curve that goes and comes
// back is cut first (Split into columns ▸ where X changes direction); here every crossing of a value counts.
import { pointsCurve } from './calculus.ts';
import { compile } from './expr.ts';
import { fmtNum } from './table.ts';

export type PickKind = 'x' | 'y' | 'max' | 'min' | 'where';
// x / y: the values (“0.5”, “0.2, 0.5”, “0:0.1:0.8”); max / min: between `from` and `to` on X (NaN: no limit);
// where: a condition of x, y, i, n and the columns A, B, C …
export type PickRule = { kind: PickKind; value: string; from?: number; to?: number; which?: 'all' | 'first' | 'last' };
export type PickOptions = { interp: 'linear' | 'spline' | 'nearest'; outside: 'empty' | 'extrapolate' | 'end' };
export type PickGraph = {
  xName: string;
  yName: string;
  curves: { name: string; x: Float64Array | number[]; y: Float64Array | number[] }[];
  points: { x: number; y: number; rule: string; at: number; kind: PickKind }[];
};
// A point picked: between rows a and b (b = a: on a row) at t (0 … 1, beyond when extrapolated); its x and y; at: the
// value the rule asked for (at X = 0.5: 0.5; NaN for the others); kind: the rule's kind
export type Picked = { rule: string; a: number; b: number; t: number; x: number; y: number; at: number; kind?: PickKind };

// “0.5”, “0.2, 0.5”, “0:0.1:0.8” (start:step:end) → the values; a message when it cannot be read.
export function pickValues(s: string): number[] | string {
  const out: number[] = [];
  for (const part of s.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(-?[\d.eE+-]+)\s*:\s*(-?[\d.eE+-]+)\s*:\s*(-?[\d.eE+-]+)$/.exec(part);
    if (m) {
      const [a, st, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (!Number.isFinite(a) || !Number.isFinite(b) || !(st !== 0) || (b - a) / st < 0) return `“${part}”: start:step:end, the step towards the end.`;
      const n = Math.floor((b - a) / st + 1e-9);
      if (n > 10000) return `“${part}”: more than 10000 values.`;
      for (let k = 0; k <= n; k++) out.push(+(a + k * st).toPrecision(12));
    } else {
      const v = Number(part.replace(',', '.'));
      if (!Number.isFinite(v)) return `“${part}” is not a number.`;
      out.push(v);
    }
  }
  return out.length ? out : 'Write the values (e.g. 0.5, or 0.2, 0.5, or 0:0.1:0.8).';
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// points with the same x joined (their mean), in the order of x, for a spline
function dedupe(p: { x: number; y: number }[]) {
  const s = [...p].filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y)).sort((a, b) => a.x - b.x);
  const out: { x: number; y: number }[] = [];
  for (const q of s) {
    const last = out[out.length - 1];
    if (last && q.x === last.x) last.y = (last.y + q.y) / 2;
    else out.push({ ...q });
  }
  return out;
}

// Every point the rules pick on one curve (x, y: its columns; rows: its rows, in the order measured; cols: the columns
// a condition can name, by letter).
export function pickPoints(x: ArrayLike<number>, y: ArrayLike<number>, rows: number[], rules: PickRule[], o: PickOptions, cols: Record<string, ArrayLike<number>> = {}): { points: Picked[]; errors: string[] } {
  const points: Picked[] = [];
  const errors: string[] = [];
  let asked = NaN;
  let curKind: PickKind = 'x';
  const at = (rule: string, a: number, b: number, t: number, xv?: number, yv?: number, kind?: PickKind) => points.push({ rule, a, b, t, x: xv ?? lerp(x[a], x[b], t), y: yv ?? lerp(y[a], y[b], t), at: asked, kind: kind ?? curKind });
  const byX = [...rows].sort((p, q) => x[p] - x[q]);
  rules.forEach((r, k) => {
    asked = NaN;
    curKind = r.kind;
    if (r.kind === 'x' || r.kind === 'y') {
      const vals = pickValues(r.value);
      if (typeof vals === 'string') return errors.push(`Rule ${k + 1}: ${vals}`);
      const by = r.kind === 'x' ? x : y;
      const spline = r.kind === 'x' && o.interp === 'spline' ? pointsCurve(dedupe(rows.map((i) => ({ x: x[i], y: y[i] }))), 'spline') : null;
      for (const v of vals) {
        asked = v;
        const name = `${r.kind} = ${fmtNum(v, 6)}`;
        const hits: { a: number; b: number; t: number; xv?: number; yv?: number }[] = [];
        // every crossing of the value, in the order measured (a value met exactly on a row: counted once)
        for (let j = 0; j + 1 < rows.length; j++) {
          const [p, q] = [by[rows[j]], by[rows[j + 1]]];
          if (!((p - v) * (q - v) <= 0) || p === q || (q === v && j + 2 < rows.length)) continue;
          const t = (v - p) / (q - p);
          const [a, b] = [rows[j], rows[j + 1]];
          if (r.kind === 'x' && o.interp === 'nearest') hits.push({ a: t < 0.5 ? a : b, b: t < 0.5 ? a : b, t: 0 });
          else if (spline) {
            const yv = spline(v);
            hits.push({ a, b, t, xv: v, yv: Number.isFinite(yv) ? yv : undefined });
          } else hits.push({ a, b, t, xv: r.kind === 'x' ? v : undefined, yv: r.kind === 'y' ? v : undefined });

        }
        const chosen = r.which === 'first' ? hits.slice(0, 1) : r.which === 'last' ? hits.slice(-1) : hits;
        for (const h of chosen) at(name, h.a, h.b, h.t, h.xv, h.yv);
        const found = chosen.length > 0;
        if (found || r.kind === 'y' || o.outside === 'empty' || byX.length < 2) continue;
        // beyond the curve: its end value, or the line through its last two points (in X)
        const low = v < x[byX[0]];
        const [e0, e1] = low ? [byX[0], byX[1]] : [byX[byX.length - 1], byX[byX.length - 2]];
        if (o.outside === 'end') at(name, e0, e0, 0);
        else if (x[e1] !== x[e0]) at(name, e0, e1, (v - x[e0]) / (x[e1] - x[e0]), v);
      }
    } else if (r.kind === 'max' || r.kind === 'min') {
      const [lo, hi] = [Number.isFinite(r.from) ? r.from! : -Infinity, Number.isFinite(r.to) ? r.to! : Infinity];
      const range = Number.isFinite(r.from) || Number.isFinite(r.to) ? ` (${Number.isFinite(r.from) ? fmtNum(r.from!, 5) : '…'} – ${Number.isFinite(r.to) ? fmtNum(r.to!, 5) : '…'})` : '';
      const name = `${r.kind}${range}`;
      const sign = r.kind === 'max' ? 1 : -1;
      let pos = -1;
      rows.forEach((i, j) => {
        if (x[i] >= Math.min(lo, hi) && x[i] <= Math.max(lo, hi) && Number.isFinite(y[i]) && (pos < 0 || sign * y[i] > sign * y[rows[pos]])) pos = j;
      });
      if (pos < 0) return;
      const best = rows[pos];
      // the top of a parabola through the point and its two neighbours (in the order measured)
      const [pa, pb] = [rows[pos - 1], rows[pos + 1]];
      if (o.interp !== 'nearest' && pa !== undefined && pb !== undefined) {
        const [x0, x1, x2, y0, y1, y2] = [x[pa], x[best], x[pb], y[pa], y[best], y[pb]];
        const den = (x0 - x1) * (x0 - x2) * (x1 - x2);
        const A = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / den;
        const B = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / den;
        const C = (x1 * x2 * (x1 - x2) * y0 + x2 * x0 * (x2 - x0) * y1 + x0 * x1 * (x0 - x1) * y2) / den;
        const xv = -B / (2 * A);
        if (A * sign < 0 && xv >= Math.min(x0, x2) && xv <= Math.max(x0, x2)) {
          const nb = (xv - x1) * (x2 - x1) >= 0 ? pb : pa;
          at(name, best, nb, (xv - x1) / (x[nb] - x1), xv, A * xv * xv + B * xv + C);
          return;
        }
      }
      at(name, best, best, 0);
    } else {
      const f = compile(r.value);
      if (typeof f === 'string') return errors.push(`Rule ${k + 1}: ${f}`);
      const unknown = f.names.filter((nm) => !['x', 'y', 'i', 'n'].includes(nm) && !(nm in cols));
      if (unknown.length) return errors.push(`Rule ${k + 1}: unknown ${unknown.join(', ')} (x, y, i, n and the columns A, B, C …).`);
      const name = `where ${r.value.trim()}`;
      const v: Record<string, number> = {};
      for (const i of rows) {
        v.x = x[i];
        v.y = y[i];
        v.i = i + 1;
        v.n = rows.length;
        for (const c in cols) v[c] = cols[c][i];
        if (f.fn(v) > 0) at(name, i, i, 0);
      }
    }
  });
  return { points, errors };
}
