// The audit of 2026-11-17, section Graph: the fixes of the Surf group checked (V17–V20 of docs/AUDIT-2026-11-17.md: a
// grid with holes kept a grid, the masks of a matrix, a log Z's values ≤ 0 and its Z min, 3D bars on a log Z; and of
// priority 2: 3D bars below 0, a matrix's X twice, more than 500 levels)
import { evaluateGraph } from '../src/engine/evaluate.ts';
import { asGrid, contourPlot, gridFromMatrix, gridOfPoints } from '../src/engine/contour.ts';
import { logScene } from '../src/engine/plot3d.ts';
import { CONTOUR_DEFAULTS, IMPORT_DEFAULTS, PLOT3D_DEFAULTS } from '../src/defaults.ts';
import { column } from '../src/engine/table.ts';
import type { AppNode } from '../src/types.ts';
import type { Curve, Figure } from '../src/figure/spec.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkAuditGraphSurf(ok: Ok) {
  const imp = (text: string) => ({ id: 'i', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: `s${text.length}` } }) as AppNode;
  const node = (id: string, type: string, data: object) => ({ id, type, position: { x: 0, y: 0 }, data }) as AppNode;
  const edge = (s: string, t: string, th = 'dataset') => ({ id: s + t, source: s, sourceHandle: 'out', target: t, targetHandle: th });
  const curveOf = (f: unknown, has: (c: Curve) => unknown) => (f as Figure | undefined)?.axes[0]?.curves.find(has);

  // ---- V17: a 10 × 10 grid with a 4 × 4 hole (Z empty, or masked) stays a grid, the hole empty and said ----
  {
    const n = 100;
    const hole = (k: number) => k % 10 >= 3 && k % 10 < 7 && Math.floor(k / 10) >= 3 && Math.floor(k / 10) < 7;
    const X = column('x', Float64Array.from({ length: n }, (_, k) => k % 10));
    const Y = column('y', Float64Array.from({ length: n }, (_, k) => Math.floor(k / 10)));
    const Z = column('z', Float64Array.from({ length: n }, (_, k) => (hole(k) ? NaN : k)));
    const Zm = { ...column('z', Float64Array.from({ length: n }, (_, k) => k)), mask: Uint8Array.from({ length: n }, (_, k) => (hole(k) ? 1 : 0)) };
    const a = gridOfPoints(X, Y, Z, 100);
    const b = gridOfPoints(X, Y, Zm, 100);
    const holes = (r: typeof a) => (typeof r === 'string' ? -1 : Array.from(r.g.z).filter(Number.isNaN).length);
    const kept = (r: typeof a) => typeof r !== 'string' && r.g.xs.length === 10 && r.g.ys.length === 10 && !r.note && !!r.g.note?.includes('16 cells') && r.g.z[0] === 0 && r.g.z[99] === 99;
    // (scattered points stay scattered, interpolated; their Z missing left out)
    const sx = Array.from({ length: 60 }, (_, k) => Math.sin(k * 12.9898) * 10);
    const sy = Array.from({ length: 60 }, (_, k) => Math.cos(k * 78.233) * 10);
    const sc = gridOfPoints(column('x', Float64Array.from(sx)), column('y', Float64Array.from(sy)), column('z', Float64Array.from(sx.map((v, k) => (k % 7 ? v : NaN)))), 50);
    const cp = typeof a === 'string' ? a : contourPlot(a.g, CONTOUR_DEFAULTS, { x: 'x', y: 'y', z: 'z' });
    ok(kept(a) && kept(b) && holes(a) === 16 && holes(b) === 16 && typeof sc !== 'string' && sc.g.xs.length === 50 && !!sc.note?.startsWith('Scattered') && asGrid([0, 1, 0, 1], [0, 0, 1, 1], [1, NaN, NaN, 4])?.note?.includes('2 cells') === true && typeof cp !== 'string' && cp.warnings.some((w) => w.includes('16 cells')), `Contour / 3D, V17: a grid with a 4 × 4 hole (Z empty or masked) stays 10 × 10, 16 cells empty and said (${holes(a)}, ${holes(b)} empty); scattered points still interpolated`);
  }

  // ---- V18: a matrix (a Y column, Z columns) with a masked row: its cells left out of the map and its range ----
  {
    const text = 'Y;R 10 nm;R 20 nm;R 30 nm\n1;1;2;3\n2;4;500;6\n3;7;8;9\n';
    const nodes = [imp(text), node('d', 'datamanip', { x: 'Y', y: 'R 20 nm', ops: [{ kind: 'mask', rows: '2', n: 3 }] }), node('c', 'contour', { ...CONTOUR_DEFAULTS, layout: 'matrix' }), node('p', 'plot3d', { ...PLOT3D_DEFAULTS, layout: 'matrix', kind: 'bars' })];
    const res = evaluateGraph(nodes, [edge('i', 'd', 'in'), edge('d', 'c'), edge('d', 'p')]);
    const c = res.get('c')!;
    const p = res.get('p')!;
    const bars = curveOf(p.view.figure, (q) => q.three)?.three?.bars.items ?? [];
    // (a mask on one Z column alone: its cell)
    const one = gridFromMatrix(column('Y', Float64Array.from([1, 2])), [{ ...column('10 nm', Float64Array.from([1, 500])), mask: Uint8Array.from([0, 1]) }, column('20 nm', Float64Array.from([2, 3]))]);
    ok(c.view.contour?.range.join() === '1,9' && c.warnings.some((w) => w.includes('3 masked cells')) && curveOf(p.view.figure, (q) => q.three)?.colorRange?.join() === '1,9' && bars.length === 6 && !bars.some((b) => b.z1 === 500) && typeof one !== 'string' && Number.isNaN(one.z[2]) && one.z[3] === 3 && !!one.note?.includes('1 masked cell'), `Contour / 3D, V18: a matrix's masked cells left out (Contour range ${c.view.contour?.range.join('–')}, 3D ${bars.length} bars)`);
  }

  // ---- V19: a log Z: the values ≤ 0 drawn empty (not in the lowest colour); a Z min ≤ 0 typed ignored, said ----
  {
    const g = { xs: [0, 1, 2], ys: [0, 1, 2], z: Float64Array.from([-1, 0, 3, 4, 5, 6, 7, 8, 9]) };
    const a = contourPlot(g, { ...CONTOUR_DEFAULTS, log: true }, { x: 'x', y: 'y', z: 'z' });
    const b = contourPlot(g, { ...CONTOUR_DEFAULTS, log: true, zMin: 0, draw: 'filled' }, { x: 'x', y: 'y', z: 'z' });
    const map = (r: typeof a) => (typeof r === 'string' ? undefined : r.curves.find((q) => q.grid)?.grid);
    const ma = map(a);
    const mb = map(b);
    ok(!!ma && !!mb && Number.isNaN(ma.z[0]) && Number.isNaN(ma.z[1]) && ma.z[2] === 3 && Number.isNaN(mb.z[0]) && typeof a !== 'string' && typeof b !== 'string' && a.range.join() === '3,9' && b.range.join() === '3,9' && b.levels.every((v) => v > 0) && a.warnings.some((w) => w.includes('2 values ≤ 0')) && b.warnings.some((w) => w.includes('Z min typed (0)')) && a.gridSet.columns[2].values[0] === -1, `Contour, V19: log Z — −1 and 0 drawn empty, the range 3–9 also with Z min 0 typed (said), the levels above 0; the outputs keep them`);
  }

  // ---- V20: 3D bars on a log Z: a bar of 0 left out (said), none drawn to the page's corner; bars below 0 from 0 ----
  {
    const rows = ['x;y;z'];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) rows.push(`${i};${j};${(i + j) % 3 === 0 ? 0 : i + j}`);
    const p = evaluateGraph([imp(rows.join('\n')), node('p', 'plot3d', { ...PLOT3D_DEFAULTS, kind: 'bars', axis3: { z: { scale: 'log' } } })], [edge('i', 'p')]).get('p')!;
    const items = curveOf(p.view.figure, (q) => q.three)?.three?.bars.items ?? [];
    const fin = items.every((b) => [b.x, b.y, b.dx, b.dy, b.z0, b.z1].every(Number.isFinite));
    const S = { range: { x: [0, 1], y: [0, 1], z: [0, 10] }, surfaces: [], bars: { items: [{ x: 0.5, y: 0.5, z0: 0, z1: 0, dx: 0.2, dy: 0.2, color: '#000' }, { x: 0.5, y: 0.5, z0: 0, z1: 10, dx: 0.2, dy: 0.2, color: '#000' }], edge: '', edgeWidth: 0, opacity: 1 }, lines: [], points: [] } as unknown as Parameters<typeof logScene>[0];
    logScene(S, [false, false, true]);
    const neg = rows.map((l, k) => (k ? l.replace(/;([^;]*)$/, (_, z: string) => `;${-Number(z) - 1}`) : l));
    const pn = evaluateGraph([imp(neg.join('\n')), node('p', 'plot3d', { ...PLOT3D_DEFAULTS, kind: 'bars' })], [edge('i', 'p')]).get('p')!;
    const nb = curveOf(pn.view.figure, (q) => q.three)?.three;
    ok(items.length === 23 && fin && p.warnings.some((w) => w.includes('12 bars')) && S.bars.items.length === 1 && S.bars.items[0].z1 === 1 && !!nb && nb.bars.items.every((b) => b.z0 === 0 && b.z1 < 0) && nb.range.z[1] === 0, `3D, V20: bars on a log Z — the 12 of 0 left out and said (${items.length} drawn, all at numbers); bars below 0 hang from 0 (range ${nb?.range.z.join('…')})`);
  }

  // ---- priority 2: a matrix's Z columns at the same X refused; more than 500 levels said ----
  {
    const dup = evaluateGraph([imp('Y;R 10 nm;R 10.0 nm;R 30 nm\n1;1;2;3\n2;4;5;6\n'), node('c', 'contour', { ...CONTOUR_DEFAULTS, layout: 'matrix' })], [edge('i', 'c')]).get('c')!;
    const many = contourPlot({ xs: [0, 1], ys: [0, 1], z: Float64Array.from([0, 100, 5, 50]) }, { ...CONTOUR_DEFAULTS, levels: 'step', step: 0.01 }, { x: 'x', y: 'y', z: 'z' });
    ok(!!dup.errors?.[0]?.includes('the same X') && typeof many !== 'string' && many.levels.length < 500 && many.warnings.some((w) => w.includes('more than 500 levels')), 'Contour: Z columns at the same X refused (as a matrix input); a step giving more than 500 levels said');
  }
}
