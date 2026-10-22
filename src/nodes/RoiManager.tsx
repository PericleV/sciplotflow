// The selections of the Image analysis editor: drawn over the image (the one picked with its handles — the corners and
// sides of a rectangle or an ellipse and its turn, the points of the others), the ROI manager (their names, colours,
// groups, shown or not; the background of a spot; the width of a line), what is measured and the results.
import type { ReactNode } from 'react';
import { isArea, isLine, roiOutline, ROI_COLOR, ROI_KINDS, RING_DEFAULTS, TOOL_HINTS, type Pt, type Roi, type RoiBgMode, type RoiTool } from '../image/roi.ts';
import { MEASURE_KEYS, type MeasureKey, type MeasureSpec } from '../image/measure.ts';
import { STEP_DEFS, type ImgStep } from '../image/steps.ts';
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
// the selections take the clicks (to pick, move, edit them), else the tool drawing does
export function RoiOverlay({ rois, sel, k, ox, oy, W, H, labels, interactive }: { rois: Roi[]; sel: string | null; k: number; ox: number; oy: number; W: number; H: number; labels: boolean; interactive: boolean }) {
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
    // the ring of background of a spot picked (a rectangle or an ellipse: drawn; other shapes: measured all the same)
    const ring =
      picked && r.box && r.bg?.mode === 'ring'
        ? [r.bg.gap ?? RING_DEFAULTS.gap, (r.bg.gap ?? RING_DEFAULTS.gap) + (r.bg.width ?? RING_DEFAULTS.width)].map((d, j) => <polygon key={j} points={P(roiOutline({ ...r, box: [r.box![0], r.box![1], Math.abs(r.box![2]) + 2 * d, Math.abs(r.box![3]) + 2 * d] }))} className="ie-roi-ring" />)
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
  wandTol: number;
  setWandTol: (v: number) => void;
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
      </div>
      {rois.length ? (
        <div className="ie-roi-list">
          {rois.map((r) => (
            <div key={r.id} className={`ie-roi-row${r.id === sel ? ' sel' : ''}`} onClick={() => setSel(r.id)}>
              <input className="nodrag color" type="color" value={r.color ?? ROI_COLOR} title="Its colour" onChange={(e) => upd(r.id, { color: e.target.value })} />
              <TextInput className="grow" value={r.name} title="Its name (the rows of the results)" onChange={(name) => upd(r.id, { name })} />
              <span className="muted ie-roi-kind" title={ROI_KINDS[r.kind]}>
                {r.role === 'background' ? 'bg' : ROI_KINDS[r.kind]}
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
        <div className="hint">No selections yet: pick a tool at the top (rectangle, ellipse, polygon, freehand, line, points, angle, wand, stamp) and draw on the image.</div>
      )}
      <div className="row wrap">
        <button className="nodrag" disabled={!picked} title="A copy of the selection picked, a little aside (Ctrl+D)" onClick={p.duplicate}>
          Duplicate
        </button>
        <button className="nodrag" disabled={!rois.length} title="Remove all the selections" onClick={p.clearAll}>
          Remove all
        </button>
      </div>
      {picked && isArea(picked) && (
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
              <Select<string> value={picked.bg.region ?? ''} title="The selection whose pixels are this spot's background" options={[['', '—'], ...regions.map((r): [string, string] => [r.id, r.name])]} onChange={(region) => upd(picked.id, { bg: { ...picked.bg!, region: region || undefined } })} />
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
