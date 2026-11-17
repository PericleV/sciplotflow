// The audit of 2026-11-17, section Graph: the fixes of the Plot group checked (1D plot V1 – V6, Polar V15), each an input
// and the result expected
import { evaluateGraph } from '../src/engine/evaluate.ts';
import { IMPORT_DEFAULTS, PLOT1D_DEFAULTS } from '../src/defaults.ts';
import { AXIS_DEFAULTS, toPt, type AxisSpec, type Figure } from '../src/figure/spec.ts';
import { axesGeometry, axesRangeNotes, barFrom, makeScale, thetaStep } from '../src/figure/axes.ts';
import { drawnLimits } from '../src/figure/drawnLimits.ts';
import { trendFit } from '../src/engine/trend.ts';
import type { AppNode } from '../src/types.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkAuditGraphPlot(ok: Ok) {
  // a Plot of the columns x, y of a text, its figure
  const plot = (id: string, text: string, extra: object = {}): Figure => {
    const res = evaluateGraph(
      [
        { id: `${id}-i`, type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text, textId: id } } as AppNode,
        { id, type: 'plot1d', position: { x: 0, y: 0 }, data: { ...structuredClone(PLOT1D_DEFAULTS), cols: { x: 'x', y: 'y' }, ...extra } } as AppNode,
      ],
      [{ id: '1', source: `${id}-i`, sourceHandle: 'out', target: id, targetHandle: 'dataset' }],
    ).get(id)!;
    return res.outputs.figure?.t === 'figure' ? res.outputs.figure.v : (null as unknown as Figure);
  };
  const geometry = (fig: Figure) => {
    const ax = fig.axes[0];
    const [W, H] = [toPt(fig.width, fig.unit), toPt(fig.height, fig.unit)];
    const p = ax.style.pos;
    return axesGeometry(ax, { x: (p.x / 100) * W, y: (p.y / 100) * H, w: (p.w / 100) * W, h: (p.h / 100) * H }, ax.text ?? fig.text);
  };
  const lin = (o: Partial<AxisSpec> = {}): AxisSpec => ({ ...AXIS_DEFAULTS, ...o });

  // ---- V1: error bars on a reversed axis start off the point toward their end (were not drawn: only the caps) ----
  {
    // a Y axis 0 … 10 reversed (0 at the top), a point at 5 ± 1, the symbol's half 3 pt
    const sy = makeScale(lin({ reverse: true }), 0, 10, 200, 0);
    const py = sy.f(5);
    const [hi, lo] = [sy.f(6), sy.f(4)];
    const [a, b] = [barFrom(py, hi, 3), barFrom(py, lo, 3)];
    // X reversed: the + bar goes left
    const sx = makeScale(lin({ reverse: true, scale: 'log' }), 1, 100, 0, 300);
    const px = sx.f(10);
    const c = barFrom(px, sx.f(20), 3);
    ok(hi > py && a === py + 3 && lo < py && b === py - 3 && c === px - 3 && barFrom(py, py + 2, 3) === null && barFrom(100, 80, 3) === 97, `V1 1D plot, reversed axes: the ±Y bars start at ${a} / ${b} (point ${py}, ends ${hi} / ${lo}), the +X bar on a reversed log X at ${c?.toFixed(2)} (point ${px.toFixed(2)}); a bar shorter than the symbol not drawn`);
  }

  // ---- V2: on a log axis of 9 decades no tick (and number) past the frame's ends ----
  {
    const fig = plot('aud-v2', 'x;y\n1;0.001\n2;1\n3;1000000\n', { axes: { y: lin({ scale: 'log' }) } });
    const g = geometry(fig);
    const major = g.tl.major;
    ok(major.length > 0 && major.every((v) => v >= 1e-3 * (1 - 1e-9) && v <= 1e6 * (1 + 1e-9)) && g.tl.minor.every((v) => v >= 1e-3 * (1 - 1e-9)), `V2 1D plot, log Y 1e-3 … 1e6: majors ${major.map((v) => v.toExponential(0)).join(' ')} all inside (1e-4 was kept and its number drawn under the frame)`);
  }

  // ---- V3: masked points hidden do not stretch the axes; drawn grey, they do ----
  {
    const fig = plot('aud-v3', 'x;y\n1;1\n2;2\n3;1000\n4;3\n');
    const ax = fig.axes[0];
    const c = ax.curves[0];
    const masked = (how: 'hidden' | 'faded') => drawnLimits({ ...fig, axes: [{ ...ax, curves: [{ ...c, mask: Uint8Array.from([0, 0, 1, 0]), style: { ...c.style, masked: how } }] }] }, 'aud-v3').left;
    const [h, f] = [masked('hidden'), masked('faded')];
    ok(h.hi <= 3 + 1e-9 && f.hi >= 1000, `V3 1D plot, 1000 masked: Y up to ${h.hi} when hidden (was 1000), ${f.hi} when drawn grey`);
  }

  // ---- V5: Start above End drawn reversed and said; a limit not used is said ----
  {
    const t = 'x;y\n1;1\n2;2\n3;3\n';
    const sw = plot('aud-v5a', t, { axes: { x: lin({ min: 5, max: 1 }) } });
    const g = geometry(sw);
    const L = drawnLimits(sw, 'aud-v5a').bottom;
    const notes = axesRangeNotes(sw.axes[0]);
    const one = axesRangeNotes(plot('aud-v5b', t, { axes: { x: lin({ min: 10 }) } }).axes[0]);
    const logZero = axesRangeNotes(plot('aud-v5c', t, { axes: { y: lin({ min: 0, scale: 'log' }) } }).axes[0]);
    const empty = axesRangeNotes(plot('aud-v5d', t, { axes: { x: lin({ min: 20, max: 30 }) } }).axes[0]);
    const fine = axesRangeNotes(plot('aud-v5e', t, { axes: { x: lin({ min: 0, max: 4 }) } }).axes[0]);
    ok(L.lo === 1 && L.hi === 5 && g.sBottom.f(5) < g.sBottom.f(1) && notes.some((s) => s.includes('drawn reversed')) && one.some((s) => s.includes('Start 10')) && logZero.some((s) => s.includes('log axis')) && empty.some((s) => s.includes('no data')) && !fine.length, `V5 1D plot, Start 5 End 1: X ${L.lo} … ${L.hi} drawn reversed (was 1 … 3 silently), “${notes[0]}”; Start 10 alone, Start 0 on log, 20 … 30 past the data said; 0 … 4 not`);
  }

  // ---- V6: an exponential / power trend says the points it leaves out ----
  {
    const e = trendFit([1, 2, 3, 4, 5], [2, 4, -1, 16, 32], { kind: 'exp' });
    const p = trendFit([-1, 1, 2, 3], [1, 1, 4, 9], { kind: 'power' });
    const all = trendFit([1, 2, 3], [2, 4, 8], { kind: 'exp' });
    ok(typeof e !== 'string' && e.n === 4 && e.note === '1 point with y ≤ 0 left out of the exponential fit' && typeof p !== 'string' && p.n === 3 && !!p.note?.includes('x ≤ 0 or y ≤ 0') && typeof all !== 'string' && !all.note, `V6 Quick fit: exponential n ${typeof e === 'string' ? e : e.n} “${typeof e === 'string' ? '' : e.note}”, power “${typeof p === 'string' ? p : p.note}” (were said nowhere)`);
  }

  // ---- V15: a polar line goes the short way round across 0° ----
  {
    const steps = [thetaStep(340, 350), thetaStep(350, 10), thetaStep(10, 350), thetaStep(0, 180), thetaStep(350, 370), thetaStep(0, 720)];
    ok(JSON.stringify(steps) === JSON.stringify([10, 20, -20, 180, 20, 0]), `V15 Polar: θ steps ${steps.join(', ')} (350° → 10°: +20°, was −340°)`);
  }
}
