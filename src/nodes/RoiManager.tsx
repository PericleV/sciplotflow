// The selections of the Image analysis editor: drawn over the image (the one picked with its handles — the corners and
// sides of a rectangle or an ellipse and its turn, the points of the others), the ROI manager (their names, colours,
// groups, shown or not; the background of a spot; the width of a line), the particles found in the mask (and grouped by
// their shape), what is measured and the results.
import { useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { isArea, isLine, roiOutline, ROI_COLOR, ROI_KINDS, RING_DEFAULTS, TOOL_HINTS, type Pt, type Roi, type RoiBgMode, type RoiTool } from '../image/roi.ts';
import { MEASURE_KEYS, type MeasureKey, type MeasureSpec } from '../image/measure.ts';
import { STEP_DEFS, type ImgStep } from '../image/steps.ts';
import type { ParticleOpts } from '../image/particles.ts';
import { FEATURE_NAMES, MATCH_DEFAULTS, MATCH_TUNING, type MatchContext, type MatchModelSpec, type MatchOpts } from '../image/match.ts';
import { LEARN_LABELS, LEARN_METHODS, LEAST_EXAMPLES, type LearnMethod } from '../image/learn.ts';
import type { AccuracyResult } from '../image/accuracy.ts';
import { REGULAR_SHAPES, type RegularShape } from '../image/refine.ts';
const CONTEXTS: [MatchContext, string][] = [
  ['disc', 'a disc around it'],
  ['cluster', 'only the particle (in clusters)'],
  ['alone', 'the particle and the ground (alone)'],
  ['drawn', 'a margin I draw'],
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
import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, RotateCcw, X } from 'lucide-react';
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
        {r.score !== undefined && <title>{`${r.name}: similarity ${r.score.toFixed(2)}`}</title>}
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
  // the sections: the context of the model picked (its margin edited on the image), the similarities found, the edges
  // fitted only inside the margin, those left out used, the finer settings
  pickedContext?: MatchContext;
  editMargin: boolean;
  setEditMargin: (on: boolean) => void;
  resetMargin: () => void;
  scores: number[];
  fit: boolean;
  inside?: boolean;
  setInside: (on: boolean) => void;
  negCount: number;
  clearRejected: () => void;
  useRejected?: boolean;
  setUseRejected: (on: boolean) => void;
  preset: string;
  setPreset: (p: 'fast' | 'balanced' | 'precise') => void;
  changed: number;
  resetAdvanced: () => void;
  steps: [string, string][];
  image?: string;
  setImage: (id: string | undefined) => void;
  // Review ▸ Learn from my choices: on, the method, the examples said good and not, what was learnt (the method used,
  // how often each is right, how much each feature counts), the probabilities of the last search and the least kept,
  // the unsure ones shown, the examples forgotten
  learnOn: boolean;
  setLearn: (on: boolean) => void;
  method: LearnMethod | 'auto';
  setMethod: (m: LearnMethod | 'auto') => void;
  goodCount: number;
  badCount: number;
  learnt: { method: LearnMethod; accuracy: Record<LearnMethod, number>; importance: number[] } | null;
  probs: number[] | null;
  pmin: number;
  setPmin: (v: number) => void;
  unsure: boolean;
  setUnsure: (on: boolean) => void;
  clearExamples: () => void;
  // Accuracy: the group of the particles marked as true, the groups there are, the check and its result
  truth: string;
  setTruth: (g: string) => void;
  groups: string[];
  check: () => void;
  acc: AccuracyResult | null;
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
      <div className="ie-section">Find like this</div>
      <div className="hint">Or like some of them: draw a rectangle (or any shape) around one good particle, pick it, then Find like this. Every place that looks like it is found, turned any way and a little larger or smaller. The sections below, folded, say what they hold.</div>
      <Fold id="model" title="Model" always>
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
        {p.modelList.length === 0 && (
          <div className="ie-params">
            <span className="ie-label">Turns</span>
            <Select<string> value={String(match.symmetry)} title="The turns that look the same: a square every 90°, a rectangle every 180°" options={TURNS} onChange={(v) => setMatch({ symmetry: Number(v) as MatchOpts['symmetry'] })} />
            <span className="ie-label">Sizes</span>
            <Select<string> value={String(match.sizes)} title="How much larger or smaller than the model the particles may be" options={SIZES} onChange={(v) => setMatch({ sizes: Number(v) })} />
          </div>
        )}
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
        </div>
      </Fold>
      <Fold id="area" title="Compared area" aside={CONTEXTS.find(([v]) => v === (p.pickedContext ?? match.context ?? 'disc'))?.[1]}>
        {p.modelList.length === 0 && (
          <div className="ie-params">
            <span className="ie-label">Around it</span>
            <span className="row">
              <Select<MatchContext>
                value={match.context ?? 'disc'}
                title="What is compared besides the particle: a disc around the selection (its corners and a little around them); only the particle and its edge (in clusters: the neighbours, whatever they are, left out); the particle and the ground around it out to the dashed line (a particle on its own: one in a cluster, or a piece of the ground, is less alike); or what is inside a margin you draw around it (its points dragged on the image)"
                options={CONTEXTS}
                onChange={(context) => setMatch({ context: context === 'disc' ? undefined : context })}
              />
              {match.context === 'alone' && (
                <>
                  <NumInput className="tiny" min={1} max={200} step={1} value={match.ring ?? 6} title="How far around the particle the ground is compared (px; also dragged by the handle on the dashed line)" onChange={(v) => setMatch({ ring: Math.max(1, Math.round(v || 6)) })} />
                  <span className="muted">px</span>
                </>
              )}
            </span>
          </div>
        )}
        {p.modelList.length > 0 && <div className="hint">Each model its own, in its row above.</div>}
        {p.pickedContext === 'drawn' ? (
          <>
            <div className="hint">The margin: the dashed line around the model picked. What is inside it is compared, nothing outside it (a neighbour, a piece of the ground). It starts as the line of the ground around the particle; move its points to fit what matters.</div>
            <div className="row wrap">
              <button className={`nodrag${p.editMargin ? ' on' : ''}`} title="Its points shown with handles on the image: drag one; drag one of the small ones between them for a new point; double-click one to take it off" onClick={() => p.setEditMargin(!p.editMargin)}>
                {p.editMargin ? 'Done' : 'Edit the margin'}
              </button>
              <button className="nodrag" title="The margin back to the line of the ground around the particle" onClick={p.resetMargin}>
                Reset
              </button>
            </div>
          </>
        ) : (
          (p.modelList.length ? p.modelList.some((m) => m.context === 'drawn') : match.context === 'drawn') && <div className="hint">Pick the model to see and edit its margin.</div>
        )}
      </Fold>
      <Fold id="similarity" title="Similarity" aside={p.probs ? `probability ≥ ${p.pmin.toFixed(2)} · ${p.probs.filter((v) => v >= p.pmin).length} found` : `≥ ${match.min.toFixed(2)}${p.scores.length ? ` · ${p.scores.filter((v) => v >= match.min).length} found` : ''}`}>
        {p.probs ? (
          <>
            <ScoreHistogram scores={p.probs} min={p.pmin} onMin={p.setPmin} lo={0} />
            <div className="hint">Learnt from your choices: the probability of every place found being a good particle; those at least as probable as the line kept.</div>
          </>
        ) : (
          p.scores.length > 0 && <ScoreHistogram scores={p.scores} min={match.min} onMin={p.setMin} />
        )}
        <div className="ie-params">
          <span className="ie-label">Least</span>
          <span className="row" title="The least similarity kept (the correlation with the model: 1 the same, 0 nothing alike): lower, more found and more mistakes. After a search it changes the particles found at once; on the histogram, put it in the gap between the particles and the mistakes">
            <input className="nodrag grow" type="range" min={0.3} max={1} step={0.01} value={match.min} onChange={(e) => p.setMin(Number(e.target.value))} />
            <NumInput className="tiny" min={0} max={1} step={0.01} value={match.min} onChange={(v) => p.setMin(Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5)))} />
          </span>
        </div>
        <div className="hint">{p.scores.length ? 'Every place found: how alike the model it is. The mouse resting on a particle found says its similarity.' : 'After a search: how alike every place found is, on a histogram.'}</div>
      </Fold>
      <Fold id="separation" title="Separation and edges" aside={`${match.separate === 'overlap' ? `overlap ${Math.round((match.overlap ?? MATCH_TUNING.overlap) * 100)} %` : (match.reach ?? MATCH_TUNING.reach).toFixed(2)}${p.fit ? ' · edges fitted' : ''}`}>
        <div className="ie-params">
          <span className="ie-label">Separate by</span>
          <Select<'distance' | 'overlap'> seg value={match.separate ?? 'distance'} title="Two places are one particle when their centres are closer than the least distance, or when their outlines overlap more than the part given (better for long particles, or particles touching along a side)" options={[['distance', 'Distance'], ['overlap', 'Overlap']]} onChange={(v) => setMatch({ separate: v === 'distance' ? undefined : v })} />
          {match.separate === 'overlap' && (
            <>
              <span className="ie-label">Overlap</span>
              <span className="row" title="Two places whose outlines overlap more than this part of the smaller are one particle">
                <NumInput className="tiny" min={1} max={95} step={5} value={Math.round((match.overlap ?? MATCH_TUNING.overlap) * 100)} onChange={(v) => setMatch({ overlap: Number.isFinite(v) ? Math.min(0.95, Math.max(0.01, v / 100)) : undefined })} />
                <span className="muted">%</span>
                {match.overlap !== undefined && <Reset onClick={() => setMatch({ overlap: undefined })} />}
              </span>
            </>
          )}
        </div>
        <div className="ie-params" style={match.separate === 'overlap' ? { display: 'none' } : undefined}>
          <span className="ie-label">Least distance</span>
          <span className="row" title="Two places closer than this part of the model's radius are one particle (the more alike kept): smaller, touching particles found apart; larger, one particle never found twice">
            <NumInput className="tiny" min={0.1} max={3} step={0.05} value={match.reach ?? MATCH_TUNING.reach} onChange={(v) => setMatch({ reach: Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.1, v)) : undefined })} />
            <span className="muted">× the radius</span>
            {match.reach !== undefined && <Reset onClick={() => setMatch({ reach: undefined })} />}
          </span>
        </div>
        <Check label="fit the edges" title="A rectangle or ellipse found: its sides and centre moved to the edges under it (its size measured, not only its place)" value={p.fit} onChange={(fit) => setMatch({ fit })} />
        {p.fit && <Check label="only inside the margin drawn" title="The edges looked for only as far as the margin drawn reaches (a neighbour's edge outside it never taken); with a margin drawn" value={!!p.inside} onChange={(inside) => p.setInside(inside)} />}
      </Fold>
      <Fold id="review" title="Review" aside={p.review ? 'on' : p.negCount ? `${p.negCount} left out` : undefined}>
        <div className="row wrap">
          <button className={`nodrag${p.review ? ' on' : ''}`} disabled={!p.canMore} title="Review: a click on a particle found leaves it out; on one left out (faint), puts it back" onClick={() => p.setReview(!p.review)}>
            Review
          </button>
          {p.negCount > 0 && (
            <button className="nodrag" title="Forget the particles left out before (the places like them are found again)" onClick={p.clearRejected}>
              Clear ({p.negCount})
            </button>
          )}
        </div>
        <Check label="Learn from my choices" title="While reviewing, a click on a particle found says it is not good, a second one that it is good, a third neither. From those said (3 of each at least) a classifier learns what tells them apart (how alike, its edges, brightness, contrast, size, turn, texture, its nearest), and keeps the places it finds probably good" value={p.learnOn} onChange={p.setLearn} />
        {p.learnOn && (
          <div className="ie-learn">
            <span className="muted">
              {p.goodCount} good, {p.badCount} not good{p.learnt ? '' : `: ${LEAST_EXAMPLES} of each to learn`}
            </span>
            <div className="ie-params">
              <span className="ie-label">Method</span>
              <Select<string> seg value={p.method} title="Auto: the method most often right on your examples (each left out in turn and guessed from the others). Logistic: few examples, says what counts; LDA: few examples, features alike; k-NN: mistakes of a few kinds; Forest: many examples, relations not straight" options={[['auto', 'Auto'], ...LEARN_METHODS.map((m): [string, string] => [m, LEARN_LABELS[m]])]} onChange={(v) => p.setMethod(v as LearnMethod | 'auto')} />
            </div>
            {p.learnt && (
              <>
                <div className="hint">
                  Right on your examples (each guessed from the others):{' '}
                  {LEARN_METHODS.map((m) => `${LEARN_LABELS[m]} ${Number.isFinite(p.learnt!.accuracy[m]) ? Math.round(p.learnt!.accuracy[m] * 100) : '–'} %`).join(', ')}; used: {LEARN_LABELS[p.learnt.method]}
                </div>
                <div className="ie-importance" title="How much each feature counts: how much the probabilities move when its values are shuffled">
                  {FEATURE_NAMES.map((name, j) => (
                    <div key={name} className="ie-imp-row">
                      <span>{name}</span>
                      <span className="ie-imp-bar" style={{ width: `${Math.round(p.learnt!.importance[j] * 100)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="row wrap">
                  <button className={`nodrag${p.unsure ? ' on' : ''}`} title="The 5 places the classifier is least sure of (not said yet), outlined: say them while reviewing, then the next 5" onClick={() => p.setUnsure(!p.unsure)}>
                    Show the unsure ones
                  </button>
                </div>
              </>
            )}
            {p.goodCount + p.badCount > 0 && (
              <div className="row">
                <button className="nodrag" title="Forget every particle said good or not" onClick={p.clearExamples}>
                  Forget the examples
                </button>
              </div>
            )}
          </div>
        )}
        <Check label="use those left out: not like these" title="The particles left out are kept, and at the next search every place more like one of them than like the model (judged on what is compared: the area above) is dropped: mistakes of one kind go away together. Leave out mistakes, not good particles: those like a good one would go too" value={!!p.useRejected} onChange={p.setUseRejected} />
      </Fold>
      <Fold id="advanced" title="Advanced" aside={p.changed ? `${p.changed} changed` : 'default'}>
        <div className="ie-params">
          <span className="ie-label">Compare</span>
          <Select<string> seg value={match.compare ?? 'brightness'} title="What is compared: the values (brightness; best in noise), the directions of the outline (edges; best when the insides of the particles differ: hollow, shiny, textured), or both" options={[['brightness', 'Brightness'], ['edges', 'Edges'], ['both', 'Both']]} onChange={(v) => setMatch({ compare: v === 'brightness' ? undefined : (v as 'edges' | 'both') })} />
          <span className="ie-label">Preset</span>
          <Select<string> seg value={p.preset} title="Fast: fewer turns, a coarser first search; Precise: more turns and sizes, a finer first search (slower)" options={[['fast', 'Fast'], ['balanced', 'Balanced'], ['precise', 'Precise'], ...(p.preset === 'custom' ? ([['custom', 'Custom']] as [string, string][]) : [])]} onChange={(v) => v !== 'custom' && p.setPreset(v as 'fast' | 'balanced' | 'precise')} />
          <span className="ie-label">Turn step</span>
          <span className="row" title="Between the turns tried (degrees): smaller, more precise and slower (refined to 1° after)">
            <NumInput className="tiny" min={1} max={45} step={1} value={match.step} onChange={(v) => setMatch({ step: Math.min(45, Math.max(1, Math.round(v || 5))) })} />
            <span className="muted">°</span>
            {match.step !== MATCH_DEFAULTS.step && <Reset onClick={() => setMatch({ step: MATCH_DEFAULTS.step })} />}
          </span>
          <span className="ie-label">Sizes tried</span>
          <span className="row" title="How many sizes from − Sizes to + Sizes (an odd number: the model's own among them)">
            <NumInput className="tiny" min={1} max={11} step={2} value={match.tried ?? MATCH_TUNING.tried} onChange={(v) => setMatch({ tried: Number.isFinite(v) ? Math.min(11, Math.max(1, Math.round(v))) : undefined })} />
            {match.tried !== undefined && <Reset onClick={() => setMatch({ tried: undefined })} />}
          </span>
          <span className="ie-label">First search</span>
          <span className="row" title="The model's radius on the image shrunk for the first, quick search (px): larger, fewer particles missed and slower">
            <NumInput className="tiny" min={2} max={20} step={1} value={match.coarse ?? MATCH_TUNING.coarse} onChange={(v) => setMatch({ coarse: Number.isFinite(v) ? Math.min(20, Math.max(2, Math.round(v))) : undefined })} />
            <span className="muted">px</span>
            {match.coarse !== undefined && <Reset onClick={() => setMatch({ coarse: undefined })} />}
          </span>
          <span className="ie-label">Candidates</span>
          <span className="row" title="The places of the first search looked at closely: those as alike as this part of Least or more (lower: weak particles caught, slower)">
            <NumInput className="tiny" min={0.3} max={1} step={0.05} value={match.candidates ?? MATCH_TUNING.candidates} onChange={(v) => setMatch({ candidates: Number.isFinite(v) ? Math.min(1, Math.max(0.3, v)) : undefined })} />
            {match.candidates !== undefined && <Reset onClick={() => setMatch({ candidates: undefined })} />}
          </span>
          <span className="ie-label">Image</span>
          <Select<string> value={p.image ?? ''} title="The image compared: the last of the steps that is not a mask, or the image after a step (e.g. edges brought out), while the particles are measured on the image Measure says" options={[['', 'the last that is not a mask'], ...p.steps]} onChange={(v) => p.setImage(v || undefined)} />
          <span className="ie-label">Edge band</span>
          <span className="row" title="With “only the particle”: how much outside its outline is compared (px)">
            <NumInput className="tiny" min={0} max={20} step={0.5} value={match.edge ?? MATCH_TUNING.edge} onChange={(v) => setMatch({ edge: Number.isFinite(v) ? Math.min(20, Math.max(0, v)) : undefined })} />
            <span className="muted">px</span>
            {match.edge !== undefined && <Reset onClick={() => setMatch({ edge: undefined })} />}
          </span>
          <span className="ie-label">Most found</span>
          <span className="row" title="The most particles found">
            <NumInput className="short" min={1} step={100} value={match.max} onChange={(v) => setMatch({ max: Math.max(1, Math.round(v || MATCH_DEFAULTS.max)) })} />
            {match.max !== MATCH_DEFAULTS.max && <Reset onClick={() => setMatch({ max: MATCH_DEFAULTS.max })} />}
          </span>
        </div>
        <Check label="the brightness counts" title="The places as bright and as contrasted as the model too (else alike up to their brightness and contrast): a much darker or brighter particle is less alike" value={!!match.brightness} onChange={(brightness) => setMatch({ brightness: brightness || undefined })} />
        {p.changed > 0 && (
          <div className="row">
            <button className="nodrag" title="Every setting of Advanced as it is when not changed" onClick={p.resetAdvanced}>
              Reset all
            </button>
          </div>
        )}
      </Fold>
      <Fold id="accuracy" title="Accuracy" aside={p.acc ? `F1 ${p.acc.f1.toFixed(2)}` : undefined}>
        <div className="hint">Mark by hand every true particle of a part of the image (selections in one group), then Check: of the particles found in the box around them, how many are right (precision), how many of the true ones were found (recall), and both at once (F1). For any way of finding them.</div>
        <div className="ie-params">
          <span className="ie-label">True ones</span>
          <Select<string> value={p.truth} title="The group of the selections marked by hand as the true particles" options={[...new Set([p.truth, ...p.groups])].map((g): [string, string] => [g, g])} onChange={p.setTruth} />
        </div>
        <div className="row wrap">
          <button className="nodrag" title="Compare the particles found with those marked, in the part of the image they cover" onClick={p.check}>
            Check
          </button>
          {p.acc && (
            <span className="muted">
              precision {p.acc.precision.toFixed(2)} · recall {p.acc.recall.toFixed(2)} · F1 {p.acc.f1.toFixed(2)} ({p.acc.tp} right, {p.acc.fp} wrong, {p.acc.fn} missed)
            </span>
          )}
        </div>
      </Fold>
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

// A section of Find like this, folded or not (remembered in this browser); aside: what it holds, said on its title
const FOLDS = 'graph-flow:find-like-folds';
const foldsOpen = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(FOLDS) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};
export function Fold({ id, title, aside, always, children }: { id: string; title: string; aside?: string; always?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => always || (foldsOpen()[id] ?? false));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(FOLDS, JSON.stringify({ ...foldsOpen(), [id]: next }));
    } catch {
      // (storage unavailable: folded as at first next time)
    }
  };
  return (
    <div className={`ie-fold${open ? ' open' : ''}`}>
      {always ? (
        <div className="ie-fold-head fixed">{title}</div>
      ) : (
        <button className="nodrag ie-fold-head" onClick={toggle} aria-expanded={open}>
          {open ? <ChevronDown {...IC} /> : <ChevronRight {...IC} />}
          <span>{title}</span>
          {aside && <span className="ie-fold-aside">{aside}</span>}
        </button>
      )}
      {open && <div className="ie-fold-body">{children}</div>}
    </div>
  );
}
// ⟲: a setting back to as it is when not changed
const Reset = ({ onClick }: { onClick: () => void }) => (
  <button className="nodrag ts-btn" title="Back to as it is when not changed" onClick={onClick}>
    <RotateCcw {...IC} />
  </button>
);
// The similarities of every place found, on a histogram (0.3 … 1), the least kept a line on it: a click or a drag on it
// sets it (the particles kept, to its right, in the accent)
function ScoreHistogram({ scores, min, onMin, lo = 0.3 }: { scores: number[]; min: number; onMin: (v: number) => void; lo?: number }) {
  const [W, H, n] = [240, 56, 35];
  const bins = new Array<number>(n).fill(0);
  for (const v of scores) bins[Math.min(n - 1, Math.max(0, Math.floor(((v - lo) / (1 - lo)) * n)))]++;
  const top = Math.max(1, ...bins);
  const xOf = (v: number) => ((v - lo) / (1 - lo)) * W;
  const set = (e: RPointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const v = lo + ((e.clientX - b.left) / b.width) * (1 - lo);
    onMin(Math.round(Math.min(1, Math.max(lo, v)) * 100) / 100);
  };
  const kept = scores.filter((v) => v >= min).length;
  return (
    <div className="ie-score-hist">
      <svg
        viewBox={`0 0 ${W} ${H + 12}`}
        className="nodrag"
        onPointerDown={(e) => {
          set(e);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // (no pointer to follow: the click alone sets it)
          }
        }}
        onPointerMove={(e) => e.buttons & 1 && set(e)}
      >
        {bins.map((c, i) => {
          const h = (c / top) * H;
          const v = lo + ((i + 0.5) / n) * (1 - lo);
          return <rect key={i} x={(i / n) * W + 0.5} y={H - h} width={W / n - 1} height={h} className={v >= min ? 'kept' : ''} />;
        })}
        <line x1={xOf(min)} x2={xOf(min)} y1={0} y2={H} className="least" />
        {(lo === 0 ? [0, 0.25, 0.5, 0.75] : [0.3, 0.5, 0.7, 0.9]).map((v) => (
          <text key={v} x={xOf(v)} y={H + 10} textAnchor="middle">
            {v}
          </text>
        ))}
        <text x={W} y={H + 10} textAnchor="end">
          1
        </text>
      </svg>
      <span className="muted">
        {kept} of {scores.length} kept (≥ {min.toFixed(2)}); click or drag on it to move the line
      </span>
    </div>
  );
}
