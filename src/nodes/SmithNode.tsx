// Smith chart: the data (two columns read as Z, Y, Γ or S11, the frequency, a curve per group, Z0), how the curves are
// drawn (a colour, or by frequency on a colour map with its bar; arrows of increasing frequency), markers at chosen
// frequencies and what they say; the figure with the same tabs as a Plot, its Axes tab the chart's own grid.
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { SmithInfo, SmithInput, SmithSpec } from '../engine/smith.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import { CMAP_OPTIONS } from '../figure/colors.ts';
import type { ColorMapName } from '../figure/spec.ts';
import type { AppNode, PlotPage, SmithData, SmithNode } from '../types.ts';
import { SYMBOLS } from './figureOptions.ts';
import { FigureTabs, InsetsPort } from './FigureTabs.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { FigureView } from './FigureView.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { Choice, ColorField, Row, Section, Sections, Toggle, WidthField } from '../ui/props.tsx';

// what the two columns are, for every way of reading them
const INPUTS: [SmithInput, string, string, string][] = [
  ['z', 'impedance Z (R, X)', 'R', 'X'],
  ['y', 'admittance Y (G, B)', 'G', 'B'],
  ['gamma', 'Γ (Re, Im)', 'Re Γ', 'Im Γ'],
  ['gammaPolar', 'Γ (|Γ|, phase °)', '|Γ|', 'phase °'],
  ['s11', 'S11 (dB, phase °)', 'S11 dB', 'phase °'],
];
const INFO: [SmithInfo, string, string][] = [
  ['f', 'f', 'The frequency'],
  ['z', 'z', 'The impedance: normalized (z), or in Ω when Z0 is given'],
  ['gamma', 'Γ', 'The reflection coefficient, its magnitude and angle'],
  ['vswr', 'VSWR', 'The standing wave ratio'],
  ['rl', 'RL', 'The return loss, dB'],
];

// The chart's own Axes tab: its grid (impedance, admittance or both, how dense, own circles), its colours and labels,
// the matching circle, circles of VSWR, arcs of Q, the scale outside the rim
function SmithAxesEditor({ d, set }: { d: SmithData; set: (p: Partial<SmithData>) => void }) {
  return (
    <div className="props-panel props-embed nodrag">
      <Sections panel="smith-axes" open={['grid']}>
        <Section value="grid" title="Grid" aside={d.grid === 'both' ? 'Z and Y' : d.grid === 'y' ? 'admittance' : 'impedance'}>
          <Row label="Grid" hint="Impedance (circles of constant r, arcs of constant x), admittance (their mirror), or both">
            <Choice<SmithSpec['grid']>
              value={d.grid}
              onChange={(grid) => set({ grid })}
              options={[
                ['z', 'Z'],
                ['y', 'Y'],
                ['both', 'Both'],
              ]}
            />
          </Row>
          <Row label="Density">
            <Choice<SmithSpec['density']>
              value={d.density}
              onChange={(density) => set({ density })}
              options={[
                ['coarse', 'Coarse'],
                ['medium', 'Medium'],
                ['fine', 'Fine'],
              ]}
            />
          </Row>
          <Row label="Own circles" hint="The values of r (and g) of the circles, comma-separated (empty: by the density)">
            <TextInput value={d.rList ?? ''} placeholder="by the density" onChange={(rList) => set({ rList: rList || undefined })} />
          </Row>
          <Row label="Own arcs" hint="The values of x (and b) of the arcs (empty: by the density)">
            <TextInput value={d.xList ?? ''} placeholder="by the density" onChange={(xList) => set({ xList: xList || undefined })} />
          </Row>
          <Row label="Colour">
            <ColorField value={d.gridColor} onChange={(gridColor) => set({ gridColor: gridColor || '#9aa3b2' })} />
          </Row>
          {d.grid !== 'z' && (
            <Row label="Admittance colour">
              <ColorField value={d.yColor} onChange={(yColor) => set({ yColor: yColor || '#d08770' })} />
            </Row>
          )}
          <Row label="Width">
            <WidthField value={d.gridWidth ?? 0.4} onChange={(w) => set({ gridWidth: Number.isFinite(w) && w > 0 ? w : undefined })} max={2} />
          </Row>
          <Row label="Labels" hint="r along the real axis, x around the rim">
            <Toggle value={d.gridLabels} onChange={(gridLabels) => set({ gridLabels })} />
          </Row>
          <Row label="Matching circle" hint="The circle r = 1 (and g = 1) drawn bolder">
            <Toggle value={!!d.match} onChange={(match) => set({ match: match || undefined })} />
          </Row>
        </Section>
        <Section value="more" title="VSWR, Q, scale" aside={[d.vswr && 'VSWR', d.qArcs && 'Q', d.scale && d.scale !== 'none' && 'scale'].filter(Boolean).join(', ') || 'none'}>
          <Row label="VSWR circles" hint="Circles of constant VSWR, comma-separated (e.g. 1.5, 2, 3)">
            <TextInput value={d.vswr ?? ''} placeholder="none" onChange={(vswr) => set({ vswr: vswr || undefined })} />
          </Row>
          <Row label="Q arcs" hint="Arcs of constant Q, comma-separated (e.g. 1, 2, 5)">
            <TextInput value={d.qArcs ?? ''} placeholder="none" onChange={(qArcs) => set({ qArcs: qArcs || undefined })} />
          </Row>
          <Row label="Scale outside" hint="The angle of Γ, or wavelengths toward the generator">
            <Choice<NonNullable<SmithSpec['scale']>>
              value={d.scale ?? 'none'}
              onChange={(scale) => set({ scale: scale === 'none' ? undefined : scale })}
              options={[
                ['none', 'None'],
                ['angle', 'Angle'],
                ['wavelengths', 'λ'],
              ]}
            />
          </Row>
        </Section>
      </Sections>
    </div>
  );
}

export function SmithNodeView({ id, data: d }: NodeProps<SmithNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<SmithData>) => updateNodeData(id, p);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const cols: [string, string][] = names.map((n) => [n, n]);
  const fig = r?.view.figure;
  const page: PlotPage = { ...PLOT_PAGE_DEFAULTS, ...d.page };
  const inp = INPUTS.find((q) => q[0] === d.input) ?? INPUTS[0];
  const info = d.markerInfo ?? ['f', 'z'];
  const impedance = d.input === 'z' || d.input === 'y';
  return (
    <div className="node node-plot1d node-smith">
      <InPort label="dataset" port="dataset" id="dataset" title="Two columns (R and X, G and B, Re and Im of Γ, |Γ| and its phase, S11 in dB and its phase) and the frequency" />
      <NodeOptions>
        <details open>
          <summary>Data</summary>
          <div className="col-form">
            <span>Data as</span>
            <Select<SmithInput> value={d.input} options={INPUTS.map(([v, l]): [SmithInput, string] => [v, l])} onChange={(input) => set({ input })} />
            <span>{inp[2]}</span>
            <Select value={d.a} options={[['', 'auto: the first Y'], ...cols]} onChange={(a) => set({ a })} />
            <span>{inp[3]}</span>
            <Select value={d.b} options={[['', 'auto: the next Y'], ...cols]} onChange={(b) => set({ b })} />
            <span>Frequency</span>
            <Select value={d.freq} title="Orders every curve, colours it if asked, places the markers" options={[['', 'auto: the X designated'], ['-', 'none'], ...cols]} onChange={(freq) => set({ freq })} />
            <span>Curves</span>
            <Select value={d.group ?? ''} title="A curve for every value of a column (empty: one curve)" options={[['', 'one curve'], ...cols]} onChange={(group) => set({ group: group || undefined })} />
            {impedance && (
              <>
                <span>Z0</span>
                <span className="row wrap">
                  <NumInput className="short" min={0} value={d.z0} title="The reference impedance, Ω" onChange={(z0) => set({ z0: z0 > 0 ? z0 : 50 })} />
                  <span className="muted">Ω</span>
                  <Check label="already normalized" title={d.input === 'z' ? 'R and X given as z = Z / Z0' : 'G and B given as y = Y · Z0'} value={!!d.norm} onChange={(norm) => set({ norm: norm || undefined })} />
                </span>
              </>
            )}
          </div>
        </details>
        <details open>
          <summary>Look</summary>
          <div className="col-form">
            <span>Draw</span>
            <span className="row wrap">
              <Select<SmithSpec['mode']>
                seg
                value={d.mode}
                options={[
                  ['line', 'line'],
                  ['linesymbol', 'both'],
                  ['scatter', 'symbols'],
                ]}
                onChange={(mode) => set({ mode })}
              />
              <Check label="Arrows" title="The direction of increasing frequency" value={!!d.arrows} onChange={(arrows) => set({ arrows: arrows || undefined })} />
            </span>
            <span>Colour</span>
            <span className="row wrap">
              <Select<NonNullable<SmithSpec['colorBy']>>
                seg
                value={d.colorBy ?? 'one'}
                options={[
                  ['one', 'one'],
                  ['freq', 'by frequency'],
                ]}
                onChange={(colorBy) => set({ colorBy })}
              />
              {(d.colorBy ?? 'one') === 'one' ? (
                <input className="nodrag color" type="color" value={d.color || '#0072B2'} onChange={(e) => set({ color: e.target.value })} />
              ) : (
                <>
                  <Select<ColorMapName> value={d.cmap} options={CMAP_OPTIONS} onChange={(cmap) => set({ cmap })} />
                  <Check label="Colour bar" value={!!d.colorbar} onChange={(colorbar) => set({ colorbar: colorbar || undefined })} />
                </>
              )}
            </span>
            <span>Line, symbols</span>
            <span className="row wrap">
              <Field label="Width">
                <NumInput className="tiny" min={0.25} step={0.25} value={d.lineWidth} onChange={(lineWidth) => set({ lineWidth: Math.max(0.25, lineWidth || 1.2) })} />
              </Field>
              {d.mode !== 'line' && (
                <>
                  <Select value={d.symbol} options={SYMBOLS} onChange={(symbol) => set({ symbol })} />
                  <Field label="Size">
                    <NumInput className="tiny" min={0.5} step={0.5} value={d.symbolSize} onChange={(symbolSize) => set({ symbolSize: Math.max(0.5, symbolSize || 3) })} />
                  </Field>
                </>
              )}
            </span>
          </div>
        </details>
        <details open={!!d.markers}>
          <summary>Markers</summary>
          <div className="col-form">
            <span>At</span>
            <TextInput value={d.markers ?? ''} placeholder="frequencies: 2.4, 2.45, 2.5" title="Frequencies, comma-separated: a marker at the nearest point of every curve" onChange={(markers) => set({ markers: markers || undefined })} />
            <span>Table</span>
            <Select<NonNullable<SmithSpec['markerTable']>>
              value={d.markerTable ?? 'tl'}
              title="Where the table of what the markers say is (the points show their numbers)"
              options={[
                ['tl', 'top left'],
                ['tr', 'top right'],
                ['bl', 'bottom left'],
                ['br', 'bottom right'],
                ['none', 'none'],
              ]}
              onChange={(markerTable) => set({ markerTable: markerTable === 'tl' ? undefined : markerTable })}
            />
            <span>They say</span>
            <span className="row wrap">
              {INFO.map(([k, label, title]) => (
                <Check key={k} label={label} title={title} value={info.includes(k)} onChange={(on) => set({ markerInfo: on ? [...info, k] : info.filter((x) => x !== k) })} />
              ))}
            </span>
          </div>
        </details>
      </NodeOptions>
      {fig && <FigureView fig={fig} width={600} page={page} setPage={(p) => set({ page: { ...page, ...p } })} layoutTitle="Move and resize the frame with the mouse (it is then placed by hand: Page ▸ Frame; Shift keeps its shape). Off: the legend and the annotations move." />}
      <NodeOptions>
        <FigureTabs id={id} data={d} legendCurves={r?.view.legendCurves ?? []} pos={fig?.axes[0]?.style.pos} port={false} axesEditor={<SmithAxesEditor d={d} set={set} />} />
        <Messages result={r} />
      </NodeOptions>
      <InsetsPort />
      <Messages result={r} />
      <OutPort label="figure" port="figure" id="figure" title="The whole figure: to a Merge, or as an inset of a Plot" />
    </div>
  );
}
