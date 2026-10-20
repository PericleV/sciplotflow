// LaTeX drawn by MathJax as SVG: curves, no font needed, so it looks the same on screen and in SVG, PNG, PDF and Word
// files; in one of three math fonts (sans: Fira; serif: STIX Two, like Times; latex: New Computer Modern). Loaded
// only when a formula is first met (store.ts). The fonts load the rare characters they need when they need them
// (their dynamic files, served here by Vite's glob imports).
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { texInput } from './mathml.ts';
import type { MathBox } from './store.ts';
import type { MathFace } from './sizes.ts';

// “@mathjax/mathjax-fira-font/js/svg/dynamic/x.js” → its module
const DYNAMIC = import.meta.glob(['/node_modules/@mathjax/mathjax-fira-font/mjs/svg/dynamic/*.js', '/node_modules/@mathjax/mathjax-stix2-font/mjs/svg/dynamic/*.js', '/node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic/*.js']);
mathjax.asyncLoad = (name: string) => {
  const load = DYNAMIC[`/node_modules/${name.replace(/\/js\//, '/mjs/').replace(/(\.js)?$/, '.js')}`];
  return load ? load() : Promise.reject(new Error(`No MathJax file ${name}`));
};

const adaptor = liteAdaptor();
// every font loaded only when a formula needs it
const FONTS: Record<MathFace, () => Promise<unknown>> = {
  sans: () => import('@mathjax/mathjax-fira-font/js/svg.js').then((m) => m.MathJaxFiraFont),
  serif: () => import('@mathjax/mathjax-stix2-font/js/svg.js').then((m) => m.MathJaxStix2Font),
  latex: () => import('@mathjax/mathjax-newcm-font/js/svg.js').then((m) => m.MathJaxNewcmFont),
};
type Doc = ReturnType<typeof mathjax.document>;
const docs = new Map<MathFace, Promise<Doc>>();
const docOf = (face: MathFace): Promise<Doc> => {
  let d = docs.get(face);
  if (!d) {
    // (one piece: no breaking of an inline formula into lines)
    d = FONTS[face]().then((fontData) => mathjax.document('', { InputJax: texInput(), OutputJax: new SVG({ fontData, fontCache: 'none', linebreaks: { inline: false } }) }));
    docs.set(face, d);
  }
  return d;
};

// the formula as SVG: what goes inside a <g> whose origin is at the start of the baseline (in 1/1000 em, y down as in
// SVG), its width, height above the baseline and depth under it in em
export async function texToSvg(tex: string, display: boolean, face: MathFace): Promise<MathBox> {
  const node = await (await docOf(face)).convertPromise(tex, { display, em: 16, ex: 8, containerWidth: 1e6 });
  // the container holds the <svg>
  const svg = adaptor.firstChild(node) as Parameters<typeof adaptor.innerHTML>[0];
  const [x0, y0, w, h] = (adaptor.getAttribute(svg, 'viewBox') ?? '0 0 0 0').split(/\s+/).map(Number);
  return { body: adaptor.innerHTML(svg), x0: x0 / 1000, w: w / 1000, h: -y0 / 1000, d: (h + y0) / 1000 };
}
