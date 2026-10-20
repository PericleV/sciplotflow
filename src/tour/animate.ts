// Show me, played: a drawn mouse pointer moves over the page as a person would, takes a node from the Nodes panel and
// drops it on the canvas, draws the connection from an output to an input, shows a value being typed into an option,
// presses buttons. Each move is eased frame by frame (the node's ghost and the wire follow it); Stop ends it at the
// next move.
import { nodeEl, type Act, type AddSpec, type TourApi } from './kit.ts';

export type Cursor = {
  on: boolean;
  x: number;
  y: number;
  down: boolean;
  ghost?: string; // the node being dragged (its title)
  wire?: { x: number; y: number }; // a connection being drawn: from here to the pointer
  bubble?: { text: string; x: number; y: number }; // what is being typed, beside the field
};
export class Stopped extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const middle = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
// an element as soon as it is there (up to `ms`)
export async function waitFor<T>(find: () => T | null | undefined, ms = 2500): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const v = find();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(60);
  }
}
// a value typed into an input React controls (its own setter, then the event React listens to)
export function typeInto(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export class Player {
  private c: Cursor;
  private stopped = false;
  private set: (c: Cursor) => void;
  constructor(set: (c: Cursor) => void, from: { x: number; y: number }) {
    this.set = set;
    this.c = { on: true, x: from.x, y: from.y, down: false };
    set(this.c);
  }
  private put(p: Partial<Cursor>) {
    this.c = { ...this.c, ...p };
    this.set(this.c);
  }
  private check() {
    if (this.stopped) throw new Stopped();
  }
  stop() {
    this.stopped = true;
  }
  hide() {
    this.put({ on: false, ghost: undefined, wire: undefined, bubble: undefined });
  }
  async wait(ms: number) {
    this.check();
    await sleep(ms);
    this.check();
  }
  // to a point, eased (the farther, the longer, within limits)
  async move(x: number, y: number, slow = 1) {
    this.check();
    const x0 = this.c.x;
    const y0 = this.c.y;
    const ms = Math.min(1100, Math.max(350, Math.hypot(x - x0, y - y0) * 0.9)) * slow;
    const t0 = performance.now();
    // frames by timer, not requestAnimationFrame: those stop while the page is hidden and the move would never end
    await new Promise<void>((done) => {
      const frame = () => {
        if (this.stopped) return done();
        const t = Math.min(1, (performance.now() - t0) / ms);
        const k = ease(t);
        this.put({ x: x0 + (x - x0) * k, y: y0 + (y - y0) * k });
        if (t < 1) setTimeout(frame, 16);
        else done();
      };
      frame();
    });
    this.check();
  }
  async to(el: Element, slow = 1) {
    (el as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    await this.wait(60);
    const p = middle(el);
    await this.move(p.x, p.y, slow);
  }
  async press() {
    this.put({ down: true });
    await this.wait(200);
    this.put({ down: false });
    await this.wait(120);
  }
  // pressed for real (a button opens what it opens)
  async click(el: Element) {
    await this.to(el);
    await this.press();
    (el as HTMLElement).click();
    await this.wait(450);
  }
  // a node taken from the Nodes panel to a place of the canvas
  async drag(from: Element, to: { x: number; y: number }, title: string) {
    await this.to(from);
    this.put({ down: true, ghost: title });
    await this.wait(250);
    await this.move(to.x, to.y, 1.4);
    this.put({ down: false, ghost: undefined });
    await this.wait(200);
  }
  // a connection drawn from an output to an input
  async wire(from: Element, to: Element) {
    await this.to(from);
    const a = middle(from);
    this.put({ down: true, wire: a });
    await this.wait(200);
    await this.to(to, 1.3);
    this.put({ down: false, wire: undefined });
    await this.wait(150);
  }
  // a value written (or chosen) in a field, letter by letter beside it
  async type(el: Element, text: string) {
    await this.to(el);
    await this.press();
    const r = el.getBoundingClientRect();
    // under the field, or over it near the bottom of the page
    const y = r.bottom + 40 > window.innerHeight ? r.top - 34 : r.bottom + 6;
    const x = Math.min(r.left, window.innerWidth - 330);
    for (let k = 1; k <= text.length; k++) {
      this.put({ bubble: { text: text.slice(0, k), x, y } });
      await this.wait(text.length > 40 ? 15 : 40);
    }
    await this.wait(550);
    this.put({ bubble: undefined });
  }
}

const handleEl = (doc: Document, node: string, handle: string) => doc.querySelector(`.react-flow__handle[data-nodeid="${CSS.escape(node)}"][data-handleid="${CSS.escape(handle)}"]`);
const paletteOpen = (doc: Document) => doc.querySelector('.palette.overlay:not(.inspector)');
const paletteFind = (doc: Document, title: string) => [...(paletteOpen(doc)?.querySelectorAll('.palette-item') ?? [])].find((b) => b.textContent?.trim() === title) ?? null;

// a node taken from the Nodes panel (opened first, the node searched for when its section is folded), dropped where
// it goes, then connected wire by wire
async function addNode(p: Player, api: TourApi, spec: AddSpec, title: string, doc: Document) {
  if (!paletteOpen(doc)) {
    const toggle = doc.querySelector('.palette.folded:not(.inspector) .palette-toggle');
    if (toggle) await p.click(toggle);
    await waitFor(() => paletteOpen(doc), 800);
  }
  let item = paletteFind(doc, title);
  let search: HTMLInputElement | null = null;
  if (!item) {
    search = paletteOpen(doc)?.querySelector('.palette-search') ?? null;
    if (search) {
      await p.type(search, title);
      typeInto(search, title);
      item = await waitFor(() => paletteFind(doc, title), 800);
    }
  }
  const at = api.place(spec);
  await api.reveal(at);
  await p.wait(350);
  const screen = api.toScreen(at);
  if (item) await p.drag(item, { x: screen.x + 40, y: screen.y + 16 }, title);
  else await p.move(screen.x + 40, screen.y + 16);
  const id = api.add({ ...spec, from: [] }, at);
  if (search) typeInto(search, '');
  await waitFor(() => nodeEl(doc, id), 1500);
  await p.wait(300);
  for (const f of spec.from) {
    const src = await waitFor(() => handleEl(doc, f.id, f.handle ?? 'out'), 800);
    const dst = await waitFor(() => handleEl(doc, id, f.to), 800);
    if (src && dst) await p.wire(src, dst);
    api.connect(f, id);
    await p.wait(250);
  }
}

// the moves of a step, one after the other
export async function play(acts: Act[], p: Player, api: TourApi, doc: Document = document) {
  for (const a of acts) {
    if (a.kind === 'add') await addNode(p, api, a.spec, a.palette, doc);
    else if (a.kind === 'select') {
      const el = nodeEl(doc, a.id);
      const head = el?.querySelector('.node-shell > div, .node-head, header') ?? el;
      if (head) await p.to(head);
      await p.press();
      api.select(a.id);
      await p.wait(500);
    } else {
      const el = await waitFor(() => a.at(doc, { nodes: api.nodes(), edges: api.edges() }), a.kind === 'click' && a.soft ? 0 : 2500);
      if (a.kind === 'click') {
        if (el) await p.click(el);
      } else if (a.kind === 'set') {
        const shown = a.text ?? (el instanceof HTMLSelectElement ? ([...el.options].find((o) => o.value === a.value)?.text ?? a.value) : a.value) ?? '';
        if (el) await p.type(el, shown);
        if (a.apply) api.setData(a.apply.id, a.apply.f);
        await p.wait(350);
      } else if (el) {
        await p.to(el);
        await p.wait(a.ms ?? 600);
      }
    }
  }
}
