// The scale bar of a micrograph found in it (Image analysis ▸ Calibration, read the scale bar): the longest bar of a
// colour at the ends of the range (white or black), a few pixels thick, standing out from the rows above and below
// it (its ticks and its label apart), likelier lower in the image; the place where its label is (to be read by OCR);
// the length and unit read from a label's text. Nothing is applied by these: the editor proposes, the user accepts.
// Pure.

export type FoundBar = { x0: number; x1: number; y0: number; y1: number; bright: boolean };

export function findScaleBar(g: ArrayLike<number>, w: number, h: number, lo: number, hi: number): FoundBar | null {
  const sp = hi - lo || 1;
  const minLen = Math.max(10, Math.round(0.03 * w));
  let best: FoundBar | null = null;
  let bestScore = 0;
  for (const bright of [true, false]) {
    const is = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const v = (g[y * w + x] - lo) / sp;
      return bright ? v >= 0.88 : v <= 0.12;
    };
    // (the share of a row's pixels from x0 to x1 of the bar's colour)
    const share = (y: number, x0: number, x1: number) => {
      if (y < 0 || y >= h) return 0;
      let n = 0;
      for (let x = x0; x <= x1; x++) if (is(x, y)) n++;
      return n / (x1 - x0 + 1);
    };
    const judge = (c: FoundBar) => {
      const [L, t] = [c.x1 - c.x0 + 1, c.y1 - c.y0 + 1];
      if (L > 0.7 * w || t > Math.max(3, 0.08 * h) || 3 * t > L) return;
      // (a bar: the rows just above and below it are not of its colour, nor what is just past its ends)
      if (share(c.y0 - 2, c.x0, c.x1) > 0.5 || share(c.y1 + 2, c.x0, c.x1) > 0.5) return;
      const mid = Math.round((c.y0 + c.y1) / 2);
      if (is(c.x0 - 3, mid) && is(c.x1 + 3, mid)) return;
      const score = L * (0.5 + c.y0 / h) * (t >= 2 ? 1 : 0.6);
      if (score > bestScore) [best, bestScore] = [{ ...c, bright }, score];
    };
    // (the runs of every row, followed down while they keep their ends)
    let open: FoundBar[] = [];
    for (let y = 0; y <= h; y++) {
      const runs: [number, number][] = [];
      if (y < h)
        for (let x = 0; x < w; ) {
          if (!is(x, y)) {
            x++;
            continue;
          }
          let e = x;
          while (e + 1 < w && is(e + 1, y)) e++;
          if (e - x + 1 >= minLen) runs.push([x, e]);
          x = e + 1;
        }
      const next: FoundBar[] = [];
      for (const [a, b] of runs) {
        const k = open.findIndex((c) => Math.abs(c.x0 - a) <= 1 && Math.abs(c.x1 - b) <= 1);
        if (k >= 0) {
          next.push({ ...open[k], y1: y });
          open.splice(k, 1);
        } else next.push({ x0: a, x1: b, y0: y, y1: y, bright });
      }
      for (const c of open) judge(c);
      open = next;
    }
  }
  return best;
}

// Where the label of a bar is looked for: as wide as the bar and more on either side, some rows above and below it
// (x, y, w, h)
export function labelBox(b: FoundBar, w: number, h: number): [number, number, number, number] {
  const L = b.x1 - b.x0 + 1;
  const m = Math.round(Math.max(24, 8 * (b.y1 - b.y0 + 1), 0.06 * h));
  const x0 = Math.max(0, Math.round(b.x0 - 0.6 * L));
  const x1 = Math.min(w, Math.round(b.x1 + 1 + 0.6 * L));
  const y0 = Math.max(0, b.y0 - m);
  const y1 = Math.min(h, b.y1 + 1 + m);
  return [x0, y0, x1 - x0, y1 - y0];
}

// The length and unit in a label's text (“500 nm”, “2 µm”, “1.5um”, “200 μm”, “10 Å”): the first found that is not
// another setting of the microscope (WD = 5 mm, HFW 12.7 µm …), else null
export function parseScale(text: string): { value: number; unit: string } | null {
  // (an O read for a 0 just before the unit: 50O nm)
  const t = text.replace(/[μ]/g, 'µ').replace(/(\d)\s*[oO](?=\s*[nµumpÅ])/g, (_, d: string) => `${d}0`);
  const all = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(nm|µm|um|mm|pm|Å|cm)(?![a-z])/gi)];
  const named = (m: RegExpExecArray) => /(WD|HFW|VFW|FOV|DWT|HV|Det|Mag|Spot|Pixel|=|:)\s*$/i.test(t.slice(Math.max(0, m.index - 8), m.index));
  const m = all.find((q) => !named(q)) ?? all[0];
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  const unit = u === 'um' || u === 'µm' ? 'µm' : u === 'å' ? 'Å' : u;
  return value > 0 ? { value, unit } : null;
}
