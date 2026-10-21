// The legend of a Plot: shown or not, its place on the frame, its entries (order, shown, own text), arrangement, text,
// frame and background.
import { ActionIcon, Select as MSelect, Tooltip } from '@mantine/core';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { plainText } from '../figure/draw.ts';
import { LEGEND_STYLE_DEFAULTS, type Anchor, type Curve, type LegendEntry } from '../figure/spec.ts';
import type { PlotLegend } from '../types.ts';
import { RichInput } from './fields.tsx';
import { AnchorField, Choice, ColorField, LayerRow, OpacityField, PictureGrid, Row, Section, Sections, SliderField, TextStyleRows, Toggle, WidthField } from '../ui/props.tsx';
import { DASH_PICS } from '../ui/dashPics.tsx';

// keys pressed in the panel are its own
const ownKeys = (e: React.KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
};

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
    <div className="legend-editor props-panel props-embed nodrag" onKeyDown={ownKeys}>
      <div className="legend-show">
        <Toggle value={d.show} onChange={(show) => set({ show })} label="Show the legend" />
        <span className="prop-note">drag it on the figure to move it</span>
      </div>
      {d.show && (
        <Sections panel="legend" open={['place', 'entries']}>
          <Section value="place" title="Place and arrangement" aside={d.auto ? 'automatic' : undefined}>
            <Row label="Place" hint="Automatic: inside the frame where it covers the least of the data (found again when the data change); outside: beside or under the plot, room kept for it; dragging it on the figure puts it where it is dropped">
              <MSelect
                value={d.auto ? 'auto' : 'here'}
                data={[
                  { value: 'here', label: 'Where it is put' },
                  { value: 'auto', label: 'Automatic: covering the least data' },
                  { value: 'right', label: 'Outside, at the right' },
                  { value: 'below', label: 'Outside, below' },
                  { value: 'above', label: 'Outside, above' },
                ]}
                onChange={(v) =>
                  v &&
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
            </Row>
            <Row label="Left" hint="% of the frame (beyond 100: outside it)">
              <SliderField value={d.x} onChange={(x) => set({ x })} min={0} max={100} step={0.5} unit="%" />
            </Row>
            <Row label="Top" hint="% of the frame">
              <SliderField value={d.y} onChange={(y) => set({ y })} min={0} max={100} step={0.5} unit="%" />
            </Row>
            <Row label="Anchor" hint="Which point of the legend box is at that place">
              <AnchorField<Anchor> value={d.anchor} onChange={(anchor) => set({ anchor })} />
            </Row>
            <Row label="Arrange">
              <Choice
                value={d.arrange}
                onChange={(arrange) => set({ arrange })}
                options={[
                  ['column', 'Column'],
                  ['row', 'Row'],
                  ['grid', 'Columns'],
                ]}
              />
            </Row>
            {d.arrange === 'grid' && (
              <>
                <Row label="Columns">
                  <SliderField value={d.columns} onChange={(v) => set({ columns: Math.max(1, Math.floor(v) || 1) })} min={1} max={8} step={1} />
                </Row>
                <Row label="Fill" hint="The order goes down the columns first, or across the rows">
                  <Choice
                    value={d.fill}
                    onChange={(fill) => set({ fill })}
                    options={[
                      ['down', 'Down columns'],
                      ['across', 'Across rows'],
                    ]}
                  />
                </Row>
              </>
            )}
            {curves.some((c) => c.group || c.groupSpan) && (
              <Row label="Coloured curves" hint="The curves coloured by a colour map (Colours ▸ colour map): an entry for each, or one entry with the colour scale and the range of the values (auto: one entry when more than 8)">
                <Choice
                  value={d.groups ?? 'auto'}
                  onChange={(groups) => set({ groups })}
                  options={[
                    ['auto', 'Auto'],
                    ['each', 'An entry each'],
                    ['one', 'One entry'],
                  ]}
                />
              </Row>
            )}
            <Row label="Reverse order">
              <Toggle value={d.reverse} onChange={(reverse) => set({ reverse })} />
            </Row>
            <LayerRow z={d.z} onChange={(z) => set({ z })} />
          </Section>
          <Section value="entries" title="Entries" aside={`${entries.filter((e) => e.show).length} of ${entries.length}`}>
            {entries.length === 0 && <div className="prop-note">No curve yet.</div>}
            {entries.map((e, k) => {
              const c = curves.find((x) => x.key === e.key)!;
              return (
                <div key={e.key} className="legend-entry-row">
                  <Tooltip label="Up">
                    <ActionIcon size="sm" disabled={k === 0} onClick={() => setEntries(move(entries, k, k - 1))} aria-label="Up">
                      <ArrowUp size={13} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Down">
                    <ActionIcon size="sm" disabled={k === entries.length - 1} onClick={() => setEntries(move(entries, k, k + 1))} aria-label="Down">
                      <ArrowDown size={13} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={e.show ? 'Shown in the legend' : 'Not in the legend'}>
                    <span>
                      <Toggle value={e.show} onChange={(show) => setEntries(entries.map((x, j) => (j === k ? { ...x, show } : x)))} />
                    </span>
                  </Tooltip>
                  <span className="swatch" style={{ background: c.style.color }} />
                  <span className="grow">
                    <RichInput value={e.label} placeholder={plainText(c.label)} title="Its text in the legend (empty: the curve's legend text)" onChange={(label) => setEntries(entries.map((x, j) => (j === k ? { ...x, label } : x)))} />
                  </span>
                </div>
              );
            })}
          </Section>
          <Section value="text" title="Title and text" aside={d.title ? undefined : 'no title'}>
            <Row label="Title">
              <RichInput value={d.title} placeholder="none" onChange={(title) => set({ title })} />
            </Row>
            <TextStyleRows value={d.text} onChange={(text) => set({ text })} />
          </Section>
          <Section value="frame" title="Frame and background" aside={d.frame === 'none' ? 'no frame' : d.frame}>
            <Row label="Frame">
              <Choice
                value={d.frame}
                onChange={(frame) => set({ frame })}
                options={[
                  ['none', 'None'],
                  ['line', 'Line'],
                  ['shadow', 'Shadow'],
                  ['round', 'Rounded'],
                ]}
              />
            </Row>
            {d.frame !== 'none' && (
              <div className="prop-sub">
                <Row label="Colour">
                  <ColorField value={d.frameColor} onChange={(c) => set({ frameColor: c || '#000000' })} />
                </Row>
                <Row label="Width">
                  <WidthField value={d.frameWidth} onChange={(v) => set({ frameWidth: num(v) })} max={3} />
                </Row>
                <Row label="Style">
                  <PictureGrid value={d.frameDash ?? 'solid'} onChange={(frameDash) => set({ frameDash })} options={DASH_PICS} cols={4} />
                </Row>
                <Row label="Corners" hint="Rounded corners">
                  <SliderField value={d.radius ?? (d.frame === 'round' ? 4 : 0)} onChange={(v) => set({ radius: num(v) })} min={0} max={15} step={0.5} unit="pt" />
                </Row>
                <Row label="Opacity">
                  <OpacityField value={d.frameOpacity ?? 1} onChange={(v) => set({ frameOpacity: Math.min(1, num(v)) })} />
                </Row>
              </div>
            )}
            <Row label="Background">
              <ColorField value={d.background} none onChange={(background) => set({ background })} />
            </Row>
            {d.background && (
              <Row label="Its opacity">
                <OpacityField value={d.bgOpacity} onChange={(v) => set({ bgOpacity: Math.min(1, num(v)) })} />
              </Row>
            )}
            <Row label="Sample line" hint="The length of the line drawn before each text">
              <SliderField value={d.lineLen} onChange={(v) => set({ lineLen: num(v) })} min={0} max={40} step={1} unit="pt" />
            </Row>
            <Row label="Padding" hint="The room inside the frame">
              <SliderField value={d.padding} onChange={(v) => set({ padding: num(v) })} min={0} max={15} step={0.5} unit="pt" />
            </Row>
            <Row label="Line spacing" hint="× the font size">
              <SliderField value={d.spacing} onChange={(v) => set({ spacing: num(v, 0.8) })} min={0.8} max={3} step={0.05} unit="×" />
            </Row>
          </Section>
        </Sections>
      )}
    </div>
  );
}
