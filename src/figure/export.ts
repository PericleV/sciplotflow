// Figure files: SVG at the physical size of the canvas (85mm × 65mm …), PNG and TIFF at a chosen dpi with the
// resolution written in the file (so journals and documents read the intended size), PDF through the browser's print window
// (vector, fonts included), and a copy to the clipboard. SVG and PNG may carry the project (embed.ts): an editable figure.
import { PT_PER, type Figure } from './spec.ts';
import { pngWithProject, svgWithProject, type Embedded } from './embed.ts';
import { notify } from '../ui/dialogStore.ts';

export function download(content: Blob | string, filename: string, type = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  // a guided tour may wait for a file saved
  window.dispatchEvent(new CustomEvent('graph-flow:downloaded', { detail: filename }));
}

// A file saved where the user chooses: the system's Save dialog (its folders; the browser remembers the last folder
// by `id`), else (a browser without it: Firefox, Safari) downloaded. false: the dialog cancelled.
type SavePicker = (o: { suggestedName: string; id?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
export async function saveAs(content: Blob | string, filename: string, type: string, what: { description: string; ext: string; id: string }): Promise<boolean> {
  const pick = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (!pick) {
    download(content, filename, type);
    return true;
  }
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  try {
    const handle = await pick({ suggestedName: filename, id: what.id, types: [{ description: what.description, accept: { [type]: [what.ext] } }] });
    const w = await handle.createWritable();
    await w.write(blob);
    await w.close();
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false;
    // (not allowed here, e.g. in a frame: downloaded)
    if ((e as Error).name === 'SecurityError') {
      download(content, filename, type);
      return true;
    }
    notify(`Not saved: ${(e as Error).message}`);
    return false;
  }
  window.dispatchEvent(new CustomEvent('graph-flow:downloaded', { detail: filename }));
  return true;
}

export const safeName = (s: string, fallback: string) => s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || fallback;

function standalone(svg: SVGSVGElement, width: string, height: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', width);
  clone.setAttribute('height', height);
  clone.removeAttribute('data-physical');
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // what is there only for dragging on the screen
  clone.querySelectorAll('[data-export="skip"]').forEach((el) => el.remove());
  clone.querySelectorAll('[data-drag], [data-drag-root], [data-drag-move]').forEach((el) => {
    el.removeAttribute('data-drag');
    el.removeAttribute('data-drag-root');
    el.removeAttribute('data-drag-move');
  });
  // what a click on the screen finds
  clone.querySelectorAll('[data-part], [data-node]').forEach((el) => {
    el.removeAttribute('data-part');
    el.removeAttribute('data-node');
  });
  return new XMLSerializer().serializeToString(clone);
}

// the SVG file's text at the physical size, with the project in it when given
export function svgText(svg: SVGSVGElement, fig: Figure, embed?: Embedded): string {
  const body = standalone(svg, `${fig.width}${fig.unit}`, `${fig.height}${fig.unit}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${embed ? svgWithProject(body, embed) : body}`;
}
export function exportSvg(svg: SVGSVGElement, fig: Figure, name: string, embed?: Embedded) {
  download(svgText(svg, fig, embed), `${name}.svg`, 'image/svg+xml');
}

export const pixelSize = (fig: Figure, dpi: number) => ({
  w: Math.round(((fig.width * PT_PER[fig.unit]) / 72) * dpi),
  h: Math.round(((fig.height * PT_PER[fig.unit]) / 72) * dpi),
});
export const MAX_PIXELS = 16384;

// The figure drawn on a canvas of its size at `dpi`.
function rasterize(svg: SVGSVGElement, fig: Figure, dpi: number): Promise<HTMLCanvasElement> {
  const { w, h } = pixelSize(fig, dpi);
  if (w > MAX_PIXELS || h > MAX_PIXELS) return Promise.reject(new Error(`${w} × ${h} pixels is more than the browser can draw (${MAX_PIXELS} per side): lower the dpi.`));
  const text = standalone(svg, String(w), String(h));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      if (!ctx) return reject(new Error('No drawing context.'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(cv);
    };
    img.onerror = () => reject(new Error('The figure could not be drawn as an image.'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  });
}
const pngBlob = (cv: HTMLCanvasElement) => new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('The image could not be made.'))), 'image/png'));

// ---- PNG with its resolution: a pHYs chunk (pixels per metre) after the IHDR chunk ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  // PNG signature (8 bytes), then IHDR: length (4) + type (4) + 13 data bytes + CRC (4) = ends at byte 33
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(png.subarray(33), 33 + chunk.length);
  return out;
}

// the PNG file at `dpi` (its resolution written in), with the project in it when given
export async function pngBytes(svg: SVGSVGElement, fig: Figure, dpi: number, embed?: Embedded): Promise<Uint8Array> {
  const cv = await rasterize(svg, fig, dpi);
  const bytes = withDpi(new Uint8Array(await (await pngBlob(cv)).arrayBuffer()), dpi);
  return embed ? pngWithProject(bytes, embed) : bytes;
}
export async function exportPng(svg: SVGSVGElement, fig: Figure, dpi: number, name: string, embed?: Embedded) {
  const bytes = await pngBytes(svg, fig, dpi, embed);
  download(new Blob([bytes as BlobPart], { type: 'image/png' }), `${name}.png`);
}

// ---- TIFF: RGB (RGBA when the background is transparent), one strip, Adobe deflate compression, resolution in dpi ----
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export async function tiffBytes(rgba: Uint8ClampedArray, w: number, h: number, dpi: number, alpha: boolean): Promise<Uint8Array> {
  const spp = alpha ? 4 : 3;
  const raw = new Uint8Array(w * h * spp);
  for (let i = 0, j = 0; i < w * h; i++) {
    raw[j++] = rgba[i * 4];
    raw[j++] = rgba[i * 4 + 1];
    raw[j++] = rgba[i * 4 + 2];
    if (alpha) raw[j++] = rgba[i * 4 + 3];
  }
  const data = await deflate(raw);
  // header (8) · image data · bits per sample (spp × 2) · resolutions (2 × 8) · IFD
  const tags: [number, number, number, number][] = []; // tag, type (3 short, 4 long, 5 rational), count, value / offset
  const bpsOff = 8 + data.length + (data.length % 2);
  const resOff = bpsOff + spp * 2;
  const ifdOff = resOff + 16;
  tags.push([256, 4, 1, w], [257, 4, 1, h], [258, 3, spp, bpsOff], [259, 3, 1, 8], [262, 3, 1, 2], [273, 4, 1, 8], [277, 3, 1, spp], [278, 4, 1, h], [279, 4, 1, data.length], [282, 5, 1, resOff], [283, 5, 1, resOff + 8], [284, 3, 1, 1], [296, 3, 1, 2]);
  if (alpha) tags.push([338, 3, 1, 2]); // unassociated alpha
  tags.sort((a, b) => a[0] - b[0]);
  const size = ifdOff + 2 + tags.length * 12 + 4;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out.set([0x49, 0x49], 0); // little endian
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifdOff, true);
  out.set(data, 8);
  for (let k = 0; k < spp; k++) dv.setUint16(bpsOff + 2 * k, 8, true);
  dv.setUint32(resOff, Math.round(dpi), true);
  dv.setUint32(resOff + 4, 1, true);
  dv.setUint32(resOff + 8, Math.round(dpi), true);
  dv.setUint32(resOff + 12, 1, true);
  dv.setUint16(ifdOff, tags.length, true);
  tags.forEach(([tag, type, count, value], k) => {
    const p = ifdOff + 2 + k * 12;
    dv.setUint16(p, tag, true);
    dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) dv.setUint16(p + 8, value, true);
    else dv.setUint32(p + 8, value, true);
  });
  dv.setUint32(ifdOff + 2 + tags.length * 12, 0, true);
  return out;
}

export async function exportTiff(svg: SVGSVGElement, fig: Figure, dpi: number, name: string) {
  const cv = await rasterize(svg, fig, dpi);
  const ctx = cv.getContext('2d')!;
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const bytes = await tiffBytes(img.data, cv.width, cv.height, dpi, fig.background === 'none');
  download(new Blob([bytes as BlobPart], { type: 'image/tiff' }), `${name}.tif`);
}

export async function copyPng(svg: SVGSVGElement, fig: Figure, dpi: number) {
  const cv = await rasterize(svg, fig, dpi);
  const blob = await pngBlob(cv);
  if (!('ClipboardItem' in window) || !navigator.clipboard?.write) throw new Error('This browser cannot copy images: use PNG and insert the file.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// PDF: a window with the figure alone, at its size on a page of its size; the browser's “Save as PDF” keeps it vector
// with its fonts.
export function printPdf(svg: SVGSVGElement, fig: Figure, name: string) {
  const w = window.open('', '_blank');
  if (!w) {
    notify('The browser blocked the print window: allow pop-ups for this page.');
    return;
  }
  const size = `${fig.width}${fig.unit} ${fig.height}${fig.unit}`;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title><style>@page{size:${size};margin:0}html,body{margin:0;padding:0}svg{display:block}</style></head><body>${standalone(svg, `${fig.width}${fig.unit}`, `${fig.height}${fig.unit}`)}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
