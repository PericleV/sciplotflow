// The Axes tab of a 3D plot: X, Y and Z each their title (its text and distance), limits, reversed or not, values (a
// step or about how many, their format and text, shown or not) and ticks (out, in, none; their length). (The 2D axes
// of a Plot do not apply to a 3D box; the colour bar: the Annotate tab.)
import type { Axis3D, LabelFormat } from '../figure/spec.ts';
import type { Plot3DData } from '../types.ts';
import { AutoNumber, Choice, ListField, NumPair, Row, Section, Sections, SliderField, TextStyleRows, Toggle } from '../ui/props.tsx';
import { RichInput } from './fields.tsx';

const FORMATS: [LabelFormat, string][] = [
  ['auto', 'Auto'],
  ['decimal', 'Decimal'],
  ['sci', 'Scientific'],
  ['eng', 'Engineering'],
  ['si', 'SI prefixes'],
  ['percent', 'Percent'],
];
const AXES = ['x', 'y', 'z'] as const;
const TITLE_KEY = { x: 'titleX', y: 'titleY', z: 'titleZ' } as const;
const LIM_KEY = { x: 'xLim', y: 'yLim', z: 'zLim' } as const;

export function Axes3DEditor({ d, set, names }: { d: Plot3DData; set: (p: Partial<Plot3DData>) => void; names: [string, string, string] }) {
  const own = d.axis3 ?? {};
  const setAxis = (a: (typeof AXES)[number], p: Partial<Axis3D>) => {
    const next: Record<string, unknown> = { ...own[a], ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const all = { ...own, [a]: Object.keys(next).length ? (next as Axis3D) : undefined };
    if (!all[a]) delete all[a];
    set({ axis3: Object.keys(all).length ? all : undefined });
  };
  return (
    <>
      <div className="props-panel props-embed nodrag">
        <Sections panel="axes3d" open={['x']}>
          {AXES.map((a, i) => {
            const ax = own[a] ?? {};
            const lim = d[LIM_KEY[a]];
            const end = (k: 0 | 1, v: number) => {
              const nl: [number | null, number | null] = [lim?.[0] ?? null, lim?.[1] ?? null];
              nl[k] = Number.isFinite(v) ? v : null;
              set({ [LIM_KEY[a]]: nl[0] === null && nl[1] === null ? undefined : nl });
            };
            const changed = Object.keys(ax).length + (d[TITLE_KEY[a]] ? 1 : 0) + (lim ? 1 : 0);
            return (
              <Section key={a} value={a} title={`${a.toUpperCase()} axis`} aside={changed ? `${changed} changed` : 'auto'}>
                <Row label="Title" hint="Empty: the data's name">
                  <RichInput value={d[TITLE_KEY[a]] ?? ''} placeholder={names[i] || 'auto'} onChange={(v) => set({ [TITLE_KEY[a]]: v })} />
                </Row>
                <Row label="Limits" hint="From and to (empty: the data's); what is outside the box is cut">
                  <NumPair a={lim?.[0] ?? NaN} b={lim?.[1] ?? NaN} onA={(v) => end(0, v)} onB={(v) => end(1, v)} names={['from', 'to']} />
                </Row>
                <Row label="Reversed" hint="From the highest value to the lowest">
                  <Toggle value={!!ax.reverse} onChange={(reverse) => setAxis(a, { reverse: reverse || undefined })} />
                </Row>
                <Row label="Step" hint="The step between the values (empty: about as many as asked below)">
                  <AutoNumber value={ax.step ?? NaN} auto={undefined} onChange={(v) => setAxis(a, { step: Number.isFinite(v) && v > 0 ? v : undefined })} />
                </Row>
                <Row label="About" hint="About this many values (auto: as all the axes, in the node's Box)">
                  <SliderField value={ax.count ?? d.ticks ?? 5} auto={ax.count === undefined} onChange={(v) => setAxis(a, { count: v >= 2 ? Math.round(v) : undefined })} min={2} max={12} step={1} />
                </Row>
                <Row label="Values" hint="The numbers along the axis shown or not">
                  <Toggle value={ax.labels !== false} onChange={(on) => setAxis(a, { labels: on ? undefined : false })} />
                </Row>
                <Row label="Format">
                  <ListField<LabelFormat> value={ax.format ?? 'auto'} onChange={(format) => setAxis(a, { format: format === 'auto' ? undefined : format })} options={FORMATS} />
                </Row>
                <Row label="Decimals" hint="Empty: as many as the step needs">
                  <AutoNumber value={ax.decimals ?? NaN} auto={undefined} onChange={(v) => setAxis(a, { decimals: Number.isFinite(v) && v >= 0 ? Math.min(12, Math.round(v)) : undefined })} />
                </Row>
                <Row label="Ticks">
                  <Choice<'out' | 'in' | 'none'>
                    value={ax.ticks ?? 'out'}
                    onChange={(ticks) => setAxis(a, { ticks: ticks === 'out' ? undefined : ticks })}
                    options={[
                      ['out', 'Out'],
                      ['in', 'In'],
                      ['none', 'None'],
                    ]}
                  />
                </Row>
                {ax.ticks !== 'none' && (
                  <Row label="Tick length">
                    <SliderField value={ax.tickLen ?? 3} auto={ax.tickLen === undefined} onChange={(v) => setAxis(a, { tickLen: Number.isFinite(v) && v >= 0 ? v : undefined })} min={0} max={12} step={0.5} unit="pt" />
                  </Row>
                )}
                <div className="prop-note">The values' text</div>
                <TextStyleRows value={ax.labelText} onChange={(labelText) => setAxis(a, { labelText: Object.keys(labelText).length ? labelText : undefined })} />
                <div className="prop-note">The title's text</div>
                <TextStyleRows value={ax.titleText} onChange={(titleText) => setAxis(a, { titleText: Object.keys(titleText).length ? titleText : undefined })} />
                <Row label="Title distance" hint="How much farther from the values than by itself">
                  <SliderField value={ax.titleGap ?? 0} auto={ax.titleGap === undefined} onChange={(v) => setAxis(a, { titleGap: Number.isFinite(v) && v !== 0 ? v : undefined })} min={-10} max={30} step={0.5} unit="pt" />
                </Row>
              </Section>
            );
          })}
        </Sections>
      </div>
    </>
  );
}
