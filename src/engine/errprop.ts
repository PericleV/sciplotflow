// The errors of a formula's inputs carried to its result (first order, the inputs independent):
// σ² = Σ (∂f/∂xᵢ · σᵢ)², every derivative by a central difference at the point. The errors are written as lines
// “A ± 0.02”, “B ± 2%” (of |B|), “A ± C” (another input, its value at the row), “A ± sqrt(A)” (any formula of the
// inputs). Pure.
import { compile } from './expr.ts';

export type ErrLine = { letter: string; formula: string };

export function parseErrors(text: string | undefined): { lines: ErrLine[]; errors: string[] } {
  const lines: ErrLine[] = [];
  const errors: string[] = [];
  for (const raw of (text ?? '').split(/[;\n]/)) {
    const t = raw.trim();
    if (!t) continue;
    const m = /^([A-Z]{1,2})\s*(?:±|\+-|\+\/-)\s*(.+)$/.exec(t);
    if (!m) {
      errors.push(`Error “${t}”: write it as A ± 0.02, A ± 2%, or A ± C.`);
      continue;
    }
    const [, letter, e0] = m;
    const pct = /%\s*$/.test(e0);
    const e = pct ? `(${e0.replace(/%\s*$/, '')})/100*abs(${letter})` : e0;
    const c = compile(e);
    if (typeof c === 'string') {
      errors.push(`Error “${t}”: ${c}`);
      continue;
    }
    if (lines.some((l) => l.letter === letter)) errors.push(`Error of ${letter} given twice: the last one is used.`);
    const k = lines.findIndex((l) => l.letter === letter);
    if (k >= 0) lines.splice(k, 1);
    lines.push({ letter, formula: e });
  }
  return { lines, errors };
}

// The error of f at one point: vars the values of the inputs (changed and put back), sig the error of each input
export function errorAt(f: (v: Record<string, number>) => number, vars: Record<string, number>, sig: Record<string, number>): number {
  let s2 = 0;
  for (const k in sig) {
    const s = Math.abs(sig[k]);
    if (!(s > 0)) continue;
    const v = vars[k];
    if (!Number.isFinite(v)) return NaN;
    const h = Math.max(Math.abs(v) * 1e-6, s * 1e-4, 1e-300);
    vars[k] = v + h;
    const a = f(vars);
    vars[k] = v - h;
    const b = f(vars);
    vars[k] = v;
    s2 += (((a - b) / (2 * h)) * s) ** 2;
  }
  return Math.sqrt(s2);
}
