// The audit of 2026-11-17, section Signal: the fixes of SignalFrac checked (G6–G9 of docs/AUDIT-2026-11-17.md: the
// Fractional FFT's X for every Y and its fast transform, the semi-integral's units, Weyl's derivative on data that are
// not periodic; the orders beyond ±4 and the units of the results)
import { fracFast, fracFastC, frft } from '../src/engine/frac.ts';
import { fracNode, frftNode } from '../src/engine/fracnodes.ts';
import { FRAC_DEFAULTS, FRFT_DEFAULTS } from '../src/defaults.ts';
import { column, type Column } from '../src/engine/table.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkAuditSignalFrac(ok: Ok) {
  const col = (name: string, v: number[], role: 'x' | 'y'): Column => ({ ...column(name, Float64Array.from(v)), role });
  const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
    let m = 0;
    for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m;
  };

  // ---- G6: two Y, each on its own X (X Y X Y; B 100 points over 5–7 s): B's filtered curve under its own X ----
  {
    const tA = Array.from({ length: 128 }, (_, k) => k * 0.01);
    const tB = Array.from({ length: 100 }, (_, k) => 5 + (2 * k) / 99);
    const pad = new Array<number>(28).fill(NaN);
    const ds = {
      name: 'g6',
      columns: [col('tA (s)', tA, 'x'), col('A', tA.map((t) => Math.exp(-((t - 0.6) ** 2) / 0.02)), 'y'), col('tB (s)', [...tB, ...pad], 'x'), col('B', [...tB.map((t) => Math.exp(-((t - 6) ** 2) / 0.05)), ...pad], 'y')],
    };
    const r = frftNode(ds, { ...FRFT_DEFAULTS, ys: 'A, B', mode: 'filter', auto: false, order: 1, width: 3 });
    const cols = 'tables' in r ? r.tables.out.columns : [];
    const xs = cols.filter((c) => c.role === 'x');
    const iB = cols.findIndex((c) => c.name === 'B (filtered)');
    const xB = cols.slice(0, iB).reverse().find((c) => c.role === 'x');
    ok(xs.length === 2 && !!xB && xB.values.length === 100 && xB.values[0] === 5 && Math.abs(xB.values[99] - 7) < 1e-12 && cols[iB].values.length === 100, `Fractional FFT, two Y on their own X: every one under its X (${cols.map((c) => `${c.name} [${c.values.length}]`).join(', ')})`);
  }

  // ---- G7: the fast transform — its DFT steps centred as its core, so every order goes back; checked on the data ----
  {
    const N = 256;
    const t = Array.from({ length: N }, (_, k) => k / (N - 1));
    const pulse = t.map((v) => Math.exp(-((v - 0.5) ** 2) / (2 * 0.05 ** 2)));
    const zero = t.map(() => 0);
    // (forward and back by the orders outside 0.5 … 1.5: fracF as published is off by some %; the centred one exact)
    const back = (f: typeof fracFast, a: number) => maxDiff(f(...f(pulse, zero, a), -a)[0], pulse);
    const pub = Math.max(back(fracFast, 0.1), back(fracFast, 1.6));
    const cen = Math.max(...[0.1, 0.3, 0.7, 1.6, 1.9, 2.5, 3.3].map((a) => back(fracFastC, a)));
    const [a1] = fracFastC(...fracFastC(pulse, zero, 0.3), 0.4);
    const [a2] = fracFastC(pulse, zero, 0.7);
    // (the filter with a band that holds nothing gives the data back, at 0.1 and 1.6: before, 0.034 and 0.062 off)
    const ds = { name: 'g7', columns: [col('Time (s)', t, 'x'), col('Signal', pulse, 'y')] };
    const filt = (y: number[], a: number, method: 'fast' | 'discrete' = 'fast', band = [120, 127]) => {
      const r = frftNode({ ...ds, columns: [ds.columns[0], col('Signal', y, 'y')] }, { ...FRFT_DEFAULTS, x: 'Time (s)', ys: 'Signal', mode: 'filter', auto: false, order: a, u1: band[0], u2: band[1], method });
      return 'tables' in r ? { y: r.tables.out.columns.find((c) => c.name === 'Signal (filtered)')!.values, report: r.report.join(' ') } : { y: new Float64Array(N).fill(NaN), report: '' };
    };
    const still = Math.max(maxDiff(filt(pulse, 0.1).y, pulse), maxDiff(filt(pulse, 1.6).y, pulse));
    // (1 + sin does not fall to 0: with a band of nothing it comes back as it was (0.42 off before); its peak taken out,
    // the fast transform is off by some % on it, so the filter takes the discrete one)
    const ones = t.map((v) => 1 + Math.sin(2 * Math.PI * 5 * v));
    const kept = maxDiff(filt(ones, 0.6, 'fast', [500, 600]).y, ones);
    const f1 = filt(ones, 0.6, 'fast', [NaN, NaN]);
    const fd = filt(ones, 0.6, 'discrete', [NaN, NaN]);
    const same = maxDiff(f1.y, fd.y);
    ok(pub > 0.01 && cen < 1e-12 && maxDiff(a1, a2) < 1e-12 && still < 1e-12 && kept < 1e-12 && same < 1e-12 && /the discrete one was taken/.test(f1.report), `Fractional FFT, fast: forward and back at 0.1 … 3.3 within ${cen.toExponential(1)} (fracF as published ${pub.toFixed(3)}), 0.3 + 0.4 = 0.7; a band of nothing gives the data back within ${Math.max(still, kept).toExponential(1)} (also 1 + sin); 1 + sin's peak taken out by the discrete transform (${same.toExponential(1)} apart)`);
    // (the discrete basis: its eigenvectors still orthonormal, by the sparse construction)
    const n = 64;
    const re = Array.from({ length: n }, (_, k) => Math.sin(k / 3));
    const im = Array.from({ length: n }, (_, k) => Math.cos(k / 5));
    const [br, bi] = frft(...frft(re, im, 0.43), -0.43);
    ok(Math.max(maxDiff(br, re), maxDiff(bi, im)) < 1e-12, 'discrete fractional Fourier transform: back by −a after the faster basis');
  }

  // ---- G8: the semi-integral's units from the names: Cottrell with X in ms and Y in µA (the unit chosen: A) ----
  {
    const [F, A, c, D] = [96485.33212, 0.0707, 1e-6, 9.72e-6];
    const ts = Array.from({ length: 2000 }, (_, k) => 0.001 + k * 0.001);
    const i = ts.map((t) => F * A * c * Math.sqrt(D / (Math.PI * t)));
    const Dof = (xn: string, sx: number, yn: string, sy: number, unit: 'A' | 'µA') => {
      const ds = { name: 'g8', columns: [col(xn, ts.map((v) => v * sx), 'x'), col(yn, i.map((v) => v * sy), 'y')] };
      const r = fracNode(ds, { ...FRAC_DEFAULTS, x: xn, ys: yn, orders: '-0.5', semi: true, unit });
      return 'report' in r ? { D: Number(/D = \(m_L \/ nFAc\)² = ([\d.e+-]+)/.exec(r.report.join(' '))?.[1]), names: r.tables.out.columns.map((q) => q.name), report: r.report.join(' ') } : { D: NaN, names: [], report: '' };
    };
    const si = Dof('Time (s)', 1, 'Current (A)', 1, 'A');
    const ms = Dof('Time (ms)', 1e3, 'Current (µA)', 1e6, 'A');
    const none = Dof('Time', 1, 'Current', 1e6, 'µA');
    ok(Math.abs(si.D / D - 1) < 0.05 && Math.abs(ms.D / si.D - 1) < 1e-9 && Math.abs(none.D / si.D - 1) < 1e-9 && ms.names.includes('D^-0.5 Current (µA·ms^½)') && /µA·ms\^½ = [\d.e+-]+ A·s\^½/.test(ms.report) && /unit chosen, A, not used/.test(ms.report) && /X taken in seconds/.test(none.report), `semi-integral: D ${ms.D} cm²/s with X in ms and Y in µA (before 9.45e+9), as in s and A (${si.D}); the result named ${ms.names[1]}`);
  }

  // ---- G9: Weyl's derivative on data that are not periodic: said; on periodic data not ----
  {
    const warnsOf = (x: number[], y: number[], order: string) => {
      const r = fracNode({ name: 'g9', columns: [col('Time (s)', x, 'x'), col('Signal', y, 'y')] }, { ...FRAC_DEFAULTS, x: 'Time (s)', ys: 'Signal', orders: order, method: 'fourier' });
      return 'warnings' in r ? r.warnings.join(' ') : 'none';
    };
    const t = Array.from({ length: 201 }, (_, k) => k / 200);
    const tp = Array.from({ length: 256 }, (_, k) => (2 * Math.PI * k) / 256);
    const sq = warnsOf(t, t.map(Math.sqrt), '0.5');
    const t2 = warnsOf(t, t.map((v) => v * v), '1');
    const arch = warnsOf(t, t.map((v) => v * (1 - v)), '1');
    const sinW = warnsOf(tp, tp.map((v) => Math.sin(3 * v) + 0.5 * Math.cos(v)), '0.5');
    const noisy = warnsOf(tp, tp.map((v, k) => Math.sin(7 * v) + 0.03 * Math.sin(k * 12.9898)), '0.5');
    ok(/not periodic|one period/.test(sq) && /one period/.test(t2) && /slopes at the ends differ/.test(arch) && !sinW && !noisy, `Weyl's derivative: √t, t² and t(1 − t) said not periodic; a periodic signal (also with noise) not (${[sinW, noisy].filter(Boolean).join(' ') || 'none'})`);
  }

  // ---- the orders beyond ±4 said; the results' units, Y's times the time's to −α ----
  {
    const t = Array.from({ length: 50 }, (_, k) => k / 49);
    const r = fracNode({ name: 'o', columns: [col('Time (s)', t, 'x'), col('Signal (V)', t, 'y')] }, { ...FRAC_DEFAULTS, x: 'Time (s)', ys: 'Signal (V)', orders: '0.5, 5, −1' });
    const names = 'tables' in r ? r.tables.out.columns.map((c) => c.name) : [];
    ok('warnings' in r && r.warnings.some((w) => /order 5 left out/.test(w)) && names.join() === 'Time (s),D^0.5 Signal (V/s^½),D^-1 Signal (V·s)', `Fractional calculus: the order 5 said left out; the results ${names.join(', ')}`);
  }
}
