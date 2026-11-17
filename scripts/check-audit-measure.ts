// The audit of 2026-11-17, section Signal: the fixes of SignalMeasure checked (Waveform measurements G10 – G11, Step
// detection G12, Event averaging G13 – G14, the units of their outputs), each an input and the result expected
import { waveform, stateLevels } from '../src/engine/signal2.ts';
import { eventsNode, stepsNode, waveformNode } from '../src/engine/signal2nodes.ts';
import { EVENTS_DEFAULTS, STEPS_DEFAULTS, WAVEFORM_DEFAULTS } from '../src/defaults.ts';
import { column, type Column, type Dataset } from '../src/engine/table.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkAuditSignalMeasure(ok: Ok) {
  const ds = (cols: [string, number[], Column['role']][]): Dataset => ({ name: 'd', columns: cols.map(([n, v, role]) => ({ ...column(n, Float64Array.from(v)), role })) });
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  // (a fixed noise: an LCG and Box–Muller)
  const noise = (seed: number) => {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    return () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  };
  const colOf = (t: Dataset, name: string) => Array.from(t.columns.find((c) => c.name === name)?.values ?? []);
  const textOf = (t: Dataset, name: string) => t.columns.find((c) => c.name === name)?.text ?? [];

  // ---- G10: the mean and the RMS averages over X (trapezoids / span), not over the samples ----
  {
    // (a 50 % square wave, 1 s, sampled 10 × denser when low: np.trapezoid gives 0.4954 and 0.7039)
    const x: number[] = [];
    for (let t = 0; t < 10; ) {
      x.push(t);
      t += t % 1 < 0.5 ? 0.01 : 0.001;
    }
    const y = x.map((t) => (t % 1 < 0.5 ? 1 : 0));
    const w = waveform(x, y, stateLevels(y, 'histogram'));
    // (on even X, almost the sample mean)
    const xe = Array.from({ length: 2000 }, (_, i) => i * 0.005);
    const ye = xe.map((t) => (t % 1 < 0.5 ? 1 : 0));
    const we = waveform(xe, ye, stateLevels(ye, 'histogram'));
    const sm = ye.reduce((a, v) => a + v, 0) / ye.length;
    ok(near(w.mean, 0.4954, 1e-3) && near(w.rms, 0.7039, 1e-3) && near(w.acRms, Math.sqrt(w.rms ** 2 - w.mean ** 2), 1e-9) && near(we.mean, sm, 1e-3) && w.gaps === 0, `G10 Waveform: mean ${w.mean.toFixed(4)} (0.4954; was 0.091), RMS ${w.rms.toFixed(4)} (0.7039; was 0.30) on uneven X; even X ${we.mean.toFixed(4)} ≈ sample mean ${sm.toFixed(4)}`);
  }

  // ---- G11: a gap in the data: no period, width or edge across it ----
  {
    // (a 1 Hz 50 % square wave over 0–5 s, 2.0–2.7 s missing as NaN rows)
    const x = Array.from({ length: 5001 }, (_, i) => i / 1000);
    const y = x.map((t) => (t >= 2 && t < 2.7 ? NaN : t % 1 < 0.5 ? 1 : 0));
    const r = waveformNode(ds([['Time (s)', x, 'x'], ['Signal (V)', y, 'y']]), { ...WAVEFORM_DEFAULTS });
    const out = 'tables' in r ? r.tables.out : undefined;
    const [per, duty] = out ? [colOf(out, 'Period (s)')[0], colOf(out, 'Duty cycle (%)')[0]] : [NaN, NaN];
    const warned = 'tables' in r && r.warnings.some((s) => s.includes('1 gap in the data'));
    ok(near(per, 1, 1e-9) && near(duty, 50, 1e-6) && warned, `G11 Waveform: with 2.0–2.7 s missing the period ${per} (1; was 1.4), duty ${duty?.toFixed(3)} % (50; was 35.7), the gap warned`);
  }

  // ---- G12: quantised data (ADC counts): the noise σ not 0, the steps found ----
  {
    const g = noise(12345);
    const y = Array.from({ length: 1000 }, (_, i) => Math.round(10 * Math.floor(i / 200) + 0.3 * g()));
    const x = y.map((_, i) => i * 0.01);
    const r = stepsNode(ds([['Time (s)', x, 'x'], ['Current (pA)', y, 'y']]), { ...STEPS_DEFAULTS });
    const changes = 'tables' in r ? r.tables.steps.columns[0].values.length : -1;
    const warned = 'tables' in r && r.warnings.some((s) => s.includes('quantised'));
    const said = 'tables' in r && !r.report.some((s) => /σ 0(?![.\d])/.test(s));
    // (a constant signal: σ 0 said so, not as if fine)
    const c = stepsNode(ds([['Time (s)', x, 'x'], ['Current (pA)', x.map(() => 3), 'y']]), { ...STEPS_DEFAULTS });
    const flat = 'tables' in c && c.warnings.some((s) => s.includes('the noise σ is 0'));
    ok(changes === 4 && warned && said && flat, `G12 Step detection: a rounded 5-level staircase: ${changes} changes (4; was 165), the quantised data warned, σ 0 never reported as fine`);
  }

  // ---- G13: the level trigger with a hysteresis: no false triggers on noisy slow edges ----
  {
    // (8 pulses, 20 ms edges, noise 0.03, every 0.5 ms: without the hysteresis 10 triggers, one on a falling edge)
    const g = noise(777);
    const x = Array.from({ length: 16000 }, (_, i) => i * 0.0005);
    const y = x.map((t) => {
      const ph = t % 1;
      return (ph < 0.1 ? 0 : ph < 0.12 ? (ph - 0.1) / 0.02 : ph < 0.5 ? 1 : ph < 0.52 ? 1 - (ph - 0.5) / 0.02 : 0) + 0.03 * g();
    });
    const S = ds([['Time (s)', x, 'x'], ['Signal (V)', y, 'y']]);
    const times = (trigger: 'rising' | 'falling') => {
      const r = eventsNode(S, { ...EVENTS_DEFAULTS, trigger });
      return 'tables' in r ? colOf(r.tables.triggers, 'Time (s)') : [];
    };
    const [up, down] = [times('rising'), times('falling')];
    ok(up.length === 8 && down.length === 8 && up.every((t) => near(t % 1, 0.11, 0.003)) && down.every((t) => near(t % 1, 0.51, 0.003)), `G13 Event averaging: ${up.length} rising triggers (8; was 10), ${down.length} falling (8), each on its own edge`);
  }

  // ---- G14: a window holding a gap of the data: not averaged, said so ----
  {
    const x = Array.from({ length: 8000 }, (_, i) => i * 0.001);
    const y = x.map((t, i) => (i >= 2200 && i < 2250 ? NaN : t % 1 >= 0.1 && t % 1 < 0.5 ? 1 : 0));
    const r = eventsNode(ds([['Time (s)', x, 'x'], ['Signal (V)', y, 'y']]), { ...EVENTS_DEFAULTS, gap: 0.5 });
    const av = 'tables' in r ? textOf(r.tables.triggers, 'Averaged') : [];
    const warned = 'tables' in r && r.warnings.some((s) => s.includes('a gap in the data inside its window'));
    ok(av[2] === 'no (a gap in its window)' && av.filter((s) => s === 'yes').length === 6 && warned, `G14 Event averaging: 50 NaN samples in event 3's window: “${av[2]}” (was “yes”), ${av.filter((s) => s === 'yes').length} averaged, warned`);
  }

  // ---- the names: the unit at the end (times of X, levels of Y, the frequency in Hz) ----
  {
    const x = Array.from({ length: 4000 }, (_, i) => i * 0.001);
    const y = x.map((t) => (t % 1 < 0.5 ? 1 : 0));
    const S = ds([['Time (s)', x, 'x'], ['Signal (mV)', y, 'y']]);
    const w = waveformNode(S, { ...WAVEFORM_DEFAULTS });
    const st = stepsNode(S, { ...STEPS_DEFAULTS });
    const ev = eventsNode(S, { ...EVENTS_DEFAULTS });
    const names = (r: ReturnType<typeof waveformNode>, k: string) => ('tables' in r ? r.tables[k].columns.map((c) => c.name) : []);
    const has = (r: ReturnType<typeof waveformNode>, k: string, want: string[]) => want.every((n) => names(r, k).includes(n));
    ok(
      has(w, 'out', ['Period (s)', 'Frequency (Hz)', 'Rise time (s)', 'Amplitude (mV)', 'RMS (mV)', 'Mean (mV)']) && has(w, 'edges', ['Time (s)']) && has(st, 'out', ['Start (s)', 'Duration (s)', 'Mean (mV)']) && has(st, 'steps', ['Step size (mV)']) && has(st, 'fit', ['Signal steps (mV)']) && has(ev, 'out', ['Lag (s)', 'Mean (mV)', 'SD (mV)']),
      `the outputs of Waveform, Step detection, Event averaging named with their units: ${names(w, 'out').slice(2, 5).join(', ')} …; ${names(st, 'fit').join(', ')}; ${names(ev, 'out').join(', ')}`,
    );
  }
}
