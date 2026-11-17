// The audit of 2026-11-17, section Signal: the fixes of SignalCurves checked (FFT spectrum G5, Normalize G15 – G16,
// Average curves G17, Interpolate G18, Convolution G19), each an input and the result expected
import { averageNode, convNode, fftNode, interpNode, normalizeNode, type SignalOut } from '../src/engine/signalnodes.ts';
import { AVERAGE_DEFAULTS, CONV_DEFAULTS, FFT_DEFAULTS, INTERP_DEFAULTS, NORMALIZE_DEFAULTS } from '../src/defaults.ts';
import { column, type Column, type Dataset } from '../src/engine/table.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkAuditSignalCurves(ok: Ok) {
  const ds = (cols: [string, number[], Column['role']][]): Dataset => ({ name: 'd', columns: cols.map(([n, v, role]) => ({ ...column(n, Float64Array.from(v)), role })) });
  const col = (o: SignalOut, name: string) => (typeof o === 'string' ? [] : Array.from(o.dataset.columns.find((c) => c.name === name)?.values ?? []));
  const warns = (o: SignalOut) => (typeof o === 'string' ? [o] : o.warnings);
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  const same = (a: number[], b: number[], tol = 1e-12) => a.length === b.length && a.every((v, i) => (Number.isNaN(b[i]) ? Number.isNaN(v) : near(v, b[i], tol)));

  // ---- G5: the FFT spectrum's power is A²/2 (Σ = the mean square); real / imaginary scaled as the amplitude ----
  {
    const N = 1000;
    const t = Array.from({ length: N }, (_, i) => i * 0.001);
    const y = t.map((v) => 2 * Math.sin(2 * Math.PI * 50 * v) + 0.3);
    const S = ds([['t (s)', t, 'x'], ['A (V)', y, 'y']]);
    const raw = { ...FFT_DEFAULTS, window: 'none' as const, detrend: 'none' as const };
    const pw = col(fftNode(S, { ...raw, output: 'power' }, () => 's'), 'A (V) power');
    const ms = y.reduce((a, b) => a + b * b, 0) / N;
    const sum = pw.reduce((a, b) => a + b, 0);
    const ri = fftNode(S, { ...raw, output: 'reim' }, () => 's');
    const [re, im] = [col(ri, 'A (V) real'), col(ri, 'A (V) imaginary')];
    const hann = fftNode(S, { ...FFT_DEFAULTS, output: 'reim' }, () => 's');
    const amp = col(fftNode(S, { ...FFT_DEFAULTS, output: 'amp' }, () => 's'), 'A (V) amplitude');
    const hm = Math.hypot(col(hann, 'A (V) real')[50], col(hann, 'A (V) imaginary')[50]);
    ok(near(pw[50], 2, 1e-9) && near(pw[0], 0.09, 1e-9) && near(sum, ms, 1e-9) && near(im[50], -2, 1e-9) && near(re[0], 0.3, 1e-9) && near(hm, amp[50], 1e-9), `FFT spectrum: a sine of 2 V (+ 0.3) — power 2 at its bin (was 4), DC 0.09, Σ power ${sum.toFixed(4)} = mean square ${ms.toFixed(4)}; imaginary −2 (was −1000), real DC 0.3; Hann: |re + i·im| = the amplitude (${hm.toFixed(4)})`);
  }

  // ---- G15: Normalize — a maximum ≤ 0 warned; a “by” column short or with a 0: NaN, counted ----
  {
    const neg = normalizeNode(ds([['x', [1, 2, 3], 'x'], ['A', [-1, -0.5, -0.1], 'y']]), NORMALIZE_DEFAULTS, undefined);
    const by = normalizeNode(ds([['x', [1, 2, 3, 4], 'x'], ['A', [2, 4, 6, 8], 'y']]), { ...NORMALIZE_DEFAULTS, method: 'column' }, [2, 0, 3]);
    ok(warns(neg).some((w) => w.includes('≤ 0') && w.includes('largest |value|')) && same(col(by, 'A (normalized)'), [1, NaN, 2, NaN]) && warns(by).some((w) => w.startsWith('A: 2 points without a finite, non-zero value of “by”')), `Normalize: maximum = 1 on [−1, −0.5, −0.1] warned (largest |value| named); by [2, 0, 3] on 4 rows → [1, NaN, 2, NaN] (was ∞ at the 0) and 2 points said`);
  }

  // ---- G16: Normalize “first point = 1” — the first row as measured, not the smallest X ----
  {
    const ft = normalizeNode(ds([['Wavenumber (cm⁻¹)', [2000, 1800, 1600, 400], 'x'], ['T', [1, 2, 4, 8], 'y']]), { ...NORMALIZE_DEFAULTS, method: 'first' }, undefined);
    const ftR = normalizeNode(ds([['Wavenumber (cm⁻¹)', [2000, 1800, 1600, 400], 'x'], ['T', [1, 2, 4, 8], 'y']]), { ...NORMALIZE_DEFAULTS, method: 'first', from: 500, to: 1900 }, undefined);
    ok(same(col(ft, 'T (normalized)'), [8, 4, 2, 1]) && same(col(ftR, 'T (normalized)'), [4, 2, 1, 0.5]), `Normalize: first point = 1 on an FTIR 2000 → 400 divides by the value at 2000 (${col(ft, 'T (normalized)').join(', ')}; was by the one at 400), within From – To the first row inside (1800)`);
  }

  // ---- G17: Average curves — a gap of one curve is not bridged nor counted ----
  {
    const a = ds([['x', [0, 1, 2, 3, 4], 'x'], ['A', [0, NaN, NaN, NaN, 4], 'y']]);
    const b = ds([['x', [0, 1, 2, 3, 4], 'x'], ['B', [10, 10, 10, 10, 10], 'y']]);
    const k1 = averageNode([a, b], { ...AVERAGE_DEFAULTS, need: 'k', k: 1 });
    const all = averageNode([a, b], AVERAGE_DEFAULTS);
    ok(same(col(k1, 'mean'), [5, 10, 10, 10, 7]) && same(col(k1, 'N'), [2, 1, 1, 1, 2]) && same(col(all, 'x'), [0, 4]), `Average curves: A = [0, NaN, NaN, NaN, 4], B = 10 — over the gap N 1 and the mean 10 (was N 2, 5.5 – 6.5); all needed: the gap left out (X ${col(all, 'x').join(', ')})`);
  }

  // ---- G18: Interpolate — the cells outside a curve's own data said, per curve ----
  {
    const ip = interpNode(ds([['x', [0, 1, 2, 3, 4], 'x'], ['A', [0, 1, 2, 3, 4], 'y'], ['x2', [0, 1, 2, NaN, NaN], 'x'], ['B', [0, 1, 2, NaN, NaN], 'y']]), { ...INTERP_DEFAULTS, method: 'linear', points: 5 }, undefined);
    const at = interpNode(ds([['x', [0, 1, 2], 'x'], ['A', [0, 1, 2], 'y']]), { ...INTERP_DEFAULTS, method: 'linear', grid: 'at' }, [1, 5, 6]);
    const w = warns(ip);
    ok(same(col(ip, 'B'), [0, 1, 2, NaN, NaN]) && w.length === 1 && w[0].startsWith('B: 2 points of the new X outside its data') && warns(at).some((q) => q.startsWith('A: 2 points of the new X outside its data')), `Interpolate: B on 0 – 2 with the grid to 4 → [0, 1, 2, NaN, NaN] said for B alone; “at” 5, 6 beyond the data said (were silent)`);
  }

  // ---- G19: Convolution — a NaN in the kernel of the port ----
  {
    const d = ds([['x', [0, 1, 2, 3, 4, 5, 6], 'x'], ['A (V)', [0, 0, 1, 0, 0, 0, 0], 'y']]);
    const cv = convNode(d, { ...CONV_DEFAULTS, shape: 'port', edge: 'zero' }, [0, 1, NaN, 0.5]);
    const tail = convNode(d, { ...CONV_DEFAULTS, shape: 'port', edge: 'zero' }, [0, 1, 0.5, NaN, NaN]);
    ok(same(col(cv, 'A (V) (convolved)'), [0, 0, 2 / 3, 0, 1 / 3, 0, 0]) && warns(cv).some((w) => w.includes('taken as 0')) && same(col(tail, 'A (V) (convolved)'), [0, 0, 2 / 3, 1 / 3, 0, 0, 0]) && !warns(tail).length, `Convolution: kernel [0, 1, NaN, 0.5] → the NaN taken as 0, said (was all NaN); NaN at its end (a shorter column) cut off silently`);
  }
}
