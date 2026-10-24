// A curve's quick fits (Plot ▸ a curve ▸ style): every fit its model — a line, a polynomial, an exponential, a power, a
// logarithm, a moving average, peaks (Gaussian, Lorentzian, pseudo-Voigt, Voigt over a baseline, found by themselves or
// placed on the figure) or a formula —, its ranges of x (drawn on the figure, or typed), its curve's look and band, its
// legend entry and results box, the look of its ranges on the figure, its parameters' starts, and its results. Its
// curve is styled as any curve of the Plot (line, scatter, line + symbols, steps; the same tabs).
import { useState } from 'react';
import type { FitParamSpec } from '../engine/fit.ts';
import { fitLook, fitOwnStyle, quickModel, isTrend, paramText, rangeText, trendNote, type QuickFitKind, type QuickFitSpec, type QuickPeakShape, type RegionLook } from '../engine/quickfit.ts';
import type { QuickFitView } from '../engine/evaluate.ts';
import { fmtNum } from '../engine/table.ts';
import type { Baseline } from '../engine/fitModels.ts';
import type { CurveStyle, Dash, Hatch, PlotMode } from '../figure/spec.ts';
import { CurveStyleEditor } from './CurveStyleEditor.tsx';
import { OptColor } from './fields.tsx';
import { HatchMore } from './HatchMore.tsx';
import { DASHES, HATCHES } from './figureOptions.ts';
import { Check, Field, NumInput, Select, TextInput } from './ui.tsx';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { IC } from './iconProps.ts';

const KINDS: [QuickFitKind, string][] = [
  ['linear', 'linear'],
  ['poly', 'polynomial'],
  ['exp', 'exponential'],
  ['power', 'power'],
  ['log', 'logarithmic'],
  ['movavg', 'moving average'],
  ['peaks', 'peaks'],
  ['formula', 'formula (custom)'],
];
const SHAPES: [QuickPeakShape, string][] = [
  ['gauss', 'Gaussian'],
  ['lorentz', 'Lorentzian'],
  ['voigt', 'pseudo-Voigt'],
  ['voigtx', 'Voigt'],
];
const BASELINES: [Baseline, string][] = [
  ['none', 'no baseline'],
  ['constant', 'constant baseline'],
  ['linear', 'linear baseline'],
  ['quadratic', 'quadratic baseline'],
];

// placing: the fit whose peaks are being placed on the figure; drawing: the fit whose ranges the figure's ↔ Add a range
// adds to (with the figure's tools); curve: the look of the curve fitted (a fit's defaults); curves: the Plot's curves
// (number, name), for a fill down to one of them
export function QuickFitControls({ value, onChange, results, drawing, onDraw, placing, onPlace, curve, curves }: { value: QuickFitSpec[]; onChange: (v: QuickFitSpec[]) => void; results: QuickFitView[]; drawing: number | null; onDraw: (j: number | null) => void; placing: number | null; onPlace: (j: number | null) => void; curve: FitBase; curves: [number, string][] }) {
  const set = (j: number, p: Partial<QuickFitSpec>) => onChange(value.map((q, i) => (i === j ? { ...q, ...p } : q)));
  const remove = (j: number) => {
    onChange(value.filter((_, i) => i !== j));
    if (drawing !== null && drawing >= j) onDraw(null);
    if (placing !== null && placing >= j) onPlace(null);
  };
  return (
    <div className="trend-controls quick-fits">
      <div className="row wrap">
        <b title="Fits drawn with this curve: lines and curves (least squares), peaks over a baseline, or a formula: on all its points or on ranges of x drawn on the figure">Quick fit</b>
        <span className="grow" />
        <button className="nodrag" title="Another fit of this curve (another model, or other ranges)" onClick={() => onChange([...value, { kind: 'linear' }])}>
          + Fit
        </button>
      </div>
      {value.map((q, j) => (
        <QuickFitItem key={j} q={q} set={(p) => set(j, p)} remove={() => remove(j)} results={results.find((r) => r.fit === j)} drawing={drawing === j} onDraw={() => onDraw(drawing === j ? null : j)} placing={placing === j} onPlace={() => onPlace(placing === j ? null : j)} curve={curve} curves={curves} />
      ))}
    </div>
  );
}

type FitBase = Pick<CurveStyle, 'color' | 'lineWidth' | 'axisX' | 'axisY'>;
const MODES: [PlotMode, string][] = [
  ['line', 'line'],
  ['scatter', 'scatter'],
  ['linesymbol', 'line + symbols'],
  ['step', 'steps'],
];

function QuickFitItem({ q, set, remove, results, drawing, onDraw, placing, onPlace, curve, curves }: { q: QuickFitSpec; set: (p: Partial<QuickFitSpec>) => void; remove: () => void; results?: QuickFitView; drawing: boolean; onDraw: () => void; placing: boolean; onPlace: () => void; curve: FitBase; curves: [number, string][] }) {
  const trend = isTrend(q.kind);
  // its curve's style: as drawn (its own over the defaults) and as set (written into `style`, the older fields cleared;
  // a value undefined: back to the default)
  const [styling, setStyling] = useState(false);
  const st = fitLook(q, curve);
  const own = fitOwnStyle(q);
  const setSt = (p: Partial<CurveStyle>) => {
    const next: Partial<CurveStyle> = { ...own, ...p };
    for (const k of Object.keys(next) as (keyof CurveStyle)[]) if (next[k] === undefined) delete next[k];
    set({ style: Object.keys(next).length ? next : undefined, color: undefined, width: undefined, dash: undefined, opacity: undefined });
  };
  const ranges = q.ranges ?? [];
  const look: RegionLook = q.region ?? {};
  const setLook = (p: Partial<RegionLook>) => set({ region: { ...look, ...p } });
  // the parameters of a peaks or formula fit (their starts, fixed, limits)
  const qm = trend ? null : quickModel(q);
  const params = qm && typeof qm !== 'string' ? qm.model.params : [];
  const spec = (name: string): FitParamSpec => q.params?.find((s) => s.name === name) ?? { name, value: NaN, fixed: false, min: NaN, max: NaN, shared: false };
  const setSpec = (name: string, p: Partial<FitParamSpec>) => set({ params: [...(q.params ?? []).filter((s) => s.name !== name), { ...spec(name), ...p }] });
  const first = results?.results[0];
  return (
    <div className="qf-item">
      <div className="row wrap">
        <input className="nodrag" type="checkbox" checked={q.show !== false} title="Fit and draw it (off: kept, not fitted)" onChange={(e) => set({ show: e.target.checked ? undefined : false })} />
        <Select<QuickFitKind> value={q.kind} options={KINDS} onChange={(kind) => set({ kind })} />
        {q.kind === 'poly' && (
          <Field label="Degree">
            <NumInput className="tiny" min={2} max={6} step={1} value={q.degree ?? 2} onChange={(v) => set({ degree: Math.min(6, Math.max(2, Math.floor(v) || 2)) })} />
          </Field>
        )}
        {q.kind === 'movavg' && (
          <Field label="Points">
            <NumInput className="tiny" min={2} step={1} value={q.window ?? 5} onChange={(v) => set({ window: Math.max(2, Math.floor(v) || 5) })} />
          </Field>
        )}
        {q.kind === 'linear' && <Check label="through the origin" value={!!q.origin} onChange={(origin) => set({ origin: origin || undefined })} />}
        <span className="grow" />
        <button className="nodrag ts-btn" title="Remove this fit" onClick={remove}>
          <X {...IC} />
        </button>
      </div>
      {trend && <div className="hint">{trendNote(q)}</div>}
      {q.kind === 'peaks' && (
        <div className="row wrap">
          <Select<QuickPeakShape> value={q.shape ?? 'gauss'} options={SHAPES} onChange={(shape) => set({ shape, params: undefined })} />
          {!q.place && (
            <Field label="Peaks" title="How many, found by themselves (the strongest deviations from the baseline)">
              <NumInput className="tiny" min={1} max={20} step={1} value={q.count ?? 1} onChange={(v) => set({ count: Math.min(20, Math.max(1, Math.round(v) || 1)) })} />
            </Field>
          )}
          <Select<Baseline> value={q.baseline ?? 'constant'} options={BASELINES} onChange={(baseline) => set({ baseline, params: undefined })} />
          <Check label="Placed by hand" title="The peaks where you click on the figure (their number, place and height): a click adds one, drag moves it, a double-click removes it" value={!!q.place} onChange={(place) => set({ place: place || undefined })} />
          {q.place && (
            <button className={`nodrag${placing ? ' on' : ''}`} title="Click on the figure where the peaks are (drag a point to move it, double-click to remove it); click again here when done" onClick={onPlace}>
              {placing ? '✓ Placing the peaks' : '⌖ Place the peaks'} ({q.points?.length ?? 0})
            </button>
          )}
          <Check label="Each peak" title="Every peak drawn on the baseline (dashed), and the baseline (dotted)" value={!!q.parts} onChange={(parts) => set({ parts: parts || undefined })} />
        </div>
      )}
      {q.kind === 'formula' && (
        <Field label="y =" title="A formula of x; every other name is a parameter (A*exp(-x/t) + y0, a + b*x^c …), its start set below">
          <TextInput value={q.formula ?? ''} placeholder="A*exp(-x/t) + y0" onChange={(formula) => set({ formula })} />
        </Field>
      )}
      {qm && typeof qm === 'string' && q.kind === 'formula' && q.formula?.trim() && <div className="err-text">{qm}</div>}
      <div className="row wrap fit-ranges">
        <span className="muted" title="Only the points inside the ranges are fitted (none: all of them)">Ranges</span>
        {ranges.length ? (
          ranges.map((r, i) => (
            <span key={i} className="chip">
              {ranges.length > 1 ? `${i + 1}) ` : ''}
              {rangeText(r)}
              <button className="nodrag ts-btn" title="Remove this range" onClick={() => set({ ranges: ranges.filter((_, k) => k !== i) })}>
                <X {...IC} />
              </button>
            </span>
          ))
        ) : (
          <span className="muted">all X</span>
        )}
        <button className={`nodrag${drawing ? ' on' : ''}`} title="The figure's “↔ Add a range” adds to this fit: drag across the figure; the edges of a range can be dragged at any time" onClick={onDraw}>
          {drawing ? '✓ Drawing ranges' : '↔ Draw ranges'}
        </button>
        <button className="nodrag" title="A range typed: from, to (then change it below)" onClick={() => set({ ranges: [...ranges, { lo: NaN, hi: NaN }] })}>
          + typed
        </button>
      </div>
      {ranges.map((r, i) => (
        <div key={i} className="row wrap">
          <span className="muted">{i + 1}) from</span>
          <NumInput className="short" value={r.lo} placeholder="start" onChange={(lo) => set({ ranges: ranges.map((g, k) => (k === i ? { ...g, lo } : g)) })} />
          <span className="muted">to</span>
          <NumInput className="short" value={r.hi} placeholder="end" onChange={(hi) => set({ ranges: ranges.map((g, k) => (k === i ? { ...g, hi } : g)) })} />
        </div>
      ))}
      {ranges.length > 0 && (
        <div className="row wrap">
          {ranges.length > 1 && <Check label="A fit per range" title="Every range fitted on its own (its own parameters and curve), else one fit of the points of all the ranges together" value={!!q.perRange} onChange={(perRange) => set({ perRange: perRange || undefined })} />}
          {q.kind !== 'movavg' && <Check label="Curve over all X" title="Its curve drawn over all the data (else over its ranges only)" value={!!q.drawAll} onChange={(drawAll) => set({ drawAll: drawAll || undefined })} />}
        </div>
      )}
      {ranges.length > 0 && (
        <div className="row wrap" title="The ranges as bands on the figure (exported too), or hidden: their fill, edges and hatching">
            <span className="muted">Ranges drawn</span>
            <Check label="shown" value={look.show !== false} onChange={(show) => setLook({ show: show ? undefined : false })} />
            {look.show !== false && (
              <>
                <input className="nodrag color" type="color" value={look.fill || '#e69f00'} title="Fill colour" onChange={(e) => setLook({ fill: e.target.value })} />
                <NumInput className="tiny" min={0} max={1} step={0.05} value={look.opacity ?? 0.13} title="Fill opacity (0 … 1)" onChange={(v) => setLook({ opacity: Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.13)) })} />
                <span className="muted">edge</span>
                <OptColor value={look.edge ?? ''} none="fill" title="Edge colour" onChange={(edge) => setLook({ edge: edge || undefined })} />
                <NumInput className="tiny" min={0} step={0.25} value={look.edgeWidth ?? 0} title="Edge width, pt (0: none)" onChange={(v) => setLook({ edgeWidth: Math.max(0, v || 0) })} />
                {(look.edgeWidth ?? 0) > 0 && <Select<Dash> value={look.edgeDash ?? 'solid'} options={DASHES} onChange={(edgeDash) => setLook({ edgeDash })} />}
                <Select<Hatch> value={look.hatch ?? 'none'} title="Hatching" options={HATCHES} onChange={(hatch) => setLook({ hatch: hatch === 'none' ? undefined : hatch })} />
                {look.hatch && <OptColor value={look.hatchColor ?? ''} none="fill" title="The colour of the hatching" onChange={(hatchColor) => setLook({ hatchColor: hatchColor || undefined })} />}
                {look.hatch && <HatchMore h={look.hatch} look={look.hatchLook} onChange={(hatchLook) => setLook({ hatchLook })} />}
              </>
            )}
        </div>
      )}
      <div className="row wrap" title="The fitted curve: drawn as a line, scatter, line + symbols or steps; its colour (empty: the curve's), width (pt), line, opacity; its 95 % band; ▸ style: all of a curve's style (symbols, fill, colour map, labels …)">
          <span className="muted">Line</span>
          <Select<PlotMode> value={st.mode} title="Drawn as" options={MODES} onChange={(mode) => setSt({ mode: mode === 'line' ? undefined : mode })} />
          <OptColor value={own.color ?? ''} none="curve's" onChange={(color) => setSt({ color: color || undefined })} />
          <NumInput className="tiny" min={0.1} step={0.25} value={own.lineWidth ?? NaN} placeholder="auto" title="Width, pt" onChange={(v) => setSt({ lineWidth: v > 0 ? v : undefined })} />
          <Select<Dash | ''> value={own.dash ?? ''} options={[['', trend ? 'auto (dashed)' : 'auto (solid)'], ...DASHES]} onChange={(dash) => setSt({ dash: dash || undefined })} />
          <NumInput className="tiny" min={0} max={1} step={0.1} value={own.lineOpacity ?? NaN} placeholder="1" title="Opacity (0 … 1)" onChange={(v) => setSt({ lineOpacity: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined })} />
          {q.kind !== 'movavg' && <Check label="95 % band" title="The 95 % confidence band of the curve (shaded in its colour)" value={!!q.band} onChange={(band) => set({ band: band || undefined })} />}
          {q.band && q.kind !== 'movavg' && <NumInput className="tiny" min={0} max={1} step={0.05} value={q.bandOpacity ?? 0.2} title="The band's opacity" onChange={(v) => set({ bandOpacity: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined })} />}
          <span className="grow" />
          <button className={`nodrag ts-btn${styling ? ' on' : ''}`} title="All the style of the fitted curve, as a curve's: line, symbols, fill, colour map, labels, axes" onClick={() => setStyling((o) => !o)}>
            {styling ? <ChevronDown {...IC} /> : <ChevronRight {...IC} />} style
          </button>
      </div>
      {styling && <CurveStyleEditor st={st} set={setSt} hasYErr={false} hasXErr={false} noErrors curves={curves} />}
      <div className="row wrap" title="Its legend entry: the equation (lines) or its name, with R²; its name; its name with the parameters; none. Name: empty, the curve's and the model's">
          <span className="muted">Legend</span>
          <Select<NonNullable<QuickFitSpec['legend']>>
            value={q.legend ?? (trend ? 'equation' : 'name')}
            options={[
              ['equation', trend && q.kind !== 'movavg' ? 'equation and R²' : 'name and R²'],
              ['name', 'name'],
              ['params', 'name and parameters'],
              ['none', 'none'],
            ]}
            onChange={(legend) => set({ legend })}
          />
          <TextInput className="short-text" value={q.label ?? ''} placeholder="name: auto" onChange={(label) => set({ label: label || undefined })} />
      </div>
      <div className="row wrap" title="The parameters ± errors and R² written in a box in a corner of the frame (several fits in one corner: one box)">
        <span className="muted">Results box</span>
        <Select<NonNullable<QuickFitSpec['box']>>
          value={q.box ?? 'none'}
          options={[
            ['none', 'none'],
            ['tl', 'top left'],
            ['tr', 'top right'],
            ['bl', 'bottom left'],
            ['br', 'bottom right'],
          ]}
          onChange={(box) => set({ box: box === 'none' ? undefined : box })}
        />
      </div>
      {params.length > 0 && (
        <div className="fit-params">
          <span className="muted">name</span>
          <span className="muted" title={q.place ? 'Empty: from the peaks placed' : 'Empty: guessed from the data'}>
            start
          </span>
          <span className="muted" title="Fixed at its start value">
            fix
          </span>
          <span className="muted">min</span>
          <span className="muted">max</span>
          <span className="muted">result ± error</span>
          {params.map((pm) => {
            const s = spec(pm.name);
            const pr = first?.params.find((x) => x.name === pm.name);
            return (
              <div key={pm.name} className="fit-param">
                <b>{pm.name}</b>
                <NumInput value={s.value} placeholder="auto" onChange={(v) => setSpec(pm.name, { value: v })} />
                <input className="nodrag" type="checkbox" checked={s.fixed} disabled={!Number.isFinite(s.value)} title={Number.isFinite(s.value) ? 'Fixed at its start' : 'Give it a start value to fix it'} onChange={(e) => setSpec(pm.name, { fixed: e.target.checked })} />
                <NumInput value={s.min} placeholder="—" onChange={(min) => setSpec(pm.name, { min })} />
                <NumInput value={s.max} placeholder="—" onChange={(max) => setSpec(pm.name, { max })} />
                <span className="mono ellipsis" title={pr ? paramText(pr) : ''}>
                  {pr ? paramText(pr).replace(/^[^=]*= /, '') : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {results?.results.map((r, i) => (
        <div key={i} className="stat-report">
          {(results.results.length > 1 || r.range) && <div className="muted">{r.range || 'all X'}</div>}
          {(trend || results.results.length > 1) &&
            r.params.map((p) => (
              <div key={p.name} className="mono">
                {paramText(p)}
              </div>
            ))}
          {r.derived.map((p) => (
            <div key={p.name} className="mono">
              {paramText(p)}
            </div>
          ))}
          <div className="muted">
            {Number.isFinite(r.r2) ? `R² = ${fmtNum(r.r2, 5)}, ` : ''}n = {r.n}
            {r.dof ? `, dof ${r.dof}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
