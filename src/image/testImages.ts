// Images of particles drawn here, for the examples, the checks and the files of test-images/ (npm run test-images):
// what is in them is known, so what the Image analysis node finds can be checked. Gray, 8 bit; the edges soft (every
// pixel the part of it covered, 3 × 3 samples), a little blur and noise. Pure.
import { fillPolygon, type Pt } from './roi.ts';

// side, angle: of a cube (its side, px; its orientation: counterclockwise as seen, 0 … 90°)
export type TestShape = { shape: 'circle' | 'ellipse' | 'triangle' | 'square' | 'rectangle' | 'irregular'; cx: number; cy: number; cluster?: number; side?: number; angle?: number };
export type TestImage = { name: string; w: number; h: number; px: Uint8Array; truth: TestShape[] };

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const regular = (cx: number, cy: number, r: number, n: number, a0: number): Pt[] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos(a0 + (2 * Math.PI * k) / n), cy + r * Math.sin(a0 + (2 * Math.PI * k) / n)]);
const ellipse = (cx: number, cy: number, a: number, b: number, t: number): Pt[] =>
  Array.from({ length: 96 }, (_, k) => {
    const u = (2 * Math.PI * k) / 96;
    return [cx + a * Math.cos(u) * Math.cos(t) - b * Math.sin(u) * Math.sin(t), cy + a * Math.cos(u) * Math.sin(t) + b * Math.sin(u) * Math.cos(t)];
  });
const blob = (cx: number, cy: number, r: number, rnd: () => number): Pt[] => {
  const [a1, a2, p1, p2] = [0.25 + 0.15 * rnd(), 0.15 + 0.1 * rnd(), rnd() * 6, rnd() * 6];
  return Array.from({ length: 72 }, (_, k) => {
    const t = (2 * Math.PI * k) / 72;
    const rr = r * (1 + a1 * Math.sin(3 * t + p1) + a2 * Math.cos(5 * t + p2));
    return [cx + rr * Math.cos(t), cy + rr * Math.sin(t)];
  });
};

// the shapes' coverage of every pixel (3 × 3 samples a pixel); then value = ground + (object − ground) · coverage,
// blurred a little, noise added
function render(w: number, h: number, shapes: Pt[][], ground: (x: number, y: number) => number, object: (x: number, y: number, k: number) => number, noise: number, seed: number): Uint8Array {
  const S = 3;
  const cover = new Float32Array(w * h);
  const which = new Int32Array(w * h).fill(-1);
  shapes.forEach((poly, k) => {
    const win = fillPolygon(
      poly.map(([x, y]): Pt => [x * S, y * S]),
      w * S,
      h * S,
    );
    for (let y = 0; y < win.h; y++)
      for (let x = 0; x < win.w; x++)
        if (win.m[y * win.w + x]) {
          const i = Math.floor((win.y0 + y) / S) * w + Math.floor((win.x0 + x) / S);
          cover[i] = Math.min(1, cover[i] + 1 / (S * S));
          which[i] = k;
        }
  });
  const v = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const g = ground(x, y);
      v[i] = which[i] >= 0 ? g + (object(x, y, which[i]) - g) * cover[i] : g;
    }
  // (a 3 × 3 blur of weights 1 2 1)
  const b = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const k = (2 - Math.abs(dx)) * (2 - Math.abs(dy));
          s += k * v[yy * w + xx];
          n += k;
        }
      b[y * w + x] = s / n;
    }
  const rnd = rng(seed);
  const px = new Uint8Array(w * h);
  for (let i = 0; i < px.length; i++) px[i] = Math.max(0, Math.min(255, Math.round(b[i] + (rnd() + rnd() + rnd() - 1.5) * noise)));
  return px;
}

// Round particles, alone and in clusters of 2 to 4 that overlap (chains: neighbours 1.6 radii apart)
export function clustersImage(): TestImage {
  const [w, h] = [512, 384];
  const rnd = rng(5);
  const shapes: Pt[][] = [];
  const truth: TestShape[] = [];
  const disc = (cx: number, cy: number, r: number, cluster?: number) => {
    shapes.push(regular(cx, cy, r, 72, 0));
    truth.push({ shape: 'circle', cx, cy, ...(cluster !== undefined ? { cluster } : {}) });
  };
  // (a grid of places, each a particle or a cluster)
  let c = 0;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 6; i++) {
      const cx = 45 + i * 84 + (rnd() - 0.5) * 10;
      const cy = 48 + j * 96 + (rnd() - 0.5) * 10;
      const r = 10 + rnd() * 4;
      const n = (i + j) % 3 === 0 ? 2 + Math.floor(rnd() * 3) : 1;
      if (n === 1) {
        disc(cx, cy, r);
        continue;
      }
      // (a chain, turning a little each time: neighbours 1.6 radii apart — they overlap, a neck between them)
      const a0 = rnd() * Math.PI;
      let [x, y] = [cx - 0.8 * r * (n - 1) * Math.cos(a0), cy - 0.8 * r * (n - 1) * Math.sin(a0)];
      for (let k = 0; k < n; k++) {
        disc(x, y, r, c);
        const t = a0 + (k % 2 ? -0.5 : 0.5);
        [x, y] = [x + 1.6 * r * Math.cos(t), y + 1.6 * r * Math.sin(t)];
      }
      c++;
    }
  const px = render(
    w,
    h,
    shapes,
    (x, y) => 40 + (12 * x) / w + (8 * y) / h,
    () => 175,
    10,
    6,
  );
  return { name: 'particles_clusters', w, h, px, truth };
}

// Circles, ellipses, triangles, squares, rectangles and irregular shapes, turned every way, of several sizes; a few
// circles touching
export function shapesImage(): TestImage {
  const [w, h] = [560, 400];
  const rnd = rng(9);
  const shapes: Pt[][] = [];
  const truth: TestShape[] = [];
  const kinds: TestShape['shape'][] = ['circle', 'triangle', 'square', 'rectangle', 'ellipse', 'irregular'];
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 7; i++) {
      const shape = kinds[(i + 2 * j) % kinds.length];
      const cx = 42 + i * 79 + (rnd() - 0.5) * 8;
      const cy = 42 + j * 79 + (rnd() - 0.5) * 8;
      const r = 14 + rnd() * 12;
      const t = rnd() * Math.PI;
      const poly =
        shape === 'circle' ? regular(cx, cy, r * 0.8, 72, 0)
        : shape === 'triangle' ? regular(cx, cy, r, 3, t)
        : shape === 'square' ? regular(cx, cy, r * 0.95, 4, t)
        : shape === 'rectangle' ? rectangle(cx, cy, r * 1.1, r * 0.45, t)
        : shape === 'ellipse' ? ellipse(cx, cy, r, r * 0.55, t)
        : blob(cx, cy, r * 0.85, rnd);
      shapes.push(poly);
      truth.push({ shape, cx, cy });
    }
  return {
    name: 'particles_shapes',
    w,
    h,
    px: render(
      w,
      h,
      shapes,
      () => 200,
      () => 60,
      8,
      10,
    ),
    truth,
  };
}
// All of them mixed: circles, triangles, squares, rectangles, ellipses and irregular shapes, two in five in clusters
// of 2 or 3 of a kind that touch (neighbours 1.4 radii apart), on a ground brighter to the right
export function mixedImage(): TestImage {
  const [w, h] = [600, 440];
  const rnd = rng(21);
  const shapes: Pt[][] = [];
  const truth: TestShape[] = [];
  const kinds: TestShape['shape'][] = ['circle', 'triangle', 'square', 'rectangle', 'ellipse', 'irregular'];
  const make = (shape: TestShape['shape'], cx: number, cy: number, r: number, t: number): Pt[] =>
    shape === 'circle' ? regular(cx, cy, r * 0.8, 72, 0)
    : shape === 'triangle' ? regular(cx, cy, r, 3, t)
    : shape === 'square' ? regular(cx, cy, r * 0.95, 4, t)
    : shape === 'rectangle' ? rectangle(cx, cy, r * 1.1, r * 0.45, t)
    : shape === 'ellipse' ? ellipse(cx, cy, r, r * 0.55, t)
    : blob(cx, cy, r * 0.85, rnd);
  let c = 0;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 6; i++) {
      const shape = kinds[Math.floor(rnd() * kinds.length)];
      const cx = 55 + i * 98 + (rnd() - 0.5) * 10;
      const cy = 60 + j * 106 + (rnd() - 0.5) * 10;
      const r = 13 + rnd() * 7;
      const n = rnd() < 0.4 ? 2 + Math.floor(rnd() * 2) : 1;
      const a0 = rnd() * Math.PI;
      for (let k = 0; k < n; k++) {
        const d = n === 1 ? 0 : 0.7 * r * (k - (n - 1) / 2) * 2;
        const [x, y] = [cx + d * Math.cos(a0), cy + d * Math.sin(a0)];
        shapes.push(make(shape, x, y, r, rnd() * Math.PI));
        truth.push({ shape, cx: x, cy: y, ...(n > 1 ? { cluster: c } : {}) });
      }
      if (n > 1) c++;
    }
  return {
    name: 'particles_mixed',
    w,
    h,
    px: render(
      w,
      h,
      shapes,
      (x, y) => 165 + (50 * x) / w + (10 * y) / h,
      () => 70,
      9,
      22,
    ),
    truth,
  };
}

// Nanocubes as an electron microscope shows them: bright square faces with a slightly darker rim, of sides 18 to 22 px,
// turned every way; most in clusters of 2 to 4 that touch side to side (turned alike, a pixel apart: a thin dark line
// between them), on a dark ground
export function cubesImage(): TestImage {
  const [w, h] = [480, 360];
  const rnd = rng(31);
  const shapes: Pt[][] = [];
  const value: number[] = [];
  const truth: TestShape[] = [];
  const cube = (cx: number, cy: number, side: number, t: number, cluster?: number) => {
    shapes.push(rectangle(cx, cy, side / 2, side / 2, t), rectangle(cx, cy, side / 2 - 1.2, side / 2 - 1.2, t));
    value.push(175, 205);
    const a = (((-t * 180) / Math.PI) % 90 + 90) % 90;
    truth.push({ shape: 'square', cx, cy, side, angle: a, ...(cluster !== undefined ? { cluster } : {}) });
  };
  // (cells of a grid: in each one cube, or a cluster in a row, an L or a 2 × 2 block)
  let c = 0;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 5; i++) {
      const cx = 50 + i * 95 + (rnd() - 0.5) * 8;
      const cy = 48 + j * 88 + (rnd() - 0.5) * 8;
      const side = 18 + rnd() * 4;
      const t = rnd() * (Math.PI / 2);
      const kind = Math.floor(rnd() * 4);
      const at: [number, number][] = kind === 0 ? [[0, 0]] : kind === 1 ? [[-0.5, 0], [0.5, 0]] : kind === 2 ? [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]] : [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
      const step = side + 1;
      for (const [u, v] of at) cube(cx + (u * Math.cos(t) - v * Math.sin(t)) * step, cy + (u * Math.sin(t) + v * Math.cos(t)) * step, side * (0.97 + rnd() * 0.06), t, at.length > 1 ? c : undefined);
      if (at.length > 1) c++;
    }
  return {
    name: 'nanocubes',
    w,
    h,
    px: render(
      w,
      h,
      shapes,
      (x, y) => 45 + (10 * x) / w + (6 * y) / h,
      (_x, _y, k) => value[k],
      8,
      33,
    ),
    truth,
  };
}

// a rectangle's corners (half its length and width), turned by t
function rectangle(cx: number, cy: number, a: number, b: number, t: number): Pt[] {
  return (
    [
      [-a, -b],
      [a, -b],
      [a, b],
      [-a, b],
    ] as Pt[]
  ).map(([u, v]): Pt => [cx + u * Math.cos(t) - v * Math.sin(t), cy + u * Math.sin(t) + v * Math.cos(t)]);
}

// Particles a threshold cannot find: as bright on average as the ground, but grainy (their pixels vary a lot) on a
// smooth ground — told apart by their texture
export function textureImage(): TestImage {
  const [w, h] = [480, 360];
  const rnd = rng(13);
  const shapes: Pt[][] = [];
  const truth: TestShape[] = [];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 6; i++) {
      const cx = 42 + i * 80 + (rnd() - 0.5) * 16;
      const cy = 45 + j * 90 + (rnd() - 0.5) * 16;
      const shape = (i + j) % 4 === 0 ? 'irregular' : 'circle';
      shapes.push(shape === 'circle' ? regular(cx, cy, 13 + rnd() * 9, 72, 0) : blob(cx, cy, 17, rnd));
      truth.push({ shape, cx, cy });
    }
  // (the grain: a value of its own every pixel, kept the same for a pixel whatever the shape)
  const grain = rng(17);
  const g = Float32Array.from({ length: w * h }, () => (grain() - 0.5) * 150);
  return {
    name: 'particles_texture',
    w,
    h,
    px: render(
      w,
      h,
      shapes,
      (x) => 110 + (20 * x) / w,
      (x, y) => 110 + (20 * x) / w + g[y * w + x],
      4,
      14,
    ),
    truth,
  };
}
