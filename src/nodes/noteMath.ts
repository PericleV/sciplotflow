// The formulas of a Note: LaTeX, read by MathJax, as MathML for the exports (HTML, PDF: the browser draws it, no fonts
// to carry) and, from that MathML, as Word's own equations (OMML) in a .docx, editable there. The MathML read here by a
// small reader of its own (MathJax writes plain XML), so this also runs in the scripts. Covered: rows, identifiers,
// numbers, operators, text, superscripts and subscripts, fractions (and binomials), roots, sums / products / integrals
// with their limits, limits under and over, accents and bars, matrices; the rest as its text.
import { texToMathml } from '../math/mathml.ts';

type El = { tag: string; attrs: Record<string, string>; kids: (El | string)[] };

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unent = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] ?? m)));

// a small XML reader (elements, attributes, text; no comments or CDATA: MathJax writes none)
function parseXml(xml: string): El {
  const root: El = { tag: '#root', attrs: {}, kids: [] };
  const stack = [root];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|([^<]+)/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      if (m[5].trim() || top.tag === 'mtext' || top.tag === 'mi' || top.tag === 'mo' || top.tag === 'mn') top.kids.push(unent(m[5]));
      continue;
    }
    if (m[1]) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = unent(a[2]);
    const el: El = { tag: m[2], attrs, kids: [] };
    top.kids.push(el);
    if (!m[4]) stack.push(el);
  }
  return root;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textOf = (e: El | string): string => (typeof e === 'string' ? e : e.kids.map(textOf).join(''));
const els = (e: El) => e.kids.filter((k): k is El => typeof k !== 'string');

// LaTeX as MathML (an error: the LaTeX shown as it is, in red)
export function latexToMathml(latex: string, display: boolean): string {
  try {
    return texToMathml(latex, display);
  } catch {
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}><mtext mathcolor="#cc0000">${esc(latex)}</mtext></math>`;
  }
}

const NARY = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '⋃', '⋂', '⋁', '⋀']);
const run = (t: string, plain = false) => (t ? `<m:r>${plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">${esc(t)}</m:t></m:r>` : '');

function omml(e: El | string): string {
  if (typeof e === 'string') return run(e);
  const k = els(e);
  const a = (i: number) => (k[i] ? omml(k[i]) : '');
  const naryOf = (base: El | undefined) => {
    const t = base ? textOf(base).trim() : '';
    return base && base.tag === 'mo' && NARY.has(t) ? t : null;
  };
  switch (e.tag) {
    case 'span':
    case 'math':
    case 'semantics':
    case 'mrow':
    case 'mstyle':
    case 'mpadded':
    case 'menclose':
    case '#root':
      return k.filter((x) => x.tag !== 'annotation').map(omml).join('');
    case 'annotation':
    case 'mphantom':
      return '';
    case 'mi':
      return run(textOf(e), e.attrs.mathvariant === 'normal' || textOf(e).length > 1);
    case 'mn':
    case 'mo':
      return run(textOf(e), true);
    case 'mtext':
      return run(textOf(e), true);
    case 'mspace':
      return run(' ', true);
    case 'msup':
      return naryOf(k[0]) ? `<m:nary><m:naryPr><m:chr m:val="${naryOf(k[0])}"/><m:subHide m:val="1"/></m:naryPr><m:sub/><m:sup>${a(1)}</m:sup><m:e/></m:nary>` : `<m:sSup><m:e>${a(0)}</m:e><m:sup>${a(1)}</m:sup></m:sSup>`;
    case 'msub':
      return naryOf(k[0]) ? `<m:nary><m:naryPr><m:chr m:val="${naryOf(k[0])}"/><m:supHide m:val="1"/></m:naryPr><m:sub>${a(1)}</m:sub><m:sup/><m:e/></m:nary>` : `<m:sSub><m:e>${a(0)}</m:e><m:sub>${a(1)}</m:sub></m:sSub>`;
    case 'msubsup':
      return naryOf(k[0]) ? `<m:nary><m:naryPr><m:chr m:val="${naryOf(k[0])}"/><m:limLoc m:val="subSup"/></m:naryPr><m:sub>${a(1)}</m:sub><m:sup>${a(2)}</m:sup><m:e/></m:nary>` : `<m:sSubSup><m:e>${a(0)}</m:e><m:sub>${a(1)}</m:sub><m:sup>${a(2)}</m:sup></m:sSubSup>`;
    case 'munderover':
      return naryOf(k[0]) ? `<m:nary><m:naryPr><m:chr m:val="${naryOf(k[0])}"/><m:limLoc m:val="undOvr"/></m:naryPr><m:sub>${a(1)}</m:sub><m:sup>${a(2)}</m:sup><m:e/></m:nary>` : `<m:limUpp><m:e><m:limLow><m:e>${a(0)}</m:e><m:lim>${a(1)}</m:lim></m:limLow></m:e><m:lim>${a(2)}</m:lim></m:limUpp>`;
    case 'munder':
      return naryOf(k[0]) ? `<m:nary><m:naryPr><m:chr m:val="${naryOf(k[0])}"/><m:limLoc m:val="undOvr"/><m:supHide m:val="1"/></m:naryPr><m:sub>${a(1)}</m:sub><m:sup/><m:e/></m:nary>` : `<m:limLow><m:e>${a(0)}</m:e><m:lim>${a(1)}</m:lim></m:limLow>`;
    case 'mover': {
      const acc = k[1] && k[1].tag === 'mo' ? textOf(k[1]).trim() : '';
      if (e.attrs.accent === 'true' || ['^', '˙', '¨', '~', '˜', '→', '⃗', 'ˉ', '¯', '‾', '´', '`', 'ˇ', '˘'].includes(acc)) {
        if (['¯', 'ˉ', '‾'].includes(acc)) return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${a(0)}</m:e></m:bar>`;
        return `<m:acc><m:accPr><m:chr m:val="${esc(acc === '→' ? '⃗' : acc)}"/></m:accPr><m:e>${a(0)}</m:e></m:acc>`;
      }
      return `<m:limUpp><m:e>${a(0)}</m:e><m:lim>${a(1)}</m:lim></m:limUpp>`;
    }
    case 'mfrac':
      return `<m:f>${e.attrs.linethickness === '0px' || e.attrs.linethickness === '0' ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : ''}<m:num>${a(0)}</m:num><m:den>${a(1)}</m:den></m:f>`;
    case 'msqrt':
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${k.map(omml).join('')}</m:e></m:rad>`;
    case 'mroot':
      return `<m:rad><m:deg>${a(1)}</m:deg><m:e>${a(0)}</m:e></m:rad>`;
    case 'mtable':
      return `<m:m>${k.map((tr) => `<m:mr>${els(tr).map((td) => `<m:e>${omml(td)}</m:e>`).join('')}</m:mr>`).join('')}</m:m>`;
    case 'mtr':
    case 'mtd':
      return k.map(omml).join('');
    default:
      return run(textOf(e));
  }
}

// LaTeX as a Word equation: inline (among the runs of a paragraph) or on its own line
export function latexToOmml(latex: string, display: boolean): string {
  const body = omml(parseXml(latexToMathml(latex, display)));
  return display ? `<m:oMathPara><m:oMath>${body}</m:oMath></m:oMathPara>` : `<m:oMath>${body}</m:oMath>`;
}
