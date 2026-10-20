// LaTeX as MathML, by MathJax's TeX reader alone (no fonts, so it runs in the scripts too): the Note's exports (HTML,
// PDF: the browser draws it; Word: made into its own equations, noteMath.ts). The same TeX packages as the drawings.
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { SerializedMmlVisitor } from '@mathjax/src/js/core/MmlTree/SerializedMmlVisitor.js';
import { STATE } from '@mathjax/src/js/core/MathItem.js';
import type { MmlNode } from '@mathjax/src/js/core/MmlTree/MmlNode.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/js/input/tex/braket/BraketConfiguration.js';
import '@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js';
import '@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js';
import '@mathjax/src/js/input/tex/upgreek/UpgreekConfiguration.js';
import '@mathjax/src/js/input/tex/gensymb/GensymbConfiguration.js';
import '@mathjax/src/js/input/tex/units/UnitsConfiguration.js';
import '@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js';
import '@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js';

// (no “noundefined”: a command it does not know is an error, shown as such)
export const PACKAGES = ['base', 'ams', 'newcommand', 'color', 'boldsymbol', 'cancel', 'braket', 'mhchem', 'physics', 'upgreek', 'gensymb', 'units', 'textmacros', 'mathtools'];

// an error of the LaTeX: thrown (the caller shows it as it is)
const rethrow = (_jax: unknown, err: Error) => {
  throw err;
};
export const texInput = () => new TeX({ packages: PACKAGES, formatError: rethrow });

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', { InputJax: texInput() });
const visitor = new SerializedMmlVisitor();

// the formula as MathML (an error: thrown); display: on a line of its own
export function texToMathml(tex: string, display: boolean): string {
  const tree = doc.convert(tex || '\\,', { display, end: STATE.CONVERT }) as MmlNode;
  return visitor
    .visitTree(tree)
    .replace(/ data-(latex|latex-item|mjx-[\w-]+)="[^"]*"/g, '')
    .replace(/>\n\s*</g, '><');
}
