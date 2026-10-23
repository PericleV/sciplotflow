// The test images of particles (src/image/testImages.ts) written as PNG files to test-images/: npm run test-images
import { mkdirSync, writeFileSync } from 'node:fs';
import { clustersImage, cubesImage, mixedImage, shapesImage, textureImage } from '../src/image/testImages.ts';
import { encodePNG } from '../src/image/render.ts';

const dir = new URL('../test-images/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const t of [clustersImage(), shapesImage(), mixedImage(), textureImage(), cubesImage()]) {
  const rgba = new Uint8ClampedArray(t.w * t.h * 4);
  for (let i = 0; i < t.px.length; i++) {
    rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = t.px[i];
    rgba[4 * i + 3] = 255;
  }
  writeFileSync(new URL(`${t.name}.png`, dir), encodePNG(rgba, t.w, t.h));
  console.log(`${t.name}.png: ${t.w} × ${t.h}, ${t.truth.length} particles (${[...new Set(t.truth.map((q) => q.shape))].join(', ')})`);
}
