// The editor of a Note's document (Tiptap): in the options panel, and on a page of its own (Large) — a small word
// processor. Paragraph styles (Normal, headings, quote), font, size (pt), bold, italic, underline, strike, superscript,
// subscript, text colour and highlight; alignment, lists, indent, line spacing, the space before and after a paragraph;
// links; undo. Blocks: a live figure of the project (the Figure list, or Copy under a figure then Ctrl+V here), pictures
// (a file, pasted, dropped), tables, text boxes. Loaded only when opened (not in the app's first download).
import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import { useReactFlow } from '@xyflow/react';
import {
  Bold,
  ChartLine,
  FileDown,
  Sigma,
  Image as ImageIcon,
  Square,
  Table as TableIcon,
  TableCellsMerge,
  TableCellsSplit,
  Italic,
  Link,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Maximize2,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  Underline,
  Undo2,
  X,
} from 'lucide-react';
import { FONTS } from '../figure/spec.ts';
import { IC } from './iconProps.ts';
import { OptColor } from './fields.tsx';
import { INDENT_STEP, RICH_BASE, docFromText, isPlain, plainOf, type RichDoc } from './richDoc.ts';
import { FigureRef, ImageBlock, PlacedTable, TextBox, pictureFromFile } from './richBlocks.ts';
import { placeOf } from './richDoc.ts';
import { PlaceTools } from './RichPlace.tsx';
import { figureOfResult } from './richFigures.ts';
import { copiedFigure } from './figureClip.ts';
import { downloadDocx, downloadHtml, downloadMarkdown, printNote } from './noteExport.tsx';
import { latexToMathml, latexToOmml } from './noteMath.ts';
import { MathPanel, type MathEdit } from './RichMath.tsx';
import { mathNodes, mathViews, type MathViews } from './richMathNodes.ts';
import { mathFace, type MathFontChoice } from '../math/sizes.ts';
import { EngineContext } from '../engine/engine.ts';
import { applyNotePage, getNotePage, subscribeNotePage, type NotePage } from '../theme.ts';
import { nodeDisplayName } from '../nodeColors.ts';
import type { AppNode } from '../types.ts';

const ptOf = (v: string) => (v.endsWith('pt') ? parseFloat(v) : v.endsWith('px') ? (parseFloat(v) * 72) / 96 : NaN);

// a paragraph's own settings, kept on paragraphs and headings: line spacing, the space before and after (pt), indent
const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: { default: null, parseHTML: (el) => el.style.lineHeight || null, renderHTML: (a) => (a.lineHeight ? { style: `line-height: ${a.lineHeight}` } : {}) },
          spaceBefore: { default: null, parseHTML: (el) => (el.style.marginTop ? ptOf(el.style.marginTop) : null), renderHTML: (a) => (a.spaceBefore !== null && a.spaceBefore !== undefined ? { style: `margin-top: ${a.spaceBefore}pt` } : {}) },
          spaceAfter: { default: null, parseHTML: (el) => (el.style.marginBottom ? ptOf(el.style.marginBottom) : null), renderHTML: (a) => (a.spaceAfter !== null && a.spaceAfter !== undefined ? { style: `margin-bottom: ${a.spaceAfter}pt` } : {}) },
          indent: { default: 0, parseHTML: (el) => Math.round((ptOf(el.style.marginLeft || '0pt') || 0) / INDENT_STEP), renderHTML: (a) => (a.indent ? { style: `margin-left: ${a.indent * INDENT_STEP}pt` } : {}) },
        },
      },
    ];
  },
});

// the extensions of an editor: its formulas (a click on one opens it in the formula panel)
const extensionsFor = (views: MathViews) => [...EXTENSIONS, ...mathNodes(views)];

const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] } }),
  TextStyleKit.configure({ lineHeight: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  Subscript,
  Superscript,
  ParagraphFormat,
  TableKit.configure({ table: false }),
  PlacedTable,
  FigureRef,
  ImageBlock,
  TextBox,
];
const BORDERS = ['0', '0.5', '0.75', '1', '1.5', '2'];

// the nodes of the project that give a figure (their live figure can go into a note)
type FigureChoice = { id: string; name: string };

const SIZES = ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '24', '28', '36'];
const SPACINGS = ['1', '1.15', '1.5', '2'];
const SPACES = ['0', '3', '6', '12', '18', '24'];

// the block the cursor is in: its style and its settings
function blockOf(ed: Editor) {
  const style = ed.isActive('heading', { level: 1 }) ? 'h1' : ed.isActive('heading', { level: 2 }) ? 'h2' : ed.isActive('heading', { level: 3 }) ? 'h3' : ed.isActive('blockquote') ? 'quote' : 'p';
  const attrs = ed.isActive('heading') ? ed.getAttributes('heading') : ed.getAttributes('paragraph');
  return { style, attrs };
}

type ExportKind = 'docx' | 'pdf' | 'html' | 'md';

function Toolbar({ editor, onLarge, large, figures, onExport, onMath }: { editor: Editor; onLarge?: () => void; large?: boolean; figures: FigureChoice[]; onExport: (k: ExportKind) => void; onMath: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const box = editor.isActive('textBox') ? editor.getAttributes('textBox') : null;
  const inTable = editor.isActive('table');
  const [figMenu, setFigMenu] = useState(false);
  const page = useSyncExternalStore(subscribeNotePage, getNotePage);
  const { style, attrs } = blockOf(editor);
  const ts = editor.getAttributes('textStyle');
  const font = (ts.fontFamily as string | undefined) ?? '';
  const size = ts.fontSize ? String(ptOf(ts.fontSize as string)) : '';
  const chain = () => editor.chain().focus();
  // a setting of the paragraphs and headings selected
  const para = (a: Record<string, unknown>) => chain().updateAttributes('paragraph', a).updateAttributes('heading', a).run();
  const btn = (title: string, on: boolean, run: () => void, icon: React.ReactNode, disabled = false) => (
    <button className={`nodrag rt-btn${on ? ' on' : ''}`} title={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {icon}
    </button>
  );
  const indent = (d: 1 | -1) => {
    if (editor.isActive('listItem')) return d > 0 ? chain().sinkListItem('listItem').run() : chain().liftListItem('listItem').run();
    para({ indent: Math.max(0, Math.min(8, ((attrs.indent as number) || 0) + d)) });
  };
  return (
    <div className={`rt-toolbar${large ? ' large' : ''}`}>
      <span className="rt-group">
        <select
          className="nodrag"
          title="The paragraph's style"
          value={style}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') chain().setParagraph().run();
            else if (v === 'quote') chain().setParagraph().toggleBlockquote().run();
            else chain().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
          }}
        >
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="quote">Quote</option>
        </select>
        <select className="nodrag" title="Font" value={font} onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}>
          <option value="">Font: default</option>
          {FONTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select className="nodrag rt-size" title="Size (pt)" value={size} onChange={(e) => (e.target.value ? chain().setFontSize(`${e.target.value}pt`).run() : chain().unsetFontSize().run())}>
          <option value="">pt</option>
          {SIZES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </span>
      <span className="rt-group">
        {btn('Bold (Ctrl+B)', editor.isActive('bold'), () => chain().toggleBold().run(), <Bold {...IC} />)}
        {btn('Italic (Ctrl+I)', editor.isActive('italic'), () => chain().toggleItalic().run(), <Italic {...IC} />)}
        {btn('Underline (Ctrl+U)', editor.isActive('underline'), () => chain().toggleUnderline().run(), <Underline {...IC} />)}
        {btn('Strikethrough', editor.isActive('strike'), () => chain().toggleStrike().run(), <Strikethrough {...IC} />)}
        {btn('Superscript', editor.isActive('superscript'), () => chain().toggleSuperscript().run(), <SupIcon {...IC} />)}
        {btn('Subscript', editor.isActive('subscript'), () => chain().toggleSubscript().run(), <SubIcon {...IC} />)}
      </span>
      <span className="rt-group" title="Text colour, highlight">
        <OptColor value={(ts.color as string | undefined) ?? ''} none="colour" title="Text colour" onChange={(c) => (c ? chain().setColor(c).run() : chain().unsetColor().run())} />
        <OptColor value={(editor.getAttributes('highlight').color as string | undefined) ?? ''} none="highlight" title="Highlight" onChange={(c) => (c ? chain().setHighlight({ color: c }).run() : chain().unsetHighlight().run())} />
      </span>
      <span className="rt-group">
        {btn('Align left', !attrs.textAlign || attrs.textAlign === 'left', () => chain().setTextAlign('left').run(), <TextAlignStart {...IC} />)}
        {btn('Centre', attrs.textAlign === 'center', () => chain().setTextAlign('center').run(), <TextAlignCenter {...IC} />)}
        {btn('Align right', attrs.textAlign === 'right', () => chain().setTextAlign('right').run(), <TextAlignEnd {...IC} />)}
        {btn('Justify', attrs.textAlign === 'justify', () => chain().setTextAlign('justify').run(), <TextAlignJustify {...IC} />)}
      </span>
      <span className="rt-group">
        {btn('Bulleted list', editor.isActive('bulletList'), () => chain().toggleBulletList().run(), <List {...IC} />)}
        {btn('Numbered list', editor.isActive('orderedList'), () => chain().toggleOrderedList().run(), <ListOrdered {...IC} />)}
        {btn('Less indent', false, () => indent(-1), <ListIndentDecrease {...IC} />)}
        {btn('More indent', false, () => indent(1), <ListIndentIncrease {...IC} />)}
      </span>
      <span className="rt-group">
        <select className="nodrag" title="Line spacing" value={(attrs.lineHeight as string | null) ?? ''} onChange={(e) => para({ lineHeight: e.target.value || null })}>
          <option value="">Lines: 1.15</option>
          {SPACINGS.map((v) => (
            <option key={v} value={v}>
              Lines: {v}
            </option>
          ))}
        </select>
        <select className="nodrag" title="Space before the paragraph (pt)" value={attrs.spaceBefore ?? ''} onChange={(e) => para({ spaceBefore: e.target.value === '' ? null : Number(e.target.value) })}>
          <option value="">Before: 0</option>
          {SPACES.map((v) => (
            <option key={v} value={v}>
              Before: {v} pt
            </option>
          ))}
        </select>
        <select className="nodrag" title="Space after the paragraph (pt)" value={attrs.spaceAfter ?? ''} onChange={(e) => para({ spaceAfter: e.target.value === '' ? null : Number(e.target.value) })}>
          <option value="">After: 6</option>
          {SPACES.map((v) => (
            <option key={v} value={v}>
              After: {v} pt
            </option>
          ))}
        </select>
      </span>
      <span className="rt-group">
        {btn('Link', editor.isActive('link'), () => setLink(link === null ? ((editor.getAttributes('link').href as string | undefined) ?? 'https://') : null), <Link {...IC} />)}
        {btn('Clear the formatting', false, () => chain().unsetAllMarks().setParagraph().run(), <RemoveFormatting {...IC} />)}
        {btn('Undo (Ctrl+Z)', false, () => chain().undo().run(), <Undo2 {...IC} />, !editor.can().undo())}
        {btn('Redo (Ctrl+Y)', false, () => chain().redo().run(), <Redo2 {...IC} />, !editor.can().redo())}
        {onLarge && (
          <button className={`nodrag rt-btn ${large ? 'rt-page-close' : 'rt-page-open'}`} title={large ? 'Close the page (Esc)' : 'Write on a page of its own'} onMouseDown={(e) => e.preventDefault()} onClick={onLarge}>
            {large ? <X {...IC} /> : <Maximize2 {...IC} />}
          </button>
        )}
      </span>
      <span className="rt-group rt-labelled" title="Insert into the note">
        <span className="rt-label">Insert</span>
        <span className="rt-menu">
          <button className={`nodrag rt-wide${figMenu ? ' on' : ''}`} title="A live figure of the project: drawn from its node, it follows the data (or: Copy under a figure, then Ctrl+V here)" onMouseDown={(e) => e.preventDefault()} onClick={() => setFigMenu(!figMenu)}>
            <ChartLine {...IC} /> Figure ▾
          </button>
          {figMenu && (
            <span className="rt-menu-list">
              {figures.length ? (
                figures.map((f) => (
                  <button
                    key={f.id}
                    className="nodrag"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      chain().insertContent({ type: 'figureRef', attrs: { node: f.id } }).run();
                      setFigMenu(false);
                    }}
                  >
                    {f.name}
                  </button>
                ))
              ) : (
                <span className="muted">No figure in this graph yet (a Plot, a Merge, a chart …).</span>
              )}
            </span>
          )}
        </span>
        <button className="nodrag rt-wide" title="A picture (a file; or paste or drop one)" onMouseDown={(e) => e.preventDefault()} onClick={() => file.current?.click()}>
          <ImageIcon {...IC} /> Picture
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            const src = f ? await pictureFromFile(f) : null;
            if (src) chain().insertContent({ type: 'imageBlock', attrs: { src, alt: f!.name } }).run();
          }}
        />
        <button className={`nodrag rt-wide${inTable ? ' on' : ''}`} title="A table (3 × 3)" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon {...IC} /> Table
        </button>
        <button className={`nodrag rt-wide${box ? ' on' : ''}`} title={box ? 'Take the text out of its box' : 'A text box around the paragraph'} onMouseDown={(e) => e.preventDefault()} onClick={() => (box ? chain().lift('textBox').run() : chain().wrapIn('textBox').run())}>
          <Square {...IC} /> Box
        </button>
        <button className="nodrag rt-wide" title="A formula (LaTeX; a click on a formula changes it)" onMouseDown={(e) => e.preventDefault()} onClick={onMath}>
          <Sigma {...IC} /> Formula
        </button>
      </span>
      {inTable && (
        <span className="rt-group rt-context" title="The table">
          <button className="nodrag" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addRowAfter().run()}>+ row</button>
          <button className="nodrag" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addColumnAfter().run()}>+ column</button>
          <button className="nodrag" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteRow().run()}>− row</button>
          <button className="nodrag" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteColumn().run()}>− column</button>
          <button className="nodrag" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().toggleHeaderRow().run()}>Header row</button>
          {btn('Merge the cells', false, () => chain().mergeCells().run(), <TableCellsMerge {...IC} />, !editor.can().mergeCells())}
          {btn('Split the cell', false, () => chain().splitCell().run(), <TableCellsSplit {...IC} />, !editor.can().splitCell())}
          <button className="nodrag" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteTable().run()}>Delete table</button>
          <PlaceTools place={placeOf(editor.getAttributes('table'), 100, 'center')} onPlace={(p) => chain().updateAttributes('table', p).run()} />
        </span>
      )}
      {box && (
        <span className="rt-group rt-context" title="The text box">
          <span className="muted">Box:</span>
          <PlaceTools place={placeOf(box, 100, 'left')} onPlace={(p) => chain().updateAttributes('textBox', p).run()} />
          <OptColor value={String(box.border ?? '')} none="no border" title="Border" onChange={(c) => chain().updateAttributes('textBox', { border: c }).run()} />
          <select className="nodrag" title="Border width (pt)" value={String(box.borderWidth ?? 0.75)} onChange={(e) => chain().updateAttributes('textBox', { borderWidth: Number(e.target.value) }).run()}>
            {BORDERS.map((w) => (
              <option key={w} value={w}>
                {w} pt
              </option>
            ))}
          </select>
          <OptColor value={String(box.fill ?? '')} none="no fill" title="Fill" onChange={(c) => chain().updateAttributes('textBox', { fill: c }).run()} />
        </span>
      )}
      <span className="rt-group rt-labelled" title="Export the note">
        <span className="rt-label">
          <FileDown {...IC} /> Export
        </span>
        <button className="nodrag" title="A document (.docx — Word, LibreOffice, Google Docs): its styles, lists, tables; the figures drawn now at 300 dpi and numbered; the formulas as equations" onMouseDown={(e) => e.preventDefault()} onClick={() => onExport('docx')}>
          DOC
        </button>
        <button className="nodrag" title="Print it, or save it as PDF (the browser's Save as PDF: text and figures stay vector)" onMouseDown={(e) => e.preventDefault()} onClick={() => onExport('pdf')}>
          PDF
        </button>
        <button className="nodrag" title="An HTML page" onMouseDown={(e) => e.preventDefault()} onClick={() => onExport('html')}>
          HTML
        </button>
        <button className="nodrag" title="Markdown (.md; with its figures and pictures: a .zip of the text and their PNG files) — formulas as $…$" onMouseDown={(e) => e.preventDefault()} onClick={() => onExport('md')}>
          MD
        </button>
      </span>
      <span className="rt-group">
        <select className="nodrag" title="The page on screen: dark with light text, or white (kept in this browser; the exports are always on white, the figures shown as they will be there)" value={page} onChange={(e) => applyNotePage(e.target.value as NotePage)}>
          <option value="theme">Page: as the theme</option>
          <option value="light">Page: light</option>
          <option value="dark">Page: dark</option>
        </select>
      </span>
      {link !== null && (
        <span className="rt-group rt-link">
          <input
            className="nodrag"
            value={link}
            autoFocus
            placeholder="https://…"
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (/^(https?:\/\/|mailto:)\S+/.test(link.trim())) chain().extendMarkRange('link').setLink({ href: link.trim() }).run();
                setLink(null);
              } else if (e.key === 'Escape') setLink(null);
            }}
          />
          <button className="nodrag" onClick={() => (chain().extendMarkRange('link').unsetLink().run(), setLink(null))}>
            Remove
          </button>
        </span>
      )}
    </div>
  );
}

// compact: in the node itself — the text typed there, no toolbar (that is in the panel), the blocks small
// mathFont: the font of the note's formulas (absent: the one that looks like the note's text)
type Props = { doc: RichDoc | undefined; text: string; onChange: (doc: RichDoc | undefined, text: string) => void; onLarge?: () => void; large?: boolean; compact?: boolean; mathFont?: MathFontChoice; onMathFont?: (f: MathFontChoice | undefined) => void };

// the editor bound to a note: its content from the note (a plain note as paragraphs), every change given back — the
// document, or none when it is only plain paragraphs (the note stays a plain text) — and the note changed elsewhere
// (the node, the other editor) taken in when this one is not being typed in
export function RichEditor({ doc, text, onChange, onLarge, large, compact, mathFont, onMathFont }: Props) {
  // the figures of the project, by name
  const { results } = useContext(EngineContext);
  const { getNodes } = useReactFlow<AppNode>();
  const figures: FigureChoice[] = getNodes()
    .filter((n) => figureOfResult(results.get(n.id)))
    .map((n) => ({ id: n.id, name: nodeDisplayName(n) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const editorRef = useRef<Editor | null>(null);
  // pictures pasted or dropped: a figure just copied under its node comes in live, any other picture as it is
  const pictures = async (files: File[], at?: number) => {
    for (const f of files) {
      const bmp = await createImageBitmap(f).catch(() => null);
      const fig = bmp ? copiedFigure(bmp.width, bmp.height) : null;
      bmp?.close();
      const content = fig && figures.some((q) => q.id === fig) ? { type: 'figureRef', attrs: { node: fig } } : { type: 'imageBlock', attrs: { src: await pictureFromFile(f), alt: f.name } };
      if (content.type === 'imageBlock' && !content.attrs.src) continue;
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      if (at !== undefined) ed.chain().focus().insertContentAt(at, content).run();
      else ed.chain().focus().insertContent(content).run();
    }
  };
  // the handlers of the editor (made once) call the latest of these
  const picturesRef = useRef(pictures);
  useEffect(() => {
    picturesRef.current = pictures;
  });
  // the formula being written (Σ, or a formula clicked)
  const [math, setMath] = useState<MathEdit | null>(null);
  const face = mathFace(RICH_BASE.font, mathFont);
  const [views] = useState(() => mathViews(face, (node, pos, display) => setMath({ latex: String(node.attrs.latex ?? ''), display, pos, was: display })));
  const [extensions] = useState(() => extensionsFor(views));
  // the note's math font changed: its formulas drawn again
  useEffect(() => views.setFace(face), [face, views]);
  const editor = useEditor({
    extensions,
    content: doc ?? docFromText(text),
    shouldRerenderOnTransaction: true,
    editorProps: {
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        void picturesRef.current(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const de = event as DragEvent;
        const files = moved ? [] : [...(de.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        void picturesRef.current(files, view.posAtCoords({ left: de.clientX, top: de.clientY })?.pos);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON() as RichDoc;
      onChange(isPlain(json) ? undefined : json, plainOf(json));
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  useEffect(() => {
    // (an editor destroyed — React's strict mode mounts twice — is left alone)
    if (!editor || editor.isDestroyed || editor.isFocused) return;
    const want = doc ?? docFromText(text);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(want)) editor.commands.setContent(want, { emitUpdate: false });
  }, [editor, doc, text]);
  if (!editor) return null;
  const figureOf = (id: string) => figureOfResult(results.get(id));
  const exportAs = (k: ExportKind) => {
    const json = editor.getJSON() as RichDoc;
    if (k === 'docx') void downloadDocx(json, figureOf, latexToOmml).catch((e: Error) => alert(`The Word file could not be made: ${e.message}`));
    else if (k === 'pdf') void printNote(json, figureOf, latexToMathml);
    else if (k === 'md') void downloadMarkdown(json, figureOf).catch((e: Error) => alert(`The Markdown could not be made: ${e.message}`));
    else void downloadHtml(json, figureOf, latexToMathml);
  };
  return (
    <div className={`rich-editor${large ? ' large' : ''}${compact ? ' compact' : ''}`}>
      {!compact && <Toolbar editor={editor} onLarge={onLarge} large={large} figures={figures} onExport={exportAs} onMath={() => setMath({ latex: editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' '), display: false, pos: null })} />}
      {math && !compact && (
        <MathPanel
          edit={math}
          face={face}
          font={mathFont ?? 'auto'}
          onFont={onMathFont}
          onChange={setMath}
          onClose={() => setMath(null)}
          onApply={() => {
            const latex = math.latex.trim();
            const ch = editor.chain().focus();
            if (math.pos === null) (math.display ? ch.insertBlockMath({ latex }) : ch.insertInlineMath({ latex })).run();
            else if (math.display === math.was) (math.display ? ch.updateBlockMath({ latex, pos: math.pos }) : ch.updateInlineMath({ latex, pos: math.pos })).run();
            else {
              // changed from the line to its own line (or back): taken out, put in again
              (math.was ? ch.deleteBlockMath({ pos: math.pos }) : ch.deleteInlineMath({ pos: math.pos })).run();
              (math.display ? editor.chain().focus().insertBlockMath({ latex }) : editor.chain().focus().insertInlineMath({ latex })).run();
            }
            setMath(null);
          }}
          onRemove={
            math.pos === null
              ? undefined
              : () => {
                  const ch = editor.chain().focus();
                  (math.was ? ch.deleteBlockMath({ pos: math.pos! }) : ch.deleteInlineMath({ pos: math.pos! })).run();
                  setMath(null);
                }
          }
        />
      )}
      <div
        className="rich-paper nowheel"
        onMouseDown={(e) => {
          // the text is only as tall as its lines: a click on the page around it (an empty note — the whole page) puts
          // the cursor at the end of the text (never on its scroll bar)
          const page = e.currentTarget;
          if ((e.target as HTMLElement).closest('.ProseMirror') || e.clientX - page.getBoundingClientRect().left > page.clientLeft + page.clientWidth) return;
          e.preventDefault();
          editor.commands.focus('end');
        }}
      >
        <EditorContent editor={editor} className="rich-doc" />
      </div>
    </div>
  );
}

// the document on a page of its own, over the app (Esc or ✕ closes it)
export function RichPage(props: Omit<Props, 'onLarge' | 'large'> & { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [props]);
  return createPortal(
    <div className="rich-backdrop nokey" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()} onKeyDown={(e) => e.stopPropagation()}>
      <RichEditor doc={props.doc} text={props.text} onChange={props.onChange} mathFont={props.mathFont} onMathFont={props.onMathFont} onLarge={props.onClose} large />
    </div>,
    document.body,
  );
}
