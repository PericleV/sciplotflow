// The blocks of a Note's document beyond text: a live figure of the project (a Plot, a Merge, any graph, a Figure
// Drawing — drawn from its node now, so it follows the data), a picture (a file, pasted or dropped; kept in the
// project, large ones made smaller), a text box (a frame with a border and a fill around paragraphs). A figure or a
// picture has its width (% of the page), its alignment and a caption, numbered (Figure 1, 2 … in the order of the note).
import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Table, TableView } from '@tiptap/extension-table';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView, ViewMutationRecord } from '@tiptap/pm/view';
import { NodeSelection } from '@tiptap/pm/state';
import { boxCss, cssText, placeCss, placeOf } from './richDoc.ts';
import { BoxView, PictureView } from './RichPicture.tsx';

const pictureAttrs = (width: number) => ({
  width: { default: width },
  align: { default: 'center' },
  wrap: { default: false },
  caption: { default: '' },
});

// a live figure of a node of the project
export const FigureRef = Node.create({
  name: 'figureRef',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { node: { default: '' }, ...pictureAttrs(100) };
  },
  parseHTML() {
    return [{ tag: 'div[data-figure-ref]', getAttrs: (el) => ({ node: (el as HTMLElement).getAttribute('data-figure-ref') ?? '' }) }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-figure-ref': node.attrs.node }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PictureView);
  },
});

// a picture kept in the note (only pictures of its own: a data URL, never an address on the web)
export const ImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: '' }, alt: { default: '' }, ...pictureAttrs(60) };
  },
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (el) => (/^data:image\//.test((el as HTMLElement).getAttribute('src') ?? '') ? { src: (el as HTMLElement).getAttribute('src') } : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes({ src: HTMLAttributes.src, alt: HTMLAttributes.alt })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PictureView);
  },
});

// a text box: paragraphs in a frame — its width (% of the page), alignment, border (colour, width in pt), fill, padding (pt)
export const TextBox = Node.create({
  name: 'textBox',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,
  addAttributes() {
    return { width: { default: 100 }, align: { default: 'left' }, wrap: { default: false }, border: { default: '#555555' }, borderWidth: { default: 0.75 }, fill: { default: '' }, padding: { default: 6 } };
  },
  addNodeView() {
    return ReactNodeViewRenderer(BoxView);
  },
  parseHTML() {
    return [{ tag: 'div[data-text-box]' }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-text-box': '', class: 'rich-box', style: cssText(boxCss(node.attrs)) }, 0];
  },
});

// a picture file as a data URL: a small one as it is, a large one made smaller (at most 1600 px a side, JPEG)
export async function pictureFromFile(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  const url = await new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(r.error);
    r.readAsDataURL(file);
  });
  if (file.size < 400_000 || file.type === 'image/svg+xml') return url;
  const img = new Image();
  await new Promise((ok, no) => {
    img.onload = ok;
    img.onerror = no;
    img.src = url;
  });
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  [c.width, c.height] = [Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k)];
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

// a table placed as a block: its width (% of the page), its place, the text beside it or not; in the editor a grip to
// move it and a corner to drag its width (the columns keep their own resizing)
const SVG = 'http://www.w3.org/2000/svg';
function gripIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  for (const [cx, cy] of [[9, 5], [9, 12], [9, 19], [15, 5], [15, 12], [15, 19]]) {
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', '1.6');
    c.setAttribute('fill', 'currentColor');
    svg.appendChild(c);
  }
  return svg;
}

class PlacedTableView extends TableView {
  private extras: HTMLElement[] = [];
  private pmView: EditorView;
  constructor(node: PMNode, cellMinWidth: number, view: EditorView, attrs?: Record<string, unknown>) {
    super(node, cellMinWidth, view, attrs);
    this.pmView = view;
    this.dom.classList.add('rich-placed', 'rich-table-frame');
    if (view.editable) {
      const grip = document.createElement('span');
      grip.className = 'rich-grip';
      grip.contentEditable = 'false';
      grip.draggable = true;
      grip.title = 'Drag to move the table in the note';
      grip.appendChild(gripIcon());
      // the grip says what is dragged (the table), not the place under the mouse; the editor's own pointer handling
      // left out
      grip.addEventListener('mousedown', (e) => e.stopPropagation());
      grip.addEventListener('dragstart', () => {
        const pos = this.posOf();
        if (pos !== null) this.pmView.dispatch(this.pmView.state.tr.setSelection(NodeSelection.create(this.pmView.state.doc, pos)));
      });
      const corner = document.createElement('span');
      corner.className = 'rich-resize';
      corner.contentEditable = 'false';
      corner.title = 'Drag to change the width of the table';
      corner.addEventListener('pointerdown', (e) => this.resize(e, corner));
      this.dom.prepend(grip);
      this.dom.append(corner);
      this.extras = [grip, corner];
    }
    this.place(node);
  }
  private place(node: PMNode) {
    const css = placeCss(placeOf(node.attrs, 100, 'center'));
    for (const k of ['float', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom']) this.dom.style.setProperty(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), css[k] ?? '');
    this.dom.style.width = css.width;
  }
  // the table's own position in the document (for its new width)
  private posOf(): number | null {
    const at = this.pmView.posAtDOM(this.table, 0);
    const $p = this.pmView.state.doc.resolve(at);
    for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === 'table') return $p.before(d);
    return null;
  }
  private resize(e: PointerEvent, corner: HTMLElement) {
    const box = this.dom.parentElement;
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      corner.setPointerCapture(e.pointerId);
    } catch {
      // (a pointer the browser does not know: a synthetic one)
    }
    const [x0, w0, W] = [e.clientX, this.dom.getBoundingClientRect().width, box.clientWidth || 1];
    const sign = getComputedStyle(this.dom).float === 'right' || (this.dom.style.marginLeft === 'auto' && this.dom.style.marginRight === '0px') ? -1 : 1;
    let pct = Math.round((w0 / W) * 100);
    const move = (ev: PointerEvent) => {
      pct = Math.min(100, Math.max(10, Math.round(((w0 + sign * (ev.clientX - x0)) / W) * 100)));
      this.dom.style.width = `${pct}%`;
    };
    const up = () => {
      corner.removeEventListener('pointermove', move);
      corner.removeEventListener('pointerup', up);
      const pos = this.posOf();
      if (pos === null) return;
      const n = this.pmView.state.doc.nodeAt(pos);
      if (n) this.pmView.dispatch(this.pmView.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, width: pct }));
    };
    corner.addEventListener('pointermove', move);
    corner.addEventListener('pointerup', up);
  }
  update(node: PMNode): boolean {
    if (!super.update(node)) return false;
    this.place(node);
    return true;
  }
  ignoreMutation(m: ViewMutationRecord): boolean {
    if (this.extras.some((x) => x.contains(m.target as globalThis.Node))) return true;
    if (m.type === 'attributes' && m.target === this.dom) return true;
    return super.ignoreMutation(m);
  }
}

export const PlacedTable = Table.extend({
  draggable: true,
  addAttributes() {
    const none = { renderHTML: () => ({}) };
    return { ...this.parent?.(), width: { default: 100, ...none }, align: { default: 'center', ...none }, wrap: { default: false, ...none } };
  },
}).configure({ resizable: true, View: PlacedTableView });
