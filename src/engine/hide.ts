// Values left out of a map (3D layers; the Contour next): below or above a threshold, equal to values written (a
// detector's −999, 0 …), and the values outside the colour range hidden instead of drawn in its end colours.
export type HideSpec = {
  below?: number; // NaN / absent: none
  above?: number;
  values?: string; // "0, -999"
  outside?: 'clamp' | 'hide'; // outside the colour range: its end colours (clamp), or not drawn
};

// the numbers of a list written "0, -999; 1e9"
export const hideValues = (s: string | undefined): number[] =>
  (s ?? '')
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);

// The test of the rules that do not depend on the colour range: true = hidden (NaN is always hidden). Null: nothing to
// test beyond NaN.
export function hiddenBy(h: HideSpec | undefined): ((v: number) => boolean) | null {
  const lo = h?.below;
  const hi = h?.above;
  const eq = hideValues(h?.values);
  const hasLo = lo !== undefined && Number.isFinite(lo);
  const hasHi = hi !== undefined && Number.isFinite(hi);
  if (!hasLo && !hasHi && !eq.length) return null;
  // equal within a part in 10⁹ (values read from text)
  const same = (v: number, e: number) => v === e || Math.abs(v - e) <= 1e-9 * Math.max(Math.abs(v), Math.abs(e));
  return (v) => !Number.isFinite(v) || (hasLo && v < lo!) || (hasHi && v > hi!) || eq.some((e) => same(v, e));
}

// a short description of the rules (for the node's report)
export function hideText(h: HideSpec | undefined): string {
  const out: string[] = [];
  if (h?.below !== undefined && Number.isFinite(h.below)) out.push(`below ${h.below}`);
  if (h?.above !== undefined && Number.isFinite(h.above)) out.push(`above ${h.above}`);
  const eq = hideValues(h?.values);
  if (eq.length) out.push(`= ${eq.join(', ')}`);
  if (h?.outside === 'hide') out.push('outside the colour range');
  return out.join(', ');
}
