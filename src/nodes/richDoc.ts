// A Note's document: the JSON of the rich-text editor (paragraphs, headings, lists, quotes; bold, italic, colours, fonts,
// sizes; alignment, line spacing, the space before and after a paragraph, its indent). Kept in the project with the
// note's plain text beside it (found by Find node, read by older pages). Pure: no editor here — the node draws the
// beginning of a document with RichView, the editor itself is loaded when the panel or the page opens.

export type RichMark = { type: string; attrs?: Record<string, unknown> };
export type RichDoc = { type: string; attrs?: Record<string, unknown>; content?: RichDoc[]; marks?: RichMark[]; text?: string };

// the base of every document: its font and size (pt), its line spacing and the space after a paragraph (pt)
export const RICH_BASE = { font: 'Arial, Helvetica, sans-serif', size: 11, lineHeight: 1.15, after: 6 };
// one step of indent (pt)
export const INDENT_STEP = 18;

// a plain text as a document: a paragraph a line (an empty line an empty paragraph)
export function docFromText(text: string): RichDoc {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
  return { type: 'doc', content: lines.map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })) };
}

// the plain text of a document: its blocks a line each, a list item with its bullet
export function plainOf(doc: RichDoc | undefined): string {
  if (!doc) return '';
  const lines: string[] = [];
  const inline = (n: RichDoc): string => (n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : (n.content ?? []).map(inline).join(''));
  const block = (n: RichDoc, prefix = '') => {
    if (n.type === 'bulletList' || n.type === 'orderedList') {
      (n.content ?? []).forEach((li, k) => (li.content ?? []).forEach((b, j) => block(b, j ? '   ' : n.type === 'bulletList' ? '• ' : `${k + 1}. `)));
      return;
    }
    if (n.type === 'blockquote' || n.type === 'doc' || n.type === 'listItem') {
      (n.content ?? []).forEach((b) => block(b, prefix));
      return;
    }
    lines.push(prefix + inline(n));
  };
  block(doc);
  return lines.join('\n');
}

// a document is only plain paragraphs of unformatted text (it can be kept as the plain text alone)
export function isPlain(doc: RichDoc): boolean {
  return (doc.content ?? []).every((p) => p.type === 'paragraph' && !Object.values(p.attrs ?? {}).some((v) => v !== null && v !== undefined && v !== 0 && v !== 'left') && (p.content ?? []).every((t) => t.type === 'text' && !t.marks?.length));
}
