// The style editor of one curve of a Plot (in tabs), and the palette picker.
import { useState, type ReactNode } from 'react';
import { CMAP_OPTIONS } from '../figure/colors.ts';
import { PALETTE, type ArrowHead, type CurveStyle, type Hatch } from '../figure/spec.ts';
import { DASHES, HATCHES, HEADS, SYMBOLS } from './figureOptions.ts';
import { OptColor, Tabs, TextStyleControls } from './fields.tsx';
import { HatchMore } from './HatchMore.tsx';
import { Check, Field, NumInput, Select, TextInput } from './ui.tsx';

export function ColorPick({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <span className="color-pick">
      {PALETTE.map((c) => (
        <button key={c} className={`nodrag swatch-btn${c.toLowerCase() === value.toLowerCase() ? ' on' : ''}`} style={{ background: c }} title={c} onClick={() => onChange(c)} />
      ))}
      <input className="nodrag color" type="color" value={value} title="Any colour" onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

// The style editor of one curve, in tabs.
// curves: the other curves of the Plot (number, name), for a fill down to one of them; placing / onPlace: the fill points
// placed with the mouse on the figure; noErrors: no Errors tab (a quick fit's curve: its band set with the fit)
export function CurveStyleEditor({ st, set, hasYErr, hasXErr, curves = [], placing = false, onPlace, noErrors = false }: { st: CurveStyle; set: (p: Partial<CurveStyle>) => void; hasYErr: boolean; hasXErr: boolean; curves?: [number, string][]; placing?: boolean; onPlace?: () => void; noErrors?: boolean }) {
  const [tab, setTab] = useState<'line' | 'symbol' | 'errors' | 'colour' | 'more'>('line');
  const line = st.mode !== 'scatter';
  const symbols = st.mode === 'scatter' || st.mode === 'linesymbol';
  const num = (v: number, min = 0) => Math.max(min, Number.isFinite(v) ? v : min);
  // the sources of a size or a width from the data
  const BY: [NonNullable<CurveStyle['widthBy']>, string][] = [
    ['none', 'no'],
    ['index', 'position (row)'],
    ['x', 'x value'],
    ['y', 'y value'],
    ['column', 'a column (port size)'],
  ];
  let body: ReactNode;
  if (tab === 'line')
    body = (
      <>
        <div className="grid2">
          <Field label="Style">
            <Select
              value={st.mode}
              options={[
                ['line', 'line'],
                ['scatter', 'scatter'],
                ['linesymbol', 'line + symbols'],
                ['step', 'steps'],
              ]}
              onChange={(mode) => set({ mode })}
            />
          </Field>
          {st.mode === 'step' ? (
            <Field label="Steps">
              <Select
                value={st.stepKind}
                options={[
                  ['hv', 'across, then up'],
                  ['vh', 'up, then across'],
                  ['mid', 'centred'],
                ]}
                onChange={(stepKind) => set({ stepKind })}
              />
            </Field>
          ) : (
            line && (
              <Field label="Connect" title="Straight lines between the points, or a smooth curve through them (monotone where x is ordered: no overshoot)">
                <Select
                  value={st.connect}
                  options={[
                    ['straight', 'straight'],
                    ['spline', 'smooth spline'],
                  ]}
                  onChange={(connect) => set({ connect })}
                />
              </Field>
            )
          )}
        </div>
        <Field label="Colour">
          <ColorPick value={st.color} onChange={(color) => set({ color })} />
        </Field>
        {line && (
          <div className="grid2">
            <Field label="Width" title="pt">
              <NumInput className="tiny" min={0} step={0.25} value={st.lineWidth} onChange={(v) => set({ lineWidth: num(v) })} />
            </Field>
            <Field label="Dash">
              <Select value={st.dash} options={DASHES} onChange={(dash) => set({ dash })} />
            </Field>
            <Field label="Opacity" title="0 … 1">
              <NumInput className="tiny" min={0} max={1} step={0.05} value={st.lineOpacity} onChange={(v) => set({ lineOpacity: Math.min(1, num(v)) })} />
            </Field>
            <Field label="Ends, corners" title="The line's ends (butt, round, square) and how its pieces meet (sharp, round, cut)">
              <span className="row">
                <Select<NonNullable<CurveStyle['lineCap']>>
                  value={st.lineCap ?? (st.dash === 'dot' ? 'round' : 'butt')}
                  options={[
                    ['butt', 'flat'],
                    ['round', 'round'],
                    ['square', 'square'],
                  ]}
                  onChange={(lineCap) => set({ lineCap })}
                />
                <Select<NonNullable<CurveStyle['lineJoin']>>
                  value={st.lineJoin ?? 'round'}
                  options={[
                    ['round', 'round'],
                    ['miter', 'sharp'],
                    ['bevel', 'cut'],
                  ]}
                  onChange={(lineJoin) => set({ lineJoin })}
                />
              </span>
            </Field>
            <Field label="Halo" title="A band around the line (pt each side; 0: none) in its colour: the line reads over other curves">
              <span className="row">
                <NumInput className="tiny" min={0} step={0.5} value={st.halo ?? 0} onChange={(v) => set({ halo: num(v) || undefined })} />
                {(st.halo ?? 0) > 0 && <input className="nodrag color" type="color" value={st.haloColor || '#ffffff'} onChange={(e) => set({ haloColor: e.target.value })} />}
              </span>
            </Field>
            <Field label="Heads" title="Arrow heads at the curve's start and end, and their size (pt; empty: from the line width)">
              <span className="row">
                <Select<ArrowHead> value={st.arrowStart ?? 'none'} title="At the start" options={HEADS} onChange={(arrowStart) => set({ arrowStart })} />
                <Select<ArrowHead> value={st.arrowEnd ?? 'none'} title="At the end" options={HEADS} onChange={(arrowEnd) => set({ arrowEnd })} />
                {((st.arrowStart ?? 'none') !== 'none' || (st.arrowEnd ?? 'none') !== 'none') && <NumInput className="tiny" min={1} step={0.5} value={st.arrowSize ?? NaN} placeholder="auto" onChange={(v) => set({ arrowSize: v > 0 ? v : undefined })} />}
              </span>
            </Field>
            <Field label="Drop lines" title="Lines from every point to the bottom (vertical) or left (horizontal) axis">
              <Select
                value={st.drop}
                options={[
                  ['none', 'none'],
                  ['vertical', 'vertical'],
                  ['horizontal', 'horizontal'],
                ]}
                onChange={(drop) => set({ drop })}
              />
            </Field>
            <Field label="Width from data" title="The line's width follows a value (the points' row, x, y, or a column on the port “size”), from the thinnest to the widest, pt">
              <span className="row">
                <Select value={st.widthBy ?? 'none'} options={BY} onChange={(widthBy) => set({ widthBy })} />
                {(st.widthBy ?? 'none') !== 'none' && (
                  <>
                    <NumInput className="tiny" min={0} step={0.25} value={st.widthMin ?? 0.5} onChange={(v) => set({ widthMin: num(v) })} />–
                    <NumInput className="tiny" min={0} step={0.25} value={st.widthMax ?? 3} onChange={(v) => set({ widthMax: num(v) })} />
                  </>
                )}
              </span>
            </Field>
            {st.mode === 'linesymbol' && (
              <Field label="Line and symbols" title="The line drawn under the symbols or over them">
                <Select
                  value={st.lineOver ? 'over' : 'under'}
                  options={[
                    ['under', 'line behind'],
                    ['over', 'line in front'],
                  ]}
                  onChange={(v) => set({ lineOver: v === 'over' || undefined })}
                />
              </Field>
            )}
            {st.mode === 'linesymbol' && (
              <Field label="Gap at symbols" title="The line stops this far (pt) from the edge of every symbol; 0: it reaches them">
                <NumInput className="tiny" min={0} step={0.25} value={st.symbolGap ?? 0} onChange={(v) => set({ symbolGap: num(v) || undefined })} />
              </Field>
            )}
          </div>
        )}
        <div className="grid2">
          <Field label="Fill under" title="The area between the curve and y = 0, the bottom of the frame, a line y = f(x), another curve of this Plot (e.g. its baseline), or straight lines through points">
            <Select
              value={st.fill}
              options={[
                ['none', 'none'],
                ['zero', 'down to y = 0'],
                ['bottom', 'down to the frame'],
                ['formula', 'to y = f(x)'],
                ['curve', 'to another curve'],
                ['points', 'to points'],
              ]}
              onChange={(fill) => set({ fill })}
            />
          </Field>
          {st.fill === 'formula' && (
            <Field label="y =" title="A number (y = 0.2) or a formula of x (0.1 + 0.002*x)">
              <TextInput className="mono" value={st.fillFormula} placeholder="0.1 + 0.002*x" onChange={(fillFormula) => set({ fillFormula })} />
            </Field>
          )}
          {st.fill === 'curve' && (
            <Field label="To curve" title="Another curve of this Plot, e.g. the baseline (between its points straight lines); it may be hidden">
              <Select value={st.fillCurve} options={curves.length ? curves : [[st.fillCurve, String(st.fillCurve)]]} onChange={(fillCurve) => set({ fillCurve })} />
            </Field>
          )}
          {st.fill === 'points' && (
            <Field label="Points" title="Placed on the figure with the mouse (click: a point, drag: move, double-click: remove), or typed: x, y; x, y … — joined by straight lines">
              <span className="row">
                <button className={`nodrag${placing ? ' on' : ''}`} title="Click on the figure to place the points (again: stop)" onClick={onPlace}>
                  {placing ? '✓ Placing' : 'Place on the graph'}
                </button>
                <TextInput className="mono" value={st.fillPoints} placeholder="x, y; x, y …" onChange={(fillPoints) => set({ fillPoints })} />
              </span>
            </Field>
          )}
          <Field label="Masked points" title="Points masked in a Data manipulation node: drawn grey, or not drawn (the line goes on past them)">
            <Select
              value={st.masked}
              options={[
                ['faded', 'grey'],
                ['hidden', 'hidden'],
              ]}
              onChange={(masked) => set({ masked })}
            />
          </Field>
          {st.fill !== 'none' && (
            <Field label="Fill colour, opacity">
              <span className="row">
                <OptColor value={st.fillColor} none="curve" onChange={(fillColor) => set({ fillColor })} />
                <NumInput className="tiny" min={0} max={1} step={0.05} value={st.fillOpacity} onChange={(v) => set({ fillOpacity: Math.min(1, num(v)) })} />
              </span>
            </Field>
          )}
          {st.fill !== 'none' && (
            <Field label="Fill hatching" title="A hatching over the fill: its kind and colour (⋯ more)">
              <span className="row wrap">
                <Select<Hatch> value={st.fillHatch ?? 'none'} options={HATCHES} onChange={(fillHatch) => set({ fillHatch })} />
                {st.fillHatch && st.fillHatch !== 'none' && <OptColor value={st.fillHatchColor ?? ''} none="curve" onChange={(fillHatchColor) => set({ fillHatchColor })} />}
                {st.fillHatch && <HatchMore h={st.fillHatch} look={st.fillHatchLook} onChange={(fillHatchLook) => set({ fillHatchLook })} />}
              </span>
            </Field>
          )}
        </div>
      </>
    );
  else if (tab === 'symbol')
    body = symbols ? (
      <>
        <div className="grid2">
          <Field label="Symbol">
            <Select value={st.symbol} options={SYMBOLS} onChange={(symbol) => set({ symbol })} />
          </Field>
          <Field label="Size" title="pt">
            <NumInput className="tiny" min={0} step={0.5} value={st.symbolSize} onChange={(v) => set({ symbolSize: num(v) })} />
          </Field>
          <Field label="Fill">
            <Select
              value={st.symbolFill}
              options={[
                ['filled', 'filled'],
                ['open', 'open'],
                ['white', 'white fill'],
                ['dot', 'open, dot inside'],
              ]}
              onChange={(symbolFill) => set({ symbolFill })}
            />
          </Field>
          <Field label="Outline" title="Width of the outline, pt">
            <NumInput className="tiny" min={0} step={0.1} value={st.symbolEdge} onChange={(v) => set({ symbolEdge: num(v) })} />
          </Field>
          <Field label="Outline colour">
            <OptColor value={st.edgeColor} none="as fill" onChange={(edgeColor) => set({ edgeColor })} />
          </Field>
          <Field label="Opacity">
            <NumInput className="tiny" min={0} max={1} step={0.05} value={st.symbolOpacity} onChange={(v) => set({ symbolOpacity: Math.min(1, num(v)) })} />
          </Field>
          <Field label="Every N-th" title="A symbol on every N-th point only (dense data)">
            <NumInput className="tiny" min={1} step={1} value={st.every} onChange={(v) => set({ every: Math.max(1, Math.floor(v) || 1) })} />
          </Field>
          <Field label="Rug" title="Every value a short tick along the frame's edge: the x values at the bottom, the y values at the left (its length, pt); the line's colour and width">
            <span className="row">
              <Select<'' | 'x' | 'y'>
                value={st.rug ?? ''}
                options={[
                  ['', 'none'],
                  ['x', 'x values (bottom)'],
                  ['y', 'y values (left)'],
                ]}
                onChange={(rug) => set({ rug: rug || undefined })}
              />
              {st.rug && <NumInput className="tiny" min={1} step={1} value={st.rugLength ?? 4} onChange={(v) => set({ rugLength: v > 0 ? v : undefined })} />}
            </span>
          </Field>
        </div>
        <div className="grid2">
          <Field label="Size from data" title="The symbol size follows a value: the points' row, x, y, or a column on the port “size”">
            <Select value={st.sizeBy} options={BY} onChange={(sizeBy) => set({ sizeBy })} />
          </Field>
          {st.sizeBy !== 'none' && (
            <Field label="Sizes" title="The smallest and the largest symbol, pt">
              <span className="row">
                <NumInput className="tiny" min={0} step={0.5} value={st.sizeMin} onChange={(v) => set({ sizeMin: num(v) })} />–
                <NumInput className="tiny" min={0} step={0.5} value={st.sizeMax} onChange={(v) => set({ sizeMax: num(v) })} />
              </span>
            </Field>
          )}
          {st.sizeBy !== 'none' && (
            <Field label="Values" title="The values given the smallest and the largest size (empty: the data); values past them get the nearest size">
              <span className="row">
                <NumInput className="tiny" value={st.sizeFrom ?? NaN} placeholder="auto" onChange={(v) => set({ sizeFrom: Number.isFinite(v) ? v : undefined })} />–
                <NumInput className="tiny" value={st.sizeTo ?? NaN} placeholder="auto" onChange={(v) => set({ sizeTo: Number.isFinite(v) ? v : undefined })} />
              </span>
            </Field>
          )}
        </div>
        {st.sizeBy !== 'none' && (
          <div className="row wrap">
            <Check label="Log scale" value={!!st.sizeLog} onChange={(sizeLog) => set({ sizeLog: sizeLog || undefined })} />
            <Check label="Reversed" title="The largest values get the smallest symbols" value={!!st.sizeReverse} onChange={(sizeReverse) => set({ sizeReverse: sizeReverse || undefined })} />
            <Check label="By area" title="The area of the symbol (not its width) in proportion to the value: how the eye reads bubbles" value={!!st.sizeArea} onChange={(sizeArea) => set({ sizeArea: sizeArea || undefined })} />
            <Check label="Size key in the legend" title="Three sizes with their values (the ends of the range and its middle) under the curve's entry" value={!!st.sizeKey} onChange={(sizeKey) => set({ sizeKey: sizeKey || undefined })} />
          </div>
        )}
      </>
    ) : (
      <div className="hint">Symbols are drawn with the styles “scatter” and “line + symbols”.</div>
    );
  else if (tab === 'errors') {
    const ex = st.errX;
    const setX = (p: Partial<typeof ex>) => set({ errX: { ...ex, ...p } });
    body = (
      <>
        <div className="grid2">
          <Field label="±Y from" title="The ±Y column (port), the same value for every point, or a percentage of |y|">
            <span className="row">
              <Select
                value={st.errFrom}
                options={[
                  ['column', 'its column'],
                  ['value', 'a value'],
                  ['percent', '% of y'],
                ]}
                onChange={(errFrom) => set({ errFrom })}
              />
              {st.errFrom !== 'column' && <NumInput className="tiny" min={0} step={0.5} value={st.errValue} onChange={(v) => set({ errValue: num(v) })} />}
            </span>
          </Field>
          <Check label="− error: own column" title="Different + and − errors: ±Y is the + error, the port “−Y” the − error" value={st.errAsym} onChange={(errAsym) => set({ errAsym })} />
        </div>
        {hasYErr || hasXErr ? (
          <>
            <div className="grid2">
              <Field label="Y error as">
                <Select
                  value={st.errStyle}
                  options={[
                    ['bars', 'error bars'],
                    ['band', 'shaded band'],
                  ]}
                  onChange={(errStyle) => set({ errStyle })}
                />
              </Field>
              <Field label="Direction">
                <Select
                  value={st.errDir}
                  options={[
                    ['both', '±'],
                    ['plus', '+ only'],
                    ['minus', '− only'],
                  ]}
                  onChange={(errDir) => set({ errDir })}
                />
              </Field>
              <Field label="Width" title="pt">
                <NumInput className="tiny" min={0} step={0.1} value={st.errWidth} onChange={(v) => set({ errWidth: num(v) })} />
              </Field>
              <Field label="Dash">
                <Select value={st.errDash} options={DASHES} onChange={(errDash) => set({ errDash })} />
              </Field>
              <Field label="Caps" title="Width of the caps, pt (0 = none)">
                <NumInput className="tiny" min={0} step={0.5} value={st.errCap} onChange={(v) => set({ errCap: num(v) })} />
              </Field>
              <Field label="Cap line" title="Thickness of the caps, pt (empty: as the bar)">
                <NumInput className="tiny" min={0} step={0.1} value={st.errCapWidth} placeholder="as bar" onChange={(v) => set({ errCapWidth: v })} />
              </Field>
              <Field label="Colour">
                <OptColor value={st.errColor} none="curve" onChange={(errColor) => set({ errColor })} />
              </Field>
              <Field label={st.errStyle === 'band' ? 'Band opacity' : 'Opacity'}>
                {st.errStyle === 'band' ? (
                  <NumInput className="tiny" min={0} max={1} step={0.05} value={st.fillOpacity} onChange={(v) => set({ fillOpacity: Math.min(1, num(v)) })} />
                ) : (
                  <NumInput className="tiny" min={0} max={1} step={0.05} value={st.errOpacity} onChange={(v) => set({ errOpacity: Math.min(1, num(v)) })} />
                )}
              </Field>
              {st.errStyle === 'band' ? (
                <Field label="Band edges" title="Lines along the edges of the band, pt (0 = none)">
                  <NumInput className="tiny" min={0} step={0.1} value={st.errBandEdge} onChange={(v) => set({ errBandEdge: num(v) })} />
                </Field>
              ) : (
                <Field label="Every N-th" title="A bar on every N-th point only (dense data)">
                  <NumInput className="tiny" min={1} step={1} value={st.errEvery} onChange={(v) => set({ errEvery: Math.max(1, Math.floor(v) || 1) })} />
                </Field>
              )}
            </div>
            <div className="row wrap">
              <Check label="Stop at the symbol" title="The bars start at the edge of the symbol" value={st.errGap} onChange={(errGap) => set({ errGap })} />
              <Check label="Over the symbols" title="The bars drawn over the symbols (else under them)" value={st.errAbove} onChange={(errAbove) => set({ errAbove })} />
            </div>
            {hasXErr && (
              <>
                <Check label="X error bars as the Y ones" value={ex.same} onChange={(same) => setX({ same })} />
                {!ex.same && (
                  <div className="grid2">
                    <Field label="X: width" title="pt">
                      <NumInput className="tiny" min={0} step={0.1} value={ex.width} onChange={(v) => setX({ width: num(v) })} />
                    </Field>
                    <Field label="X: caps" title="pt (0 = none)">
                      <NumInput className="tiny" min={0} step={0.5} value={ex.cap} onChange={(v) => setX({ cap: num(v) })} />
                    </Field>
                    <Field label="X: colour">
                      <OptColor value={ex.color} none="curve" onChange={(color) => setX({ color })} />
                    </Field>
                    <Field label="X: dash">
                      <Select value={ex.dash} options={DASHES} onChange={(dash) => setX({ dash })} />
                    </Field>
                    <Field label="X: direction">
                      <Select
                        value={ex.dir}
                        options={[
                          ['both', '±'],
                          ['plus', '+ only'],
                          ['minus', '− only'],
                        ]}
                        onChange={(dir) => setX({ dir })}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="hint">Connect a ±Y or ±X column to this curve (or take ±Y as a value or a % of y) to draw its errors.</div>
        )}
      </>
    );
  }
  else if (tab === 'colour')
    body = (
      <>
        <div className="grid2">
          <Field label="Colour by" title="Colour every point from a value">
            <Select
              value={st.colorBy}
              options={[
                ['none', 'one colour'],
                ['index', 'position (row)'],
                ['x', 'x value'],
                ['y', 'y value'],
                ['column', 'a column (port)'],
              ]}
              onChange={(colorBy) => set({ colorBy })}
            />
          </Field>
          {st.colorBy !== 'none' && (
            <Field label="Applies to">
              <Select
                value={st.colorTarget}
                options={[
                  ['both', 'line and symbols'],
                  ['symbols', 'symbols'],
                  ['line', 'line'],
                ]}
                onChange={(colorTarget) => set({ colorTarget })}
              />
            </Field>
          )}
        </div>
        {st.colorBy !== 'none' && (
          <>
            <Check label="Categories (integers or texts → one palette colour each)" value={st.categorical} onChange={(categorical) => set({ categorical })} />
            {!st.categorical && (
              <>
                <div className="grid2">
                  <Field label="Colour map">
                    <Select value={st.cmap} options={CMAP_OPTIONS} onChange={(cmap) => set({ cmap })} />
                  </Field>
                  <Field label="Range" title="Empty: the data">
                    <span className="row">
                      <NumInput className="tiny" value={st.cmapMin} placeholder="auto" onChange={(cmapMin) => set({ cmapMin })} />–
                      <NumInput className="tiny" value={st.cmapMax} placeholder="auto" onChange={(cmapMax) => set({ cmapMax })} />
                    </span>
                  </Field>
                </div>
                {st.cmap === 'custom' && (
                  <Field label="Colours" title="Two or three colours: low – (middle) – high">
                    <span className="row">
                      {[0, 1, 2].map((k) => (
                        <OptColor
                          key={k}
                          value={st.cmapColors[k] ?? ''}
                          none={k === 2 ? 'none' : '—'}
                          onChange={(c) => {
                            const cs = [...st.cmapColors];
                            if (c) cs[k] = c;
                            else cs.splice(k, 1);
                            set({ cmapColors: cs.filter(Boolean).slice(0, 3) });
                          }}
                        />
                      ))}
                    </span>
                  </Field>
                )}
                <div className="row">
                  <Check label="Reversed" value={st.cmapReverse} onChange={(cmapReverse) => set({ cmapReverse })} />
                  <Check label="Log scale" value={st.cmapLog} onChange={(cmapLog) => set({ cmapLog })} />
                </div>
              </>
            )}
          </>
        )}
      </>
    );
  else
    body = (
      <>
        <div className="grid2">
          <Field label="Labels at points">
            <Select
              value={st.labels}
              options={[
                ['none', 'none'],
                ['y', 'the y value'],
                ['x', 'the x value'],
                ['column', 'a column (port)'],
              ]}
              onChange={(labels) => set({ labels })}
            />
          </Field>
          {st.labels !== 'none' && (
            <Field label="Where">
              <Select
                value={st.labelPos}
                options={[
                  ['above', 'above'],
                  ['below', 'below'],
                  ['left', 'left'],
                  ['right', 'right'],
                  ['aboveLeft', 'above, ending at it'],
                  ['belowLeft', 'below, ending at it'],
                  ['aboveRight', 'above, starting at it'],
                  ['belowRight', 'below, starting at it'],
                ]}
                onChange={(labelPos) => set({ labelPos })}
              />
            </Field>
          )}
          {st.labels !== 'none' && (
            <Field label="Digits">
              <NumInput className="tiny" min={1} max={12} step={1} value={st.labelDigits} onChange={(v) => set({ labelDigits: Math.max(1, Math.min(12, Math.floor(v) || 3)) })} />
            </Field>
          )}
        </div>
        {st.labels !== 'none' && <TextStyleControls label="Label text" value={st.labelText} onChange={(labelText) => set({ labelText })} />}
        <Check label="Name at the end of the line" title="The curve's name written right of its last point, in its colour (the frame makes room)" value={!!st.endLabel} onChange={(endLabel) => set({ endLabel: endLabel || undefined })} />
        <div className="grid2">
          <Field label="X axis" title="X2: the top axis when it has its own scale; X3 …: axes added in Axes ▸ Add an axis (else the bottom axis)">
            <Select
              value={st.axisX}
              options={[
                ['bottom', 'X1 bottom'],
                ['top', 'X2 top'],
                ['x3', 'X3'],
                ['x4', 'X4'],
                ['x5', 'X5'],
              ]}
              onChange={(axisX) => set({ axisX })}
            />
          </Field>
          <Field label="Y axis" title="Y2: the right axis when it has its own scale; Y3 …: axes added in Axes ▸ Add an axis (else the left axis)">
            <Select
              value={st.axisY}
              options={[
                ['left', 'Y1 left'],
                ['right', 'Y2 right'],
                ['y3', 'Y3'],
                ['y4', 'Y4'],
                ['y5', 'Y5'],
              ]}
              onChange={(axisY) => set({ axisY })}
            />
          </Field>
        </div>
      </>
    );
  return (
    <div className="curve-style">
      <Tabs
        tabs={(
          [
            ['line', 'Line'],
            ['symbol', 'Symbol'],
            ['errors', 'Errors'],
            ['colour', 'Colour map'],
            ['more', 'Labels, axes'],
          ] as [typeof tab, string][]
        ).filter(([t]) => !(noErrors && t === 'errors'))}
        value={tab}
        onChange={setTab}
      />
      {body}
    </div>
  );
}
