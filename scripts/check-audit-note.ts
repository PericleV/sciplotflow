// The audit of 2026-11-17, section Notes: the fixes of the Note checked (N1–N7 of docs/AUDIT-2026-11-17.md: the control
// characters a Word file cannot carry, the run properties once each and in Word's order, a code block's lines, a
// Markdown table with merged cells, a block's attributes through the clipboard, a figure at its own size, every figure
// numbered; and the CSS values of a project checked before they reach a style)
import { strFromU8, unzipSync } from 'fflate';
import { noteDocx } from '../src/nodes/noteDocx.ts';
import { noteMarkdown } from '../src/nodes/noteMd.ts';
import { latexToOmml } from '../src/nodes/noteMath.ts';
import { boxCss, dataAttr, figureWidthPct, missingText, safeColor, safeFont, safeSize, xmlSafe, type RichDoc } from '../src/nodes/richDoc.ts';
import { toPt } from '../src/figure/spec.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkAuditNote(ok: Ok) {
  const t = (text: string, marks?: object[]): RichDoc => ({ type: 'text', text, ...(marks ? { marks: marks as RichDoc['marks'] } : {}) });
  const p = (content: RichDoc[], attrs?: Record<string, unknown>): RichDoc => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content });
  const pic = { bytes: new Uint8Array([137, 80, 78, 71]), ext: 'png' as const, w: 300, h: 200 };
  const docXml = (content: RichDoc[], picture: (n: RichDoc) => typeof pic | null = () => pic) => strFromU8(unzipSync(noteDocx({ type: 'doc', content }, picture, latexToOmml, 'T'))['word/document.xml']);
  // eslint-disable-next-line no-control-regex
  const notXml = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

  // ---- N1: a control character (pasted from a PDF or Word) left out of every text of the Word file ----
  {
    const dx = docXml([
      { type: 'heading', attrs: { level: 1 }, content: [t('ctrl\u000Bvt\u0001 \uFFFE')] },
      { type: 'figureRef', attrs: { node: 'p', caption: 'cap\u0007tion' } },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p([t('cell\u001F')])] }] }] },
      p([{ type: 'inlineMath', attrs: { latex: '\\text{a\u0002b}' } }]),
    ]);
    ok(!notXml.test(dx) && dx.includes('ctrlvt') && dx.includes('caption') && !notXml.test(latexToOmml('\\text{x\u0003}', false)) && xmlSafe('a\tb\n😀\uD800c') === 'a\tb\n😀c', 'Note ▸ Word, N1: control characters, U+FFFE and lone surrogates left out of the text, captions, cells and equations (tab, newline and emoji kept)');
  }

  // ---- N2: the run properties each once, in the order of the schema (CT_RPr) ----
  {
    const dx = docXml([
      p([t('a', [{ type: 'code' }, { type: 'textStyle', attrs: { fontFamily: 'Georgia', color: '#cc0000', backgroundColor: '#00ff00' } }]), t('b', [{ type: 'highlight', attrs: { color: '#ffff00' } }, { type: 'textStyle', attrs: { backgroundColor: '#00ff00' } }, { type: 'underline' }, { type: 'bold' }])]),
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p([t('h', [{ type: 'bold' }]), t('l', [{ type: 'link', attrs: { href: 'https://example.org' } }])])] }] }] },
    ]);
    const order = ['rStyle', 'rFonts', 'b', 'i', 'strike', 'color', 'sz', 'szCs', 'u', 'shd', 'vertAlign'];
    const props = [...dx.matchAll(/<w:rPr>(.*?)<\/w:rPr>/g)].map((m) => [...m[1].matchAll(/<w:(\w+)/g)].map((x) => x[1]));
    const right = props.every((names) => new Set(names).size === names.length && names.every((n, i) => i === 0 || order.indexOf(names[i - 1]) < order.indexOf(n)));
    ok(right && props.some((n) => n.join() === 'rStyle,b') && props.some((n) => n.join() === 'rFonts,color,shd') && dx.includes('Courier New') && !dx.includes('Georgia'), `Note ▸ Word, N2: bold in a header once, a link's style first, code with a font one rFonts, a highlight with a background one shd (${props.map((n) => n.join('+')).join(' | ')})`);
  }

  // ---- N3: a code block keeps its lines (and its tabs) ----
  {
    const dx = docXml([{ type: 'codeBlock', content: [t('line1\nline2\n\tx')] }]);
    ok(dx.includes('<w:t xml:space="preserve">line1</w:t><w:br/><w:t xml:space="preserve">line2</w:t><w:br/><w:tab/><w:t xml:space="preserve">x</w:t>'), 'Note ▸ Word, N3: a code block\'s lines as line breaks, its tabs as tabs');
  }

  // ---- N4: a Markdown table — a cell merged down leaves its place empty under it; a line break, a | in code ----
  {
    const cell = (kids: RichDoc[], attrs?: Record<string, unknown>): RichDoc => ({ type: 'tableCell', ...(attrs ? { attrs } : {}), content: [p(kids)] });
    const md = noteMarkdown(
      {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              { type: 'tableRow', content: [cell([t('h1')]), cell([t('h2')]), cell([t('h3')])] },
              { type: 'tableRow', content: [cell([t('tall')], { rowspan: 2 }), cell([t('r2c2'), { type: 'hardBreak' }, t('br')]), cell([t('x|y', [{ type: 'code' }]), { type: 'inlineMath', attrs: { latex: '|v|' } }])] },
              { type: 'tableRow', content: [cell([t('r3c2')]), cell([t('r3c3')])] },
            ],
          },
          { type: 'codeBlock', content: [t('a*b `c`')] },
        ],
      },
      () => null,
    );
    ok(md.includes('| tall | r2c2<br>br | `x\\|y`$\\|v\\|$ |\n|  | r3c2 | r3c3 |') && md.includes('```\na*b `c`\n```'), `Note ▸ Markdown, N4: under a cell merged down its place stays empty, a line break in a cell as <br>, | escaped in code and formulas; a code block's text as it is (${JSON.stringify(md)})`);
  }

  // ---- N5: a block's attributes through the clipboard's HTML (data-…), older HTML read with the defaults ----
  {
    const attrs = { width: dataAttr('width', 100), wrap: dataAttr('wrap', false), caption: dataAttr('caption', ''), borderWidth: dataAttr('borderWidth', 0.75), fill: dataAttr('fill', '') };
    const block = { width: 42, wrap: true, caption: 'The spectrum.', borderWidth: 1.5, fill: '#fff3c4' };
    const html: Record<string, string> = Object.assign({}, ...Object.values(attrs).map((a) => a.renderHTML(block)));
    const el = (h: Record<string, string>) => ({ getAttribute: (k: string) => (k in h ? h[k] : null) });
    const back = Object.fromEntries(Object.entries(attrs).map(([k, a]) => [k, a.parseHTML(el(html))]));
    const old = Object.fromEntries(Object.entries(attrs).map(([k, a]) => [k, a.parseHTML(el({}))]));
    ok(JSON.stringify(back) === JSON.stringify(block) && html['data-border-width'] === '1.5' && JSON.stringify(old) === JSON.stringify({ width: 100, wrap: false, caption: '', borderWidth: 0.75, fill: '' }), `Note ▸ editor, N5: a figure's caption, width, wrap and a box's border and fill kept through the clipboard, older HTML read with the defaults (${JSON.stringify(html)})`);
  }

  // ---- N6: a figure put into a note at its own width (85 mm of a 170 mm text: half), at most the text's ----
  {
    ok(figureWidthPct(toPt(85, 'mm')) === 50 && figureWidthPct(toPt(250, 'mm')) === 100 && figureWidthPct(toPt(10, 'mm')) === 10 && figureWidthPct(NaN) === 100, `Note, N6: a new figure at its own size (85 mm → ${figureWidthPct(toPt(85, 'mm'))} % of the text), at most 100 %`);
  }

  // ---- N7: every figure numbered, with or without a caption (Word: a SEQ field each), as in the editor ----
  {
    const blocks: RichDoc[] = [
      { type: 'figureRef', attrs: { node: 'a', caption: 'First.' } },
      { type: 'figureRef', attrs: { node: 'b', caption: '' } },
      { type: 'imageBlock', attrs: { src: 'data:image/png;base64,', caption: '' } },
    ];
    const dx = docXml(blocks, (n) => (n.attrs?.node === 'b' ? null : pic));
    const md = noteMarkdown({ type: 'doc', content: blocks }, (_n, k) => `figures/figure-${k}.png`, (id) => id === 'a');
    ok((dx.match(/SEQ Figure/g) ?? []).length === 3 && dx.includes('<w:t>3</w:t>') && dx.includes('The figure of this node is not ready') && md.includes('*Figure 1. First.*') && md.includes('*Figure 2.*') && md.includes('*Figure 3.*'), 'Note ▸ exports, N7: every figure and picture its "Figure k." (Word: a SEQ field each), its caption after it; one that cannot be drawn says why');
    ok(missingText({ type: 'figureRef', attrs: { node: 'x' } }, false) === 'The node of this figure was removed.' && missingText({ type: 'figureRef', attrs: { node: 'x' } }, true).startsWith('The figure of this node is not ready') && missingText({ type: 'imageBlock' }) === 'The picture could not be read.', 'Note ▸ exports: a figure that cannot be drawn says why, as the editor does (node removed, figure not ready, picture unreadable)');
  }

  // ---- CSS from a project: only colours, sizes and font families reach a style ----
  {
    const evil = 'red;background:url(https://example.org/x)';
    ok(
      safeColor(evil) === undefined && safeColor('#cc0000') === '#cc0000' && safeColor('rgba(1, 2, 3, 0.5)') === 'rgba(1, 2, 3, 0.5)' && safeColor('steelblue') === 'steelblue' && safeColor('url(x)') === undefined &&
        safeSize('12pt') === '12pt' && safeSize('1.15') === '1.15' && safeSize('12pt;color:red') === undefined && safeFont('"Times New Roman", serif') === '"Times New Roman", serif' && safeFont('Arial;background:url(x)') === undefined &&
        boxCss({ border: evil, fill: 'url(https://example.org/y)' }).border === 'none' && !('background' in boxCss({ fill: evil })),
      'Note: a colour, a size or a font family that would add CSS of its own (url(…), ;) kept out of the node and the HTML export',
    );
  }
}
