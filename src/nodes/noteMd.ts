// A Note as Markdown: headings, paragraphs, bold, italic, strikethrough, code, links, lists (nested), quotes, rules,
// tables (GitHub's pipes: the first row their header; a merged cell kept in its first place), text boxes as quotes,
// formulas as $…$ and $$…$$, figures and pictures as images of their own files (figures/figure-1.png …) with their
// numbered caption. Superscript, subscript and underline as their HTML tags (Markdown has none); colours, fonts and
// places are not kept. Pure.
import { PICTURES, missingText, xmlSafe, type RichDoc, type RichMark } from './richDoc.ts';

// a text with the characters Markdown reads as marks escaped
const escMd = (s: string) => s.replace(/([\\`*_[\]<>|#])/g, '\\$1');

// cell: in a table's cell (a line break as <br>, a | escaped even in code and formulas: GitHub splits the row first)
function inlineMd(nodes: RichDoc[] | undefined, cell = false): string {
  const bar = (t: string) => (cell ? t.replace(/\|/g, '\\|') : t);
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'hardBreak') return cell ? '<br>' : '  \n';
      if (n.type === 'inlineMath') return `$${bar(xmlSafe(String(n.attrs?.latex ?? '')))}$`;
      if (n.type !== 'text') return inlineMd(n.content, cell);
      const marks = n.marks ?? [];
      const has = (t: string) => marks.some((m: RichMark) => m.type === t);
      const raw = xmlSafe(n.text ?? '');
      if (has('code')) return `\`${bar(raw.replace(/`/g, '\\`'))}\``;
      // the marks go around the text, its spaces kept outside them
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw) ?? ['', '', raw, ''];
      if (!core) return raw;
      let t = escMd(core);
      if (has('superscript')) t = `<sup>${t}</sup>`;
      if (has('subscript')) t = `<sub>${t}</sub>`;
      if (has('underline')) t = `<u>${t}</u>`;
      if (has('strike')) t = `~~${t}~~`;
      if (has('italic')) t = `*${t}*`;
      if (has('bold')) t = `**${t}**`;
      const link = marks.find((m) => m.type === 'link');
      const href = typeof link?.attrs?.href === 'string' && /^(https?:|mailto:)/i.test(link.attrs.href) ? link.attrs.href : null;
      if (href) t = `[${t}](${href})`;
      return lead + t + trail;
    })
    .join('');
}

// file: the name of a figure's or a picture's file (null: none to give); has: a node still in the project (a figure
// that cannot be drawn says why)
export function noteMarkdown(doc: RichDoc, file: (n: RichDoc, k: number) => string | null, has?: (node: string) => boolean): string {
  let figure = 0;
  const out: string[] = [];
  const block = (n: RichDoc, indent = '', quote = ''): string[] => {
    const a = n.attrs ?? {};
    const kids = n.content ?? [];
    const pre = (lines: string[]) => lines.map((l) => (l ? quote + indent + l : quote.trimEnd()));
    if (PICTURES.has(n.type)) {
      const k = ++figure;
      const caption = typeof a.caption === 'string' ? a.caption : '';
      const f = file(n, k);
      // every figure its number (as in the editor), its caption after it
      const missing = `*(${escMd(missingText(n, has?.(String(a.node ?? ''))))})*`;
      return pre([f ? `![${escMd(caption || `Figure ${k}`)}](${f})` : missing, '', `*Figure ${k}.${caption ? ` ${escMd(caption)}` : ''}*`, '']);
    }
    switch (n.type) {
      case 'paragraph':
        return pre([inlineMd(kids), '']);
      case 'heading':
        return pre([`${'#'.repeat(Math.min(3, Math.max(1, Number(a.level) || 1)))} ${inlineMd(kids)}`, '']);
      case 'blockquote':
      case 'textBox': {
        // its lines quoted; after it an empty line out of the quote (else the next block would join it)
        const lines = kids.flatMap((b) => block(b, indent, `${quote}> `));
        while (lines.length && lines[lines.length - 1].trim() === `${quote}>`.trim()) lines.pop();
        return [...lines, quote.trimEnd()];
      }
      case 'codeBlock': {
        // its text as it is (nothing escaped), in a fence longer than any run of backticks in it
        const code = xmlSafe(kids.map((t) => t.text ?? '').join(''));
        const fence = '`'.repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map((m) => m[0].length + 1)));
        return pre([fence, ...code.split('\n'), fence, '']);
      }
      case 'horizontalRule':
        return pre(['---', '']);
      case 'blockMath':
        return pre(['$$', String(a.latex ?? ''), '$$', '']);
      case 'bulletList':
      case 'orderedList': {
        const start = Number(a.start) || 1;
        const lines = kids.flatMap((li, i) => {
          const mark = n.type === 'bulletList' ? '- ' : `${start + i}. `;
          return (li.content ?? []).flatMap((b, j) => {
            if (b.type === 'bulletList' || b.type === 'orderedList') return block(b, `${indent}${' '.repeat(mark.length)}`, quote).filter((l) => l.trim());
            const text = b.type === 'paragraph' ? inlineMd(b.content) : block(b, '', '').join(' ');
            return [quote + indent + (j ? ' '.repeat(mark.length) : mark) + text];
          });
        });
        return [...lines, ''];
      }
      case 'table': {
        // the grid as in the Word file: a cell merged across, empty places after it; merged down, empty places under it
        const text = (c: RichDoc) => (c.content ?? []).map((p) => inlineMd(p.content, true).trim()).filter(Boolean).join('<br>');
        const width = Math.max(1, ...kids.map((r) => (r.content ?? []).reduce((s, c) => s + (Number(c.attrs?.colspan) || 1), 0)));
        const down = new Array<number>(width).fill(0); // rows still covered by a cell above, per column
        const downSpan = new Array<number>(width).fill(1);
        const rows = kids.map((r) => {
          const out: string[] = [];
          const own = [...(r.content ?? [])];
          let col = 0;
          while (col < width) {
            if (down[col] > 0) {
              down[col]--;
              const s = downSpan[col];
              out.push(...new Array<string>(s).fill(''));
              col += s;
              continue;
            }
            const c = own.shift();
            if (!c) {
              out.push('');
              col++;
              continue;
            }
            const span = Math.max(1, Number(c.attrs?.colspan) || 1);
            const rowspan = Number(c.attrs?.rowspan) || 1;
            if (rowspan > 1) {
              down[col] = rowspan - 1;
              downSpan[col] = span;
            }
            out.push(text(c), ...new Array<string>(span - 1).fill(''));
            col += span;
          }
          return out;
        });
        const cols = Math.max(1, ...rows.map((r) => r.length));
        const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ')} |`;
        return pre([line(rows[0] ?? []), `|${' --- |'.repeat(cols)}`, ...rows.slice(1).map(line), '']);
      }
      default:
        return kids.flatMap((b) => block(b, indent, quote));
    }
  };
  for (const b of doc.content ?? []) out.push(...block(b));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
