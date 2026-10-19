// What a Figure Drawing's paths need a geometry library for — combined (union, subtract, intersect, exclude, divide:
// the curves kept), moved out or in (offset), a line turned into the outline it covers (stroke to path): paper.js
// (MIT) and its offset add-on paperjs-offset (MIT), loaded only when one of these is first asked for. Paths in, paths
// out: SVG path text in mm (read back into M, L, C, Z by parsePath).
import { parsePath, pathText } from '../figure/paths.ts';

type Lib = { paper: typeof import('paper/dist/paper-core'); off: typeof import('paperjs-offset') };
let lib: Promise<Lib> | null = null;
function load(): Promise<Lib> {
  if (!lib)
    lib = Promise.all([import('paper/dist/paper-core'), import('paperjs-offset')]).then(([p, off]) => {
      const paper = (p as unknown as { default?: Lib['paper'] }).default ?? p;
      if (!paper.project) paper.setup(new paper.Size(1, 1));
      return { paper, off };
    });
  return lib;
}
type Item = paper.PathItem;
const clean = (d: string) => pathText(parsePath(d));
const empty = (it: Item) => !it.pathData || Math.abs((it as paper.Path).area ?? 0) < 1e-9;

export type BoolOp = 'unite' | 'subtract' | 'intersect' | 'exclude' | 'divide';
// The paths combined, in their order (the first at the back): unite, the first minus all the others, what they all
// share, what an odd number of them cover; divide: the first cut into the pieces the others make of it.
export async function combine(paths: string[], op: BoolOp): Promise<string[]> {
  const { paper } = await load();
  const items: Item[] = paths.map((d) => new paper.CompoundPath({ pathData: d, insert: false }));
  if (items.length < 2) return paths;
  const opt = { insert: false };
  const all = (list: Item[]) => list.slice(1).reduce((a, b) => a.unite(b, opt), list[0]);
  let out: Item[];
  if (op === 'unite') out = [all(items)];
  else if (op === 'subtract') out = [items[0].subtract(all(items.slice(1)), opt)];
  else if (op === 'intersect') out = [items.slice(1).reduce((a, b) => a.intersect(b, opt), items[0])];
  else if (op === 'exclude') out = [items.slice(1).reduce((a, b) => a.exclude(b, opt), items[0])];
  else {
    let pieces: Item[] = [items[0]];
    for (const b of items.slice(1)) pieces = pieces.flatMap((p) => [p.intersect(b, opt), p.subtract(b, opt)]).filter((p) => !empty(p));
    out = pieces;
  }
  return out.filter((p) => !!p.pathData).map((p) => clean(p.pathData));
}

// A path moved out (+) or in (−) by `dist` mm, its corners joined as asked.
export async function offsetPath(d: string, dist: number, join: 'miter' | 'round' | 'bevel' = 'round'): Promise<string> {
  const { paper, off } = await load();
  const item = new paper.CompoundPath({ pathData: d, insert: false });
  const res = off.offset(item, dist, { join, insert: false });
  return clean(res.pathData);
}

// The outline a line of `width` mm covers along the path: its ends and corners as asked.
export async function strokeOutline(d: string, width: number, cap: 'butt' | 'round' | 'square' = 'butt', join: 'miter' | 'round' | 'bevel' = 'miter'): Promise<string> {
  const { paper, off } = await load();
  const item = new paper.CompoundPath({ pathData: d, insert: false });
  const res = off.offsetStroke(item, width / 2, { cap: cap === 'square' ? 'butt' : cap, join, insert: false });
  return clean(res.pathData);
}
