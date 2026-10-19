// The editor of a Note's document (Tiptap): in the options panel, and on a page of its own (Large) — a small word
// processor. Paragraph styles (Normal, headings, quote), font, size (pt), bold, italic, underline, strike, superscript,
// subscript, text colour and highlight; alignment, lists, indent, line spacing, the space before and after a paragraph;
// links; undo. Loaded only when opened (not in the app's first download).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import {
  Bold,
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
import { INDENT_STEP, docFromText, isPlain, plainOf, type RichDoc } from './richDoc.ts';

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

const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] } }),
  TextStyleKit.configure({ lineHeight: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  Subscript,
  Superscript,
  ParagraphFormat,
];

const SIZES = ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '24', '28', '36'];
const SPACINGS = ['1', '1.15', '1.5', '2'];
const SPACES = ['0', '3', '6', '12', '18', '24'];

// the block the cursor is in: its style and its settings
function blockOf(ed: Editor) {
  const style = ed.isActive('heading', { level: 1 }) ? 'h1' : ed.isActive('heading', { level: 2 }) ? 'h2' : ed.isActive('heading', { level: 3 }) ? 'h3' : ed.isActive('blockquote') ? 'quote' : 'p';
  const attrs = ed.isActive('heading') ? ed.getAttributes('heading') : ed.getAttributes('paragraph');
  return { style, attrs };
}

function Toolbar({ editor, onLarge, large }: { editor: Editor; onLarge?: () => void; large?: boolean }) {
  const [link, setLink] = useState<string | null>(null);
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
        {onLarge && btn(large ? 'Close the page' : 'Write on a page of its own', false, onLarge, large ? <X {...IC} /> : <Maximize2 {...IC} />)}
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

type Props = { doc: RichDoc | undefined; text: string; onChange: (doc: RichDoc | undefined, text: string) => void; onLarge?: () => void; large?: boolean };

// the editor bound to a note: its content from the note (a plain note as paragraphs), every change given back — the
// document, or none when it is only plain paragraphs (the note stays a plain text) — and the note changed elsewhere
// (the node, the other editor) taken in when this one is not being typed in
export function RichEditor({ doc, text, onChange, onLarge, large }: Props) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: doc ?? docFromText(text),
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON() as RichDoc;
      onChange(isPlain(json) ? undefined : json, plainOf(json));
    },
  });
  useEffect(() => {
    // (an editor destroyed — React's strict mode mounts twice — is left alone)
    if (!editor || editor.isDestroyed || editor.isFocused) return;
    const want = doc ?? docFromText(text);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(want)) editor.commands.setContent(want, { emitUpdate: false });
  }, [editor, doc, text]);
  if (!editor) return null;
  return (
    <div className={`rich-editor${large ? ' large' : ''}`}>
      <Toolbar editor={editor} onLarge={onLarge} large={large} />
      <div className="rich-paper nowheel">
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
      <RichEditor doc={props.doc} text={props.text} onChange={props.onChange} onLarge={props.onClose} large />
    </div>,
    document.body,
  );
}
