// An image file read off the page (Image analysis): decoded (a TIFF by UTIF, others by the browser), its pixels packed
// as the node keeps them.
import { readImagePixels } from './load.ts';

self.onmessage = async (e: MessageEvent<Blob>) => {
  try {
    const pixels = await readImagePixels(e.data);
    (self as unknown as Worker).postMessage({ pixels });
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: (err as Error).message });
  }
};
