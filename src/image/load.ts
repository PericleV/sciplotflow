// An image file read for the Image analysis node, in the browser: a TIFF with its own values (8 or 16 bit, float; gray,
// RGB, a palette; its scale when ImageJ or the microscope wrote one) by UTIF, other images (PNG, JPEG …) through a
// canvas (8 bit; gray when its three channels are equal everywhere), height maps (Gwyddion .gwy, text) as float.
import { packPixels, type ImgPixels } from './raster.ts';
import { isTiff } from '../imageFile.ts';
import { HEIGHT_FILES, readGwy, readHeightText } from './heights.ts';

type Ifd = Record<string, unknown> & { width: number; height: number; data: Uint8Array; isLE?: boolean };
type Utif = { decode: (b: ArrayBuffer) => Ifd[]; decodeImage: (b: ArrayBuffer, i: Ifd) => void; toRGBA8: (i: Ifd) => Uint8Array };
const tag = (ifd: Ifd, t: number): number[] | undefined => ifd[`t${t}`] as number[] | undefined;

// the size of a pixel written in a TIFF: by the electron microscope (its text tags), ImageJ's description (unit=…)
// with its resolution, or a resolution in centimetres; an inch resolution (72 dpi of a screen) is not taken as a scale
function tiffScale(ifd: Ifd): ImgPixels['scale'] {
  const sem = semScale(ifd);
  if (sem) return sem;
  const xr = tag(ifd, 282);
  const res = xr ? (xr.length >= 2 ? xr[0] / xr[1] : xr[0]) : NaN;
  if (!(res > 0)) return undefined;
  const desc = String((ifd.t270 as string[] | undefined)?.[0] ?? '');
  const unit = /unit=([^\n]+)/.exec(desc)?.[1]?.trim().replace(/\\u00B5/g, 'µ');
  if (unit && unit !== 'pixel' && unit !== 'inch') return { size: 1 / res, unit: unit === 'micron' ? 'µm' : unit };
  const ru = tag(ifd, 296)?.[0] ?? 2;
  if (ru === 3) return { size: 10000 / res, unit: 'µm' };
  return undefined;
}

// the text of a TIFF's tags (the microscopes write their settings there: FEI / Thermo 34682, Zeiss 34118, Tescan
// 50431 …), every one that is text
function tagTexts(ifd: Ifd): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(ifd)) {
    if (!/^t\d+$/.test(k)) continue;
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v) && typeof v[0] === 'string') out.push(v.join('\n'));
    else if (v instanceof Uint8Array && v.length > 16) {
      // (a text written as bytes)
      let t = '';
      for (let i = 0; i < Math.min(v.length, 200000); i++) t += String.fromCharCode(v[i]);
      if (/[A-Za-z]{4}/.test(t)) out.push(t);
    }
  }
  return out.join('\n');
}
const LENGTH: Record<string, number> = { m: 1, mm: 1e-3, um: 1e-6, µm: 1e-6, nm: 1e-9, pm: 1e-12 };
// the pixel size an electron microscope wrote: FEI / Thermo (PixelWidth=… in metres), Zeiss (Image Pixel Size = … nm),
// Tescan (PixelSizeX=… in metres) — in nm or µm, as suits it
export function semScale(ifd: Record<string, unknown>): ImgPixels['scale'] {
  const t = tagTexts(ifd as Ifd);
  if (!t) return undefined;
  let metres = NaN;
  const fei = /PixelWidth\s*=\s*([\d.]+(?:[eE][-+]?\d+)?)/.exec(t);
  const tescan = /PixelSizeX\s*=\s*([\d.]+(?:[eE][-+]?\d+)?)/.exec(t);
  const zeiss = /Image Pixel Size\s*=\s*([\d.]+)\s*(pm|nm|µm|um|mm)/i.exec(t);
  if (fei) metres = Number(fei[1]);
  else if (tescan) metres = Number(tescan[1]);
  else if (zeiss) metres = Number(zeiss[1]) * LENGTH[zeiss[2].toLowerCase().replace('um', 'µm')];
  if (!(metres > 0) || metres > 1e-2) return undefined;
  return metres < 1e-7 ? { size: +(metres * 1e9).toPrecision(6), unit: 'nm' } : { size: +(metres * 1e6).toPrecision(6), unit: 'µm' };
}

async function readTiff(file: Blob): Promise<ImgPixels> {
  const UTIF = ((await import('utif2')) as unknown as { default: Utif }).default;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error('no image in the TIFF file');
  const ifd = ifds[0];
  UTIF.decodeImage(buf, ifd);
  const w = ifd.width;
  const h = ifd.height;
  const bps = tag(ifd, 258)?.[0] ?? 1;
  const spp = tag(ifd, 277)?.[0] ?? 1;
  const photo = tag(ifd, 262)?.[0] ?? 1;
  const fmt = tag(ifd, 339)?.[0] ?? 1;
  const planar = tag(ifd, 284)?.[0] ?? 1;
  const scale = tiffScale(ifd);
  const n = w * h;
  const data = ifd.data;
  // what the reader cannot take sample by sample: through UTIF's 8-bit RGBA
  const simple = planar === 1 && (bps === 8 || bps === 16 || (bps === 32 && fmt === 3)) && (photo === 0 || photo === 1 || photo === 2 || photo === 3);
  if (!simple) {
    const rgba = UTIF.toRGBA8(ifd);
    return fromRGBA(rgba, w, h, scale);
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // (16 and 32 bit in the file's own byte order)
  const le = ifd.isLE !== false;
  const sample = (k: number) => (bps === 8 ? data[k] : bps === 16 ? dv.getUint16(k * 2, le) : dv.getFloat32(k * 4, le));
  if (photo === 3) {
    // a palette: the colours of the colour map (16 bit) as 8-bit RGB
    const map = tag(ifd, 320) ?? [];
    const nc = map.length / 3;
    const out = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = sample(i);
      out[i * 3] = map[v] >> 8;
      out[i * 3 + 1] = map[nc + v] >> 8;
      out[i * 3 + 2] = map[2 * nc + v] >> 8;
    }
    return packPixels(w, h, 3, 8, out, scale);
  }
  const depth = bps === 8 ? 8 : bps === 16 ? 16 : 32;
  const max = depth === 8 ? 255 : depth === 16 ? 65535 : 0;
  if (spp >= 3 && photo === 2) {
    const out = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = sample(i * spp + c);
    return packPixels(w, h, 3, depth, out, scale);
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = sample(i * spp);
    // white is zero: turned the usual way
    out[i] = photo === 0 && depth !== 32 ? max - v : v;
  }
  return packPixels(w, h, 1, depth, out, scale);
}

// RGBA pixels (alpha over white) as 8-bit gray (when R = G = B everywhere) or RGB
function fromRGBA(rgba: ArrayLike<number>, w: number, h: number, scale?: ImgPixels['scale']): ImgPixels {
  const n = w * h;
  let isGray = true;
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(rgba[i * 4 + c] * a + 255 * (1 - a));
    if (isGray && (rgb[i * 3] !== rgb[i * 3 + 1] || rgb[i * 3] !== rgb[i * 3 + 2])) isGray = false;
  }
  if (isGray) return packPixels(w, h, 1, 8, Uint8Array.from({ length: n }, (_, i) => rgb[i * 3]), scale);
  return packPixels(w, h, 3, 8, rgb, scale);
}

async function readOther(file: Blob): Promise<ImgPixels> {
  const bmp = await createImageBitmap(file);
  // (an offscreen canvas: in a worker as on the page)
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const g = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return fromRGBA(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
}

// The pixels of an image file, or why not
export async function readImagePixels(file: Blob): Promise<ImgPixels> {
  if (isHeightFile(file)) {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const hm = String.fromCharCode(...head) === 'GWYP' ? readGwy(await file.arrayBuffer()) : readHeightText(await file.text());
    return { ...packPixels(hm.w, hm.h, 1, 32, hm.z, hm.px), ...(hm.zUnit ? { zUnit: hm.zUnit } : {}) };
  }
  return (await isTiff(file)) ? readTiff(file) : readOther(file);
}
// a file of heights (by its name)
export const isHeightFile = (file: Blob) => HEIGHT_FILES.test((file as File).name ?? '');
// The same, read in a worker of its own (a large TIFF decoded and packed without stopping the page); on the page when
// a worker cannot be made
export function readImagePixelsAsync(file: Blob): Promise<ImgPixels> {
  let w: Worker;
  try {
    w = new Worker(new URL('./loadWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return readImagePixels(file);
  }
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<{ pixels?: ImgPixels; error?: string }>) => {
      w.terminate();
      if (e.data.pixels) resolve(e.data.pixels);
      else reject(new Error(e.data.error ?? 'the image could not be read'));
    };
    w.onerror = () => {
      w.terminate();
      // (the worker itself failed: read on the page)
      readImagePixels(file).then(resolve, reject);
    };
    w.postMessage(file);
  });
}
// a new id for a new image
export const newPixelsId = () => `img${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
