// The colours of the coloured things of a chart (its series, groups or categories): a colour each, for every one a
// gradient on demand (from its colour at the end to a second one at the base; not for points and lines), and with ⚙ a
// look of its own (its edge, opacity, hatching, median, error bars, symbols, line, band, fits): what is not set there
// stays as the node's.
import { PALETTE, type Curve, type Dash, type ElementLook, type Hatch, type LineLook, type SymbolFill, type SymbolShape } from '../figure/spec.ts';
import { OptColor } from './fields.tsx';
import { DASHES, HATCHES, SYMBOLS } from './figureOptions.ts';
import { Check, Field, NumInput, Select } from './ui.tsx';
import { maxOf } from '../engine/minmax.ts';
import { ArrowRight, RotateCcw, Settings2 } from 'lucide-react';
import { IC } from './iconProps.ts';

// a lighter one of a colour (#rrggbb), the gradient's second colour at first
const lighterHex = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return '#ffffff';
  const v = parseInt(m[1], 16);
  const mix = (x: number) => Math.round(x + (255 - x) * 0.65);
  return `#${[v >> 16, (v >> 8) & 255, v & 255].map((x) => mix(x).toString(16).padStart(2, '0')).join('')}`;
};

// what an element's own look can change: bars / boxes (opacity, edge, hatch, median, err), points, the line, the band,
// the fits of a histogram column
export type LookField = 'opacity' | 'edge' | 'hatch' | 'median' | 'err' | 'points' | 'line' | 'band' | 'fits' | 'style' | 'explode';

// a look without the settings left as the node's (empty, NaN); null when nothing is left
function clean<T extends object>(o: T): T | null {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v)) && v !== null && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));
  return Object.keys(out).length ? (out as T) : null;
}
const NODE = 'as the node';
const withNode = <T extends string>(list: [T, string][]): [string, string][] => [['', NODE], ...list];

function LineControls({ label, value, onChange, color = true }: { label: string; value: LineLook | null | undefined; onChange: (v: LineLook | null) => void; color?: boolean }) {
  const v = value ?? {};
  const set = (p: Partial<LineLook>) => onChange(clean({ ...v, ...p }));
  return (
    <span className="row wrap">
      <Check label={label} value={v.show !== false} onChange={(show) => set({ show: show ? undefined : false })} />
      {v.show !== false && (
        <>
          {color && <OptColor value={v.color ?? ''} none={NODE} onChange={(c) => set({ color: c })} />}
          <Field label="Width">
            <NumInput className="tiny" min={0.1} step={0.25} value={v.width ?? NaN} placeholder="node" onChange={(width) => set({ width: width > 0 ? width : undefined })} />
          </Field>
          <Select<string> value={v.dash ?? ''} options={withNode(DASHES)} onChange={(dash) => set({ dash: (dash || undefined) as Dash | undefined })} />
        </>
      )}
    </span>
  );
}

function LookEditor({ value, fields, fitNames, onChange }: { value: ElementLook | null | undefined; fields: LookField[]; fitNames: string[]; onChange: (v: ElementLook | null) => void }) {
  const v = value ?? {};
  const set = (p: Partial<ElementLook>) => onChange(clean({ ...v, ...p }));
  const has = (f: LookField) => fields.includes(f);
  return (
    <div className="col-form">
      {(has('opacity') || has('edge')) && (
        <>
          <span>Fill, edge</span>
          <span className="row wrap">
            {has('opacity') && (
              <Field label="Opacity">
                <NumInput className="tiny" min={0} max={1} step={0.1} value={v.opacity ?? NaN} placeholder="node" onChange={(o) => set({ opacity: Number.isFinite(o) ? Math.min(1, Math.max(0, o)) : undefined })} />
              </Field>
            )}
            {has('edge') && (
              <Field label="Edge" title="Colour, width (pt)">
                <OptColor value={v.edgeColor ?? ''} none={NODE} onChange={(edgeColor) => set({ edgeColor })} />
                <NumInput className="tiny" min={0} step={0.25} value={v.edgeWidth ?? NaN} placeholder="node" onChange={(w) => set({ edgeWidth: Number.isFinite(w) ? Math.max(0, w) : undefined })} />
              </Field>
            )}
          </span>
        </>
      )}
      {has('explode') && (
        <>
          <span>Moved out</span>
          <span className="row wrap">
            <Field label="By %" title="The slice moved out of the pie, % of its radius">
              <NumInput className="tiny" min={0} max={50} step={2} value={v.explode ?? NaN} placeholder="0" onChange={(e) => set({ explode: e > 0 ? Math.min(50, e) : undefined })} />
            </Field>
          </span>
        </>
      )}
      {has('hatch') && (
        <>
          <span>Hatching</span>
          <span className="row wrap">
            <Select<string> value={v.hatch ?? ''} options={withNode(HATCHES)} onChange={(h) => set({ hatch: (h || undefined) as Hatch | undefined })} />
            <OptColor value={v.hatchColor ?? ''} none={NODE} title="The colour of its lines" onChange={(hatchColor) => set({ hatchColor })} />
          </span>
        </>
      )}
      {(has('median') || has('err')) && (
        <>
          <span>{has('median') ? 'Median' : 'Error bars'}</span>
          <span className="row wrap">
            {has('median') && <OptColor value={v.median ?? ''} none={NODE} onChange={(median) => set({ median })} />}
            {has('err') && <OptColor value={v.err ?? ''} none={NODE} onChange={(err) => set({ err })} />}
          </span>
        </>
      )}
      {has('points') && (
        <>
          <span>Symbols</span>
          <span className="row wrap">
            <Check label="Shown" value={v.points !== false} onChange={(show) => set({ points: show ? undefined : false })} />
            <Select<string> value={v.symbol ?? ''} options={withNode(SYMBOLS)} onChange={(s) => set({ symbol: (s || undefined) as SymbolShape | undefined })} />
            <Field label="Size">
              <NumInput className="tiny" min={0.5} step={0.5} value={v.symbolSize ?? NaN} placeholder="node" onChange={(s) => set({ symbolSize: s > 0 ? s : undefined })} />
            </Field>
            <Select<string>
              value={v.symbolFill ?? ''}
              options={withNode<SymbolFill>([
                ['filled', 'filled'],
                ['open', 'open'],
                ['white', 'white'],
                ['dot', 'dot'],
              ])}
              onChange={(f) => set({ symbolFill: (f || undefined) as SymbolFill | undefined })}
            />
          </span>
        </>
      )}
      {has('line') && (
        <>
          <span>Line</span>
          <LineControls label="shown" value={v.line} onChange={(line) => set({ line: line ?? undefined })} />
        </>
      )}
      {has('style') && (
        <>
          <span>Line</span>
          <LineControls label="shown" color={false} value={v.line} onChange={(line) => set({ line: line ?? undefined })} />
        </>
      )}
      {has('band') && (
        <>
          <span>Band</span>
          <LineControls label="shown" value={v.band} onChange={(band) => set({ band: band ?? undefined })} />
        </>
      )}
      {has('fits') &&
        fitNames.map((name, k) => (
          <FitLine
            key={k}
            name={name}
            value={v.fits?.[k]}
            onChange={(f) => {
              const list = Array.from({ length: Math.max(k + 1, v.fits?.length ?? 0) }, (_, i) => (i === k ? f : (v.fits?.[i] ?? null)));
              set({ fits: list.some(Boolean) ? list : undefined });
            }}
          />
        ))}
    </div>
  );
}
function FitLine({ name, value, onChange }: { name: string; value: LineLook | null | undefined; onChange: (v: LineLook | null) => void }) {
  return (
    <>
      <span className="ellipsis" title={name}>
        {name}
      </span>
      <LineControls label="shown" value={value} onChange={onChange} />
    </>
  );
}

type Looks = (ElementLook | null)[];
// the swatches: a colour each (a gradient on demand), ⚙ opening its own look below (LookPanel, placed by the node as a
// row of its own). ids: the index of every swatch in colors / looks when they are not 0, 1, 2 … (some not shown)
export function ColorSwatches({
  swatches,
  ids,
  colors,
  colors2,
  onChange,
  gradient = true,
  looks,
  open,
  onOpen,
  defaults,
}: {
  swatches: Curve[];
  ids?: number[];
  defaults?: string[]; // their colours when not chosen (else the palette's)
  colors?: string[];
  colors2?: string[];
  onChange: (p: { colors?: string[]; colors2?: string[] }) => void;
  gradient?: boolean;
  looks?: Looks;
  open?: number | null;
  onOpen?: (j: number | null) => void; // ⚙: a look of its own for every one
}) {
  const at = (j: number) => ids?.[j] ?? j;
  const n = Math.max(swatches.length, maxOf((ids ?? []).map((i) => i + 1)), colors?.length ?? 0, colors2?.length ?? 0);
  const first = (i: number) => colors?.[i] || defaults?.[i] || PALETTE[(i + 1) % PALETTE.length];
  const second = (i: number) => colors2?.[i] || '';
  const setAt = (list: (i: number) => string, j: number, v: string) => Array.from({ length: n }, (_, i) => (i === j ? v : list(i)));
  return (
    <>
      {swatches.map((c, q) => {
        const j = at(q);
        return (
          <label key={c.key} className="radio" title={c.label}>
            <input className="nodrag color" type="color" value={first(j)} onChange={(e) => onChange({ colors: setAt(first, j, e.target.value) })} />
            {gradient && (
              <button className={`nodrag${second(j) ? ' on' : ''}`} title="A gradient: from this colour at the end to a second one at the base" onClick={(e) => (e.preventDefault(), onChange({ colors2: setAt(second, j, second(j) ? '' : lighterHex(first(j))) }))}>
                <ArrowRight {...IC} />
              </button>
            )}
            {gradient && second(j) && <input className="nodrag color" type="color" value={second(j)} title="At the base" onChange={(e) => onChange({ colors2: setAt(second, j, e.target.value) })} />}
            {onOpen && (
              <button className={`nodrag${looks?.[j] ? ' on' : ''}${open === j ? ' open' : ''}`} title="Its own look (what is not set stays as the node's)" onClick={(e) => (e.preventDefault(), onOpen(open === j ? null : j))}>
                <Settings2 {...IC} />
              </button>
            )}
            <span className="ellipsis">{c.label}</span>
          </label>
        );
      })}
    </>
  );
}

// the look of one of them (⚙ in ColorSwatches; open: its index in looks), as a row of its own across the node's form
export function LookPanel({ swatches, ids, looks, fields, fitNames = [], open, onChange }: { swatches: Curve[]; ids?: number[]; looks?: Looks; fields: LookField[]; fitNames?: string[]; open: number | null; onChange: (looks: Looks | undefined) => void }) {
  const q = open === null ? -1 : ids ? ids.indexOf(open) : open;
  if (open === null || q < 0 || q >= swatches.length) return null;
  const setLook = (L: ElementLook | null) => {
    const list = Array.from({ length: Math.max(swatches.length, open + 1, looks?.length ?? 0) }, (_, i) => (i === open ? L : (looks?.[i] ?? null)));
    onChange(list.some(Boolean) ? list : undefined);
  };
  return (
    <div className="look-panel">
      <div className="row">
        <b className="ellipsis">{swatches[q].label}</b>
        <span className="muted">its own look; what is not set stays as the node’s</span>
        {looks?.[open] && (
          <button className="nodrag" title="Everything back to the node's settings" onClick={() => setLook(null)}>
            <RotateCcw {...IC} /> as the node
          </button>
        )}
      </div>
      <LookEditor value={looks?.[open]} fields={fields} fitNames={fitNames} onChange={setLook} />
    </div>
  );
}
