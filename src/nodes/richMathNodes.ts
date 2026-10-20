// The formulas of a Note's editor: a formula in the line (inlineMath) and one on a line of its own (blockMath), kept as
// their LaTeX (attribute latex) and drawn by MathJax in the note's math font. The same names, attributes, HTML and
// commands as Tiptap's Mathematics, whose notes they open. Typed: $$x^2$$ in the line, $$$x^2$$$ alone on a line.
import { InputRule, mergeAttributes, Node, type InputRuleMatch } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { mathBox, mathBoxAsync, mathError, mathSvgHtml, type MathFace } from '../math/store.ts';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineMath: {
      insertInlineMath: (options: { latex: string; pos?: number }) => ReturnType;
      deleteInlineMath: (options?: { pos?: number }) => ReturnType;
      updateInlineMath: (options?: { latex?: string; pos?: number }) => ReturnType;
    };
    blockMath: {
      insertBlockMath: (options: { latex: string; pos?: number }) => ReturnType;
      deleteBlockMath: (options?: { pos?: number }) => ReturnType;
      updateBlockMath: (options?: { latex?: string; pos?: number }) => ReturnType;
    };
  }
}

// the formulas shown in an editor, drawn again when the note's math font changes
export type MathViews = { face: MathFace; redraw: Set<() => void>; onClick: (node: PMNode, pos: number, display: boolean) => void; setFace: (f: MathFace) => void };
export function mathViews(face: MathFace, onClick: MathViews['onClick']): MathViews {
  const v: MathViews = {
    face,
    redraw: new Set(),
    onClick,
    setFace: (f) => {
      if (v.face === f) return;
      v.face = f;
      for (const draw of v.redraw) draw();
    },
  };
  return v;
}

// draws a formula into an element (its LaTeX until it is drawn; a wrong one: its LaTeX in red, the reason as a tooltip)
function drawInto(el: HTMLElement, tex: string, display: boolean, face: MathFace) {
  const show = () => {
    const box = mathBox(tex, display, face);
    const err = box ? null : mathError(tex, display, face);
    el.classList.toggle('math-wrong', !!err);
    el.title = err ?? '';
    if (box) el.innerHTML = mathSvgHtml(box, tex);
    else el.textContent = tex;
    return !!box || !!err;
  };
  if (!show()) {
    el.classList.add('math-src');
    void mathBoxAsync(tex, display, face).then(() => {
      if (el.dataset.latex !== tex) return;
      el.classList.remove('math-src');
      show();
    });
  }
}

const attrs = () => ({
  latex: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-latex'), renderHTML: (a: Record<string, unknown>) => ({ 'data-latex': a.latex }) },
});

function nodeView(views: MathViews, display: boolean) {
  return ({ node, getPos }: { node: PMNode; getPos: () => number | undefined }) => {
    const dom = document.createElement(display ? 'div' : 'span');
    dom.className = `rich-formula${display ? ' rich-math-block' : ''}`;
    dom.dataset.type = display ? 'block-math' : 'inline-math';
    const tex = String(node.attrs.latex ?? '');
    dom.dataset.latex = tex;
    const draw = () => drawInto(dom, tex, display, views.face);
    draw();
    views.redraw.add(draw);
    const click = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = getPos();
      if (pos !== undefined) views.onClick(node, pos, display);
    };
    dom.addEventListener('click', click);
    return {
      dom,
      destroy() {
        views.redraw.delete(draw);
        dom.removeEventListener('click', click);
      },
    };
  };
}

// $$…$$ typed in a line (not part of $$$…$$$)
const findInline = (text: string): InputRuleMatch | null => {
  const re = /\$\$([^$\n]+?)\$\$(?!\$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index === 0 || text[m.index - 1] !== '$') return { index: m.index, text: m[0], data: { latex: m[1] } };
    re.lastIndex = m.index + 1;
  }
  return null;
};

export function mathNodes(views: MathViews) {
  const InlineMath = Node.create({
    name: 'inlineMath',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes: attrs,
    parseHTML: () => [{ tag: 'span[data-type="inline-math"]' }],
    renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' })],
    addCommands() {
      return {
        insertInlineMath:
          ({ latex, pos }) =>
          ({ editor, tr }) => {
            if (!latex) return false;
            const at = pos ?? editor.state.selection.from;
            tr.replaceWith(at, at, this.type.create({ latex }));
            return true;
          },
        deleteInlineMath:
          (o) =>
          ({ editor, tr }) => {
            const pos = o?.pos ?? editor.state.selection.$from.pos;
            const n = editor.state.doc.nodeAt(pos);
            if (!n || n.type.name !== this.name) return false;
            tr.delete(pos, pos + n.nodeSize);
            return true;
          },
        updateInlineMath:
          (o) =>
          ({ editor, tr }) => {
            const pos = o?.pos ?? editor.state.selection.$from.pos;
            const n = editor.state.doc.nodeAt(pos);
            if (!n || n.type.name !== this.name) return false;
            tr.setNodeMarkup(pos, this.type, { ...n.attrs, latex: o?.latex ?? n.attrs.latex });
            return true;
          },
      };
    },
    addInputRules() {
      return [
        new InputRule({
          find: findInline,
          handler: ({ state, range, match }) => {
            const latex = match.data?.latex;
            if (typeof latex !== 'string') return null;
            state.tr.replaceWith(range.from, range.to, this.type.create({ latex }));
          },
        }),
      ];
    },
    addNodeView() {
      return nodeView(views, false);
    },
  });
  const BlockMath = Node.create({
    name: 'blockMath',
    group: 'block',
    atom: true,
    addAttributes: attrs,
    parseHTML: () => [{ tag: 'div[data-type="block-math"]' }],
    renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'block-math' })],
    addCommands() {
      return {
        insertBlockMath:
          ({ latex, pos }) =>
          ({ commands, editor }) =>
            !!latex && commands.insertContentAt(pos ?? editor.state.selection.from, { type: this.name, attrs: { latex } }),
        deleteBlockMath:
          (o) =>
          ({ editor, tr }) => {
            const pos = o?.pos ?? editor.state.selection.$from.pos;
            const n = editor.state.doc.nodeAt(pos);
            if (!n || n.type.name !== this.name) return false;
            tr.delete(pos, pos + n.nodeSize);
            return true;
          },
        updateBlockMath:
          (o) =>
          ({ editor, tr }) => {
            const pos = o?.pos ?? editor.state.selection.$from.pos;
            const n = editor.state.doc.nodeAt(pos);
            if (!n || n.type.name !== this.name) return false;
            tr.setNodeMarkup(pos, this.type, { ...n.attrs, latex: o?.latex ?? n.attrs.latex });
            return true;
          },
      };
    },
    addInputRules() {
      return [
        new InputRule({
          find: /^\$\$\$([^$]+)\$\$\$$/,
          handler: ({ state, range, match }) => {
            const { tr } = state;
            const $from = state.doc.resolve(range.from);
            const node = this.type.create({ latex: match[1] });
            // the whole paragraph typed in: the formula in its place
            const whole = $from.depth > 0 && $from.parent.isTextblock && range.from === $from.start() && range.to === $from.end() && $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), this.type);
            if (whole) tr.replaceWith($from.before(), $from.after(), node);
            else tr.replaceWith(range.from, range.to, node);
          },
        }),
      ];
    },
    addNodeView() {
      return nodeView(views, true);
    },
  });
  return [InlineMath, BlockMath];
}
