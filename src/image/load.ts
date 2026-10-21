// An image file read for the Image analysis node, in the browser: a TIFF with its own values (8 or 16 bit, float; gray,
// RGB, a palette; its scale when ImageJ or the microscope wrote one) by UTIF, other images (PNG, JPEG …) through a
// canvas (8 bit; gray when its three channels are equal everywhere).
import { packPixels, type ImgPixels } from './raster.ts';
import { isTiff } from '../imageFile.ts';

type Ifd = Record<string, unknown> & { width: number; height: number; data: Uint8Array; isLE?: boolean };
type Utif = { decode: (b: ArrayBuffer) => Ifd[]; decodeImage: (b: ArrayBuffer, i: Ifd) => void; toRGBA8: (i: Ifd) => Uint8Array };
const tag = (ifd: Ifd, t: number): number[] | undefined => ifd[`t${t}`] as number[] | undefined;

// the size of a pixel written in a TIFF: ImageJ's description (unit=…) with its resolution, or a resolution in
// centimetres; an inch resolution (72 dpi of a screen) is not taken as a scale
function tiffScale(ifd: Ifd): ImgPixels['scale'] {
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
  const sample = (k: number) => (bps === 8 ? data[k] : bps === 16 ? dv.getUint16(k * 2, true) : dv.getFloat32(k * 4, ifd.isLE !== false));
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
  const cv = document.createElement('canvas');
  [cv.width, cv.height] = [bmp.width, bmp.height];
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return fromRGBA(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
}

// The pixels of an image file, or why not
export async function readImagePixels(file: Blob): Promise<ImgPixels> {
  return (await isTiff(file)) ? readTiff(file) : readOther(file);
}
// a new id for a new image
export const newPixelsId = () => `img${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
