// The legend of a Plot: shown or not, its place on the frame, its entries (order, shown, own text), arrangement, text,
// frame and background.
import { plainText } from '../figure/draw.ts';
import { LEGEND_STYLE_DEFAULTS, type Curve, type LegendEntry } from '../figure/spec.ts';
import type { PlotLegend } from '../types.ts';
import { ANCHORS, LAYERS } from './figureOptions.ts';
import { OptColor, RichInput, TextStyleControls } from './fields.tsx';
import { Check, Field, NumInput, Select, Slider } from './ui.tsx';
import { BorderControls } from './BorderControls.tsx';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { IC } from './iconProps.ts';

export function LayerField({ z, onChange }: { z: number; onChange: (z: number) => void }) {
  return (
    <Field label="Layer" title="Which is on top: below 0 under the data, the data at 0, higher numbers over lower ones (the legend and every annotation, each on its own)">
      <span className="row">
        <Select value={LAYERS.some(([v]) => v === z) ? z : 99} options={[...LAYERS, [99, `custom (${z})`]]} onChange={(v) => v !== 99 && onChange(v)} />
        <NumInput className="tiny" step={1} value={z} onChange={(v) => Number.isFinite(v) && v !== 0 && onChange(v)} />
      </span>
    </Field>
  );
}

export function LegendEditor({ value, onChange, curves }: { value: PlotLegend | undefined; onChange: (p: Partial<PlotLegend>) => void; curves: Curve[] }) {
  const d = { ...LEGEND_STYLE_DEFAULTS, ...value, show: !!value?.show };
  const set = onChange;
  const num = (v: number, min = 0) => Math.max(min, Number.isFinite(v) ? v : min);
  // every curve, in the order chosen (new ones at the end), shown or not, with its own text
  const entries: LegendEntry[] = [
    ...d.entries.filter((e) => curves.some((c) => c.key === e.key)),
    ...curves.filter((c) => !d.entries.some((e) => e.key === c.key)).map((c) => ({ key: c.key, show: true, label: '' })),
  ];
  const setEntries = (list: LegendEntry[]) => set({ entries: list });
  const move = (list: LegendEntry[], from: number, to: number) => {
    const next = [...list];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    return next;
  };
  return (
    <div className="legend-editor">
      <div className="row wrap">
        <Check label="Show the legend" value={d.show} onChange={(show) => set({ show })} />
        <span className="muted">drag it on the figure to move it</span>
      </div>
      {d.show && (
        <>
          <details open>
            <summary>Place and arrangement</summary>
            <Field label="Place" title="Automatic: inside the frame where it covers the least of the data (found again when the data change); outside: beside or under the plot, room kept for it; dragging it on the figure puts it where it is dropped">
              <Select<string>
                value={d.auto ? 'auto' : 'here'}
                options={[
                  ['here', 'where it is put'],
                  ['auto', 'automatic: covering the least data'],
                  ['right', 'outside, at the right'],
                  ['below', 'outside, below'],
                  ['above', 'outside, above'],
                ]}
                onChange={(v) =>
                  set(
                    v === 'auto'
                      ? { auto: true }
                      : v === 'right'
                        ? { auto: false, x: 103, y: 0, anchor: 'tl' }
                        : v === 'below'
                          ? { auto: false, x: 50, y: 103, anchor: 'tc', arrange: 'row' }
                          : v === 'above'
                            ? { auto: false, x: 50, y: -3, anchor: 'bc', arrange: 'row' }
                            : { auto: false },
                  )
                }
              />
            </Field>
            <Slider label="Left" value={d.x} min={0} max={100} step={0.5} unit="%" title="% of the frame (beyond 100: outside it)" onChange={(x) => set({ x })} />
            <Slider label="Top" value={d.y} min={0} max={100} step={0.5} unit="%" title="% of the frame" onChange={(y) => set({ y })} />
            <div className="grid2">
              <Field label="Anchor" title="Which point of the legend box is at (left, top)">
                <Select value={d.anchor} options={ANCHORS} onChange={(anchor) => set({ anchor })} />
              </Field>
              <Field label="Arrange">
                <Select
                  value={d.arrange}
                  options={[
                    ['column', 'one column'],
                    ['row', 'all on one row'],
                    ['grid', 'in columns'],
                  ]}
                  onChange={(arrange) => set({ arrange })}
                />
              </Field>
              {d.arrange === 'grid' && (
                <>
                  <Field label="Columns">
                    <NumInput className="tiny" min={1} step={1} value={d.columns} onChange={(v) => set({ columns: Math.max(1, Math.floor(v) || 1) })} />
                  </Field>
                  <Field label="Fill" title="The order goes down the columns first, or across the rows">
                    <Select
                      value={d.fill}
                      options={[
                        ['down', 'down columns'],
                        ['across', 'across rows'],
                      ]}
                      onChange={(fill) => set({ fill })}
                    />
                  </Field>
                </>
              )}
              {curves.some((c) => c.group || c.groupSpan) && (
                <Field label="Coloured curves" title="The curves coloured by a colour map (Colours ▸ colour map): an entry for each, or one entry with the colour scale and the range of the values (auto: one entry when more than 8)">
                  <Select
                    value={d.groups ?? 'auto'}
                    options={[
                      ['auto', 'auto'],
                      ['each', 'an entry each'],
                      ['one', 'one entry'],
                    ]}
                    onChange={(groups) => set({ groups })}
                  />
                </Field>
              )}
            </div>
            <div className="row wrap">
              <Check label="Reverse order" value={d.reverse} onChange={(reverse) => set({ reverse })} />
            </div>
            <LayerField z={d.z} onChange={(z) => set({ z })} />
          </details>
          <details open>
            <summary>Entries: order, shown, text</summary>
            {entries.length === 0 && <div className="hint">No curve yet.</div>}
            {entries.map((e, k) => {
              const c = curves.find((x) => x.key === e.key)!;
              return (
                <div key={e.key} className="legend-entry">
                  <button className="nodrag ts-btn" disabled={k === 0} title="Up" onClick={() => setEntries(move(entries, k, k - 1))}>
                    <ArrowUp {...IC} />
                  </button>
                  <button className="nodrag ts-btn" disabled={k === entries.length - 1} title="Down" onClick={() => setEntries(move(entries, k, k + 1))}>
                    <ArrowDown {...IC} />
                  </button>
                  <input className="nodrag" type="checkbox" checked={e.show} title="Shown in the legend" onChange={(ev) => setEntries(entries.map((x, j) => (j === k ? { ...x, show: ev.target.checked } : x)))} />
                  <span className="swatch" style={{ background: c.style.color }} />
                  <span className="grow">
                    <RichInput value={e.label} placeholder={plainText(c.label)} title="Its text in the legend (empty: the curve's legend text)" onChange={(label) => setEntries(entries.map((x, j) => (j === k ? { ...x, label } : x)))} />
                  </span>
                </div>
              );
            })}
          </details>
          <details>
            <summary>Title and text</summary>
            <Field label="Title">
              <RichInput value={d.title} placeholder="none" onChange={(title) => set({ title })} />
            </Field>
            <TextStyleControls label="Text" value={d.text} onChange={(text) => set({ text })} />
          </details>
          <details>
            <summary>Frame, background, spacing</summary>
            <div className="grid2">
              <Field label="Frame">
                <Select
                  value={d.frame}
                  options={[
                    ['none', 'none'],
                    ['line', 'line'],
                    ['shadow', 'shadow'],
                    ['round', 'rounded'],
                  ]}
                  onChange={(frame) => set({ frame })}
                />
              </Field>
              {d.frame !== 'none' && (
                <Field label="Line" title="Of the frame: colour, width (pt), line, rounded corners (pt), opacity">
                  <BorderControls
                    value={{ color: d.frameColor, width: d.frameWidth, dash: d.frameDash ?? 'solid', radius: d.radius ?? (d.frame === 'round' ? 4 : 0), opacity: d.frameOpacity ?? 1 }}
                    onChange={(p) => set({ ...(p.color !== undefined ? { frameColor: p.color } : {}), ...(p.width !== undefined ? { frameWidth: p.width } : {}), ...(p.dash ? { frameDash: p.dash } : {}), ...(p.radius !== undefined ? { radius: p.radius } : {}), ...(p.opacity !== undefined ? { frameOpacity: p.opacity } : {}) })}
                  />
                </Field>
              )}
              <Field label="Background">
                <span className="row">
                  <OptColor value={d.background} onChange={(background) => set({ background })} />
                  {d.background && <NumInput className="tiny" min={0} max={1} step={0.05} value={d.bgOpacity} onChange={(v) => set({ bgOpacity: Math.min(1, num(v)) })} />}
                </span>
              </Field>
              <Field label="Sample line" title="pt">
                <NumInput className="tiny" min={0} step={1} value={d.lineLen} onChange={(v) => set({ lineLen: num(v) })} />
              </Field>
              <Field label="Padding" title="pt">
                <NumInput className="tiny" min={0} step={0.5} value={d.padding} onChange={(v) => set({ padding: num(v) })} />
              </Field>
              <Field label="Line spacing" title="× the font size">
                <NumInput className="tiny" min={0.8} step={0.1} value={d.spacing} onChange={(v) => set({ spacing: num(v, 0.8) })} />
              </Field>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
