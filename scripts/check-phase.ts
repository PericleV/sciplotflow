// The checks of the Phase diagram node against closed forms: the ideal liquidus and solidus, the symmetric solvus and
// eutectic (found here on their own by bisection), the lever rule's mass balance, the presets against the real
// eutectics, and the node's outputs.
import { R_GAS, cooling, equilibrium, gibbs, lever, phaseDiagram, type PhaseModel } from '../src/engine/phase.ts';
import { PHASE_DEFAULTS, PHASE_PRESETS, modelOf } from '../src/engine/phasenode.ts';
import { evaluateGraph } from '../src/engine/evaluate.ts';
import type { AppNode } from '../src/types.ts';

type Ok = (cond: boolean, what: string) => void;
const K = 273.15;

export function checkPhase(ok: Ok) {
  // ideal solutions (Cu–Ni): the ends of the tie line as the closed form, x_S = (1 − k_A) / (k_B − k_A), x_L = k_B x_S
  {
    const m: PhaseModel = { tmA: 1084.6 + K, tmB: 1455 + K, hA: 13260, hB: 17480, omegaL: 0, omegaS: 0 };
    let worst = 0;
    for (const T of [1380, 1450, 1550, 1650, 1720]) {
      const kA = Math.exp((-m.hA / R_GAS) * (1 / T - 1 / m.tmA));
      const kB = Math.exp((-m.hB / R_GAS) * (1 / T - 1 / m.tmB));
      const xS = (1 - kA) / (kB - kA);
      const tie = equilibrium(m, T).find((s) => s.tie)!;
      worst = Math.max(worst, Math.abs(tie.a - kB * xS), Math.abs(tie.b - xS));
    }
    ok(worst < 1e-8, `phase diagram, ideal (Cu–Ni): the liquidus and solidus as the closed form (${worst.toExponential(1)})`);
    // an alloy's liquidus: where x_L(T) = x₀, by bisection on the closed form; the cooling's first solid there
    const x0 = 0.4;
    let [lo, hi] = [m.tmA, m.tmB];
    for (let i = 0; i < 80; i++) {
      const T = (lo + hi) / 2;
      const kA = Math.exp((-m.hA / R_GAS) * (1 / T - 1 / m.tmA));
      const kB = Math.exp((-m.hB / R_GAS) * (1 / T - 1 / m.tmB));
      if (kB * ((1 - kA) / (kB - kA)) > x0) hi = T;
      else lo = T;
    }
    const d = phaseDiagram(m);
    const c = cooling(m, x0, d, d.tMax, d.tMin, 50);
    const sums = c.T.every((_, i) => Math.abs(Object.values(c.frac).reduce((s, f) => s + f[i], 0) - 1) < 1e-9);
    ok(Math.abs((c.liquidus ?? 0) - (lo + hi) / 2) < 1e-3 && sums && d.regions.map((r) => r.key).sort().join() === ['L', 'L + α', 'α'].sort().join() && !d.invariants.length, `phase diagram, ideal: three regions, no invariant; an alloy of 40 % starts to solidify at the closed form’s ${((lo + hi) / 2 - K).toFixed(2)} °C; its amounts add up to 1`);
  }
  // a symmetric gap in the solid: the solvus as ln(x / (1 − x)) = −Ω (1 − 2x) / RT; the symmetric eutectic at x = ½,
  // its temperature where G_S at the solvus equals G_L(½) (the horizontal common tangent), found here by bisection
  {
    const m: PhaseModel = { tmA: 1000, tmB: 1000, hA: 15000, hB: 15000, omegaL: 0, omegaS: 25000 };
    const d = phaseDiagram(m);
    const v = d.invariants[0];
    const Tl = d.tMin + 5;
    const ss = equilibrium(m, Tl).find((s) => s.tie)!;
    const res = Math.log(ss.a / (1 - ss.a)) + (m.omegaS * (1 - 2 * ss.a)) / (R_GAS * Tl);
    const solvus = (T: number) => {
      let [a, b] = [1e-12, 0.5 - 1e-9];
      for (let i = 0; i < 200; i++) {
        const x = (a + b) / 2;
        if (R_GAS * T * Math.log(x / (1 - x)) + m.omegaS * (1 - 2 * x) > 0) b = x;
        else a = x;
      }
      return (a + b) / 2;
    };
    let [lo, hi] = [600, 999];
    for (let i = 0; i < 100; i++) {
      const T = (lo + hi) / 2;
      if (gibbs(m, 'S', solvus(T), T) < gibbs(m, 'L', 0.5, T)) lo = T;
      else hi = T;
    }
    const TE = (lo + hi) / 2;
    ok(d.gap === 'eutectic' && d.invariants.length === 1 && v.kind === 'eutectic' && Math.abs(v.xs[1] - 0.5) < 1e-4 && Math.abs(v.T - TE) < 1e-3 && Math.abs(v.xs[0] - solvus(TE)) < 1e-5 && Math.abs(res) < 1e-9, `phase diagram, symmetric eutectic: at x = ½ and the ${TE.toFixed(3)} K of the horizontal tangent (${v.T.toFixed(3)} K); the solvus as its closed form`);
    // the lever rule: the amounts add up to 1 and give back the composition (mass balance), at points all over
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const x = 0.02 + 0.96 * ((i * 0.618) % 1);
      const T = d.tMin + (d.tMax - d.tMin) * ((i * 0.377) % 1);
      const lv = lever(m, x, T, d.nameOf);
      worst = Math.max(worst, Math.abs(lv.phases.reduce((s, p) => s + p.f, 0) - 1), Math.abs(lv.phases.reduce((s, p) => s + p.f * p.x, 0) - x));
      if (lv.phases.some((p) => p.f < -1e-12 || p.f > 1 + 1e-12)) worst = 1;
    }
    // an alloy of 30 %: just above the eutectic, primary α = (½ − 0.3) / (½ − x_α)
    const c = cooling(m, 0.3, d, d.tMax, d.tMin, 40);
    const prim = c.atInvariant?.above.phases.find((p) => p.name === 'α');
    ok(worst < 1e-12 && !!prim && Math.abs(prim.f - (0.5 - 0.3) / (0.5 - v.xs[0])) < 1e-4 && Math.abs((c.solidus ?? 0) - v.T) < 1e-3, `lever rule: the amounts add to 1 and give back the composition; above the eutectic the primary α as (½ − x) / (½ − x_α) (${prim ? (prim.f * 100).toFixed(2) : '—'} %)`);
  }
  // the presets: the eutectics near the real ones; no solid above a melting point (the liquidus falls from both ends);
  // the Au–Ni-like model: a minimum and a gap under the solidus (α₁, α₂)
  {
    const of = (key: string) => {
      const p = PHASE_PRESETS.find((q) => q.key === key)!;
      const m = modelOf({ ...PHASE_DEFAULTS, ...p.v, unit: 'C' });
      return { m, d: phaseDiagram(m) };
    };
    const pb = of('pbsn').d.invariants[0];
    const ag = of('agcu').d.invariants[0];
    // next to a pure component, just above its melting point: all liquid (no solid of it above where it melts)
    const meltOk = PHASE_PRESETS.every((p) => {
      const { m, d } = of(p.key);
      const liquid = (x: number, T: number) => {
        const ps = lever(m, x, T, d.nameOf).phases;
        return ps.length === 1 && ps[0].name === 'L';
      };
      return liquid(0.001, m.tmA + 1) && liquid(0.999, m.tmB + 1);
    });
    const g = of('gap').d;
    ok(Math.abs(pb.T - K - 183) < 1 && Math.abs(pb.xs[1] - 0.738) < 0.005 && Math.abs(ag.T - K - 779) < 1 && Math.abs(ag.xs[1] - 0.399) < 0.005 && meltOk && g.gap === 'solid' && g.regions.some((r) => r.key === 'α₁ + α₂'), `phase diagram presets: Pb–Sn eutectic ${(pb.T - K).toFixed(1)} °C at ${(pb.xs[1] * 100).toFixed(1)} at% Sn, Ag–Cu ${(ag.T - K).toFixed(1)} °C at ${(ag.xs[1] * 100).toFixed(1)} at% Cu; all liquid just above the melting points; the gap model with α₁ + α₂`);
  }
  // the node: a figure with the lines and the regions; the points' table; an alloy's amounts (a second figure)
  {
    const node = { id: 'pd', type: 'phasediagram', position: { x: 0, y: 0 }, data: { ...PHASE_DEFAULTS, points: [[40, 220]], alloy: 40 } } as AppNode;
    const r = evaluateGraph([node], []).get('pd')!;
    const F = r.outputs.figure;
    const P = r.outputs.points;
    const A = r.outputs.fractions;
    const curves = F?.t === 'figure' ? F.v.axes[0].curves.map((c) => c.label) : [];
    const regions = F?.t === 'figure' ? F.v.axes[0].annotations.filter((a) => a.kind === 'shape' && a.shape.kind === 'polygon').length : 0;
    const col = (name: string) => (P?.t === 'dataset' ? P.v.columns.find((c) => c.name === name) : undefined);
    const sum = A?.t === 'dataset' ? A.v.columns.filter((c) => /\(%\)$/.test(c.name)).reduce((s, c) => s + c.values[Math.floor(c.values.length / 2)], 0) : NaN;
    const editable = F?.t === 'figure' ? F.v.axes[0].annotations.some((a) => a.owner && /\/ph-/.test(a.key)) : true;
    ok(['liquidus', 'solidus', 'solvus', 'eutectic'].every((l) => curves.includes(l)) && regions >= 6 && col('Phase 1')?.text?.[0] === 'α' && col('Phase 2')?.text?.[0] === 'L' && Math.abs((col('Amount 1 (%)')?.values[0] ?? 0) + (col('Amount 2 (%)')?.values[0] ?? 0) - 100) < 1e-9 && r.outputs.cooling?.t === 'figure' && Math.abs(sum - 100) < 1e-6 && !editable && !r.errors.length, `Phase diagram node: the lines and ${regions} regions; the point at 40 at% Sn, 220 °C in α + L, its amounts adding to 100 %; the alloy’s amounts (a second figure); its own shapes not moved by hand`);
    const bad = evaluateGraph([{ ...node, data: { ...node.data, hA: 0 } } as AppNode], []).get('pd')!;
    ok(bad.errors[0]?.startsWith('The enthalpy of fusion of Pb') === true, 'Phase diagram node: an enthalpy of fusion of 0 said');
  }
}
