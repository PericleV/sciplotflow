// A picture file as a data URL the browser can show: PNG, JPEG, SVG … as they are; a TIFF (which browsers do not show)
// read by UTIF (loaded only when one is opened) and made a PNG — its first page, 8 bits per channel.

// a TIFF: by its type, its name, or its first bytes (II*\0 / MM\0*)
export async function isTiff(file: Blob): Promise<boolean> {
  const name = (file as File).name ?? '';
  if (file.type === 'image/tiff' || /\.tiff?$/i.test(name)) return true;
  if (file.type && file.type !== 'application/octet-stream') return false;
  const b = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return (b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42);
}

type Utif = {
  decode: (buf: ArrayBuffer) => { width: number; height: number }[];
  decodeImage: (buf: ArrayBuffer, ifd: { width: number; height: number }) => void;
  toRGBA8: (ifd: { width: number; height: number }) => Uint8Array;
};

// the first page of a TIFF as a PNG data URL
async function tiffToPng(file: Blob): Promise<string> {
  const UTIF = ((await import('utif2')) as unknown as { default: Utif }).default;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error('no image in the TIFF file');
  const ifd = ifds[0];
  UTIF.decodeImage(buf, ifd);
  const { width: w, height: h } = ifd;
  if (!(w > 0 && h > 0)) throw new Error('the TIFF file has no image data');
  const cv = document.createElement('canvas');
  [cv.width, cv.height] = [w, h];
  cv.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(ifd)), w, h), 0, 0);
  return cv.toDataURL('image/png');
}

const asDataUrl = (file: Blob) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(r.error);
    r.readAsDataURL(file);
  });

// A picture as a data URL (a TIFF as a PNG)
export async function imageUrl(file: Blob): Promise<string> {
  return (await isTiff(file)) ? tiffToPng(file) : asDataUrl(file);
}

// the pictures the file dialogs offer (TIFF named: some systems leave it out of image/*)
export const IMAGE_ACCEPT = 'image/*,.svg,.tif,.tiff';
