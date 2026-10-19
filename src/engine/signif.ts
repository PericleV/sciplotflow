// Significance brackets: a bracket over two
// groups of a Bar chart or a Box & violin with the stars or the p of their comparison. The p: tested here from the values
// of the groups — Welch's or Student's t, Mann–Whitney (adjusted by Holm or Bonferroni), or all the groups of a scope
// together by Tukey, Games–Howell or Dunn —, read from a post hoc table (the ANOVA / Nonparametric nodes' “pair” and
// “p (adjusted)”, or two columns of names and a p), or written (“A vs B = 0.003”). The pairs: all, against the first
// (a control), neighbours, or a list; between the groups (for each subgroup) or between the subgroups (in each group).
// Stars: * < 0.05, ** < 0.01, *** < 0.001, **** < 0.0001. Placed one above the other where they would
// cross, above the highest thing they span. Pure.
import * as H from './hypo.ts';
import { column, type Dataset } from './table.ts';
import { curveStyle, type Curve } from '../figure/spec.ts';
import { maxOf } from './minmax.ts';

export type SigSpec = {
  on: boolean;
  source: 'test' | 'table' | 'typed';
  test: 'welch' | 'student' | 'mw' | 'tukey' | 'gameshowell' | 'dunn';
  adjust: 'none' | 'holm' | 'bonferroni';
  pairs: 'all' | 'control' | 'adjacent' | 'list';
  list: string; // “A vs B; A vs C” (or 1-3), typed p: “A vs B = 0.003”
  among: 'groups' | 'subgroups';
  show: 'stars' | 'p' | 'both';
  ns: boolean; // the pairs that do not differ drawn too (“ns”)
  alpha: number;
  color: string;
  width: number; // pt
  textSize: number; // pt, NaN: the page's
};
export const SIG_DEFAULTS: SigSpec = { on: false, source: 'test', test: 'welch', adjust: 'holm', pairs: 'all', list: '', among: 'groups', show: 'stars', ns: false, alpha: 0.05, color: '#000000', width: 0.75, textSize: NaN };

// a group as drawn: its name, its category and subgroup, its place across, the top of what is drawn of it, its values
export type SigElement = { name: string; cat: string; series: string; pos: number; top: number; values?: number[] };
export type Bracket = { a: number; b: number; p: number; text: string };

export const stars = (p: number) => (p < 1e-4 ? '****' : p < 1e-3 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns');
const pText = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${+p.toPrecision(2)}`);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// “A vs B”, “A - B”, “A − B”, “1-3”: the two elements (by name, by category, or by their number from 1)
function pairOf(text: string, els: SigElement[]): [number, number] | null {
  const parts = text.split(/\s+vs\.?\s+|\s+[−–-]\s+|(?<=^\d+)\s*-\s*(?=\d+$)/i).map((s) => s.trim());
  if (parts.length !== 2) return null;
  const find = (s: string) => {
    if (/^\d+$/.test(s) && +s >= 1 && +s <= els.length) return +s - 1;
    const k = els.findIndex((e) => norm(e.name) === norm(s));
    if (k >= 0) return k;
    const byCat = els.map((e, i) => (norm(e.cat) === norm(s) ? i : -1)).filter((i) => i >= 0);
    return byCat.length === 1 ? byCat[0] : -1;
  };
  const [a, b] = parts.map(find);
  return a >= 0 && b >= 0 && a !== b ? [a, b] : null;
}

// the scopes compared within: every subgroup across the groups, or every group across its subgroups
function scopes(els: SigElement[], among: SigSpec['among']): number[][] {
  const key = (e: SigElement) => (among === 'groups' ? e.series : e.cat);
  const keys = [...new Set(els.map(key))];
  return keys.map((k) => els.flatMap((e, i) => (key(e) === k ? [i] : [])));
}

export function significance(els: SigElement[], d: SigSpec, table?: Dataset): { brackets: Bracket[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: Bracket[] = [];
  const add = (a: number, b: number, p: number) => {
    if (!Number.isFinite(p)) return;
    if (p >= d.alpha && !d.ns) return;
    const s = stars(p);
    out.push({ a, b, p, text: d.show === 'stars' ? s : d.show === 'p' ? pText(p) : s === 'ns' ? `ns (${pText(p)})` : `${s} (${pText(p)})` });
  };
  // the pairs wanted, in a scope (indices into els)
  const wanted = (scope: number[]): [number, number][] => {
    if (d.pairs === 'control') return scope.slice(1).map((j) => [scope[0], j]);
    if (d.pairs === 'adjacent') return scope.slice(1).map((j, k) => [scope[k], j]);
    if (d.pairs === 'list') {
      const listed = d.list.split(/[;\n]/).map((s) => s.split('=')[0]).filter((s) => s.trim()).map((s) => pairOf(s, els));
      return listed.flatMap((p) => (p && scope.includes(p[0]) && scope.includes(p[1]) ? [p] : []));
    }
    return scope.flatMap((i, k) => scope.slice(k + 1).map((j): [number, number] => [i, j]));
  };
  if (d.source === 'typed') {
    for (const line of d.list.split(/[;\n]/).filter((s) => s.trim())) {
      const [pair, pv] = line.split('=');
      const p = pairOf(pair ?? '', els);
      const v = Number((pv ?? '').trim().replace(',', '.'));
      if (!p || !Number.isFinite(v)) warnings.push(`Significance: “${line.trim()}” is not “A vs B = p”.`);
      else add(p[0], p[1], v);
    }
    return { brackets: out, warnings };
  }
  if (d.source === 'table') {
    if (!table) return { brackets: [], warnings: ['Significance: connect a table of p values (e.g. the post hoc of an ANOVA node) to the p values port.'] };
    const cols = table.columns;
    const pCol = cols.find((c) => /^p \(adj/i.test(c.name)) ?? cols.find((c) => /^p\b/i.test(c.name.trim()));
    const pairCol = cols.find((c) => /^pair$/i.test(c.name));
    const texts = cols.filter((c) => c.text?.some((t) => t?.trim()));
    if (!pCol) return { brackets: [], warnings: ['Significance: the table has no p column (“p”, “p (adjusted)”).'] };
    let missed = 0;
    for (let i = 0; i < pCol.values.length; i++) {
      const name = pairCol ? (pairCol.text?.[i] ?? '') : texts.length >= 2 ? `${texts[0].text?.[i] ?? ''} vs ${texts[1].text?.[i] ?? ''}` : '';
      const p = pairOf(name, els);
      if (!p) missed++;
      else add(p[0], p[1], pCol.values[i]);
    }
    if (missed) warnings.push(`Significance: ${missed} row(s) of the table name no pair of these groups.`);
    return { brackets: out, warnings };
  }
  // tested here, in every scope
  for (const scope of scopes(els, d.among)) {
    if (scope.length < 2) continue;
    const groups = scope.map((i) => (els[i].values ?? []).filter(Number.isFinite));
    if (groups.some((g) => g.length < 2)) {
      warnings.push('Significance: a group has fewer than 2 values (or only a mean: test with raw values, or give the p values).');
      continue;
    }
    const pairs = wanted(scope);
    if (d.test === 'tukey' || d.test === 'gameshowell' || d.test === 'dunn') {
      const all =
        d.test === 'dunn'
          ? H.dunn(groups, d.adjust)
          : (() => {
              const ow = H.oneWay(groups);
              return H.postHoc(groups, d.test === 'tukey' ? 'tukey' : 'games-howell', ow.mse, ow.df2);
            })();
      for (const [a, b] of pairs) {
        const q = all.find((x) => (scope[x.a] === a && scope[x.b] === b) || (scope[x.a] === b && scope[x.b] === a));
        if (q) add(a, b, q.p);
      }
    } else {
      const ps = pairs.map(([a, b]) => {
        const [x, y] = [groups[scope.indexOf(a)], groups[scope.indexOf(b)]];
        return d.test === 'mw' ? H.mannWhitney(x, y).p : H.tTwo(x, y, d.test === 'student').p;
      });
      const adj = H.adjust(ps, d.adjust);
      pairs.forEach(([a, b], k) => add(a, b, adj[k]));
    }
  }
  return { brackets: out, warnings };
}

// The brackets as curves: each a line up from both groups and across (its ends down by a tip), its text above its
// middle; placed one above the other where their spans meet, above the highest top they span. unit: the step, in the
// values' units (about 6 % of their range).
export function bracketCurves(brackets: Bracket[], els: SigElement[], d: SigSpec, horizontal: boolean, unit: number): Curve[] {
  const placed: { lo: number; hi: number; top: number }[] = [];
  const order = brackets.map((b, k) => ({ b, k, lo: Math.min(els[b.a].pos, els[b.b].pos), hi: Math.max(els[b.a].pos, els[b.b].pos) })).sort((p, q) => p.hi - p.lo - (q.hi - q.lo) || p.lo - q.lo);
  const curves: Curve[] = [];
  for (const { b, k, lo, hi } of order) {
    const under = Math.max(maxOf(els.filter((e) => e.pos >= lo - 1e-9 && e.pos <= hi + 1e-9).map((e) => e.top)), maxOf(placed.filter((p) => p.hi >= lo - 1e-9 && p.lo <= hi + 1e-9).map((p) => p.top)));
    const y = under + unit;
    const tip = 0.4 * unit;
    placed.push({ lo, hi, top: y + 1.3 * unit });
    const [xa, xb] = [els[b.a].pos, els[b.b].pos];
    const xs = [xa, xa, xb, xb];
    const ys = [y - tip, y, y, y - tip];
    const line = (u: number[], v: number[]) => ({ name: 'bracket', x: column('x', Float64Array.from(horizontal ? v : u)), y: column('y', Float64Array.from(horizontal ? u : v)) });
    curves.push({ key: `sig:${k}`, label: b.text, noLegend: true, series: line(xs, ys), style: curveStyle({ mode: 'line', color: d.color, lineWidth: d.width }) });
    // the text: at the middle, above (beside a horizontal chart's bracket); a second, empty point keeps room for it
    const mid = (xa + xb) / 2;
    curves.push({
      key: `sig:${k}:text`,
      label: b.text,
      noLegend: true,
      series: line([mid, mid], [y, y + 1.1 * unit]),
      style: curveStyle({ mode: 'line', color: d.color, lineWidth: 0, lineOpacity: 0, labels: 'column', labelPos: horizontal ? 'right' : 'above', labelText: { color: d.color, ...(Number.isFinite(d.textSize) && d.textSize > 0 ? { size: d.textSize } : {}) } }),
      labelValues: column('text', new Float64Array([NaN, NaN]), [b.text, '']),
    });
  }
  return curves;
}

// the comparisons as a table: the pair, p, the text drawn
export const bracketTable = (brackets: Bracket[], els: SigElement[]): Dataset => ({
  name: 'significance',
  columns: [
    { ...column('pair', Float64Array.from(brackets, () => NaN), brackets.map((b) => `${els[b.a].name} vs ${els[b.b].name}`)), role: 'label' },
    { ...column('p', Float64Array.from(brackets, (b) => b.p)), role: 'none' },
    { ...column('shown', Float64Array.from(brackets, () => NaN), brackets.map((b) => b.text)), role: 'label' },
  ],
});
