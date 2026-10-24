// The text of a picture read by tesseract.js (Apache-2.0), loaded only when it is first asked for: its engine and the
// English data come from the jsDelivr CDN once (some 5 MB, then kept by the browser); the picture is read here and
// never sent anywhere. Used to read the label of a scale bar.
import { labelBox, type FoundBar } from './scalebar.ts';

type OcrWorker = { setParameters: (p: Record<string, string>) => Promise<unknown>; recognize: (c: HTMLCanvasElement) => Promise<{ data: { text: string } }> };
let made: Promise<OcrWorker> | null = null;
const ocr = () =>
  (made ??= import('tesseract.js').then(async (m) => {
    const T = (m as unknown as { default: { createWorker: (lang: string) => Promise<OcrWorker> } }).default;
    const w = await T.createWorker('eng');
    // (sparse text: a few words anywhere)
    await w.setParameters({ tessedit_pageseg_mode: '11' });
    return w;
  }));

// The label of a bar, read: the region around it (labelBox) cut from the gray image, the bar painted over, made dark on
// light (as OCR reads best), enlarged to some 3× and read
export async function readBarLabel(g: ArrayLike<number>, w: number, h: number, lo: number, hi: number, bar: FoundBar): Promise<string> {
  const [bx, by, bw, bh] = labelBox(bar, w, h);
  const f = Math.max(1, Math.min(4, Math.round(120 / Math.max(1, bh / 3))));
  const cv = document.createElement('canvas');
  [cv.width, cv.height] = [bw * f, bh * f];
  const img = new ImageData(bw * f, bh * f);
  const sp = hi - lo || 1;
  for (let y = 0; y < bh * f; y++)
    for (let x = 0; x < bw * f; x++) {
      const [sx, sy] = [bx + Math.floor(x / f), by + Math.floor(y / f)];
      const onBar = sx >= bar.x0 - 1 && sx <= bar.x1 + 1 && sy >= bar.y0 - 1 && sy <= bar.y1 + 1;
      let v = onBar ? (bar.bright ? 0 : 1) : (g[sy * w + sx] - lo) / sp;
      // (a white label on a dark ground turned dark on light)
      if (bar.bright) v = 1 - v;
      const k = 4 * (y * bw * f + x);
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.max(0, Math.min(255, Math.round(v * 255)));
      img.data[k + 3] = 255;
    }
  cv.getContext('2d')!.putImageData(img, 0, 0);
  const r = await (await ocr()).recognize(cv);
  return r.data.text;
}
