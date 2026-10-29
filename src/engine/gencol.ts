// Generated values: evenly spaced (from – to), from a start by a step, a formula of the row i, or random (uniform or
// normal, seeded) — n of them; or values typed (Generate column; Columns has its own column of them). Used by Generate
// column and by the columns added in Columns. Pure.
import { compile } from './expr.ts';

export type GenMode = 'linspace' | 'step' | 'formula' | 'random' | 'typed';
export type GenSpec = { mode: GenMode; start: number; stop: number; step: number; formula: string; dist: 'uniform' | 'normal'; a: number; b: number; seed: number; typed?: string };

// Values typed: one per line, else separated by ; (a decimal comma: 1,5; 2,3), else by , — an empty one in between an
// empty cell, those at the end left out
export function typedCells(t: string): string[] {
  const sep = t.includes('\n') ? '\n' : t.includes(';') ? ';' : ',';
  const cells = t.split(sep).map((x) => x.trim());
  while (cells.length && !cells[cells.length - 1]) cells.pop();
  return cells;
}
export const GEN_SPEC_DEFAULTS: GenSpec = { mode: 'linspace', start: 0, stop: 1, step: 1, formula: 'i', dist: 'normal', a: 0, b: 1, seed: 1 };

// A small seeded generator (mulberry32): the same seed gives the same random column on every computer.
export function rng(seed: number) {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generatedValues(d: GenSpec, n: number): Float64Array | string {
  const v = new Float64Array(n);
  switch (d.mode) {
    case 'linspace':
      for (let k = 0; k < n; k++) v[k] = n === 1 ? d.start : d.start + ((d.stop - d.start) * k) / (n - 1);
      break;
    case 'step':
      for (let k = 0; k < n; k++) v[k] = d.start + k * d.step;
      break;
    case 'formula': {
      const f = compile(d.formula);
      if (typeof f === 'string') return f;
      const bad = f.names.filter((x) => x !== 'i' && x !== 'n');
      if (bad.length) return `Unknown name${bad.length > 1 ? 's' : ''} ${bad.join(', ')}: the formula may use i (the row, 1 … n) and n (the number of rows).`;
      const vars = { i: 0, n };
      for (let k = 0; k < n; k++) {
        vars.i = k + 1;
        v[k] = f.fn(vars);
      }
      break;
    }
    case 'random': {
      const r = rng(d.seed);
      if (d.dist === 'uniform') for (let k = 0; k < n; k++) v[k] = d.a + (d.b - d.a) * r();
      else
        for (let k = 0; k < n; k += 2) {
          // Box–Muller: two normal values from two uniform ones
          const u1 = 1 - r();
          const u2 = r();
          const m = Math.sqrt(-2 * Math.log(u1));
          v[k] = d.a + d.b * m * Math.cos(2 * Math.PI * u2);
          if (k + 1 < n) v[k + 1] = d.a + d.b * m * Math.sin(2 * Math.PI * u2);
        }
      break;
    }
  }
  return v;
}
