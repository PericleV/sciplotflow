// The baseline's choice and its options — the same list in Peak analyzer, Integrate and Peak width (src/engine/baselines.ts):
// the method with its value or the way its points are joined, then the options of the method. In a grid of fields
// (layout 'grid') or in the label / control rows of a form (layout 'form').
import type { ReactNode } from 'react';
import { BASE_OPTION_DEFAULTS, SIDED_METHODS, type BaseMethod, type BaseOptions } from '../engine/baselines.ts';
import { Check, Field, NumInput, Select } from './ui.tsx';

const BASE_LABELS: [BaseMethod, string][] = [
  ['zero', 'y = 0'],
  ['value', 'y ='],
  ['line', 'line between the ends'],
  ['lowest', 'lowest point'],
  ['rubber', 'rubber band'],
  ['points', 'points placed on the graph'],
  ['curve', 'another curve'],
  ['poly', 'iterative polynomial'],
  ['asls', 'asymmetric least squares'],
  ['airpls', 'airPLS'],
  ['arpls', 'arPLS'],
  ['snip', 'SNIP'],
  ['shirley', 'Shirley (XPS)'],
  ['tougaard', 'Tougaard (XPS)'],
];
const BASE_TITLE =
  'Under the data: y = 0; a value; the straight line between the ends (each end the mean of a few points); the lowest point; the rubber band (the lower hull of the data); points placed on the graph; another curve. Found from the data, the peaks left above it: the iterative polynomial (the points above it brought down, again and again), asymmetric least squares (a smooth curve, the points above it weighed little), airPLS (the same, its weights found by themselves), arPLS (the weights from the spread of the points below the curve: fewer parameters, sound on noisy data), SNIP (every point lowered to the mean of its neighbours, the window widened step by step). Photoelectron spectra: Shirley (the background follows the area of the peak), Tougaard (the electrons that lost energy)';

type Props = {
  method: string;
  onMethod: (m: string) => void;
  // methods of the node before the common ones (Peak analyzer: the baselines fitted with the peaks)
  before?: [string, string][];
  opts: BaseOptions | undefined;
  onOpts: (o: BaseOptions) => void;
  value?: number;
  onValue?: (v: number) => void;
  interp?: 'linear' | 'spline';
  onInterp?: (v: 'linear' | 'spline') => void;
  // the controls of 'curve' (a column, a port) and of 'points' (their number, Clear)
  curve?: ReactNode;
  points?: ReactNode;
  // under the peaks or over the dips when not chosen; the points averaged at each end when not given ('auto': by the number of points)
  autoUnder?: 'peaks' | 'dips';
  ends?: number | 'auto';
  layout: 'grid' | 'form';
  title?: string;
};

export function BaselineFields(p: Props) {
  const o = p.opts ?? {};
  const set = (q: Partial<BaseOptions>) => p.onOpts({ ...o, ...q });
  const m = p.method as BaseMethod;
  const row = (label: string, title: string, ctl: ReactNode, key: string) =>
    p.layout === 'grid' ? (
      <Field key={key} label={label} title={title}>
        {ctl}
      </Field>
    ) : (
      [
        <span key={`${key}-l`} title={title}>
          {label}
        </span>,
        <span key={`${key}-c`} className="row" title={title}>
          {ctl}
        </span>,
      ]
    );
  const rows: ReactNode[] = [];
  rows.push(
    row(
      'Baseline',
      p.title ?? BASE_TITLE,
      <>
        <Select<string> value={p.method} options={[...(p.before ?? []), ...BASE_LABELS]} onChange={p.onMethod} />
        {m === 'value' && p.onValue && <NumInput className="tiny" value={p.value ?? 0} onChange={(v) => p.onValue!(Number.isFinite(v) ? v : 0)} />}
        {m === 'points' && p.onInterp && (
          <Select
            value={p.interp ?? 'linear'}
            title="The baseline through its points: straight segments, or a smooth (natural cubic) spline"
            options={[
              ['linear', 'straight'],
              ['spline', 'spline'],
            ]}
            onChange={p.onInterp}
          />
        )}
      </>,
      'method',
    ),
  );
  if (m === 'points' && p.points) rows.push(row('Points', 'Placed on the graph (the Baseline points button): click to place, drag to move, double-click to remove', p.points, 'points'));
  if (m === 'curve' && p.curve) rows.push(row('Curve', 'The curve under the data: another column (with its own X when it has one) or a curve connected', p.curve, 'curve'));
  if (m === 'line' || m === 'shirley' || m === 'tougaard')
    rows.push(
      row(
        'End points',
        'The points averaged at each end of the range (its level there); empty: by the number of points (1 to 5)',
        <NumInput className="tiny" min={1} step={1} value={o.ends ?? NaN} placeholder={p.ends === 'auto' || p.ends == null ? 'auto' : String(p.ends)} onChange={(ends) => set({ ends: Number.isFinite(ends) && ends >= 1 ? Math.round(ends) : undefined })} />,
        'ends',
      ),
    );
  if (m === 'poly')
    rows.push(row('Degree', 'The degree of the polynomial (higher: it follows a more curved background, and the wider peaks too)', <NumInput className="tiny" min={0} max={12} step={1} value={o.order ?? BASE_OPTION_DEFAULTS.order} onChange={(order) => Number.isFinite(order) && set({ order: Math.max(0, Math.min(12, Math.round(order))) })} />, 'order'));
  if (m === 'asls' || m === 'airpls' || m === 'arpls')
    rows.push(
      row(
        'Smoothness',
        'log10 λ: how stiff the curve is (higher: smoother, it passes under wider peaks; typical 3 to 8 — more points need more)',
        <>
          <span className="muted">10^</span>
          <NumInput className="tiny" step={0.5} value={o.lambda ?? BASE_OPTION_DEFAULTS.lambda} onChange={(lambda) => Number.isFinite(lambda) && set({ lambda: Math.max(-2, Math.min(14, lambda)) })} />
        </>,
        'lambda',
      ),
    );
  if (m === 'asls')
    rows.push(row('Asymmetry', 'p: the weight of the points above the curve (those below weigh 1 − p); smaller: the curve keeps lower; typical 0.001 to 0.05', <NumInput className="tiny" step={0.005} min={0.0001} max={0.5} value={o.p ?? BASE_OPTION_DEFAULTS.p} onChange={(q) => Number.isFinite(q) && q > 0 && set({ p: Math.min(0.5, q) })} />, 'p'));
  if (m === 'snip')
    rows.push(
      row(
        'Window',
        'The widest clipping window, in points on each side: about the half width of the widest peak (empty: the points / 20)',
        <>
          <NumInput className="tiny" min={1} step={1} value={o.width ?? NaN} placeholder="auto" onChange={(width) => set({ width: Number.isFinite(width) && width >= 1 ? Math.round(width) : undefined })} />
          <Check label="LLS scale" title="Clipped on the log-log-square-root scale (the data lifted above 0): keeps the small peaks next to large ones; off: on the data as they are" value={o.lls !== false} onChange={(lls) => set({ lls: lls ? undefined : false })} />
        </>,
        'width',
      ),
    );
  if (m === 'tougaard')
    rows.push(
      row(
        'Losses',
        'The energy losses: toward a higher X (X a binding energy) or a lower X (a kinetic energy); C of the universal cross-section B·T / (C + T²)², in eV² with X in eV (1643 for most metals and oxides); B so that the baseline meets the far end',
        <>
          <Select<'up' | 'down'>
            value={o.losses ?? 'up'}
            options={[
              ['up', 'toward higher X'],
              ['down', 'toward lower X'],
            ]}
            onChange={(losses) => set({ losses: losses === 'up' ? undefined : losses })}
          />
          <span className="muted">C</span>
          <NumInput className="tiny" min={1} value={o.c ?? BASE_OPTION_DEFAULTS.c} onChange={(c) => Number.isFinite(c) && c > 0 && set({ c })} />
        </>,
        'losses',
      ),
    );
  if (SIDED_METHODS.includes(m))
    rows.push(
      row(
        'Under',
        'The baseline under the peaks (the data above it), or over the dips (the data below it: absorption, transmission)',
        <Select<'peaks' | 'dips'>
          value={o.under ?? p.autoUnder ?? 'peaks'}
          options={[
            ['peaks', 'the peaks'],
            ['dips', 'the dips (over them)'],
          ]}
          onChange={(under) => set({ under })}
        />,
        'under',
      ),
    );
  return <>{rows}</>;
}
