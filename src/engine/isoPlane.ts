// The faces of an isometric box: a flat drawing (mm) put on the top, the left or the right face, drawn through the face's
// projection (y down): x' = a x + c y + e, y' = b x + d y + f, its 2 × 2 part the face's, (e, f) the place `at`. An
// object on a face keeps its own flat shape (a rectangle stays one, its width and height in the face); its handles and
// its letters are drawn on the face too. Pure (the evaluator and the editor).
import type { Pt } from '../figure/shapes.ts';
import type { IsoFace, IsoPlace } from '../types.ts';

const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
// top: its edges down to the right and down to the left; left: down to the right and down; right: up to the right and
// down
export const ISO_FACES: Record<IsoFace, readonly [number, number, number, number]> = {
  top: [C30, S30, -C30, S30],
  left: [C30, S30, 0, 1],
  right: [C30, -S30, 0, 1],
};
export const isoMatrix = (iso: IsoPlace): [number, number, number, number, number, number] => [...ISO_FACES[iso.face], iso.at[0], iso.at[1]];
// a point of the face (mm) where it is drawn on the page, and back
export const isoToPage = (iso: IsoPlace, [x, y]: Pt): Pt => {
  const [a, b, c, d] = ISO_FACES[iso.face];
  return [a * x + c * y + iso.at[0], b * x + d * y + iso.at[1]];
};
export const isoToFace = (iso: IsoPlace, p: Pt): Pt => {
  const [a, b, c, d] = ISO_FACES[iso.face];
  const [x, y] = [p[0] - iso.at[0], p[1] - iso.at[1]];
  const det = a * d - b * c;
  return [(d * x - c * y) / det, (a * y - b * x) / det];
};
// a move on the page (mm) as a move in the face, and back (its arrows: along its own edges)
export const isoDelta = (face: IsoFace, [dx, dy]: Pt): Pt => isoToFace({ face, at: [0, 0] }, [dx, dy]);
export const isoDeltaToPage = (face: IsoFace, [dx, dy]: Pt): Pt => isoToPage({ face, at: [0, 0] }, [dx, dy]);
// the direction (degrees, y down) of the face's own x and y edges on the page: the guides drawn along them
export function isoEdges(face: IsoFace): [number, number] {
  const [a, b, c, d] = ISO_FACES[face];
  const deg = (u: number, v: number) => {
    const r = (Math.atan2(v, u) * 180) / Math.PI;
    return +(((r % 180) + 180) % 180).toFixed(6);
  };
  return [deg(a, b), deg(c, d)];
}
