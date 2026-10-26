// The paint of the trainable classifier (Pixel classifier): every pixel of the original image a class painted on it
// (0: none), as a brush, an eraser and a fill paint it; kept in the node as runs of the same value (base64); the
// examples the classifier learns from, in the part analysed.
import { fillPolygon, type Pt } from './roi.ts';
import type { TrainExample } from './classify.ts';

// in the node: its size (the original's), the classes by number (1: the first), the runs
export type PaintStored = { w: number; h: number; classes: string[]; rle: string };
export type PaintLayer = { w: number; h: number; classes: string[]; px: Uint8Array };

export const emptyPaint = (w: number, h: number, classes: string[] = []): PaintLayer => ({ w, h, classes, px: new Uint8Array(w * h) });

// ---- kept as runs: value, then its length as a varint (7 bits a byte), in base64 ----
export function encodePaint(l: PaintLayer): PaintStored {
  const out: number[] = [];
  const px = l.px;
  for (let i = 0; i < px.length; ) {
    const v = px[i];
    let j = i + 1;
    while (j < px.length && px[j] === v) j++;
    out.push(v);
    let n = j - i;
    while (n >= 128) {
      out.push((n & 127) | 128);
      n >>>= 7;
    }
    out.push(n);
    i = j;
  }
  let bin = '';
  const bytes = Uint8Array.from(out);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { w: l.w, h: l.h, classes: [...l.classes], rle: btoa(bin) };
}
export function decodePaint(s: PaintStored): PaintLayer {
  const bin = atob(s.rle);
  const px = new Uint8Array(s.w * s.h);
  let o = 0;
  for (let i = 0; i < bin.length && o < px.length; ) {
    const v = bin.charCodeAt(i++);
    let [n, sh] = [0, 0];
    for (;;) {
      const b = bin.charCodeAt(i++);
      n |= (b & 127) << sh;
      sh += 7;
      if (b < 128) break;
    }
    px.fill(v, o, Math.min(px.length, o + n));
    o += n;
  }
  return { w: s.w, h: s.h, classes: [...s.classes], px };
}

// the number of a class in the layer (added when new)
export function classIndex(l: PaintLayer, cls: string): number {
  let k = l.classes.indexOf(cls);
  if (k < 0) {
    if (l.classes.length >= 255) return 255;
    l.classes.push(cls);
    k = l.classes.length - 1;
  }
  return k + 1;
}

// ---- painting (pixels of the original; v: the class's number, 0: erased); the box of the pixels changed ----
export type Box = [number, number, number, number];
export function paintDisc(l: PaintLayer, cx: number, cy: number, r: number, v: number): Box {
  const R = Math.max(0.5, r);
  const [x0, y0, x1, y1] = [Math.max(0, Math.floor(cx - R)), Math.max(0, Math.floor(cy - R)), Math.min(l.w - 1, Math.ceil(cx + R)), Math.min(l.h - 1, Math.ceil(cy + R))];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= R * R) l.px[y * l.w + x] = v;
  return [x0, y0, x1, y1];
}
// a stroke from a to b: discs a quarter of the radius apart (no gaps however fast the mouse)
export function paintSegment(l: PaintLayer, a: Pt, b: Pt, r: number, v: number): Box {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / Math.max(0.5, r / 4)));
  let box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (let t = 0; t <= n; t++) {
    const d = paintDisc(l, a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n, r, v);
    box = [Math.min(box[0], d[0]), Math.min(box[1], d[1]), Math.max(box[2], d[2]), Math.max(box[3], d[3])];
  }
  return box;
}
// the inside of an outline painted
export function paintFill(l: PaintLayer, pts: Pt[], v: number): Box {
  const win = fillPolygon(pts, l.w, l.h);
  for (let y = 0; y < win.h; y++) for (let x = 0; x < win.w; x++) if (win.m[y * win.w + x]) l.px[(win.y0 + y) * l.w + win.x0 + x] = v;
  return [win.x0, win.y0, win.x0 + win.w - 1, win.y0 + win.h - 1];
}
// the pixels painted of every class
export function paintCounts(l: PaintLayer): Record<string, number> {
  const n = new Array<number>(l.classes.length + 1).fill(0);
  for (let i = 0; i < l.px.length; i++) n[l.px[i]]++;
  return Object.fromEntries(l.classes.map((c, k) => [c, n[k + 1]]));
}
// a class's paint taken away
export function clearClass(l: PaintLayer, cls: string) {
  const k = l.classes.indexOf(cls) + 1;
  if (k > 0) for (let i = 0; i < l.px.length; i++) if (l.px[i] === k) l.px[i] = 0;
}

// ---- the examples of the classifier: the pixels painted of every class in the part analysed (crop: x, y, w, h of the
// original; absent: all), their indices in it; their key (the same paint: the same key) ----
const decoded = new Map<string, PaintLayer>();
export function paintExamples(s: PaintStored | undefined, crop?: [number, number, number, number] | null): TrainExample[] {
  if (!s?.rle) return [];
  let l = decoded.get(s.rle);
  if (!l) {
    l = decodePaint(s);
    decoded.clear();
    decoded.set(s.rle, l);
  }
  const [cx, cy, cw, ch] = crop ?? [0, 0, l.w, l.h];
  const lists = l.classes.map(() => [] as number[]);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const v = l.px[(y + cy) * l.w + x + cx];
      if (v) lists[v - 1]?.push(y * cw + x);
    }
  let hash = 2166136261;
  for (let i = 0; i < s.rle.length; i++) hash = Math.imul(hash ^ s.rle.charCodeAt(i), 16777619);
  const key = `${(hash >>> 0).toString(36)}|${cx},${cy},${cw},${ch}`;
  return l.classes.flatMap((cls, k) => (lists[k].length ? [{ cls, pts: [], line: false, width: 0, px: Int32Array.from(lists[k]), pw: cw, key: `${key}|${k}` }] : []));
}
