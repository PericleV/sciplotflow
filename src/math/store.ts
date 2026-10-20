// The formulas drawn so far, for the figures and the Note. MathJax (tex.ts) loads the first time a formula is met;
// until a formula is drawn mathBox gives null and the drawing waits for it (useMathVersion makes it draw again). Every
// formula drawn gives its size to the measures of the texts (sizes.ts).
import { useSyncExternalStore } from 'react';
import { mathKey, setMathSizes, type MathFace } from './sizes.ts';

export { mathFace, type MathFace, type MathFontChoice } from './sizes.ts';
// a drawn formula: the inside of its <svg> (origin at the start of the baseline, in 1/1000 em), its width, height
// above the baseline and depth under it, in em; x0: where its drawing starts (em)
export type MathBox = { body: string; w: number; h: number; d: number; x0: number };
type Entry = { box?: MathBox; error?: string; wait?: Promise<void> };

let tex: Promise<typeof import('./tex.ts')> | null = null;
const loadTex = () => (tex ??= import('./tex.ts'));
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const f of listeners) f();
};
export const onMathDrawn = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

function entry(src: string, display: boolean, face: MathFace): Entry {
  const key = mathKey(src, display, face);
  let e = cache.get(key);
  if (!e) {
    const made: Entry = {};
    e = made;
    cache.set(key, made);
    // (outside a browser, as in the scripts: not drawn, its place kept)
    if (typeof document === 'undefined') return made;
    made.wait = loadTex()
      .then((m) => m.texToSvg(src, display, face))
      .then(
        (box) => {
          made.box = box;
          setMathSizes([[key, { w: box.w, h: box.h, d: box.d }]]);
        },
        // (MathJax's errors of the LaTeX are not Errors, but have a message)
        (err: unknown) => void (made.error = typeof (err as { message?: unknown })?.message === 'string' ? (err as { message: string }).message : String(err)),
      )
      .finally(() => {
        made.wait = undefined;
        changed();
      });
  }
  return e;
}

// the formula drawn, or null while it is being drawn (or when its LaTeX is wrong: mathError says why)
export function mathBox(src: string, display: boolean, face: MathFace): MathBox | null {
  return entry(src, display, face).box ?? null;
}
export function mathError(src: string, display: boolean, face: MathFace): string | null {
  return entry(src, display, face).error ?? null;
}
// the formula drawn, waiting for it (null: its LaTeX is wrong)
export async function mathBoxAsync(src: string, display: boolean, face: MathFace): Promise<MathBox | null> {
  const e = entry(src, display, face);
  if (e.wait) await e.wait;
  return e.box ?? null;
}
// every formula asked for so far drawn (before a file is saved)
export async function mathReady(): Promise<void> {
  for (;;) {
    const waits = [...cache.values()].map((e) => e.wait).filter(Boolean);
    if (!waits.length) return;
    await Promise.all(waits);
  }
}
// MathJax loaded (a formula can then be read at once: texToMathml)
export const loadMath = () => loadTex().then(() => undefined);

// a drawn formula as an <svg> to put in a page's text: as tall as the text (1 em), on its baseline, in its colour
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function mathSvgHtml(box: MathBox, tex: string): string {
  const f = (v: number) => +v.toFixed(4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(box.w)}em" height="${f(box.h + box.d)}em" viewBox="${f(box.x0 * 1000)} ${f(-box.h * 1000)} ${f(box.w * 1000)} ${f((box.h + box.d) * 1000)}" style="vertical-align: ${f(-box.d)}em; overflow: visible" role="img" aria-label="${attr(tex)}">${box.body}</svg>`;
}

// draws again when a formula is ready
export function useMathVersion(): number {
  return useSyncExternalStore(onMathDrawn, () => version, () => version);
}
