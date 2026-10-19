// A 3D scene drawn in a frame (3D plot): the data box seen from an azimuth and an elevation (orthographic, or with
// perspective), the back walls with their grid, the three axes on the box's outer edges, then everything sorted from the farthest to the nearest (painter's order): surface cells (shaded
// by the light, their mesh), the visible faces of bars, lines (a 3D waterfall's curves as wholes, with their walls),
// symbols (fainter when far, with lines down to the floor); the floor's map or contour lines under them. Vector output
// (SVG, PDF) like every figure.
import { useContext, useId, type ReactNode } from 'react';
import type { Box } from './axes.ts';
import { mapColor, mapT, stopsOf } from './colors.ts';
import { dashArray, symbolPath } from './draw.ts';
import { ThreeTurn } from './interactive.ts';
import { RichText } from './render.tsx';
import { resolveText, SIDE_DEFAULTS, type Curve, type P3, type TextDefaults, type ThreeScene } from './spec.ts';
import { sceneCamera } from './camera3d.ts';
import { formatLabels, niceStep } from './ticks.ts';

const n2 = (v: number) => (Number.isFinite(v) ? +v.toFixed(2) : 0);
type V = [number, number, number];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// a colour made darker (k < 1) — a cell or a face turned away from the light
function shadeHex(c: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m || k >= 1) return c;
  const v = parseInt(m[1], 16);
  const f = (s: number) => Math.round(((v >> s) & 255) * Math.max(0, k))
    .toString(16)
    .padStart(2, '0');
  return `#${f(16)}${f(8)}${f(0)}`;
}

// a colour made lighter, towards white (k: 0 … 1) — a highlight
function towardWhite(c: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m || !(k > 0)) return c;
  const v = parseInt(m[1], 16);
  const f = (s: number) => {
    const x = (v >> s) & 255;
    return Math.round(x + (255 - x) * Math.min(1, k))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(16)}${f(8)}${f(0)}`;
}

// the nice values of an axis between lo and hi (about n)
function axisTicks(lo: number, hi: number, n: number): number[] {
  if (!(hi > lo)) return [lo];
  const step = niceStep(hi - lo, Math.max(2, n));
  const out: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) out.push(Math.abs(k * step) < step * 1e-9 ? 0 : k * step);
  return out;
}

// The camera: data → the box's coordinates (−aspect … +aspect) → the frame (pt), with the depth (larger: nearer)
export function ThreeView({ c, frame, defaults }: { c: Curve; frame: Box; defaults: TextDefaults }) {
  // turned with the mouse: drawn from the new view until the node has it
  const turn = useContext(ThreeTurn);
  const clip = useId().replace(/:/g, '');
  const { S, t, cam } = sceneCamera(c, frame, defaults, turn);
  const tt = resolveText(undefined, defaults);
  const { B, P, toBox, e3 } = cam;
  const pt = (q: V) => `${n2(q[0])},${n2(q[1])}`;
  const poly = (qs: V[]) => `M${qs.map(pt).join('L')}Z`;
  // which side of every axis is at the back (its wall is drawn), which at the front
  const back = [0, 1, 2].map((a) => (e3[a] > 0 ? -1 : 1));
  const front = back.map((b) => -b);
  const range = [S.range.x, S.range.y, S.range.z];
  // the values of every axis (Z: the layers' own, when given)
  const own = [undefined, S.yLabels, S.zLabels].map((L, a) => (L ? L.at.map((v, k) => ({ v, text: L.text[k] ?? '' })).filter((q) => q.v >= range[a][0] && q.v <= range[a][1]) : null));
  const tk = range.map((r, a) => own[a]?.map((q) => q.v) ?? axisTicks(r[0], r[1], S.ticks));
  const tn = tk.map((vs, a) => vs.map((v) => ((v - range[a][0]) / (range[a][1] - range[a][0] || 1)) * 2 - 1));
  // halfway between the values (the minor grid), inside the box
  const half = tn.map((us, a) => {
    const st = us.length > 1 ? us[1] - us[0] : 0;
    if (!(st > 0) || own[a]) return [];
    const out: number[] = [];
    for (let u = us[0] - st / 2; u <= 1 + 1e-9; u += st) if (u >= -1 - 1e-9) out.push(u);
    return out;
  });
  const at = (a: number, ua: number, b: number, ub: number, c2: number, uc: number): V => {
    const u: V = [0, 0, 0];
    u[a] = ua;
    u[b] = ub;
    u[c2] = uc;
    return u;
  };
  const parts: ReactNode[] = [];
  // the back walls and their grid
  for (let a = 0; a < 3; a++) {
    const [b, c2] = [0, 1, 2].filter((k) => k !== a);
    const wall = [at(a, back[a], b, -1, c2, -1), at(a, back[a], b, 1, c2, -1), at(a, back[a], b, 1, c2, 1), at(a, back[a], b, -1, c2, 1)].map(B);
    if (S.panes) parts.push(<path key={`w${a}`} d={poly(wall)} fill={S.panes} stroke="none" />);
    if (!S.grid || S.gridWalls?.[a] === false) continue;
    const lines = (ub: number[], uc: number[]) => [...ub.map((u) => `M${pt(B(at(a, back[a], b, u, c2, -1)))}L${pt(B(at(a, back[a], b, u, c2, 1)))}`), ...uc.map((u) => `M${pt(B(at(a, back[a], c2, u, b, -1)))}L${pt(B(at(a, back[a], c2, u, b, 1)))}`)].join('');
    parts.push(<path key={`g${a}`} d={lines(tn[b], tn[c2])} stroke={S.grid} strokeWidth={0.4} fill="none" />);
    if (S.gridMinor) parts.push(<path key={`gm${a}`} d={lines(half[b], half[c2])} stroke={S.grid} strokeWidth={0.3} strokeDasharray="1.5 1.5" fill="none" />);
  }
  // the box's edges: those of the walls (and, all, the front ones after the data)
  const edge = (u: V, v: V, k: string) => <path key={k} d={`M${pt(B(u))}L${pt(B(v))}`} stroke={S.edgeColor || '#000000'} strokeWidth={0.6} fill="none" />;
  const edgesOf = (isBack: boolean) => {
    const out: ReactNode[] = [];
    for (let a = 0; a < 3; a++) {
      const [b, c2] = [0, 1, 2].filter((k) => k !== a);
      for (const ub of [-1, 1])
        for (const uc of [-1, 1]) {
          // an edge along a is at the back when it lies on a back wall
          const onBack = ub === back[b] || uc === back[c2];
          if (onBack === isBack) out.push(edge(at(a, -1, b, ub, c2, uc), at(a, 1, b, ub, c2, uc), `e${a}${ub}${uc}${isBack}`));
        }
    }
    return out;
  };
  if (S.edges !== 'none') parts.push(...edgesOf(true));
  // the floor (the lowest Z) and the ceiling (the highest): a map or contour lines, at the projections' opacity
  const fz = S.range.z[0];
  const projOp = S.projOpacity !== undefined && S.projOpacity < 1 ? S.projOpacity : undefined;
  const plane = (pr: ThreeScene['floor'], z: number, key: string) => {
    if (pr?.cells)
      parts.push(
        <g key={key} opacity={projOp}>
          {pr.cells.map((q, k) => (
            <path key={k} d={poly([P([q.x0, q.y0, z]), P([q.x1, q.y0, z]), P([q.x1, q.y1, z]), P([q.x0, q.y1, z])])} fill={q.color} stroke={q.color} strokeWidth={0.2} />
          ))}
        </g>,
      );
    if (pr?.lines) parts.push(<g key={`${key}l`} opacity={projOp}>{pr.lines.map((l, k) => <path key={k} d={`M${l.pts.map((q) => pt(P([q[0], q[1], z]))).join('L')}`} stroke={l.color} strokeWidth={0.6} fill="none" />)}</g>);
  };
  plane(S.floor, fz, 'floor');
  plane(S.ceiling, S.range.z[1], 'ceiling');
  // the surfaces projected on the back walls: their curves every so many rows (in the map's colours of their mean),
  // or their highest outline filled down to the floor
  if (S.walls) {
    const st = c.style;
    const [lo, hi] = c.colorRange ?? S.range.z;
    const tint = (v: number) => (Number.isFinite(v) ? mapColor(stopsOf(st.cmap, st.cmapColors), mapT(v, lo, hi, false, st.cmapReverse)) : S.walls!.color);
    const W = S.walls;
    // on the wall across axis a (x: 0 — the curves z(y); y: 1 — the curves z(x)), at its back side
    for (const a of [0, 1]) {
      const at0 = a === 0 ? S.range.x[back[0] < 0 ? 0 : 1] : S.range.y[back[1] < 0 ? 0 : 1];
      const out: ReactNode[] = [];
      S.surfaces.forEach((sf, si) => {
        const nx = sf.xs.length;
        const ny = sf.ys.length;
        const along = a === 0 ? sf.ys : sf.xs;
        const across = a === 0 ? nx : ny;
        const zAt = (k: number, q: number) => (a === 0 ? sf.z[q * nx + k] : sf.z[k * nx + q]);
        const p3 = (q: number, z: number): P3 => (a === 0 ? [at0, sf.ys[q], z] : [sf.xs[q], at0, z]);
        if (W.mode === 'lines') {
          for (let k = 0; k < across; k += W.every) {
            const zs = along.map((_, q) => zAt(k, q));
            const fin = zs.filter(Number.isFinite);
            if (fin.length < 2) continue;
            const mean = fin.reduce((s2, v) => s2 + v, 0) / fin.length;
            const d = zs.map((z, q) => (Number.isFinite(z) ? pt(P(p3(q, z))) : null));
            out.push(<path key={`${si}-${k}`} d={d.reduce<string>((acc, v, q) => (v ? `${acc}${q && d[q - 1] ? 'L' : 'M'}${v}` : acc), '')} stroke={tint(mean)} strokeWidth={0.5} fill="none" />);
          }
        } else {
          // the highest outline along the wall, filled down to the floor
          const top = along.map((_, q) => {
            let m = -Infinity;
            for (let k = 0; k < across; k++) if (Number.isFinite(zAt(k, q))) m = Math.max(m, zAt(k, q));
            return m;
          });
          const q0 = top.findIndex(Number.isFinite);
          const q1 = top.length - 1 - [...top].reverse().findIndex(Number.isFinite);
          if (q0 < 0 || q1 <= q0) return;
          const ring = [...top.slice(q0, q1 + 1).map((z, q) => P(p3(q0 + q, Number.isFinite(z) ? z : fz))), P(p3(q1, fz)), P(p3(q0, fz))];
          out.push(<path key={`${si}m`} d={poly(ring)} fill={W.color} fillOpacity={0.45} stroke={W.color} strokeWidth={0.5} />);
        }
      });
      if (out.length) parts.push(<g key={`wp${a}`} opacity={projOp}>{out}</g>);
    }
  }
  // the marks projected on the floor and on the back walls: their shadows, dashed, fainter
  const projOf = (l: (typeof S.lines)[number]) => {
    const out: ReactNode[] = [];
    const fin = l.pts.filter((p) => p.every(Number.isFinite));
    if (!fin.length || !l.proj) return out;
    const xb = S.range.x[back[0] < 0 ? 0 : 1];
    const yb = S.range.y[back[1] < 0 ? 0 : 1];
    const faces: [boolean | undefined, (p: P3) => P3][] = [
      [l.proj.floor, (p) => [p[0], p[1], fz]],
      [l.proj.x, (p) => [xb, p[1], p[2]]],
      [l.proj.y, (p) => [p[0], yb, p[2]]],
    ];
    faces.forEach(([on, f], k) => {
      if (!on) return;
      const q = fin.map((p) => P(f(p)));
      const one = q.every((v) => Math.abs(v[0] - q[0][0]) < 1e-6 && Math.abs(v[1] - q[0][1]) < 1e-6);
      out.push(one ? <circle key={k} cx={n2(q[0][0])} cy={n2(q[0][1])} r={1.6} fill={l.color} fillOpacity={0.55} /> : <path key={k} d={`M${q.map(pt).join('L')}`} stroke={l.color} strokeWidth={Math.max(0.4, l.width * 0.8)} strokeDasharray="2 1.5" strokeOpacity={0.55} fill={l.area ? l.area.color : 'none'} fillOpacity={l.area ? l.area.opacity * 0.4 : undefined} />);
    });
    return out;
  };
  S.lines.forEach((l, li) => {
    const pr = projOf(l);
    if (pr.length) parts.push(<g key={`mp${li}`}>{pr}</g>);
  });
  // the data, from the farthest to the nearest (stacked maps: by height — exact for flat layers and the line pieces
  // between them —, from below when seen from above)
  const prims: { d: number; h?: number; layer?: boolean; el: ReactNode }[] = [];
  const light = unit([e3[0] - 0.4 * cam.e1[0] + 0.5 * cam.e2[0], e3[1] - 0.4 * cam.e1[1] + 0.5 * cam.e2[1], e3[2] - 0.4 * cam.e1[2] + 0.5 * cam.e2[2]]);
  // the layers: every cell coloured by the curve's map over its colour range (a Merge may give one range to all its
  // panels), the cells of one colour in one path
  if (S.planes?.length) {
    const st = c.style;
    const [lo, hi] = c.colorRange ?? [0, 1];
    const lut = Array.from({ length: 256 }, (_, k) => mapColor(stopsOf(st.cmap, st.cmapColors), k / 255));
    const out = S.outside === 'hide';
    S.planes.forEach((pl, pi) => {
      const nx = pl.xe.length - 1;
      const ny = pl.ye.length - 1;
      // the corners projected once
      const w = nx + 1;
      const cx = new Float64Array(w * (ny + 1));
      const cy = new Float64Array(w * (ny + 1));
      for (let j = 0; j <= ny; j++)
        for (let i = 0; i <= nx; i++) {
          const q = P([pl.xe[i], pl.ye[j], pl.z]);
          cx[j * w + i] = n2(q[0]);
          cy[j * w + i] = n2(q[1]);
        }
      const segs = new Map<number, string[]>();
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const v = pl.v[j * nx + i];
          if (!Number.isFinite(v) || (st.cmapLog && v <= 0) || (out && (v < lo || v > hi))) continue;
          const k = Math.round(mapT(v, lo, hi, st.cmapLog, st.cmapReverse) * 255);
          const [a0, a1, a2, a3] = [j * w + i, j * w + i + 1, (j + 1) * w + i + 1, (j + 1) * w + i];
          const s = `M${cx[a0]},${cy[a0]}L${cx[a1]},${cy[a1]}L${cx[a2]},${cy[a2]}L${cx[a3]},${cy[a3]}Z`;
          const list = segs.get(k);
          if (list) list.push(s);
          else segs.set(k, [s]);
        }
      const centre = P([(pl.xe[0] + pl.xe[nx]) / 2, (pl.ye[0] + pl.ye[ny]) / 2, pl.z]);
      const solid = pl.opacity >= 1;
      prims.push({
        d: centre[2],
        h: toBox([0, 0, pl.z])[2],
        layer: true,
        el: (
          <g key={`pl${pi}`} opacity={solid ? undefined : pl.opacity}>
            {[...segs].map(([k, s]) => (
              <path key={k} d={s.join('')} fill={lut[k]} stroke={solid ? lut[k] : 'none'} strokeWidth={solid ? 0.12 : undefined} strokeLinejoin="round" />
            ))}
          </g>
        ),
      });
    });
  }
  S.surfaces.forEach((sf, si) => {
    const nx = sf.xs.length;
    const ny = sf.ys.length;
    const Z = (i: number, j: number) => sf.z[j * nx + i];
    // its light: from a direction of its own (azimuth, elevation), else from the eye's side; a highlight towards the eye
    const lightOf = sf.light ? unit([Math.cos((sf.light[1] * Math.PI) / 180) * Math.cos((sf.light[0] * Math.PI) / 180), Math.cos((sf.light[1] * Math.PI) / 180) * Math.sin((sf.light[0] * Math.PI) / 180), Math.sin((sf.light[1] * Math.PI) / 180)]) : light;
    const half = unit([lightOf[0] + e3[0], lightOf[1] + e3[1], lightOf[2] + e3[2]]);
    const m = sf.mesh;
    const meshDash = m.dash ? dashArray(m.dash, m.width) : undefined;
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const zs = [Z(i, j), Z(i + 1, j), Z(i + 1, j + 1), Z(i, j + 1)];
        if (!zs.every(Number.isFinite)) continue;
        const ps: P3[] = [[sf.xs[i], sf.ys[j], zs[0]], [sf.xs[i + 1], sf.ys[j], zs[1]], [sf.xs[i + 1], sf.ys[j + 1], zs[2]], [sf.xs[i], sf.ys[j + 1], zs[3]]];
        const q = ps.map(P);
        const d = (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4;
        let fill = sf.fill[j * (nx - 1) + i] ?? '';
        const b = ps.map(toBox);
        const n = unit(cross([b[2][0] - b[0][0], b[2][1] - b[0][1], b[2][2] - b[0][2]], [b[3][0] - b[1][0], b[3][1] - b[1][1], b[3][2] - b[1][2]]));
        // seen from below: the underside's colour
        if (fill && sf.back && dot(n, e3) < 0) fill = sf.back;
        let color = fill;
        if (fill && sf.shade > 0) color = shadeHex(fill, 1 - sf.shade * (1 - Math.abs(dot(n, lightOf))));
        if (fill && sf.shine) color = towardWhite(color, sf.shine * Math.abs(dot(n, half)) ** 30);
        // the mesh: its lines along X (between the rows) and along Y (between the columns), every so many cells
        const mesh: [string, string][] = [];
        if (m.every > 0) {
          const col = (v: number) => (m.colors ? m.colors[v] || m.color : m.darker && fill ? shadeHex(fill, 0.55) : m.color);
          const [v0, v1, v3] = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i];
          if (m.dir !== 'x' && i % m.every === 0) mesh.push([`M${pt(q[0])}L${pt(q[3])}`, col(v0)]);
          if (m.dir !== 'y' && j % m.every === 0) mesh.push([`M${pt(q[0])}L${pt(q[1])}`, col(v0)]);
          if (m.dir !== 'x' && (i === nx - 2 || (i + 1) % m.every === 0)) mesh.push([`M${pt(q[1])}L${pt(q[2])}`, col(v1)]);
          if (m.dir !== 'y' && (j === ny - 2 || (j + 1) % m.every === 0)) mesh.push([`M${pt(q[3])}L${pt(q[2])}`, col(v3)]);
        }
        // the mesh's pieces of one colour in one path
        const byColor = new Map<string, string>();
        for (const [dd, cc] of mesh) byColor.set(cc, (byColor.get(cc) ?? '') + dd);
        prims.push({
          d,
          el: (
            <g key={`s${si}-${i}-${j}`}>
              {color && <path d={poly(q)} fill={color} fillOpacity={sf.opacity < 1 ? sf.opacity : undefined} stroke={color} strokeWidth={sf.opacity < 1 ? 0 : 0.3} strokeOpacity={sf.opacity < 1 ? undefined : sf.opacity} />}
              {[...byColor].map(([cc, dd]) => (
                <path key={cc} d={dd} stroke={cc} strokeWidth={m.width} strokeOpacity={m.opacity} strokeDasharray={meshDash} fill="none" strokeLinecap="round" />
              ))}
            </g>
          ),
        });
      }
  });
  // bars: the faces turned to the eye (the top, two or three sides)
  S.bars.items.forEach((b, k) => {
    const [xa, xb, ya, yb] = [b.x - b.dx / 2, b.x + b.dx / 2, b.y - b.dy / 2, b.y + b.dy / 2];
    const faces: { n: V; ps: P3[] }[] = [
      { n: [0, 0, b.z1 >= b.z0 ? 1 : -1], ps: [[xa, ya, b.z1], [xb, ya, b.z1], [xb, yb, b.z1], [xa, yb, b.z1]] },
      { n: [-1, 0, 0], ps: [[xa, ya, b.z0], [xa, yb, b.z0], [xa, yb, b.z1], [xa, ya, b.z1]] },
      { n: [1, 0, 0], ps: [[xb, ya, b.z0], [xb, yb, b.z0], [xb, yb, b.z1], [xb, ya, b.z1]] },
      { n: [0, -1, 0], ps: [[xa, ya, b.z0], [xb, ya, b.z0], [xb, ya, b.z1], [xa, ya, b.z1]] },
      { n: [0, 1, 0], ps: [[xa, yb, b.z0], [xb, yb, b.z0], [xb, yb, b.z1], [xa, yb, b.z1]] },
    ];
    faces.forEach((f, fi) => {
      if (dot(f.n, e3) <= 1e-9) return;
      const q = f.ps.map(P);
      const color = shadeHex(b.color, 1 - 0.45 * (1 - Math.abs(dot(f.n, light))));
      prims.push({
        d: (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4 + (fi === 0 ? 1e-6 : 0),
        el: <path key={`b${k}-${fi}`} d={poly(q)} fill={color} fillOpacity={S.bars.opacity < 1 ? S.bars.opacity : undefined} stroke={S.bars.edge || color} strokeWidth={S.bars.edge ? S.bars.edgeWidth : 0.3} strokeLinejoin="round" />,
      });
    });
  });
  // lines: a 3D waterfall's curves whole (each in its own plane), with their walls down to the floor; others piece by piece
  S.lines.forEach((l, li) => {
    const q = l.pts.filter((p) => p.every(Number.isFinite)).map(P);
    if (q.length < 2 || !(l.width > 0)) return;
    const stroke = { stroke: l.color, strokeWidth: l.width, strokeDasharray: dashArray(l.dash, l.width), fill: 'none', strokeLinejoin: 'round' as const, strokeOpacity: l.opacity };
    // its heads: at its two ends, along its last piece on the screen
    const headAt = (tip: V, from: V, kind: string, k: string) => {
      const [dx, dy] = [tip[0] - from[0], tip[1] - from[1]];
      const L = Math.hypot(dx, dy);
      if (!(L > 1e-6) || kind === 'none') return;
      const [ux, uy] = [dx / L, dy / L];
      const s2 = l.headSize ?? 5;
      const [bx, by] = [tip[0] - ux * s2, tip[1] - uy * s2];
      const [nx, ny] = [-uy * s2 * 0.4, ux * s2 * 0.4];
      const el =
        kind === 'bar' ? (
          <path key={k} d={`M${n2(tip[0] + nx * 1.3)},${n2(tip[1] + ny * 1.3)}L${n2(tip[0] - nx * 1.3)},${n2(tip[1] - ny * 1.3)}`} stroke={l.color} strokeWidth={l.width} strokeOpacity={l.opacity} />
        ) : (
          <path key={k} d={`M${n2(bx + nx)},${n2(by + ny)}L${n2(tip[0])},${n2(tip[1])}L${n2(bx - nx)},${n2(by - ny)}${kind === 'open' ? '' : 'Z'}`} fill={kind === 'open' ? 'none' : l.color} stroke={l.color} strokeWidth={kind === 'open' ? l.width : 0.3} strokeOpacity={l.opacity} fillOpacity={l.opacity} strokeLinejoin="round" />
        );
      prims.push({ d: tip[2] + 1e-6, el });
    };
    if (l.heads) {
      headAt(q[q.length - 1], q[q.length - 2], l.heads[1], `lh${li}b`);
      headAt(q[0], q[1], l.heads[0], `lh${li}a`);
    }
    const hz = (p: P3) => toBox(p)[2];
    if (l.planar) {
      const fin = l.pts.filter((p) => p.every(Number.isFinite));
      const floor = fin.map((p) => P([p[0], p[1], fz]));
      prims.push({
        d: q.reduce((s, v) => s + v[2], 0) / q.length,
        h: fin.reduce((s, p) => s + hz(p), 0) / fin.length,
        el: (
          <g key={`l${li}`}>
            {l.fill && <path d={`M${q.map(pt).join('L')}L${[...floor].reverse().map(pt).join('L')}Z`} fill={l.fill.color} fillOpacity={l.fill.opacity} stroke="none" />}
            {l.area && <path d={`M${q.map(pt).join('L')}Z`} fill={l.area.color} fillOpacity={l.area.opacity} stroke="none" />}
            <path d={`M${q.map(pt).join('L')}`} {...stroke} />
          </g>
        ),
      });
    } else {
      const fin = l.pts.filter((p) => p.every(Number.isFinite));
      for (let k = 0; k < q.length - 1; k++) prims.push({ d: (q[k][2] + q[k + 1][2]) / 2 + (l.bias ?? 0), h: (hz(fin[k]) + hz(fin[k + 1])) / 2, el: <path key={`l${li}-${k}`} d={`M${pt(q[k])}L${pt(q[k + 1])}`} {...stroke} strokeLinecap={l.dash === 'solid' ? 'round' : 'butt'} /> });
    }
  });
  // symbols: fainter the farther they are (depth shade), a line down to the floor
  const reach = Math.hypot(...cam.A);
  S.points.forEach((s, si) =>
    s.pts.forEach((p, k) => {
      if (!p.every(Number.isFinite)) return;
      const q = P(p);
      const col = s.colors[k] ?? s.colors[0] ?? '#000000';
      const op = s.depthShade ? 0.3 + 0.7 * Math.min(1, Math.max(0, (q[2] + reach) / (2 * reach))) : 1;
      const open = s.fill === 'open';
      prims.push({
        d: q[2],
        el: (
          <g key={`p${si}-${k}`} opacity={op < 1 ? +op.toFixed(3) : undefined}>
            {s.drop && <path d={`M${pt(q)}L${pt(P([p[0], p[1], fz]))}`} stroke={col} strokeWidth={0.4} strokeOpacity={0.6} />}
            <path d={symbolPath(s.symbol, s.size, q[0], q[1])} fill={open ? 'none' : s.fill === 'white' ? '#ffffff' : col} stroke={col} strokeWidth={s.edge} />
          </g>
        ),
      });
    }),
  );
  // the labels of the marks: beside their place, over everything near it
  (S.labels ?? []).forEach((lb, k) => {
    if (!lb.at.every(Number.isFinite)) return;
    const q = P(lb.at);
    const st = resolveText({ color: lb.color, ...(lb.size > 0 ? { size: lb.size } : {}) }, defaults);
    prims.push({ d: q[2] + 1e-3, el: <RichText key={`lb${k}`} x={q[0] + 3} y={q[1] - 3} text={lb.text} st={st} anchor="start" valign="bottom" /> });
  });
  if (S.planes?.length) {
    // by height; at the same height a line over the layer
    const up = S.elev >= 0 ? 1 : -1;
    const rank = (p: (typeof prims)[number]) => (p.h ?? 0) * up;
    const after = (p: (typeof prims)[number]) => (p.layer ? 0 : 1);
    prims.sort((a, b) => rank(a) - rank(b) || after(a) - after(b) || a.d - b.d);
  } else prims.sort((a, b) => a.d - b.d);
  parts.push(<g key="data">{prims.map((p) => p.el)}</g>);
  if (S.edges === 'all') parts.push(...edgesOf(false));
  // the axes: X and Y on the floor's front edges, Z on the vertical edge farthest to the left; their values and titles
  const centre = B([0, 0, 0]);
  const zEdges = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([ux, uy]) => ({ ux, uy, s: B([ux, uy, 0])[0] }));
  const zl = zEdges.reduce((m, e) => (e.s < m.s ? e : m), zEdges[0]);
  const axes: { a: number; base: (u: number) => V }[] = [
    { a: 0, base: (u) => [u, front[1], back[2]] },
    { a: 1, base: (u) => [front[0], u, back[2]] },
    { a: 2, base: (u) => [zl.ux, zl.uy, u] },
  ];
  const tickLen = 3;
  for (const { a, base } of axes) {
    const mid = B(base(0));
    let dx = mid[0] - centre[0];
    let dy = mid[1] - centre[1];
    if (a === 2) [dx, dy] = [-1, 0];
    const l = Math.hypot(dx, dy) || 1;
    [dx, dy] = [dx / l, dy / l];
    const labels = own[a] ? own[a].map((q) => q.text) : formatLabels(tk[a], false, SIDE_DEFAULTS).labels;
    const anchor = dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle';
    const valign = dy > 0.35 ? 'top' : dy < -0.35 ? 'bottom' : 'middle';
    parts.push(
      <g key={`ax${a}`}>
        {tn[a].map((u, k) => {
          const p = B(base(u));
          return (
            <g key={k}>
              <path d={`M${pt(p)}l${n2(dx * tickLen)},${n2(dy * tickLen)}`} stroke="#000000" strokeWidth={0.6} />
              <RichText x={p[0] + dx * (tickLen + 1.5)} y={p[1] + dy * (tickLen + 1.5)} text={labels[k] ?? ''} st={t} anchor={anchor} valign={valign} />
            </g>
          );
        })}
      </g>,
    );
    // the title: beyond the values, along the axis (Z: upright)
    const longest = Math.max(1, ...labels.map((s) => s.length));
    const off = tickLen + 3 + (Math.abs(dx) > 0.5 ? longest * t.size * 0.55 : t.size * 1.1) + tt.size * 0.6;
    const p0 = B(base(-1));
    const p1 = B(base(1));
    let ang = (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    const rot = a === 2 ? -90 : Math.abs(ang) < 60 ? ang : 0;
    if (S.titles[a]) parts.push(<RichText key={`t${a}`} x={mid[0] + dx * off} y={mid[1] + dy * off} text={S.titles[a]} st={tt} anchor="middle" valign="middle" rotate={rot} />);
  }
  // zoomed or moved: what leaves the frame cut at it
  const zoomed = !!S.cam && (S.cam.k !== 1 || !!S.cam.dx || !!S.cam.dy);
  if (!zoomed) return <g>{parts}</g>;
  return (
    <g>
      <defs>
        <clipPath id={`c3-${clip}`}>
          <rect x={n2(frame.x)} y={n2(frame.y)} width={n2(frame.w)} height={n2(frame.h)} />
        </clipPath>
      </defs>
      <g clipPath={`url(#c3-${clip})`}>{parts}</g>
    </g>
  );
}
