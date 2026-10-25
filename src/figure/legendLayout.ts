// The size and arrangement of a legend (pt): its columns and rows, the width of every column, the title — used to draw
// it and, in a Merge, to keep room for a legend common to all the panels. Pure.
import { richMetrics } from './draw.ts';
import { resolveText, type LegendSpec, type TextDefaults } from './spec.ts';
import { maxOf } from '../engine/minmax.ts';

export function legendLayout(lg: LegendSpec, defaults: TextDefaults) {
  const t = resolveText(lg.text, defaults);
  const curves = lg.reverse ? [...lg.curves].reverse() : lg.curves;
  const n = curves.length || 1;
  // one column, one row, or a grid of `columns` columns filled down the columns or across the rows
  const cols = lg.arrange === 'row' ? n : lg.arrange === 'grid' ? Math.max(1, Math.min(n, Math.floor(lg.columns) || 1)) : 1;
  const rows = Math.ceil(n / cols);
  const across = lg.arrange === 'row' || (lg.arrange === 'grid' && lg.fill === 'across');
  const cell = (k: number) => (across ? { col: k % cols, row: Math.floor(k / cols) } : { col: Math.floor(k / rows), row: k % rows });
  // a size key: rows as high as its largest symbol
  // (a filled sample: as high as asked, else 0.7 of the font size; the text that far after it, else half the font size)
  const sampleH = lg.sampleH !== undefined && lg.sampleH > 0 ? lg.sampleH : t.size * 0.7;
  const rowH = Math.max(t.size * Math.max(0.8, lg.spacing), sampleH + 1, Math.max(0, maxOf(curves.filter((c) => c.keyEntry).map((c) => c.style.symbolSize + 1))));
  const gap = lg.sampleGap !== undefined && lg.sampleGap >= 0 ? lg.sampleGap : t.size * 0.5;
  const colGap = t.size * 0.75;
  const colW = Array.from({ length: cols }, (_, j) => Math.max(0, maxOf(curves.filter((_, k) => cell(k).col === j).map((c) => richMetrics(c.label, t).width))) + lg.lineLen + gap);
  const titleT = { ...t, bold: true };
  const titleM = lg.title ? richMetrics(lg.title, titleT) : null;
  const titleH = titleM ? titleM.lines * titleM.lineHeight : 0;
  const w = lg.padding * 2 + Math.max(colW.reduce((a, b) => a + b, 0) + (cols - 1) * colGap, titleM?.width ?? 0);
  // entries on several lines (a fit with its parameters): their row taller by the lines after the first; extra[k]: how
  // far the middle of entry k's text is below its first line
  const ms = curves.map((c) => richMetrics(c.label, t));
  const extra = ms.map((m) => ((m.lines - 1) * m.lineHeight) / 2);
  const rowMore = Array.from({ length: rows }, (_, r) => Math.max(0, ...ms.map((m, k) => (cell(k).row === r ? (m.lines - 1) * m.lineHeight : 0))));
  const rowY = rowMore.map((_, r) => r * rowH + rowMore.slice(0, r).reduce((a, b) => a + b, 0));
  const h = lg.padding * 2 + titleH + rows * rowH + rowMore.reduce((a, b) => a + b, 0) - (rowH - t.size) * 0.5;
  return { t, titleT, curves, rows, rowH, rowY, extra, gap, colGap, sampleH, colW, titleH, w, h, cell };
}
