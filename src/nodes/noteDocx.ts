// A Note's document as a Word file (.docx, OOXML), written here: the styles (Normal, Heading 1–3, Quote, Caption) in
// styles.xml, every paragraph with its alignment, spacing and indent, every run with its font, size, bold, italic,
// underline, strike, superscript / subscript, colour and highlight; links; bulleted and numbered lists (Word's own
// numbering, nested); tables (merged cells kept); a text box as a framed one-cell table; figures and pictures as
// pictures in their paragraph, each with its caption numbered by Word (a SEQ field). Pure: the pictures come as bytes
// from the caller (the live figures drawn by it).
import { strToU8, zipSync, type Zippable } from 'fflate';
import { INDENT_STEP, PICTURES, RICH_BASE, placeOf, type Place, type RichDoc, type RichMark } from './richDoc.ts';

// a picture ready for the file: its bytes, their kind, its size in pt
export type DocxPicture = { bytes: Uint8Array; ext: 'png' | 'jpeg'; w: number; h: number };
// the formulas (when any): a formula's Word equation (OMML), inline or on its own line
export type DocxMath = (latex: string, display: boolean) => string | null;

const PAGE = { w: 11906, h: 16838, margin: 1134 }; // A4, 20 mm margins (twips)
const TEXT_W_PT = (PAGE.w - 2 * PAGE.margin) / 20;
const EMU = 12700; // per pt

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c: unknown): string | null => {
  if (typeof c !== 'string') return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()) ?? /^#?([0-9a-f]{3})$/i.exec(c.trim());
  if (m) return (m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1]).toUpperCase();
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(c);
  return rgb ? [rgb[1], rgb[2], rgb[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
};
const ptOf = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? (v.endsWith('px') ? (n * 72) / 96 : n) : null;
};
// the first family of a CSS font list
const fontName = (v: unknown) => (typeof v === 'string' && v ? v.split(',')[0].trim().replace(/^['"]|['"]$/g, '') : null);

type Ctx = {
  rels: string[]; // the relations of the document (links, pictures)
  media: Zippable;
  nums: string[]; // the numbering instances (w:num), one per list
  picture: (n: RichDoc) => DocxPicture | null;
  math?: DocxMath;
  figure: number; // the pictures numbered so far
};

const rel = (ctx: Ctx, type: string, target: string, external = false) => {
  const id = `rId${ctx.rels.length + 10}`;
  ctx.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${esc(target)}"${external ? ' TargetMode="External"' : ''}/>`);
  return id;
};

function runProps(marks: RichMark[] | undefined, extra = ''): string {
  const p: string[] = [];
  for (const m of marks ?? []) {
    const a = m.attrs ?? {};
    if (m.type === 'bold') p.push('<w:b/>');
    else if (m.type === 'italic') p.push('<w:i/>');
    else if (m.type === 'underline') p.push('<w:u w:val="single"/>');
    else if (m.type === 'strike') p.push('<w:strike/>');
    else if (m.type === 'superscript') p.push('<w:vertAlign w:val="superscript"/>');
    else if (m.type === 'subscript') p.push('<w:vertAlign w:val="subscript"/>');
    else if (m.type === 'code') p.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>');
    else if (m.type === 'highlight') {
      const c = hex(a.color) ?? 'FFF59D';
      p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${c}"/>`);
    } else if (m.type === 'textStyle') {
      const f = fontName(a.fontFamily);
      if (f) p.push(`<w:rFonts w:ascii="${esc(f)}" w:hAnsi="${esc(f)}" w:cs="${esc(f)}"/>`);
      const c = hex(a.color);
      if (c) p.push(`<w:color w:val="${c}"/>`);
      const sz = ptOf(a.fontSize);
      if (sz) p.push(`<w:sz w:val="${Math.round(sz * 2)}"/><w:szCs w:val="${Math.round(sz * 2)}"/>`);
      const bg = hex(a.backgroundColor);
      if (bg) p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>`);
    }
  }
  // Word wants the properties in its order: fonts, b, i, strike, color, sz, u, shd, vertAlign
  const order = ['w:rStyle', 'w:rFonts', 'w:b/', 'w:i/', 'w:strike', 'w:color', 'w:sz ', 'w:szCs', 'w:u ', 'w:shd', 'w:vertAlign'];
  const all = [extra, ...p].filter(Boolean);
  all.sort((x, y) => order.findIndex((o) => x.startsWith(`<${o}`)) - order.findIndex((o) => y.startsWith(`<${o}`)));
  return all.length ? `<w:rPr>${all.join('')}</w:rPr>` : '';
}

function runs(nodes: RichDoc[] | undefined, ctx: Ctx, extra = ''): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'hardBreak') return '<w:r><w:br/></w:r>';
      if (n.type === 'inlineMath' && ctx.math) return ctx.math(String(n.attrs?.latex ?? ''), false) ?? '';
      if (n.type !== 'text') return runs(n.content, ctx, extra);
      const link = n.marks?.find((m) => m.type === 'link');
      const href = typeof link?.attrs?.href === 'string' && /^(https?:|mailto:)/i.test(link.attrs.href) ? link.attrs.href : null;
      const r = `<w:r>${runProps(n.marks, href ? `${extra}<w:rStyle w:val="Hyperlink"/>` : extra)}<w:t xml:space="preserve">${esc(n.text ?? '')}</w:t></w:r>`;
      return href ? `<w:hyperlink r:id="${rel(ctx, 'hyperlink', href, true)}">${r}</w:hyperlink>` : r;
    })
    .join('');
}

function paraProps(a: Record<string, unknown> | undefined, style?: string, more = ''): string {
  const o = a ?? {};
  const p: string[] = [];
  if (style) p.push(`<w:pStyle w:val="${style}"/>`);
  if (more) p.push(more);
  const sp: string[] = [];
  if (typeof o.spaceBefore === 'number') sp.push(`w:before="${Math.round(o.spaceBefore * 20)}"`);
  if (typeof o.spaceAfter === 'number') sp.push(`w:after="${Math.round(o.spaceAfter * 20)}"`);
  const lh = typeof o.lineHeight === 'string' ? parseFloat(o.lineHeight) : NaN;
  if (Number.isFinite(lh)) sp.push(`w:line="${Math.round(lh * 240)}" w:lineRule="auto"`);
  if (sp.length) p.push(`<w:spacing ${sp.join(' ')}/>`);
  if (typeof o.indent === 'number' && o.indent > 0) p.push(`<w:ind w:left="${o.indent * INDENT_STEP * 20}"/>`);
  const jc = o.textAlign === 'center' ? 'center' : o.textAlign === 'right' ? 'right' : o.textAlign === 'justify' ? 'both' : null;
  if (jc) p.push(`<w:jc w:val="${jc}"/>`);
  return p.length ? `<w:pPr>${p.join('')}</w:pPr>` : '';
}

const picturePara = (pic: DocxPicture, width: number, align: string, ctx: Ctx, name: string, frame = 100) => {
  const id = rel(ctx, 'image', `media/image${ctx.rels.length + 10}.${pic.ext}`);
  const file = ctx.rels[ctx.rels.length - 1].match(/Target="([^"]+)"/)![1];
  ctx.media[`word/${file}`] = pic.bytes;
  const wPt = (((TEXT_W_PT * frame) / 100) * Math.min(100, Math.max(5, width))) / 100;
  const hPt = (wPt * pic.h) / (pic.w || 1);
  const [cx, cy] = [Math.round(wPt * EMU), Math.round(hPt * EMU)];
  const n = ctx.rels.length;
  const jc = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  return (
    `<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/><w:jc w:val="${jc}"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="${esc(name)}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${n}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
};

// a placed block (a figure with the text beside it, a box, a table): its width, its place, and — with the text beside it — a
// floating table (Word wraps the text around it); the empty paragraph after a table that does not float (two tables
// one after the other would join)
const tblPlace = (p: Place) =>
  (p.wrap ? `<w:tblpPr w:leftFromText="${p.align === 'right' ? 200 : 0}" w:rightFromText="${p.align === 'left' ? 200 : 0}" w:vertAnchor="text" w:horzAnchor="margin" w:tblpXSpec="${p.align}" w:tblpY="1"/>` : '') +
  `<w:tblW w:w="${Math.round(p.width * 50)}" w:type="pct"/><w:jc w:val="${p.align}"/>`;
const after = (p: Place) => (p.wrap ? '' : '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>');

function blocks(list: RichDoc[] | undefined, ctx: Ctx, level = 0, num?: string): string {
  return (list ?? []).map((n) => block(n, ctx, level, num)).join('');
}

function block(n: RichDoc, ctx: Ctx, level: number, num?: string): string {
  const a = n.attrs ?? {};
  const kids = n.content;
  if (PICTURES.has(n.type)) {
    const k = ++ctx.figure;
    const pic = ctx.picture(n);
    const caption = typeof a.caption === 'string' ? a.caption : '';
    const place = placeOf(a, 100, 'center');
    // floating: the picture fills its frame (a table of one cell, no border), the caption under it in the frame
    const body = pic ? picturePara(pic, place.wrap ? 100 : place.width, place.wrap ? 'center' : place.align, ctx, `Figure ${k}`, place.wrap ? place.width : 100) : `<w:p>${paraProps({}, 'Caption')}<w:r><w:t>(the figure is no longer in the project)</w:t></w:r></w:p>`;
    const cap = caption ? `<w:p>${paraProps({ textAlign: place.wrap ? 'center' : place.align }, 'Caption')}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Figure </w:t></w:r><w:fldSimple w:instr=" SEQ Figure \\* ARABIC "><w:r><w:rPr><w:b/></w:rPr><w:t>${k}</w:t></w:r></w:fldSimple><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">. </w:t></w:r><w:r><w:t xml:space="preserve">${esc(caption)}</w:t></w:r></w:p>` : '';
    if (!place.wrap) return body + cap;
    const none = 'w:val="nil"';
    return `<w:tbl><w:tblPr>${tblPlace(place)}<w:tblBorders>${['top', 'left', 'bottom', 'right'].map((x) => `<w:${x} ${none}/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol/></w:tblGrid><w:tr><w:tc>${body}${cap}</w:tc></w:tr></w:tbl>`;
  }
  switch (n.type) {
    case 'paragraph': {
      const list = num ? `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${num}"/></w:numPr>` : '';
      return `<w:p>${paraProps(a, num ? 'ListParagraph' : undefined, list)}${runs(kids, ctx)}</w:p>`;
    }
    case 'heading':
      return `<w:p>${paraProps(a, `Heading${Math.min(3, Math.max(1, Number(a.level) || 1))}`)}${runs(kids, ctx)}</w:p>`;
    case 'blockquote':
      return (kids ?? []).map((p) => (p.type === 'paragraph' ? `<w:p>${paraProps(p.attrs, 'Quote')}${runs(p.content, ctx)}</w:p>` : block(p, ctx, level))).join('');
    case 'codeBlock':
      return `<w:p>${runs(kids, ctx, '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>')}</w:p>`;
    case 'horizontalRule':
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>';
    case 'bulletList':
    case 'orderedList': {
      // a list: its own numbering (a numbered one starts at its start), its items at this level, the lists inside them deeper
      const abstract = n.type === 'bulletList' ? 0 : 1;
      const id = String(ctx.nums.length + 1);
      const start = Number(a.start) || 1;
      ctx.nums.push(`<w:num w:numId="${id}"><w:abstractNumId w:val="${abstract}"/>${abstract ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${start}"/></w:lvlOverride>` : ''}</w:num>`);
      return (kids ?? []).map((li) => (li.content ?? []).map((b) => (b.type === 'bulletList' || b.type === 'orderedList' ? block(b, ctx, Math.min(8, level + 1)) : block(b, ctx, level, id))).join('')).join('');
    }
    case 'textBox': {
      const place = placeOf(a, 100, 'left');
      const bw = Number(a.borderWidth ?? 0.75);
      const bc = hex(a.border);
      const border = bc && bw > 0 ? `w:val="single" w:sz="${Math.max(2, Math.round(bw * 8))}" w:color="${bc}"` : 'w:val="nil"';
      const fill = hex(a.fill);
      const pad = Math.round((Number(a.padding ?? 6) || 0) * 20);
      return (
        `<w:tbl><w:tblPr>${tblPlace(place)}<w:tblBorders>${['top', 'left', 'bottom', 'right'].map((s) => `<w:${s} ${border}/>`).join('')}</w:tblBorders>` +
        `<w:tblCellMar><w:top w:w="${pad}" w:type="dxa"/><w:left w:w="${pad}" w:type="dxa"/><w:bottom w:w="${pad}" w:type="dxa"/><w:right w:w="${pad}" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
        `<w:tblGrid><w:gridCol/></w:tblGrid><w:tr><w:tc><w:tcPr>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${blocks(kids, ctx) || '<w:p/>'}</w:tc></w:tr></w:tbl>${after(place)}`
      );
    }
    case 'table': {
      // the grid: as many columns as the widest row; a cell merged down: its place kept by the cells under it (vMerge)
      const rows = kids ?? [];
      const cols = Math.max(1, ...rows.map((r) => (r.content ?? []).reduce((s, c) => s + (Number(c.attrs?.colspan) || 1), 0)));
      const down = new Array<number>(cols).fill(0); // rows still covered by a cell above, per column
      const downSpan = new Array<number>(cols).fill(1);
      const colW = Math.floor((PAGE.w - 2 * PAGE.margin) / cols);
      const trs = rows.map((r) => {
        const cells: string[] = [];
        let col = 0;
        const own = [...(r.content ?? [])];
        while (col < cols) {
          if (down[col] > 0) {
            down[col]--;
            cells.push(`<w:tc><w:tcPr>${downSpan[col] > 1 ? `<w:gridSpan w:val="${downSpan[col]}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`);
            col += downSpan[col];
            continue;
          }
          const c = own.shift();
          if (!c) {
            cells.push('<w:tc><w:p/></w:tc>');
            col++;
            continue;
          }
          const span = Number(c.attrs?.colspan) || 1;
          const rowspan = Number(c.attrs?.rowspan) || 1;
          if (rowspan > 1) {
            down[col] = rowspan - 1;
            downSpan[col] = span;
          }
          const head = c.type === 'tableHeader';
          const inner = (c.content ?? []).map((p) => (p.type === 'paragraph' ? `<w:p>${paraProps(p.attrs)}${runs(p.content, ctx, head ? '<w:b/>' : '')}</w:p>` : block(p, ctx, 0))).join('') || '<w:p/>';
          cells.push(`<w:tc><w:tcPr><w:tcW w:w="${colW * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${rowspan > 1 ? '<w:vMerge w:val="restart"/>' : ''}${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F0F0F0"/>' : ''}</w:tcPr>${inner}</w:tc>`);
          col += span;
        }
        return `<w:tr>${cells.join('')}</w:tr>`;
      });
      const b = 'w:val="single" w:sz="6" w:color="777777"';
      return (
        `<w:tbl><w:tblPr>${tblPlace(placeOf(a, 100, 'center'))}<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} ${b}/>`).join('')}</w:tblBorders>` +
        `<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${colW}"/>`.repeat(cols)}</w:tblGrid>${trs.join('')}</w:tbl>${after(placeOf(a, 100, 'center'))}`
      );
    }
    case 'blockMath':
      return ctx.math ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${ctx.math(String(a.latex ?? ''), true) ?? ''}</w:p>` : '';
    default:
      return blocks(kids, ctx, level, num);
  }
}

const STYLES = (font: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${RICH_BASE.size * 2}"/><w:szCs w:val="${RICH_BASE.size * 2}"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="${RICH_BASE.after * 20}" w:line="${Math.round(RICH_BASE.lineHeight * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C9C9C9"/></w:pBdr><w:ind w:left="240"/></w:pPr><w:rPr><w:color w:val="444444"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="200"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1A5FB4"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;

const lvl = (k: number, numbered: boolean) =>
  `<w:lvl w:ilvl="${k}"><w:start w:val="1"/><w:numFmt w:val="${numbered ? ['decimal', 'lowerLetter', 'lowerRoman'][k % 3] : 'bullet'}"/><w:lvlText w:val="${numbered ? `%${k + 1}.` : ['•', '◦', '▪'][k % 3]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 * (k + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;

// the document as the bytes of a .docx
export function noteDocx(doc: RichDoc, picture: (n: RichDoc) => DocxPicture | null, math?: DocxMath, title = 'Note'): Uint8Array {
  const ctx: Ctx = { rels: [], media: {}, nums: [], picture, math, figure: 0 };
  const body = blocks(doc.content, ctx);
  const font = fontName(RICH_BASE.font) ?? 'Arial';
  const ns =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${ns}><w:body>${body}<w:sectPr><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/><w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0">${Array.from({ length: 9 }, (_, k) => lvl(k, false)).join('')}</w:abstractNum><w:abstractNum w:abstractNumId="1">${Array.from({ length: 9 }, (_, k) => lvl(k, true)).join('')}</w:abstractNum>${ctx.nums.join('')}</w:numbering>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${ctx.rels.join('')}</Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title><dc:creator>SciPlotFlow</dc:creator></cp:coreProperties>`;
  return zipSync({
    '[Content_Types].xml': strToU8(types),
    '_rels/.rels': strToU8(rootRels),
    'docProps/core.xml': strToU8(core),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(STYLES(font)),
    'word/numbering.xml': strToU8(numbering),
    'word/_rels/document.xml.rels': strToU8(docRels),
    ...ctx.media,
  });
}
