// The sizes of the formulas drawn so far (pure: the evaluation measures the texts of a figure with them, in the worker
// too). The drawing side (store.ts) fills them as MathJax draws; a formula not drawn yet: a guess from its LaTeX. The
// version grows with every size learnt, so the results that measured a formula are computed again (evaluate.ts).
// the math font: sans (Fira), serif (STIX Two, Times-like) or the look of LaTeX (New Computer Modern); the user's
// choice: auto follows the text's font
export type MathFace = 'sans' | 'serif' | 'latex';
export type MathFontChoice = 'auto' | MathFace;
export const MATH_FACE_NAMES: Record<MathFace, string> = { sans: 'sans serif, Fira', serif: 'serif, STIX Two', latex: 'LaTeX look, Computer Modern' };

// the math font for a text font: chosen, or the one that looks like it (a sans font: Fira; Times and the other serif
// fonts: STIX Two; Computer Modern and the LaTeX fonts: New Computer Modern)
const LATEX_FONTS = /computer modern|cmu |latin modern|lmroman|new cm|newcm/i;
const SERIF_FONTS = /times|cambria|caladea|georgia|garamond|palatino|book antiqua|baskerville|bodoni|century|charter|constantia|didot|minion|stix|libertin|serif/i;
export function mathFace(family: string | undefined, choice: MathFontChoice | undefined): MathFace {
  if (choice && choice !== 'auto') return choice;
  const names = (family ?? '').split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
  if (LATEX_FONTS.test(names[0] ?? '')) return 'latex';
  // the kind the font says it is at the end of its list (“Arial, Helvetica, sans-serif”), else its name
  const kind = names[names.length - 1]?.toLowerCase();
  if (kind === 'sans-serif' || kind === 'monospace') return 'sans';
  if (kind === 'serif') return 'serif';
  return /sans/i.test(names[0] ?? '') || !SERIF_FONTS.test(names[0] ?? '') ? 'sans' : 'serif';
}

// in em of the text: width, height above the baseline, depth under it
export type MathSize = { w: number; h: number; d: number };

const known = new Map<string, MathSize>();
let version = 0;
// asked since the last reset (the evaluation of a node: whether its result depends on the sizes)
let asked = false;

export const mathKey = (tex: string, display: boolean, face: MathFace) => `${face}${display ? 'D' : 'I'}${tex}`;
export const mathSizesVersion = () => version;
export function setMathSizes(list: [string, MathSize][]) {
  let added = false;
  for (const [k, s] of list) {
    const old = known.get(k);
    if (old && old.w === s.w && old.h === s.h && old.d === s.d) continue;
    known.set(k, s);
    added = true;
  }
  if (added) version++;
}
export const allMathSizes = (): [string, MathSize][] => [...known];
export function resetMathAsked(): boolean {
  const was = asked;
  asked = false;
  return was;
}
export const markMathAsked = () => void (asked = true);

// a guess: about half an em a character (a command such as \alpha one character), taller with a fraction
function guess(tex: string, display: boolean): MathSize {
  const plain = tex
    .replace(/\\(left|right|mathrm|mathbf|mathit|text|operatorname|displaystyle|,|;|!|quad|qquad)\b/g, '')
    .replace(/\\[A-Za-z]+/g, 'x')
    .replace(/[{}^_\s]/g, '');
  const frac = /\\[dt]?frac|\\binom|\\over\b/.test(tex);
  const big = display || /\\(sum|prod|int|oint)\b/.test(tex);
  return { w: Math.max(0.3, plain.length * 0.55), h: frac ? 1.25 : big ? 1.1 : 0.75, d: frac ? 0.7 : big ? 0.5 : 0.25 };
}
export function mathSize(tex: string, display: boolean, face: MathFace): MathSize {
  asked = true;
  return known.get(mathKey(tex, display, face)) ?? guess(tex, display);
}
