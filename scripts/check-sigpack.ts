// The checks of the signal package (Baseline correction, Waveform measurements, Step detection, Event averaging,
// Wavelet, Fractional calculus, Fractional FFT, Lomb–Scargle, Harmonics) against pybaselines, ruptures, pycwt,
// PyWavelets, SciPy and differint (scripts/fixtures/sigpack-ref.py → sigpack-ref.json), and properties where there is
// no reference.
import { readFileSync } from 'node:fs';
import { baselineOf } from '../src/engine/baselines.ts';
import { binseg, pelt, stateLevels, waveform, averageAround, crossingsOf, harmonics, lombScargle, lsFap, lsFrequencies, lsLevel } from '../src/engine/signal2.ts';
import { cwt, cwtSignificance, coherence, denoise, mother, mra, peaksCwt } from '../src/engine/wavelet2.ts';
import { fracDerivative, fracFast, fracGL, frft } from '../src/engine/frac.ts';
import { fracNode, frftNode } from '../src/engine/fracnodes.ts';
import { FRAC_DEFAULTS, FRFT_DEFAULTS } from '../src/defaults.ts';
import { column } from '../src/engine/table.ts';
import { lgamma } from '../src/engine/dist.ts';
import { designSos, notchSos, sosResponse } from '../src/engine/spectral.ts';
import { hampel } from '../src/engine/signal2.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkSigpack(ok: Ok) {
  const R = JSON.parse(readFileSync(new URL('./fixtures/sigpack-ref.json', import.meta.url), 'utf8'));
  const relMax = (a: ArrayLike<number>, b: ArrayLike<number>) => {
    let m = 0;
    let s = 0;
    for (let i = 0; i < b.length; i++) s = Math.max(s, Math.abs(b[i]));
    for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m / (s || 1);
  };
  const flat = (a: number[][]) => a.flat();

  // ---- arPLS as pybaselines ----
  {
    const A = R.arpls;
    const x = Array.from({ length: A.y.length }, (_, i) => (100 * i) / (A.y.length - 1));
    const e6 = relMax(baselineOf('arpls', x, A.y, { lambda: 6 }), A.b6);
    const e4 = relMax(baselineOf('arpls', x, A.y, { lambda: 4 }), A.b4);
    ok(e6 < 1e-6 && e4 < 1e-6, `arPLS as pybaselines: λ 10⁶ within ${e6.toExponential(1)}, 10⁴ within ${e4.toExponential(1)}`);
  }

  // ---- change points as ruptures (its breakpoints: the ends of the segments, the last n) ----
  {
    const S = R.steps;
    const bk = (cps: number[], n: number) => [...cps, n].join(',');
    const p = bk(pelt(S.y, 'mean', 20, 5), S.y.length);
    const b = bk(binseg(S.y, 'mean', 20, 5), S.y.length);
    const b4 = bk(binseg(S.y, 'mean', 0, 5, 4), S.y.length);
    const nv = bk(pelt(S.y2, 'meanvar', 3 * Math.log(S.y2.length), 5), S.y2.length);
    ok(p === S.pelt.join(',') && b === S.binseg.join(',') && b4 === S.binseg4.join(',') && nv === S.normal.join(','), `change points as ruptures: PELT ${p} (${S.pelt.join(',')}); Binseg ${b} (${S.binseg.join(',')}); 4 changes ${b4}; mean and variance ${nv} (${S.normal.join(',')})`);
  }

  // ---- the continuous transform, its significance, the coherence as pycwt ----
  {
    const C = R.cwt;
    const m = C.x.reduce((a: number, v: number) => a + v, 0) / C.x.length;
    const z = C.x.map((v: number) => v - m);
    const errs = (['morlet', 'paul', 'dog'] as const).map((k) => {
      const c = cwt(z, C.dt, 1 / 8, NaN, NaN, mother(k));
      const pw = c.re.filter((_, j) => j % 7 === 0).map((r, jj) => Array.from(r, (v, t) => v * v + c.im[jj * 7][t] ** 2).filter((_, t) => t % 17 === 0));
      return Math.max(relMax(c.scales, C[k].scales), relMax(flat(pw), flat(C[k].power)), relMax(c.coi.filter((_, t) => t % 17 === 0), C[k].coi));
    });
    const mo = mother('morlet');
    const c = cwt(z, C.dt, 1 / 8, NaN, NaN, mo);
    const v = z.reduce((a: number, q: number) => a + q * q, 0) / z.length;
    const s0 = relMax(cwtSignificance(v, C.dt, c.scales, 0, C.alpha, 0.95, mo, z.length), C.sig0);
    const co = coherence(C.x, C.y, C.dt, 1 / 8, NaN, NaN);
    const ew = relMax(flat(co.wct.filter((_, j) => j % 7 === 0).map((r) => r.filter((_, t) => t % 17 === 0))), flat(C.wct));
    const ep = relMax(flat(co.phase.filter((_, j) => j % 7 === 0).map((r) => r.filter((_, t) => t % 17 === 0))), flat(C.phase));
    ok(Math.max(...errs) < 1e-9 && s0 < 1e-9 && ew < 1e-9 && ep < 1e-9, `wavelet transform as pycwt: Morlet, Paul, DOG within ${errs.map((e) => e.toExponential(1)).join(', ')}; significance ${s0.toExponential(1)}; coherence ${ew.toExponential(1)}, phase ${ep.toExponential(1)}`);
  }

  // ---- the multiresolution analysis as PyWavelets ----
  {
    const M = R.mra;
    const errs = ['db4', 'sym6', 'coif2', 'haar'].map((w) => {
      const r = mra(M.x, w === 'haar' ? 'db1' : w, 4);
      // (PyWavelets: the smooth first, then the details from the coarsest)
      const ours = [r.S, ...[...r.D].reverse()];
      return Math.max(...ours.map((c, k) => relMax(c, M[w][k])));
    });
    ok(Math.max(...errs) < 1e-9, `multiresolution analysis as PyWavelets: db4, sym6, coif2, Haar within ${errs.map((e) => e.toExponential(1)).join(', ')}`);
  }

  // ---- denoising ----
  {
    const D = R.denoise;
    const bad: string[] = [];
    for (const w of ['db4', 'sym8'])
      for (const r of ['universal', 'sure', 'bayes'] as const)
        for (const m of ['soft', 'hard'] as const)
          for (const p of [false, true]) {
            const [ry, rt] = D[`${w}_${r}_${m}_${p ? 'True' : 'False'}`];
            const o = denoise(D.y, w, 5, r, m, p);
            if (!(relMax(o.y, ry) < 1e-9 && relMax(o.thresholds, rt) < 1e-9)) bad.push(`${w} ${r} ${m}${p ? ' per level' : ''}`);
          }
    ok(!bad.length, `wavelet denoising: universal, SURE, Bayes, soft and hard, σ global or per level, as the thresholds on PyWavelets${bad.length ? ` (not: ${bad.join('; ')})` : ''}`);
  }

  // ---- peaks of the Ricker transform as SciPy's find_peaks_cwt ----
  {
    const P = R.peaks;
    const got = peaksCwt(P.y, P.widths).peaks;
    ok(got.join(',') === P.peaks.join(','), `CWT peaks as SciPy's find_peaks_cwt: ${got.join(', ')} (${P.peaks.join(', ')})`);
  }

  // ---- waveform, triggers, averaging: properties ----
  {
    // (a trapezoid train: period 10, high 3, edges 0.4 → 10–90 % 0.32; levels 0 and 1; duty 30 % between the mid crossings)
    const x = Array.from({ length: 2000 }, (_, i) => i * 0.01);
    const y = x.map((t) => {
      const ph = t % 10;
      return ph < 0.4 ? ph / 0.4 : ph < 3 ? 1 : ph < 3.4 ? 1 - (ph - 3) / 0.4 : 0;
    });
    const lv = stateLevels(y, 'histogram');
    const w = waveform(x, y, lv);
    const rise = w.edges.find((e) => e.kind === 'rise')!;
    const fall = w.edges.find((e) => e.kind === 'fall')!;
    const tr = crossingsOf(x, y, 0.5, 'rising');
    const av = averageAround(x, y, tr, 0.1, 4, 0.01, false);
    ok(Math.abs(lv.base) < 1e-9 && Math.abs(lv.top - 1) < 1e-9 && Math.abs(rise.dur - 0.32) < 1e-9 && Math.abs(fall.dur - 0.32) < 1e-9 && Math.abs(w.period - 10) < 1e-9 && Math.abs(w.duty - 30) < 1e-6 && tr.length === 2 && Math.abs(tr[0] - 0.2) < 1e-12 && av.segs.length === 2 && Math.max(...av.sd.filter(Number.isFinite)) < 1e-9, `waveform: levels ${lv.base}, ${lv.top}; rise ${rise.dur.toFixed(4)}, fall ${fall.dur.toFixed(4)} (0.32); period ${w.period}, duty ${w.duty.toFixed(3)} %; the triggers at ${tr.join(', ')}; the average of equal segments`);
  }

  // ---- fractional derivatives: the Grünwald–Letnikov sum, differint's RL, the exact ones of powers ----
  {
    const F = R.frac;
    const h = F.x[1] - F.x[0];
    const gl = Object.keys(F.gl).map((a) => relMax(fracGL(F.f, h, +a), F.gl[a]));
    ok(Math.max(...gl) < 1e-10, `Grünwald–Letnikov as its sum written out: orders ${Object.keys(F.gl).join(', ')} within ${Math.max(...gl).toExponential(1)}`);
    // (differint: a trapezoid rule, O(h) apart from the product integration; at h = 1/400)
    const rl = Object.keys(F.rl).map((a) => relMax(fracDerivative(F.x, F.f, +a, 'rl').slice(1), F.rl[a].slice(1)));
    ok(Math.max(...rl) < 2e-3, `Riemann–Liouville as differint's RL (within its trapezoid rule): orders ${Object.keys(F.rl).join(', ')}, apart ${rl.map((e) => e.toExponential(1)).join(', ')}`);
    // (exact: D^α x^p = Γ(p + 1)/Γ(p + 1 − α) x^(p − α); a line exact for the integrals, a quadratic for the derivatives)
    const g = (v: number) => Math.exp(lgamma(v));
    const x = Array.from({ length: 201 }, (_, i) => (2 * i) / 200);
    const exact = (p: number, a: number) => x.map((t) => (g(p + 1) / g(p + 1 - a)) * t ** (p - a));
    const cases: [number, number, 'rl' | 'caputo', number][] = [
      [1, -0.5, 'rl', 1e-12],
      [1, -1.5, 'rl', 1e-12],
      [2, 0.5, 'rl', 1e-3],
      [2, 1.5, 'rl', 1e-3],
      [2, 0.5, 'caputo', 1e-3],
      [1, 0.3, 'rl', 1e-3],
    ];
    const bad = cases.filter(([p, a, m, tol]) => relMax(fracDerivative(x, x.map((t) => t ** p), a, m).slice(1), exact(p, a).slice(1)) > tol);
    // (Caputo leaves the value at the start out: D^α (x² + 3) = D^α x²)
    const cap = relMax(fracDerivative(x, x.map((t) => t * t + 3), 0.5, 'caputo').slice(1), exact(2, 0.5).slice(1));
    // (Weyl: D^α sin = sin(x + απ/2), periodic data)
    const xp = Array.from({ length: 256 }, (_, i) => (2 * Math.PI * i) / 256);
    const wy = relMax(fracDerivative(xp, xp.map(Math.sin), 0.5, 'fourier'), xp.map((t) => Math.sin(t + Math.PI / 4)));
    ok(!bad.length && cap < 1e-3 && wy < 1e-9, `fractional derivatives of powers as Γ(p + 1)/Γ(p + 1 − α) x^(p − α)${bad.length ? ` (not: ${bad.map((c) => c.join(' ')).join('; ')})` : ''}; Caputo of x² + 3 within ${cap.toExponential(1)}; Weyl of sin within ${wy.toExponential(1)}`);
  }

  // ---- convolution voltammetry: the semi-integral of a reversible wave, both sweeps on the sigmoid; D from it ----
  {
    const [Fc, Rg, T] = [96485.33212, 8.314462618, 298.15];
    const E: number[] = [];
    for (let k = 0; k <= 600; k++) E.push(0.5 - k * 0.001);
    for (let k = 1; k <= 600; k++) E.push(-0.1 + k * 0.001);
    const mL = Fc * 0.0707 * 1e-6 * Math.sqrt(7.6e-6);
    const m = E.map((e) => -mL / (1 + Math.exp((Fc / (Rg * T)) * (e - 0.22))));
    const i = fracGL(m, 0.01, 0.5).map((v) => v * 1e6);
    const ds = { name: 'cv', columns: [{ ...column('Potential (V)', Float64Array.from(E)), role: 'x' as const }, { ...column('Current (µA)', Float64Array.from(i)), role: 'y' as const }] };
    const r = fracNode(ds, { ...FRAC_DEFAULTS, x: 'Potential (V)', ys: 'Current (µA)', orders: '-0.5', along: 'rows', rate: 0.1, semi: true, unit: 'µA' });
    const back = 'tables' in r ? r.tables.out.columns.find((c) => c.name.startsWith('D^-0.5'))!.values : new Float64Array();
    const eb = relMax(Array.from(back).map((v) => v * 1e-6), m);
    const D = 'report' in r ? Number(/D = \(m_L \/ nFAc\)² = ([\d.e+-]+)/.exec(r.report.join(' '))?.[1]) : NaN;
    ok(eb < 5e-3 && Math.abs(D / 7.6e-6 - 1) < 0.01, `convolution voltammetry: the semi-integral of the current back to m within ${eb.toExponential(1)}; D = ${D} cm²/s (7.6e-6)`);
  }

  // ---- the fractional Fourier transform: fracF (Ozaktas) written out in Python; the discrete one's properties ----
  {
    const Q = R.frft;
    const orders = Object.keys(Q).filter((k) => k !== 're' && k !== 'im');
    const ef = orders.map((a) => {
      const [r, i] = fracFast(Q.re, Q.im, +a);
      return Math.max(relMax(r, Q[a][0]), relMax(i, Q[a][1]));
    });
    ok(Math.max(...ef) < 1e-9, `fast fractional Fourier transform as fracF (Ozaktas et al. 1996): orders ${orders.join(', ')} within ${Math.max(...ef).toExponential(1)}`);
    const N = 48;
    const re = Array.from({ length: N }, (_, k) => Math.sin(k / 3) + 0.3 * Math.cos(k * k));
    const im = Array.from({ length: N }, (_, k) => Math.cos(k / 5));
    const energy = (r: number[], i: number[]) => r.reduce((s, v, k) => s + v * v + i[k] * i[k], 0);
    const [r1, i1] = frft(re, im, 1);
    const [dr, di] = fracFast(re, im, 1);
    const [a1r, a1i] = frft(...frft(re, im, 0.37), 0.81);
    const [a2r, a2i] = frft(re, im, 1.18);
    const [rr, ri] = frft(re, im, 2);
    const [ir, ii] = frft(...frft(re, im, 0.6), -0.6);
    const add = Math.max(relMax(a1r, a2r), relMax(a1i, a2i));
    const rev = Math.max(relMax(rr, [re[0], ...re.slice(1).reverse()]), relMax(ri, [im[0], ...im.slice(1).reverse()]));
    const back = Math.max(relMax(ir, re), relMax(ii, im));
    const en = Math.abs(energy(...frft(re, im, 0.43)) / energy(re, im) - 1);
    const dft = Math.max(relMax(r1, dr), relMax(i1, di));
    ok(add < 1e-9 && rev < 1e-9 && back < 1e-9 && en < 1e-12 && dft < 1e-9, `discrete fractional Fourier transform: a = 1 the centred DFT (${dft.toExponential(1)}); 0.37 + 0.81 = 1.18 (${add.toExponential(1)}); a = 2 the reversal u → −u (${rev.toExponential(1)}); back by −a (${back.toExponential(1)}); the energy kept (${en.toExponential(1)})`);
  }

  // ---- a chirp: the scan finds its rate, the filter takes it out ----
  {
    const n = 512;
    const t = Array.from({ length: n }, (_, k) => k * 0.001);
    const pulse = t.map((v) => Math.exp(-((v - 0.25) ** 2) / (2 * 0.06 ** 2)) * Math.sin(2 * Math.PI * 60 * v));
    const y = t.map((v, k) => pulse[k] + 1.5 * Math.sin((Math.PI * k) / (n - 1)) ** 2 * Math.cos(2 * Math.PI * (20 * v + 175 * v * v)));
    const ds = { name: 'chirp', columns: [{ ...column('Time (s)', Float64Array.from(t)), role: 'x' as const }, { ...column('Signal', Float64Array.from(y)), role: 'y' as const }] };
    const sc = frftNode(ds, { ...FRFT_DEFAULTS, x: 'Time (s)', ys: 'Signal', mode: 'scan' });
    const rate = 'report' in sc ? Number(/a chirp of rate ([\d.]+)/.exec(sc.report.join(' '))?.[1]) : NaN;
    const fl = frftNode(ds, { ...FRFT_DEFAULTS, x: 'Time (s)', ys: 'Signal', mode: 'filter', auto: true, width: 3 });
    const out = 'tables' in fl ? fl.tables.out.columns.find((c) => c.name === 'Signal (filtered)')!.values : new Float64Array(n);
    const rms = (v: ArrayLike<number>) => Math.sqrt(Array.from(v).reduce((s, q) => s + q * q, 0) / v.length);
    const left = rms(Array.from(out).map((v, k) => v - pulse[k])) / rms(pulse);
    ok(Math.abs(rate / 350 - 1) < 0.01 && left < 0.08, `fractional Fourier transform of a chirp of 350 Hz/s: the scan's rate ${rate}; filtered, the pulse back within ${(100 * left).toFixed(1)} % of its RMS`);
  }
  // ---- Lomb–Scargle as astropy (standard, the mean fitted; Baluev's false alarm) and SciPy (normalized, floating mean) ----
  {
    const L = R.lomb;
    const f = lsFrequencies(L.t, 5, NaN, NaN);
    const r = lombScargle(L.t, L.y, f);
    const fmax = f[f.length - 1];
    const ef = relMax(f, L.f);
    const ep = Math.max(relMax(r.power, L.power), relMax(r.power, L.scipy));
    const z = Math.max(...r.power);
    const efap = Math.max(Math.abs(lsFap(z, L.t, fmax) / L.fap - 1), ...[0.05, 0.1, 0.2].map((q, k) => Math.abs(lsFap(q, L.t, fmax) / L.fapAt[k] - 1)));
    const el = Math.abs(lsLevel(0.01, L.t, fmax) / L.level - 1);
    ok(f.length === L.f.length && ef < 1e-12 && ep < 1e-9 && efap < 1e-8 && el < 1e-8, `Lomb–Scargle as astropy and SciPy: ${f.length} frequencies, the power within ${ep.toExponential(1)}; the false-alarm probability (Baluev) within ${efap.toExponential(1)}, its 1 % level ${el.toExponential(1)}`);
  }

  // ---- harmonics: a sine with harmonics of known amplitudes and white noise ----
  {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
    const [fs, f0, A1, A2, A3, A5, sg] = [48000, 1031.7, 1, 0.01, 0.003, 0.001, 0.0005];
    const y = Array.from({ length: 8192 }, (_, i) => {
      const t = i / fs;
      return 0.2 + A1 * Math.sin(2 * Math.PI * f0 * t) + A2 * Math.sin(4 * Math.PI * f0 * t + 1) + A3 * Math.sin(6 * Math.PI * f0 * t) + A5 * Math.sin(10 * Math.PI * f0 * t) + sg * gauss();
    });
    const h = harmonics(y, 1 / fs, 6, NaN);
    const [ph, p1] = [(A2 ** 2 + A3 ** 2 + A5 ** 2) / 2, A1 ** 2 / 2];
    const want = { thd: 10 * Math.log10(ph / p1), snr: 10 * Math.log10(p1 / sg ** 2), sinad: 10 * Math.log10(p1 / (sg ** 2 + ph)), sfdr: 10 * Math.log10(A1 ** 2 / A2 ** 2) };
    const got = typeof h === 'string' ? null : h;
    ok(!!got && Math.abs(got.f0 - f0) < 0.01 && Math.abs(got.thd - want.thd) < 0.05 && Math.abs(got.snr - want.snr) < 0.2 && Math.abs(got.sinad - want.sinad) < 0.05 && Math.abs(got.sfdr - want.sfdr) < 0.05 && Math.abs(got.harmonics[1].amp / A2 - 1) < 0.01 && Math.abs(got.enob - (want.sinad - 1.76) / 6.02) < 0.01, `harmonics: the fundamental ${got?.f0.toFixed(3)} (${f0}); THD ${got?.thd.toFixed(3)} dB (${want.thd.toFixed(3)}), SNR ${got?.snr.toFixed(2)} (${want.snr.toFixed(2)}), SINAD ${got?.sinad.toFixed(3)} (${want.sinad.toFixed(3)}), SFDR ${got?.sfdr.toFixed(3)} (${want.sfdr.toFixed(3)})`);
  }
  // ---- the Bessel filter and the notch as SciPy (their responses); the Hampel filter ----
  {
    const I = R.iir;
    const bad: string[] = [];
    let worst = 0;
    for (const [k, c] of Object.entries(I.bessel) as [string, { N: number; band: 'low' | 'high' | 'band' | 'stop'; w: number[]; re: number[]; im: number[] }][]) {
      const H = sosResponse(designSos('bessel', c.N, c.band, c.w[0], c.w[1]), I.w);
      const e = Math.max(relMax(H.map((h) => h[0]), c.re), relMax(H.map((h) => h[1]), c.im));
      worst = Math.max(worst, e);
      if (!(e < 1e-9)) bad.push(k);
    }
    const Hn = sosResponse(notchSos(50, 30, 1000, 1), I.w);
    const en = Math.max(relMax(Hn.map((h) => h[0]), I.notch.re), relMax(Hn.map((h) => h[1]), I.notch.im));
    ok(!bad.length && en < 1e-12, `Bessel filters as SciPy's bessel (orders 1 to 12, low, high, band, stop) within ${worst.toExponential(1)}${bad.length ? ` (not: ${bad.join(', ')})` : ''}; the notch as iirnotch within ${en.toExponential(1)}`);
    const y = Array.from({ length: 300 }, (_, i) => Math.sin(i / 15));
    const sp = y.map((v, i) => (i % 50 === 25 ? v + 5 : v));
    const h = hampel(sp, 5, 3);
    ok(h.out.join(',') === '25,75,125,175,225,275' && relMax(h.y.filter((_, i) => i % 50 !== 25), y.filter((_, i) => i % 50 !== 25)) === 0 && hampel(y, 5, 3).out.length === 0, `Hampel: the six spikes replaced (${h.out.join(', ')}), the other points kept; none in the clean signal`);
  }
}
