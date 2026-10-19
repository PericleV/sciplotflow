// An SVG file read into a Figure Drawing's objects: its paths, rectangles, circles, ellipses, lines, polylines and
// polygons as editable paths (their transforms applied, their fill, line, opacity kept; a gradient fill as its first
// colour), its texts as texts; in mm (from the file's own size), made at most `maxW` mm wide, from the top-left corner
// of their box. Nothing in the file runs: it is only read.
import { newAnnotation } from '../defaults.ts';
import { mapPath, parsePath, pathBox, pathText } from '../figure/paths.ts';
import type { AnnotationItem } from '../types.ts';
import { mapItem } from '../engine/drawingItems.ts';
import type { Pt } from '../figure/shapes.ts';

type M = [number, number, number, number, number, number]; // a b c d e f
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
const apply = (m: M, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function parseTransform(t: string | null): M {
  let m = I;
  for (const [, fn, args] of (t ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    const r = ((a[0] ?? 0) * Math.PI) / 180;
    const step: M =
      fn === 'matrix' && a.length >= 6
        ? [a[0], a[1], a[2], a[3], a[4], a[5]]
        : fn === 'translate'
          ? [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]
          : fn === 'scale'
            ? [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]
            : fn === 'rotate'
              ? mul(mul([1, 0, 0, 1, a[1] ?? 0, a[2] ?? 0], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -(a[1] ?? 0), -(a[2] ?? 0)])
              : fn === 'skewX'
                ? [1, 0, Math.tan(r), 1, 0, 0]
                : fn === 'skewY'
                  ? [1, Math.tan(r), 0, 1, 0, 0]
                  : I;
    m = mul(m, step);
  }
  return m;
}
const MM_PER: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };
const lengthMm = (v: string | null) => {
  const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(v ?? '');
  return m ? Number(m[1]) * MM_PER[(m[2] ?? '').toLowerCase()] : NaN;
};
// a colour as #rrggbb when the browser knows it (names, rgb()), else as written
function hex(c: string): string {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return c;
    ctx.fillStyle = '#000000';
    ctx.fillStyle = c;
    return String(ctx.fillStyle);
  } catch {
    return c;
  }
}
type Style = Record<string, string>;
const STYLE_KEYS = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-linejoin', 'stroke-linecap', 'display', 'visibility', 'font-size', 'font-family', 'font-weight', 'font-style'];
function styleOfEl(el: Element, parent: Style): Style {
  const s: Style = { ...parent };
  delete s.opacity; // opacity multiplies down the tree
  for (const k of STYLE_KEYS) {
    const v = el.getAttribute(k);
    if (v !== null) s[k] = v.trim();
  }
  for (const part of (el.getAttribute('style') ?? '').split(';')) {
    const [k, v] = part.split(':').map((x) => x?.trim());
    if (k && v && STYLE_KEYS.includes(k)) s[k] = v;
  }
  s.opacity = String((Number(parent.opacity ?? 1) || 1) * (s.opacity !== undefined ? Number(s.opacity) : 1));
  if (el.getAttribute('opacity') !== null) s.opacity = String((Number(parent.opacity ?? 1) || 1) * Number(el.getAttribute('opacity')));
  return s;
}
const num = (el: Element, k: string, d = 0) => {
  const v = parseFloat(el.getAttribute(k) ?? '');
  return Number.isFinite(v) ? v : d;
};
const K = 0.5522847498;
function outline(el: Element): string | null {
  switch (el.tagName.toLowerCase()) {
    case 'path':
      return el.getAttribute('d');
    case 'rect': {
      const [x, y, w, h] = [num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height')];
      if (!(w > 0) || !(h > 0)) return null;
      let rx = num(el, 'rx', NaN);
      let ry = num(el, 'ry', NaN);
      if (!Number.isFinite(rx)) rx = Number.isFinite(ry) ? ry : 0;
      if (!Number.isFinite(ry)) ry = rx;
      [rx, ry] = [Math.min(rx, w / 2), Math.min(ry, h / 2)];
      if (!(rx > 0)) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [num(el, 'cx'), num(el, 'cy')];
      const rx = el.tagName.toLowerCase() === 'circle' ? num(el, 'r') : num(el, 'rx');
      const ry = el.tagName.toLowerCase() === 'circle' ? rx : num(el, 'ry');
      if (!(rx > 0) || !(ry > 0)) return null;
      const [kx, ky] = [rx * K, ry * K];
      return `M${cx + rx} ${cy}C${cx + rx} ${cy + ky} ${cx + kx} ${cy + ry} ${cx} ${cy + ry}C${cx - kx} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy}C${cx - rx} ${cy - ky} ${cx - kx} ${cy - ry} ${cx} ${cy - ry}C${cx + kx} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy}Z`;
    }
    case 'line':
      return `M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`;
    case 'polyline':
    case 'polygon': {
      const v = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (v.length < 4) return null;
      const pts: string[] = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push(`${v[i]} ${v[i + 1]}`);
      return `M${pts.join('L')}${el.tagName.toLowerCase() === 'polygon' ? 'Z' : ''}`;
    }
    default:
      return null;
  }
}

export function importSvg(text: string, maxW = 60): { items: AnnotationItem[]; w: number; h: number } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) throw new Error('Not an SVG file that can be read.');
  // user units → mm: from the file's width and its viewBox (else 96 px to the inch)
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0;
  const wMm = lengthMm(svg.getAttribute('width'));
  const unit = hasVb && Number.isFinite(wMm) && wMm > 0 ? wMm / vb[2] : 25.4 / 96;
  const root: M = mul([unit, 0, 0, unit, 0, 0], hasVb ? [1, 0, 0, 1, -vb[0], -vb[1]] : I);
  // a gradient's first colour (for a fill or a line given by one)
  const paint = (v: string | undefined): string => {
    if (!v || v === 'none' || v === 'transparent') return '';
    const m = /url\(\s*#([^)\s]+)\s*\)/.exec(v);
    if (m) {
      const g = doc.getElementById(m[1]);
      const stop = g?.querySelector('stop');
      const c = stop?.getAttribute('stop-color') ?? /stop-color\s*:\s*([^;]+)/.exec(stop?.getAttribute('style') ?? '')?.[1];
      return c ? hex(c.trim()) : '#808080';
    }
    return v === 'currentColor' ? '#000000' : hex(v);
  };
  const items: AnnotationItem[] = [];
  const walk = (el: Element, m: M, st: Style) => {
    const tag = el.tagName.toLowerCase();
    if (['defs', 'clippath', 'mask', 'symbol', 'marker', 'pattern', 'lineargradient', 'radialgradient', 'style', 'script', 'title', 'desc', 'metadata'].includes(tag)) return;
    const s = styleOfEl(el, st);
    if (s.display === 'none' || s.visibility === 'hidden') return;
    const mm = mul(m, parseTransform(el.getAttribute('transform')));
    const scale = Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2])) || 1;
    if (tag === 'text') {
      const p = apply(mm, [num(el, 'x'), num(el, 'y')]);
      const size = (parseFloat(s['font-size'] ?? '16') || 16) * scale * (72 / 25.4);
      const t = (el.textContent ?? '').trim();
      if (t) items.push(newAnnotation('text', { coords: 'data', x: p[0], y: p[1], anchor: 'bl', text: t, style: { size: +size.toFixed(2), color: paint(s.fill ?? '#000000') || '#000000', ...(s['font-weight'] === 'bold' || Number(s['font-weight']) >= 600 ? { bold: true } : {}), ...(s['font-style'] === 'italic' ? { italic: true } : {}) } }));
      return;
    }
    const d = outline(el);
    if (d) {
      const fill = paint(s.fill ?? '#000000');
      const stroke = paint(s.stroke);
      const width = stroke ? (parseFloat(s['stroke-width'] ?? '1') || 1) * scale * (72 / 25.4) : 0;
      const dd = mapPath(pathText(parsePath(d)), (q) => apply(mm, q));
      if (dd)
        items.push(
          newAnnotation('shape', {
            kind: 'path',
            coords: 'data',
            d: dd,
            fill: tag === 'line' ? '' : fill,
            fillOpacity: s['fill-opacity'] !== undefined ? Number(s['fill-opacity']) : 1,
            color: stroke || '#000000',
            width: +width.toFixed(3),
            opacity: Math.max(0, Math.min(1, Number(s.opacity) || 1)),
            head1: 'none',
            head2: 'none',
            ...(s['fill-rule'] === 'evenodd' ? { evenodd: true } : {}),
            ...(s['stroke-linejoin'] === 'round' || s['stroke-linejoin'] === 'bevel' ? { join: s['stroke-linejoin'] } : {}),
            ...(s['stroke-linecap'] === 'round' || s['stroke-linecap'] === 'square' ? { cap: s['stroke-linecap'] } : {}),
          }),
        );
    }
    for (const c of Array.from(el.children)) walk(c, mm, s);
  };
  for (const c of Array.from(svg.children)) walk(c, root, {});
  if (!items.length) throw new Error('No shapes found in the SVG file.');
  // from the top-left corner of their box, at most maxW mm wide (lines and texts as much smaller)
  const boxes = items.map((it) => (it.type === 'shape' && it.spec.d ? pathBox(parsePath(it.spec.d)) : it.type === 'text' ? { x: it.spec.x ?? 0, y: (it.spec.y ?? 0) - 3, w: 0, h: 3 } : null)).filter((b): b is NonNullable<typeof b> => !!b);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const w = Math.max(...boxes.map((b) => b.x + b.w)) - x0 || 1;
  const h = Math.max(...boxes.map((b) => b.y + b.h)) - y0 || 1;
  const k = w > maxW ? maxW / w : 1;
  const placed = items.map((it) => {
    const q = mapItem(it, ([x, y]) => [(x - x0) * k, (y - y0) * k]);
    if (k === 1) return q;
    if (q.type === 'shape') return { ...q, spec: { ...q.spec, width: +((q.spec.width ?? 0) * k).toFixed(3) } };
    if (q.type === 'text') return { ...q, spec: { ...q.spec, style: { ...q.spec.style, size: +((q.spec.style?.size ?? 8) * k).toFixed(2) } } };
    return q;
  });
  return { items: placed, w: +(w * k).toFixed(3), h: +(h * k).toFixed(3) };
}
