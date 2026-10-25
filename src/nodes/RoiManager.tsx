// The selections of the Image analysis editor: drawn over the image (the one picked with its handles — the corners and
// sides of a rectangle or an ellipse and its turn, the points of the others), the ROI manager (their names, colours,
// groups, shown or not; the background of a spot; the width of a line), the particles found in the mask (and grouped by
// their shape), what is measured and the results.
import type { ReactNode } from 'react';
import { isArea, isLine, roiOutline, ROI_COLOR, ROI_KINDS, RING_DEFAULTS, TOOL_HINTS, type Pt, type Roi, type RoiBgMode, type RoiTool } from '../image/roi.ts';
import { MEASURE_KEYS, type MeasureKey, type MeasureSpec } from '../image/measure.ts';
import { STEP_DEFS, type ImgStep } from '../image/steps.ts';
import type { ParticleOpts } from '../image/particles.ts';
import type { MatchContext, MatchModelSpec, MatchOpts } from '../image/match.ts';
import { REGULAR_SHAPES, type RegularShape } from '../image/refine.ts';
const CONTEXTS: [MatchContext, string][] = [
  ['disc', 'a disc around it'],
  ['cluster', 'only the particle (in clusters)'],
  ['alone', 'the particle and the ground (alone)'],
];
const TURNS: [string, string][] = [
  ['90', 'square (0 to 90°)'],
  ['180', 'rectangle (0 to 180°)'],
  ['360', 'any (0 to 360°)'],
];
const SIZES: [string, string][] = [
  ['0', 'as the model'],
  ['0.1', '± 10 %'],
  ['0.2', '± 20 %'],
  ['0.3', '± 30 %'],
];
import type { Workbook } from '../engine/table.ts';
import { Check, NumInput, Select, TextInput } from './ui.tsx';
import { Copy, Eye, EyeOff, X } from 'lucide-react';
import { IC } from './iconProps.ts';

const fmt = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(+v.toPrecision(5))) : '');
// the handles of a rectangle or an ellipse: its corners and the middles of its sides (−1, 0, 1 across and down)
const BOX_HANDLES: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
// the most points a selection shows as handles (a freehand or wand outline: moved whole)
const MAX_HANDLES = 300;
const hasVertexHandles = (r: Roi) => !r.box && r.kind !== 'freehand' && r.kind !== 'traced' && (r.pts?.length ?? 0) <= MAX_HANDLES;

// a point of a turned box's own frame on the image
const boxPoint = (r: Roi, u: number, v: number): Pt => {
  const [cx, cy] = r.box!;
  const a = ((r.angle ?? 0) * Math.PI) / 180;
  return [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)];
};

// ---- over the image ----

// rois: in pixels of the original; ox, oy: the corner of the part shown; k: screen pixels per image pixel. interactive:
// the selections take the clicks (to pick, move, edit them), else the tool drawing does; rings: the rings of background
// of every spot drawn (else of the one picked)
export function RoiOverlay({ rois, sel, k, ox, oy, W, H, labels, interactive, rings }: { rois: Roi[]; sel: string | null; k: number; ox: number; oy: number; W: number; H: number; labels: boolean; interactive: boolean; rings: boolean }) {
  const at = ([x, y]: Pt) => `${((x - ox) * k).toFixed(1)},${((y - oy) * k).toFixed(1)}`;
  const P = (pts: Pt[]) => pts.map(at).join(' ');
  const one = (r: Roi) => {
    const pts = roiOutline(r);
    const color = r.color ?? ROI_COLOR;
    const picked = r.id === sel;
    let body: ReactNode;
    if (isArea(r))
      body = (
        <>
          <polygon points={P(pts)} className="ie-roi-line" />
          <polygon points={P(pts)} className={`ie-roi-hit${picked ? ' inside' : ''}`} />
        </>
      );
    else if (r.kind === 'points')
      body = pts.map(([x, y], j) => (
        <g key={j}>
          <circle cx={(x - ox) * k} cy={(y - oy) * k} r={4} className="ie-roi-dot" />
          <circle cx={(x - ox) * k} cy={(y - oy) * k} r={7} className="ie-roi-hit inside" />
        </g>
      ));
    else
      body = (
        <>
          <polyline points={P(pts)} className="ie-roi-line" style={isLine(r) && (r.width ?? 1) > 1 ? { strokeWidth: Math.max(1.5, (r.width ?? 1) * k), strokeOpacity: 0.35 } : undefined} />
          {isLine(r) && (r.width ?? 1) > 1 && <polyline points={P(pts)} className="ie-roi-line" />}
          <polyline points={P(pts)} className="ie-roi-hit" />
        </>
      );
    // the ring of background of a spot (a rectangle or an ellipse: drawn, its inner and outer edge; other shapes:
    // measured all the same)
    const ring =
      (picked || rings) && r.box && r.bg?.mode === 'ring'
        ? [r.bg.gap ?? RING_DEFAULTS.gap, (r.bg.gap ?? RING_DEFAULTS.gap) + (r.bg.width ?? RING_DEFAULTS.width)].map((d, j) => <polygon key={j} points={P(roiOutline({ ...r, box: [r.box![0], r.box![1], Math.abs(r.box![2]) + 2 * d, Math.abs(r.box![3]) + 2 * d] }))} className={`ie-roi-ring${picked ? '' : ' faint'}`} />)
        : null;
    const [x0, y0] = pts.length ? [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))] : [0, 0];
    return (
      <g key={r.id} data-roi={r.id} className={`ie-roi${picked ? ' sel' : ''}${r.role === 'background' ? ' bg' : ''}`} style={{ color }}>
        {ring}
        {body}
        {labels && (
          <text x={(x0 - ox) * k + 2} y={(y0 - oy) * k - 3} className="ie-roi-name">
            {r.name}
          </text>
        )}
        {picked && <Handles r={r} k={k} ox={ox} oy={oy} />}
      </g>
    );
  };
  return (
    <svg className={`ie-overlay ie-rois${interactive ? ' interactive' : ''}`} width={W} height={H}>
      {rois.filter((r) => !r.hidden || r.id === sel).map(one)}
    </svg>
  );
}

function Handles({ r, k, ox, oy }: { r: Roi; k: number; ox: number; oy: number }) {
  const sq = (key: string, [x, y]: Pt, cls = '') => <rect key={key} data-handle={key} x={(x - ox) * k - 4} y={(y - oy) * k - 4} width={8} height={8} className={`ie-roi-handle${cls}`} />;
  if (r.box) {
    const [, , w, h] = r.box;
    const top = boxPoint(r, 0, -Math.abs(h) / 2);
    const rot = boxPoint(r, 0, -Math.abs(h) / 2 - 22 / k);
    return (
      <>
        <line x1={(top[0] - ox) * k} y1={(top[1] - oy) * k} x2={(rot[0] - ox) * k} y2={(rot[1] - oy) * k} className="ie-roi-stem" />
        <circle data-handle="rot" cx={(rot[0] - ox) * k} cy={(rot[1] - oy) * k} r={5} className="ie-roi-handle round" />
        {BOX_HANDLES.map(([sx, sy]) => sq(`b${sx},${sy}`, boxPoint(r, (sx * w) / 2, (sy * h) / 2)))}
      </>
    );
  }
  if (!hasVertexHandles(r)) return null;
  return <>{(r.pts ?? []).map((p, i) => sq(`v${i}`, p))}</>;
}

// ---- the ROI manager ----

export type RoiPanelProps = {
  rois: Roi[];
  sel: string | null;
  setSel: (id: string | null) => void;
  setRois: (r: Roi[]) => void;
  tool: string;
  group: string;
  setGroup: (g: string) => void;
  labels: boolean;
  setLabels: (v: boolean) => void;
  rings: boolean;
  setRings: (v: boolean) => void;
  wandTol: number;
  setWandTol: (v: number) => void;
  raysOf: 'auto' | 'bright' | 'dark';
  setRaysOf: (v: 'auto' | 'bright' | 'dark') => void;
  centre: 'off' | 'bright' | 'dark';
  setCentre: (v: 'off' | 'bright' | 'dark') => void;
  duplicate: () => void;
  clearAll: () => void;
};
export function RoiPanel(p: RoiPanelProps) {
  const { rois, sel, setSel, setRois } = p;
  const upd = (id: string, patch: Partial<Roi>) => setRois(rois.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const picked = rois.find((r) => r.id === sel);
  const regions = rois.filter((r) => isArea(r) && r.id !== sel);
  return (
    <>
      <div className="ie-section">Selections</div>
      {p.tool in TOOL_HINTS && <div className="hint">{TOOL_HINTS[p.tool as RoiTool]}</div>}
      {p.tool === 'wand' && (
        <div className="row wrap">
          <span className="muted">Tolerance</span>
          <NumInput className="short" min={0} value={p.wandTol} title="The values taken: within this of the pixel clicked (a mask: its object, whatever this)" onChange={(v) => p.setWandTol(v >= 0 ? v : 0)} />
        </div>
      )}
      {p.tool === 'rays' && (
        <div className="row wrap">
          <span className="muted">Particles</span>
          <Select<'auto' | 'bright' | 'dark'>
            value={p.raysOf}
            title="The particles brighter or darker than the ground (as the pixel clicked: brighter or darker than the middle value around it)"
            options={[
              ['auto', 'as clicked'],
              ['bright', 'bright'],
              ['dark', 'dark'],
            ]}
            onChange={p.setRaysOf}
          />
        </div>
      )}
      {p.tool === 'stamp' && (
        <div className="row wrap">
          <span className="muted">Centre on</span>
          <Select<'off' | 'bright' | 'dark'>
            value={p.centre}
            title="A copy moved onto the spot under it: to the centre of its bright (or dark) pixels"
            options={[
              ['off', 'no (where clicked)'],
              ['bright', 'bright spots'],
              ['dark', 'dark spots'],
            ]}
            onChange={p.setCentre}
          />
        </div>
      )}
      <div className="row wrap">
        <span className="muted">New ones in group</span>
        <TextInput className="short" value={p.group} placeholder="none" title="The group of the selections drawn next (a sample, a replicate): the summary is by group" onChange={p.setGroup} />
        <Check label="names" title="The names written by the selections" value={p.labels} onChange={p.setLabels} />
        <Check label="rings" title="The rings of background of every spot drawn (two dashed outlines: where the ring starts and ends), else only of the spot picked" value={p.rings} onChange={p.setRings} />
      </div>
      {rois.length ? (
        <div className="ie-roi-list">
          {rois.map((r) => (
            <div key={r.id} className={`ie-roi-row${r.id === sel ? ' sel' : ''}`} onClick={() => setSel(r.id)}>
              <input className="nodrag color" type="color" value={r.color ?? ROI_COLOR} title="Its colour" onChange={(e) => upd(r.id, { color: e.target.value })} />
              <TextInput className="grow" value={r.name} title="Its name (the rows of the results)" onChange={(name) => upd(r.id, { name })} />
              <span className="muted ie-roi-kind" title={r.train ? `an example of ${r.train} (the trainable classifier)` : ROI_KINDS[r.kind]}>
                {r.train ? `ex. ${r.train}` : r.role === 'background' ? 'bg' : r.auto ? 'particle' : ROI_KINDS[r.kind]}
              </span>
              <TextInput className="tiny" value={r.group ?? ''} placeholder="group" title="Its group" onChange={(g) => upd(r.id, { group: g || undefined })} />
              <button className="nodrag ts-btn" title={r.hidden ? 'Hidden: show it' : 'Shown: hide it (still measured)'} onClick={() => upd(r.id, { hidden: !r.hidden || undefined })}>
                {r.hidden ? <EyeOff {...IC} /> : <Eye {...IC} />}
              </button>
              <button
                className="nodrag ts-btn"
                title="Remove it (Delete)"
                onClick={(e) => {
                  e.stopPropagation();
                  setRois(rois.filter((q) => q.id !== r.id));
                  if (sel === r.id) setSel(null);
                }}
              >
                <X {...IC} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="hint">No selections yet: pick a tool at the top (rectangle, ellipse, polygon, freehand, line, points, angle, wand, rays, stamp) and draw on the image.</div>
      )}
      <div className="row wrap">
        <button className="nodrag" disabled={!picked} title="A copy of the selection picked, a little aside (Ctrl+D)" onClick={p.duplicate}>
          Duplicate
        </button>
        <button className="nodrag" disabled={!rois.length} title="Remove all the selections" onClick={p.clearAll}>
          Remove all
        </button>
      </div>
      {picked && isArea(picked) && !picked.train && (
        <div className="ie-params">
          <span className="ie-label">Background</span>
          <Select<RoiBgMode | 'role'>
            value={picked.role === 'background' ? 'role' : (picked.bg?.mode ?? 'none')}
            title="A spot's background, taken off its signal: a ring around it, a region drawn, the global one (Measure); or this selection is itself a region of background"
            options={[
              ['none', 'none'],
              ['ring', 'a ring around it'],
              ['region', 'a region drawn'],
              ['global', 'the global one'],
              ['role', 'this is a background region'],
            ]}
            onChange={(m) => upd(picked.id, m === 'role' ? { role: 'background', bg: undefined } : { role: undefined, bg: { ...picked.bg, mode: m } })}
          />
          {picked.bg?.mode === 'ring' && (
            <>
              <span className="ie-label">Ring</span>
              <span className="row">
                <NumInput className="tiny" min={0} step={1} value={picked.bg.gap ?? RING_DEFAULTS.gap} title="Its gap from the spot's edge (px)" onChange={(gap) => upd(picked.id, { bg: { ...picked.bg!, gap: Math.max(0, gap) } })} />
                <NumInput className="tiny" min={1} step={1} value={picked.bg.width ?? RING_DEFAULTS.width} title="Its width (px)" onChange={(width) => upd(picked.id, { bg: { ...picked.bg!, width: Math.max(1, width) } })} />
                <span className="muted">px gap, width</span>
              </span>
            </>
          )}
          {picked.bg?.mode === 'region' && (
            <>
              <span className="ie-label">Region</span>
              <Select<string> value={picked.bg.region ?? ''} title="The selection whose pixels are this spot's background" options={[['', 'none'], ...regions.map((r): [string, string] => [r.id, r.name])]} onChange={(region) => upd(picked.id, { bg: { ...picked.bg!, region: region || undefined } })} />
            </>
          )}
          {picked.bg && picked.bg.mode !== 'none' && (
            <span className="hint" style={{ gridColumn: '1 / -1' }}>
              <button className="nodrag" title="The same background for every selection of its group" onClick={() => setRois(rois.map((r) => (isArea(r) && r.role !== 'background' && (r.group ?? '') === (picked.group ?? '') ? { ...r, bg: picked.bg } : r)))}>
                Same for its group
              </button>
            </span>
          )}
        </div>
      )}
      {picked && isLine(picked) && (
        <div className="row wrap">
          <span className="muted">Width</span>
          <NumInput className="tiny" min={1} step={1} value={picked.width ?? 1} title="The band across the line averaged for its profile (px)" onChange={(width) => upd(picked.id, { width: Math.max(1, Math.round(width)) || 1 })} />
          <span className="muted">px</span>
        </div>
      )}
    </>
  );
}

// ---- particles ----

// opts: in pixels (sizes in px²); k: the size of a pixel (the sizes shown in its unit u)
export function ParticlesPanel(p: {
  opts: ParticleOpts;
  set: (p: Partial<ParticleOpts>) => void;
  group: string;
  setGroup: (g: string) => void;
  k: number;
  u: string;
  find: () => void;
  msg: string;
  count: number;
  byShape: () => void;
  likeExamples: () => void;
  match: MatchOpts & { fit: boolean };
  setMatch: (p: Partial<MatchOpts> & { fit?: boolean }) => void;
  canMatch: boolean;
  models: number;
  findLike: () => void;
  setMin: (min: number) => void;
  // the list of models, each with its settings (and its name), added from the selection picked
  modelList: (MatchModelSpec & { name: string })[];
  canAdd: boolean;
  addModel: () => void;
  setModel: (k: number, p: Partial<MatchModelSpec>) => void;
  removeModel: (k: number) => void;
  pickModel: (k: number) => void;
  modelColors: string[];
  review: boolean;
  setReview: (on: boolean) => void;
  canMore: boolean;
  findMore: () => void;
  // Refine: the regular shapes allowed, snapped to the edges; the particles changed by hand (left as they are)
  refine: (alsoHand: boolean) => void;
  shapes: RegularShape[];
  setShapes: (s: RegularShape[]) => void;
  snap: boolean;
  setSnap: (on: boolean) => void;
  handCount: number;
  layers: boolean;
  setLayers: (on: boolean) => void;
}) {
  const { opts, set, group, setGroup, k, u, find, msg, count, byShape, likeExamples, match, setMatch } = p;
  const a = k * k;
  return (
    <>
      <div className="ie-section">Particles</div>
      <div className="hint">The objects of the last mask of the steps (a threshold, a trainable classifier), as selections: measured as the others, found again as asked.</div>
      <div className="ie-params">
        <span className="ie-label">From</span>
        <span className="row">
          <Select<'mask' | 'rays'> seg
            value={opts.method ?? 'mask'}
            title="The particles of the mask (a threshold, a trainable classifier), cut apart if asked; or seeds and rays: a seed in every particle (the mask's centres when there is one, else the bright or dark blobs of the image at their size), from each 32 rays stopped at the first edge: touching particles found one by one, a dark gap between them or not"
            options={[
              ['mask', 'the mask'],
              ['rays', 'seeds and rays'],
            ]}
            onChange={(method) => set({ method: method === 'mask' ? undefined : method })}
          />
          {opts.method === 'rays' && (
            <>
              <NumInput className="short" min={0} value={opts.size && opts.size > 0 ? +(opts.size * k).toPrecision(6) : NaN} placeholder="auto" title={`The particles' diameter (${u}): empty, from the mask (a Threshold in the steps); needed without a mask`} onChange={(v) => set({ size: v > 0 ? v / k : undefined })} />
              <Select<string> seg value={opts.light === false ? 'dark' : 'light'} title="The particles brighter or darker than the ground" options={[['light', 'bright'], ['dark', 'dark']]} onChange={(v) => set({ light: v === 'dark' ? false : undefined })} />
            </>
          )}
        </span>
        <span className="ie-label">Clusters</span>
        <span className="row">
          <Check label="cut apart" title="Touching or overlapping particles cut apart along their necks (watershed on the distance map), as ImageJ" value={opts.separate} onChange={(separate) => set({ separate })} />
          {opts.separate && (
            <>
              <NumInput className="tiny" min={0} step={0.1} value={opts.tolerance} title="How deep a neck must be to be cut (px): larger, fewer cuts" onChange={(tolerance) => set({ tolerance: Math.max(0, tolerance) })} />
              <NumInput className="tiny" min={0.1} max={1} step={0.05} value={opts.neck} title="How narrow a neck must be, at most, against the thinner part (0.75: a long or flat particle is not cut along itself; 1: any, as ImageJ)" onChange={(neck) => set({ neck: Math.min(1, Math.max(0.1, neck || 0.75)) })} />
            </>
          )}
        </span>
        <span className="ie-label">Size ({u}²)</span>
        <span className="row">
          <NumInput className="short" min={0} value={+(opts.minSize * a).toPrecision(6)} title="The least area kept" onChange={(v) => set({ minSize: Math.max(0, v / a) || 0 })} />
          <span className="muted">to</span>
          <NumInput className="short" min={0} value={opts.maxSize > 0 ? +(opts.maxSize * a).toPrecision(6) : NaN} placeholder="any" title="The largest area kept (empty: any)" onChange={(v) => set({ maxSize: v > 0 ? v / a : 0 })} />
        </span>
        <span className="ie-label">Circularity</span>
        <span className="row">
          <NumInput className="tiny" min={0} max={1} step={0.05} value={opts.minCirc} title="4π·area / perimeter²: 1 a disc, about 0.8 a square, 0.6 a triangle" onChange={(v) => set({ minCirc: Math.min(1, Math.max(0, v || 0)) })} />
          <span className="muted">to</span>
          <NumInput className="tiny" min={0} max={1} step={0.05} value={opts.maxCirc} onChange={(v) => set({ maxCirc: Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1)) })} />
        </span>
        <span className="ie-label">Group</span>
        <TextInput className="short" value={group} title="The group the particles found are put in (the summary is by group)" onChange={setGroup} />
      </div>
      <Check label="leave out those on the image's edge" title="Particles cut by the edge of the image left out (their size is not known)" value={opts.excludeEdges} onChange={(excludeEdges) => set({ excludeEdges })} />
      <div className="row wrap">
        <button className="nodrag btn-run" title="Find the particles of the mask (those found before replaced)" onClick={find}>
          Find particles
        </button>
        <span className="muted">{msg}</span>
      </div>
      <div className="hint">Or like some of them: draw a rectangle (or any shape) around one good particle, pick it, then Find like this. Every place that looks like it is found, turned any way and a little larger or smaller, on the last image of the steps that is not a mask. The dashed line around the selection shows what is compared. Several models (particles that look different: lit otherwise, tilted): give them one group in the list and pick one of them; each place is given the model most like it.</div>
      <div className="row wrap">
        <button className="nodrag" disabled={!p.canAdd} title={p.canAdd ? 'The selection picked added to the models, with the settings below (then each changed in its row)' : 'Pick a selection around a particle (not one of the models yet)'} onClick={p.addModel}>
          + Add model
        </button>
        {p.modelList.length > 0 && <span className="muted">{p.modelList.length} model{p.modelList.length === 1 ? '' : 's'}: each its own settings and group</span>}
      </div>
      {p.modelList.length > 0 && (
        <div className="ie-models">
          {p.modelList.map((m, j) => (
            <div key={m.roi} className="ie-model">
              <div className="row">
                <span className="ie-class-dot" style={{ background: p.modelColors[j % p.modelColors.length] }} />
                <button className="nodrag ie-model-name grow" title="Pick it (its dashed line shows what is compared)" onClick={() => p.pickModel(j)}>
                  {m.name}
                </button>
                <TextInput className="short" value={m.group ?? ''} placeholder={group} title="The group its particles go in (empty: the group below)" onChange={(g) => p.setModel(j, { group: g || undefined })} />
                <button className="nodrag ts-btn" title="Take it out of the models (the selection stays)" onClick={() => p.removeModel(j)}>
                  <X {...IC} />
                </button>
              </div>
              <div className="row wrap">
                <Select<MatchContext> value={m.context ?? 'disc'} title="What is compared besides the particle" options={CONTEXTS} onChange={(context) => p.setModel(j, { context })} />
                {m.context === 'alone' && <NumInput className="tiny" min={1} max={200} step={1} value={m.ring ?? 6} title="How far around the particle the ground is compared (px)" onChange={(v) => p.setModel(j, { ring: Math.max(1, Math.round(v || 6)) })} />}
                <Select<string> value={String(m.symmetry ?? 90)} title="The turns that look the same" options={TURNS} onChange={(v) => p.setModel(j, { symmetry: Number(v) as MatchOpts['symmetry'] })} />
                <Select<string> value={String(m.sizes ?? 0.1)} title="How much larger or smaller than the model" options={SIZES} onChange={(v) => p.setModel(j, { sizes: Number(v) })} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="ie-params">
        {p.modelList.length === 0 && (
          <>
        <span className="ie-label">Around it</span>
          <span className="row">
            <Select<MatchContext>
              value={match.context ?? 'disc'}
              title="What is compared besides the particle: a disc around the selection (its corners and a little around them); only the particle and its edge (in clusters: the neighbours, whatever they are, left out); or the particle and the ground around it out to the dashed line (a particle on its own: one in a cluster, or a piece of the ground, is less alike)"
              options={[
                ['disc', 'a disc around it'],
                ['cluster', 'only the particle (in clusters)'],
                ['alone', 'the particle and the ground (alone)'],
              ]}
              onChange={(context) => setMatch({ context: context === 'disc' ? undefined : context })}
            />
            {match.context === 'alone' && (
              <>
                <NumInput className="tiny" min={1} max={200} step={1} value={match.ring ?? 6} title="How far around the particle the ground is compared (px; also dragged by the handle on the dashed line)" onChange={(v) => setMatch({ ring: Math.max(1, Math.round(v || 6)) })} />
                <span className="muted">px</span>
              </>
            )}
          </span>
          <span className="ie-label">Turns</span>
          <Select<string>
            value={String(match.symmetry)}
            title="The turns that look the same: a square every 90°, a rectangle every 180°"
            options={[
              ['90', 'square (0 to 90°)'],
              ['180', 'rectangle (0 to 180°)'],
              ['360', 'any (0 to 360°)'],
            ]}
            onChange={(v) => setMatch({ symmetry: Number(v) as MatchOpts['symmetry'] })}
          />
          <span className="ie-label">Sizes</span>
          <Select<string>
            value={String(match.sizes)}
            title="How much larger or smaller than the model the particles may be"
            options={[
              ['0', 'as the model'],
              ['0.1', '± 10 %'],
              ['0.2', '± 20 %'],
              ['0.3', '± 30 %'],
            ]}
            onChange={(v) => setMatch({ sizes: Number(v) })}
          />
          </>
        )}
        <span className="ie-label">Similarity</span>
        <span className="row" title="The least similarity kept (the correlation with the model: 1 the same, 0 nothing alike): lower, more found and more mistakes. After a search it changes the particles found at once">
          <input className="nodrag grow" type="range" min={0.3} max={1} step={0.01} value={match.min} onChange={(e) => p.setMin(Number(e.target.value))} />
          <NumInput className="tiny" min={0} max={1} step={0.01} value={match.min} onChange={(v) => p.setMin(Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5)))} />
        </span>
      </div>
      <Check label="fit the edges" title="A rectangle or ellipse found: its sides and centre moved to the edges under it (its size measured, not only its place)" value={match.fit} onChange={(fit) => setMatch({ fit })} />
      <div className="row wrap">
        <button className="nodrag btn-run" disabled={!p.canMatch} title={p.canMatch ? 'Find every particle like the selection picked (those found before replaced)' : 'Pick a selection around one particle first'} onClick={p.findLike}>
          Find like this
        </button>
        {p.models > 1 && <span className="muted">{p.models} models (its group)</span>}
        {p.canMore && (
          <button className="nodrag" title="Search again with the particles found as models too (the least alike of them: they differ most from the first): more of those that look a little different" onClick={p.findMore}>
            Find more like these
          </button>
        )}
        {p.canMore && (
          <button className={`nodrag${p.review ? ' on' : ''}`} title="Review: a click on a particle found leaves it out; on one left out (faint), puts it back" onClick={() => p.setReview(!p.review)}>
            Review
          </button>
        )}
      </div>
      {count > 0 && (
        <>
          <div className="ie-section">Layers</div>
          <Check label="estimate the layers (which lie on others)" title="Where two particles touch, the one whose outline stays whole there is on top, the one cut by it under it (else the brighter on top): every particle its layer, 1 when nothing lies on it, its outline in the colour of its layer (green, orange, red …) and a Layer column in the measurements. A curiosity: an estimate" value={p.layers} onChange={p.setLayers} />
          <div className="ie-section">Refine</div>
          <div className="hint">Every particle found made the regular shape most like it, among those ticked, its place, size and turn fitted; then each can still be moved, turned or resized by hand (a particle changed by hand, ✎, is left as it is when refined again).</div>
          <div className="ie-shapes">
            {REGULAR_SHAPES.map((sh) => (
              <Check key={sh} label={sh} value={p.shapes.includes(sh)} onChange={(on) => p.setShapes(on ? [...p.shapes, sh] : p.shapes.filter((x) => x !== sh))} />
            ))}
          </div>
          <Check label="snapped to the edges" title="Each shape then moved onto the edges under it on the image (a square or a rectangle: its sides where the image crosses half-way from inside to outside; the others: scaled to the strongest edge)" value={p.snap} onChange={p.setSnap} />
          <div className="row wrap">
            <button className="nodrag btn-run" disabled={!p.shapes.length} title="The particles found made regular shapes (those changed by hand left as they are)" onClick={() => p.refine(false)}>
              Refine
            </button>
            {p.handCount > 0 && (
              <button className="nodrag" title={`Refine the ${p.handCount} changed by hand too`} onClick={() => p.refine(true)}>
                Refine all ({p.handCount} by hand too)
              </button>
            )}
          </div>
        </>
      )}
      {count > 0 && (
        <div className="row wrap">
          <button className="nodrag" title="Every particle put in the group of its shape: circle, ellipse, triangle, square, rectangle, polygon, irregular (by its corners and roundness)" onClick={byShape}>
            Group by shape
          </button>
          <button className="nodrag" title={`The particles still in “${group}” put in the group of the examples most like them in shape: first give a few particles a group of your own (in the list), then press this`} onClick={likeExamples}>
            Group like the examples
          </button>
        </div>
      )}
    </>
  );
}

// ---- what is measured, and the results ----

export function MeasurePanel({ spec, set, steps, rgb, rois, book, sheet, setSheet, pick }: { spec: MeasureSpec; set: (p: Partial<MeasureSpec>) => void; steps: ImgStep[]; rgb: boolean; rois: Roi[]; book: Workbook | null; sheet: string; setSheet: (s: string) => void; pick: (name: string) => void }) {
  const on: [string, string][] = [['original', 'the original'], ['result', 'the result'], ...steps.map((s, k): [string, string] => [s.id, `after ${k + 1}. ${STEP_DEFS[s.kind]?.label ?? s.kind}`])];
  const toggle = (key: MeasureKey, v: boolean) => set({ keys: v ? [...spec.keys, key] : spec.keys.filter((x) => x !== key) });
  const hasSpots = rois.some((r) => r.bg && r.bg.mode !== 'none');
  const shown = book?.sheets.find((s) => s.name === sheet) ?? book?.sheets[0];
  const copy = () => {
    if (!shown) return;
    const n = shown.columns[0]?.values.length ?? 0;
    const cell = (c: (typeof shown.columns)[number], i: number) => (c.text ? c.text[i] : Number.isFinite(c.values[i]) ? String(c.values[i]) : '');
    const tsv = [shown.columns.map((c) => c.name).join('\t'), ...Array.from({ length: n }, (_, i) => shown.columns.map((c) => cell(c, i)).join('\t'))].join('\n');
    void navigator.clipboard?.writeText(tsv);
  };
  const ch = ['R', 'G', 'B'].map((c, j): [number, string] => [j, c]);
  return (
    <>
      <div className="ie-section">Measure</div>
      <div className="ie-params">
        <span className="ie-label">On</span>
        <Select<string> value={spec.on} title="The image whose values are measured: the original (the part analysed), the result of the steps, or the image after a step. The mask's coverage: of the last mask the steps give" options={on} onChange={(v) => set({ on: v })} />
        {rgb && (
          <>
            <span className="ie-label">Channels</span>
            <span className="row">
              <Select<MeasureSpec['channels']>
                value={spec.channels}
                title="A colour image: measured on its luminance, or on each channel (with the ratio of two: two colours of a microarray in one image)"
                options={[
                  ['luminance', 'luminance'],
                  ['each', 'each, and a ratio'],
                ]}
                onChange={(channels) => set({ channels })}
              />
              {spec.channels === 'each' && (
                <>
                  <Select<number> value={spec.ratio[0]} options={ch} title="The ratio's numerator" onChange={(a) => set({ ratio: [a, spec.ratio[1]] })} />
                  <span className="muted">/</span>
                  <Select<number> value={spec.ratio[1]} options={ch} title="The ratio's denominator" onChange={(b) => set({ ratio: [spec.ratio[0], b] })} />
                </>
              )}
            </span>
          </>
        )}
      </div>
      <div className="ie-measure-keys">
        {MEASURE_KEYS.map(([key, label, title]) => (
          <Check key={key} label={label} title={title} value={spec.keys.includes(key)} onChange={(v) => toggle(key, v)} />
        ))}
      </div>
      {hasSpots && (
        <div className="ie-params">
          <span className="ie-label">Spots</span>
          <Select<MeasureSpec['bgStat']>
            value={spec.bgStat}
            title="The background taken off a spot: the median of its pixels (robust to dust and neighbours) or their mean"
            options={[
              ['median', 'background median'],
              ['mean', 'background mean'],
            ]}
            onChange={(bgStat) => set({ bgStat })}
          />
          <span className="ie-label">Saturated</span>
          <NumInput className="short" value={spec.saturated} placeholder="the top" title="A pixel at or above this counts as saturated (empty: the top of the image's range, 255 or 65535)" onChange={(saturated) => set({ saturated })} />
          <span className="ie-label">Global bg</span>
          <span className="row">
            <Select<string> value={spec.globalBg ?? ''} title="The global background: a selection (its pixels), else the value given" options={[['', 'a value'], ...rois.filter(isArea).map((r): [string, string] => [r.id, r.name])]} onChange={(g) => set({ globalBg: g || undefined })} />
            {!spec.globalBg && <NumInput className="short" value={spec.globalValue ?? NaN} placeholder="value" onChange={(globalValue) => set({ globalValue: Number.isFinite(globalValue) ? globalValue : undefined })} />}
          </span>
        </div>
      )}
      <div className="ie-section">Results</div>
      {book && book.sheets.length ? (
        <>
          <div className="row wrap">
            <Select<string> value={shown?.name ?? ''} options={book.sheets.map((s): [string, string] => [s.name, s.name])} title="The sheet shown (all of them go out of the node's workbook)" onChange={setSheet} />
            <button className="nodrag" title="Copy the sheet shown (tab-separated, for a spreadsheet)" onClick={copy}>
              <Copy {...IC} /> Copy
            </button>
          </div>
          {shown && <ResultsTable sheet={shown} pick={pick} />}
        </>
      ) : (
        <div className="hint">{rois.length ? 'Measuring…' : 'The measurements of the selections, and the coverage of a mask, appear here and go out of the node (workbook).'}</div>
      )}
    </>
  );
}

function ResultsTable({ sheet, pick }: { sheet: Workbook['sheets'][number]; pick: (name: string) => void }) {
  const n = Math.min(500, sheet.columns[0]?.values.length ?? 0);
  const name = sheet.columns.find((c) => c.name === 'Name');
  return (
    <div className="ie-results">
      <table>
        <thead>
          <tr>
            {sheet.columns.map((c) => (
              <th key={c.name}>{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => (
            <tr key={i} onClick={() => name?.text && pick(name.text[i])}>
              {sheet.columns.map((c) => (
                <td key={c.name} className={c.text ? 'text' : ''}>
                  {c.text ? c.text[i] : fmt(c.values[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
