// The style editor of one curve of a Plot (in tabs: line and fill, symbols, errors, colour map, labels and axes).
import { useState, type ReactNode } from 'react';
import { Button, Select as MSelect, TextInput as MTextInput } from '@mantine/core';
import { MousePointerClick } from 'lucide-react';
import { CMAP_OPTIONS } from '../figure/colors.ts';
import type { ArrowHead, CurveStyle, Hatch, InnerMark, SymbolShape } from '../figure/spec.ts';
import { HATCHES, SYMBOLS } from './figureOptions.ts';
import { Tabs } from './fields.tsx';
import { AutoSlider, Choice, ColorField, NumField, NumPair, OpacityField, PictureGrid, PicturePick, Row, Section, Sections, SliderField, TextStyleRows, Toggle, WidthField } from '../ui/props.tsx';
import { CapIcon, HeadIcon, JoinIcon, SymbolIcon } from '../ui/propIcons.tsx';
import { DASH_PICS } from '../ui/dashPics.tsx';
import { HatchRows } from '../ui/HatchRows.tsx';

const HEADS: ArrowHead[] = ['none', 'triangle', 'stealth', 'open', 'bar', 'circle', 'diamond', 'square', 'half'];
const headPics = (start: boolean) => HEADS.map((h): [ArrowHead, ReactNode, string] => [h, <HeadIcon key={h} head={h} start={start} />, h]);
const SYMBOL_PICS = SYMBOLS.map(([s, n]): [SymbolShape, ReactNode, string] => [s, <SymbolIcon key={s} shape={s} />, n.replace(/^\S+\s/, '')]);
// the marks inside a symbol ('': none)
const INNER_PICS: ['' | InnerMark, ReactNode, string][] = [
  ['', <span key="n" className="inner-pic none">none</span>, 'Nothing inside'],
  ['dot', <span key="d" className="inner-pic">•</span>, 'A dot'],
  ['dash', <span key="h" className="inner-pic">–</span>, 'A dash'],
  ['plus', <span key="p" className="inner-pic">+</span>, 'A plus'],
  ['cross', <span key="x" className="inner-pic">×</span>, 'A cross'],
  ['ring', <span key="o" className="inner-pic">○</span>, 'A ring'],
  ['bar', <span key="b" className="inner-pic">|</span>, 'A bar'],
  ['slash', <span key="s" className="inner-pic">/</span>, 'A slash'],
  ['backslash', <span key="k" className="inner-pic">\</span>, 'A backslash'],
];
// the sources of a size or a width from the data
const BY: { value: NonNullable<CurveStyle['widthBy']>; label: string }[] = [
  { value: 'none', label: 'No' },
  { value: 'index', label: 'Position (row)' },
  { value: 'x', label: 'x value' },
  { value: 'y', label: 'y value' },
  { value: 'column', label: 'A column (port size)' },
];
// keys pressed in the panel are its own
const ownKeys = (e: React.KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
};

// The style editor of one curve, in tabs.
// curves: the other curves of the Plot (number, name), for a fill down to one of them; placing / onPlace: the fill points
// placed with the mouse on the figure; noErrors: no Errors tab (a quick fit's curve: its band set with the fit)
// axes: the Plot's axes a curve can be on (and new ones), chosen as in the curve's row (an axis made); without it, a
// fixed list
// byGroup: the Plot's curves coloured by group (Colours): the curve's colour is its group's unless it keeps its own
export function CurveStyleEditor({ st, set, hasYErr, hasXErr, curves = [], placing = false, onPlace, noErrors = false, axes, byGroup = false }: { st: CurveStyle; set: (p: Partial<CurveStyle>) => void; hasYErr: boolean; hasXErr: boolean; curves?: [number, string][]; placing?: boolean; onPlace?: () => void; noErrors?: boolean; axes?: { x: [string, string][]; y: [string, string][]; pick: (kind: 'x' | 'y', v: string) => void }; byGroup?: boolean }) {
  const [tab, setTab] = useState<'line' | 'symbol' | 'errors' | 'colour' | 'more'>('line');
  const line = st.mode !== 'scatter';
  const symbols = st.mode === 'scatter' || st.mode === 'linesymbol';
  const num = (v: number, min = 0) => Math.max(min, Number.isFinite(v) ? v : min);
  let body: ReactNode;
  if (tab === 'line')
    body = (
      <Sections panel="curve-line" open={['line', 'fill']}>
        <Section value="line" title="Line" aside={line ? `${st.lineWidth} pt` : 'none'}>
          <Row label="Style">
            <Choice
              value={st.mode}
              onChange={(mode) => set({ mode })}
              options={[
                ['line', 'Line'],
                ['scatter', 'Points'],
                ['linesymbol', 'Both', 'Line and symbols'],
                ['step', 'Steps'],
              ]}
            />
          </Row>
          {st.mode === 'step' ? (
            <Row label="Steps">
              <Choice
                value={st.stepKind}
                onChange={(stepKind) => set({ stepKind })}
                options={[
                  ['hv', 'Across, up'],
                  ['vh', 'Up, across'],
                  ['mid', 'Centred'],
                ]}
              />
            </Row>
          ) : (
            line && (
              <Row label="Connect" hint="Straight lines between the points, or a smooth curve through them (monotone where x is ordered: no overshoot)">
                <Choice
                  value={st.connect}
                  onChange={(connect) => set({ connect })}
                  options={[
                    ['straight', 'Straight'],
                    ['spline', 'Smooth'],
                  ]}
                />
              </Row>
            )
          )}
          <Row label="Colour" hint={byGroup && !st.ownColor ? 'its group’s (Colours); tick “own” to keep this one' : undefined}>
            <ColorField value={st.color} onChange={(color) => set({ color: color || '#000000', ...(byGroup ? { ownColor: true } : {}) })} />
            {byGroup && <Toggle value={!!st.ownColor} onChange={(on) => set({ ownColor: on || undefined })} label="own" />}
          </Row>
          {line && (
            <>
              <Row label="Width">
                <WidthField value={st.lineWidth} onChange={(v) => set({ lineWidth: num(v) })} />
              </Row>
              <Row label="Dashes">
                <PictureGrid value={st.dash} onChange={(dash) => set({ dash })} options={DASH_PICS} cols={4} />
              </Row>
              <Row label="Opacity">
                <OpacityField value={st.lineOpacity} onChange={(v) => set({ lineOpacity: Math.min(1, num(v)) })} />
              </Row>
              <Row label="Ends" hint="The line's ends">
                <Choice<NonNullable<CurveStyle['lineCap']>>
                  value={st.lineCap ?? (st.dash === 'dot' ? 'round' : 'butt')}
                  onChange={(lineCap) => set({ lineCap })}
                  options={[
                    ['butt', <span key="butt" className="seg-pic"><CapIcon cap="butt" />Flat</span>, 'The line stops at its end'],
                    ['round', <span key="round" className="seg-pic"><CapIcon cap="round" />Round</span>, 'A half circle past its end'],
                    ['square', <span key="square" className="seg-pic"><CapIcon cap="square" />Square</span>, 'Half its width past its end'],
                  ]}
                />
              </Row>
              <Row label="Joins" hint="How its pieces meet">
                <Choice<NonNullable<CurveStyle['lineJoin']>>
                  value={st.lineJoin ?? 'round'}
                  onChange={(lineJoin) => set({ lineJoin })}
                  options={[
                    ['round', <span key="round" className="seg-pic"><JoinIcon join="round" />Round</span>, 'A rounded corner'],
                    ['miter', <span key="miter" className="seg-pic"><JoinIcon join="miter" />Sharp</span>, 'A pointed corner'],
                    ['bevel', <span key="bevel" className="seg-pic"><JoinIcon join="bevel" />Cut</span>, 'The corner cut off'],
                  ]}
                />
              </Row>
              <Row label="Halo" hint="A band around the line (each side; 0: none) in a colour of its own: the line reads over other curves">
                <SliderField value={st.halo ?? 0} onChange={(v) => set({ halo: num(v) || undefined })} min={0} max={6} step={0.25} unit="pt" />
                {(st.halo ?? 0) > 0 && <ColorField value={st.haloColor ?? ''} auto="#ffffff" onChange={(haloColor) => set({ haloColor: haloColor || undefined })} />}
              </Row>
              {(st.halo ?? 0) > 0 && (
                <Row label="Halo opacity">
                  <OpacityField value={st.haloOpacity ?? 1} onChange={(v) => set({ haloOpacity: Number.isFinite(v) && v < 1 ? Math.max(0, v) : undefined })} />
                </Row>
              )}
              <Row label="Heads" hint="Arrow heads at the curve's start and end">
                <div className="prop-btns">
                  <PicturePick label="Head at the start" value={st.arrowStart ?? 'none'} onChange={(arrowStart) => set({ arrowStart })} options={headPics(true)} cols={3} />
                  <PicturePick label="Head at the end" value={st.arrowEnd ?? 'none'} onChange={(arrowEnd) => set({ arrowEnd })} options={headPics(false)} cols={3} />
                </div>
              </Row>
              {((st.arrowStart ?? 'none') !== 'none' || (st.arrowEnd ?? 'none') !== 'none') && (
                <Row label="Head size" hint="auto: from the line's width">
                  <AutoSlider value={st.arrowSize} def={undefined} onChange={(v) => set({ arrowSize: v !== undefined && v > 0 ? v : undefined })} min={1} max={15} step={0.5} unit="pt" />
                </Row>
              )}
              <Row label="Drop lines" hint="Lines from every point to the bottom (vertical) or left (horizontal) axis">
                <Choice
                  value={st.drop}
                  onChange={(drop) => set({ drop })}
                  options={[
                    ['none', 'None'],
                    ['vertical', 'Down'],
                    ['horizontal', 'Across'],
                  ]}
                />
              </Row>
              <Row label="Width from" hint="The line's width follows a value (the points' row, x, y, or a column on the port “size”), from the thinnest to the widest">
                <MSelect value={st.widthBy ?? 'none'} data={BY} onChange={(v) => v && set({ widthBy: v as NonNullable<CurveStyle['widthBy']> })} />
              </Row>
              {(st.widthBy ?? 'none') !== 'none' && (
                <>
                  <Row label="Thinnest">
                    <SliderField value={st.widthMin ?? 0.5} onChange={(v) => set({ widthMin: num(v) })} min={0} max={10} step={0.25} unit="pt" />
                  </Row>
                  <Row label="Widest">
                    <SliderField value={st.widthMax ?? 3} onChange={(v) => set({ widthMax: num(v) })} min={0} max={10} step={0.25} unit="pt" />
                  </Row>
                </>
              )}
              {st.mode === 'linesymbol' && (
                <>
                  <Row label="Line is" hint="The line drawn under the symbols or over them">
                    <Choice
                      value={st.lineOver ? 'over' : 'under'}
                      onChange={(v) => set({ lineOver: v === 'over' || undefined })}
                      options={[
                        ['under', 'Behind'],
                        ['over', 'In front'],
                      ]}
                    />
                  </Row>
                  <Row label="Gap at symbols" hint="The line stops this far from the edge of every symbol; 0: it reaches them">
                    <SliderField value={st.symbolGap ?? 0} onChange={(v) => set({ symbolGap: num(v) || undefined })} min={0} max={5} step={0.25} unit="pt" />
                  </Row>
                </>
              )}
            </>
          )}
          <Row label="Masked points" hint="Points masked in a Data manipulation node: drawn grey, or not drawn (the line goes on past them)">
            <Choice
              value={st.masked}
              onChange={(masked) => set({ masked })}
              options={[
                ['faded', 'Grey'],
                ['hidden', 'Hidden'],
              ]}
            />
          </Row>
        </Section>
        <Section value="fill" title="Fill under" aside={st.fill === 'none' ? 'none' : undefined}>
          <Row label="Fill" hint="The area between the curve and y = 0, the bottom of the frame, a line y = f(x), another curve of this Plot (e.g. its baseline), or straight lines through points">
            <MSelect
              value={st.fill}
              onChange={(v) => v && set({ fill: v as CurveStyle['fill'] })}
              data={[
                { value: 'none', label: 'None' },
                { value: 'zero', label: 'Down to y = 0' },
                { value: 'bottom', label: 'Down to the frame' },
                { value: 'formula', label: 'To y = f(x)' },
                { value: 'curve', label: 'To another curve' },
                { value: 'points', label: 'To points' },
              ]}
            />
          </Row>
          {st.fill === 'formula' && (
            <Row label="y =" hint="A number (y = 0.2) or a formula of x (0.1 + 0.002*x)">
              <MTextInput className="mono-input" value={st.fillFormula} placeholder="0.1 + 0.002*x" onChange={(e) => set({ fillFormula: e.currentTarget.value })} />
            </Row>
          )}
          {st.fill === 'curve' && (
            <Row label="To curve" hint="Another curve of this Plot, e.g. the baseline (between its points straight lines); it may be hidden">
              <MSelect
                value={String(st.fillCurve)}
                onChange={(v) => v && set({ fillCurve: Number(v) })}
                data={(curves.length ? curves : ([[st.fillCurve, String(st.fillCurve)]] as [number, string][])).map(([n, l]) => ({ value: String(n), label: l }))}
              />
            </Row>
          )}
          {st.fill === 'points' && (
            <Row label="Points" hint="Placed on the figure with the mouse (click: a point, drag: move, double-click: remove), or typed: x, y; x, y … joined by straight lines">
              <Button variant={placing ? 'filled' : 'default'} leftSection={<MousePointerClick size={13} />} onClick={onPlace} title="Click on the figure to place the points (again: stop)">
                {placing ? 'Placing: click to stop' : 'Place on the graph'}
              </Button>
              <MTextInput className="mono-input" value={st.fillPoints} placeholder="x, y; x, y …" onChange={(e) => set({ fillPoints: e.currentTarget.value })} />
            </Row>
          )}
          {st.fill !== 'none' && (
            <>
              <Row label="Colour" hint="auto: the curve's colour">
                <ColorField value={st.fillColor} auto={st.color} onChange={(fillColor) => set({ fillColor })} />
              </Row>
              <Row label="Opacity">
                <OpacityField value={st.fillOpacity} onChange={(v) => set({ fillOpacity: Math.min(1, num(v)) })} />
              </Row>
              <Row label="Hatching" hint="A hatching over the fill">
                <MSelect value={st.fillHatch ?? 'none'} data={HATCHES.map(([v, l]) => ({ value: v, label: l }))} onChange={(h) => h && set({ fillHatch: h as Hatch })} />
              </Row>
              {st.fillHatch && st.fillHatch !== 'none' && (
                <>
                  <Row label="Its colour" hint="auto: the curve's colour">
                    <ColorField value={st.fillHatchColor ?? ''} auto={st.color} onChange={(fillHatchColor) => set({ fillHatchColor })} />
                  </Row>
                  <HatchRows h={st.fillHatch} look={st.fillHatchLook} onChange={(fillHatchLook) => set({ fillHatchLook })} />
                </>
              )}
            </>
          )}
        </Section>
      </Sections>
    );
  else if (tab === 'symbol')
    body = symbols ? (
      <Sections panel="curve-symbol" open={['symbol', 'size']}>
        <Section value="symbol" title="Symbol" aside={`${st.symbolSize} pt`}>
          <Row label="Shape">
            <PictureGrid value={st.symbol} onChange={(symbol) => set({ symbol })} options={SYMBOL_PICS} cols={6} />
          </Row>
          <Row label="Size">
            <SliderField value={st.symbolSize} onChange={(v) => set({ symbolSize: num(v) })} min={0} max={20} step={0.5} unit="pt" />
          </Row>
          <Row label="Fill">
            <Choice<'filled' | 'open' | 'color'>
              value={st.symbolFill === 'white' || st.symbolFill === 'color' ? 'color' : st.symbolFill === 'dot' ? 'open' : st.symbolFill}
              onChange={(f) =>
                set(
                  f === 'color'
                    ? { symbolFill: 'color', symbolFillColor: st.symbolFillColor || '#ffffff' }
                    : // (an older dot: open, its dot kept as the mark inside)
                      { symbolFill: f, ...(st.symbolFill === 'dot' && !st.symbolInner ? { symbolInner: 'dot' as const } : {}) },
                )
              }
              options={[
                ['filled', 'Filled', 'In the curve’s colour'],
                ['open', 'Open', 'Only its outline'],
                ['color', 'Colour', 'Filled with a colour of its own (white hides the line behind it)'],
              ]}
            />
          </Row>
          {(st.symbolFill === 'color' || st.symbolFill === 'white') && (
            <>
              <Row label="Fill colour">
                <ColorField value={st.symbolFill === 'white' ? '#ffffff' : st.symbolFillColor || '#ffffff'} onChange={(c) => set({ symbolFill: 'color', symbolFillColor: c || '#ffffff' })} />
              </Row>
              <Row label="Fill opacity">
                <OpacityField value={st.symbolFillOpacity ?? 1} onChange={(v) => set({ symbolFill: 'color', symbolFillColor: st.symbolFillColor || '#ffffff', symbolFillOpacity: Number.isFinite(v) && v < 1 ? Math.max(0, v) : undefined })} />
              </Row>
            </>
          )}
          <Row label="Inside" hint="A mark inside every symbol">
            <PictureGrid<'' | InnerMark>
              value={st.symbolInner ?? (st.symbolFill === 'dot' ? 'dot' : '')}
              onChange={(m) => set({ symbolInner: m || undefined, ...(st.symbolFill === 'dot' ? { symbolFill: 'open' as const } : {}) })}
              options={INNER_PICS}
              cols={9}
            />
          </Row>
          {(st.symbolInner || st.symbolFill === 'dot') && (
            <>
              <Row label="Its size" hint="A part of the symbol's size">
                <SliderField value={Math.round((st.innerSize ?? 0.5) * 100)} onChange={(v) => set({ innerSize: Number.isFinite(v) && v > 0 && v !== 50 ? v / 100 : undefined })} min={10} max={100} step={5} unit="%" />
              </Row>
              <Row label="Its colour" hint="auto: as the outline">
                <ColorField value={st.innerColor ?? ''} auto={st.edgeColor || st.color} onChange={(c) => set({ innerColor: c || undefined })} />
              </Row>
              {st.symbolInner !== 'dot' && st.symbolFill !== 'dot' && (
                <Row label="Its width">
                  <WidthField value={st.innerWidth ?? Math.max(0.5, st.symbolEdge)} onChange={(v) => set({ innerWidth: Number.isFinite(v) && v > 0 ? v : undefined })} max={3} />
                </Row>
              )}
            </>
          )}
          <Row label="Outline" hint="The width of the outline">
            <WidthField value={st.symbolEdge} onChange={(v) => set({ symbolEdge: num(v) })} max={3} />
          </Row>
          <Row label="Outline colour" hint="auto: as the fill">
            <ColorField value={st.edgeColor} auto={st.color} onChange={(edgeColor) => set({ edgeColor })} />
          </Row>
          <Row label="Opacity">
            <OpacityField value={st.symbolOpacity} onChange={(v) => set({ symbolOpacity: Math.min(1, num(v)) })} />
          </Row>
          <Row label="Every N-th" hint="A symbol on every N-th point only (dense data)">
            <SliderField value={st.every} onChange={(v) => set({ every: Math.max(1, Math.floor(v) || 1) })} min={1} max={20} step={1} />
          </Row>
          <Row label="Rug" hint="Every value a tick from the frame's edge: the x values at the bottom, the y values at the left, or both">
            <Choice<'' | 'x' | 'y' | 'both'>
              value={st.rug ?? ''}
              onChange={(rug) => set({ rug: rug || undefined })}
              options={[
                ['', 'None'],
                ['x', 'X'],
                ['y', 'Y'],
                ['both', 'Both'],
              ]}
            />
          </Row>
          {st.rug && (
            <>
              <Row label="Rug length" hint="A tick of a length, or a line from the edge to the point">
                <Choice<'len' | 'point'>
                  value={st.rugTo === 'point' ? 'point' : 'len'}
                  onChange={(v) => set({ rugTo: v === 'point' ? 'point' : undefined })}
                  options={[
                    ['len', 'A tick'],
                    ['point', 'To the point'],
                  ]}
                />
                {st.rugTo !== 'point' && <SliderField value={st.rugLength ?? 4} onChange={(v) => set({ rugLength: v > 0 ? v : undefined })} min={1} max={15} step={0.5} unit="pt" />}
              </Row>
              <Row label="Rug width">
                <WidthField value={st.rugWidth ?? Math.max(0.3, st.lineWidth)} onChange={(v) => set({ rugWidth: Number.isFinite(v) && v > 0 ? v : undefined })} max={3} />
              </Row>
              <Row label="Rug colour" hint="auto: the curve's">
                <ColorField value={st.rugColor ?? ''} auto={st.color} onChange={(c) => set({ rugColor: c || undefined })} />
              </Row>
              <Row label="Rug dashes">
                <PictureGrid value={st.rugDash ?? 'solid'} onChange={(rugDash) => set({ rugDash: rugDash === 'solid' ? undefined : rugDash })} options={DASH_PICS} cols={4} />
              </Row>
              <Row label="Rug opacity">
                <OpacityField value={st.rugOpacity ?? st.lineOpacity} onChange={(v) => set({ rugOpacity: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined })} />
              </Row>
            </>
          )}
        </Section>
        <Section value="size" title="Size from data" aside={st.sizeBy === 'none' ? 'no' : st.sizeBy}>
          <Row label="Size from" hint="The symbol size follows a value: the points' row, x, y, or a column on the port “size”">
            <MSelect value={st.sizeBy} data={BY} onChange={(v) => v && set({ sizeBy: v as CurveStyle['sizeBy'] })} />
          </Row>
          {st.sizeBy !== 'none' && (
            <>
              <Row label="Smallest">
                <SliderField value={st.sizeMin} onChange={(v) => set({ sizeMin: num(v) })} min={0} max={30} step={0.5} unit="pt" />
              </Row>
              <Row label="Largest">
                <SliderField value={st.sizeMax} onChange={(v) => set({ sizeMax: num(v) })} min={0} max={30} step={0.5} unit="pt" />
              </Row>
              <Row label="For values" hint="The values given the smallest and the largest size (empty: the data); values past them get the nearest size">
                <NumPair a={st.sizeFrom ?? NaN} b={st.sizeTo ?? NaN} names={['from', 'to']} onA={(v) => set({ sizeFrom: Number.isFinite(v) ? v : undefined })} onB={(v) => set({ sizeTo: Number.isFinite(v) ? v : undefined })} />
              </Row>
              <Row label="Also">
                <Toggle value={!!st.sizeLog} onChange={(sizeLog) => set({ sizeLog: sizeLog || undefined })} label="log scale" />
                <Toggle value={!!st.sizeReverse} onChange={(sizeReverse) => set({ sizeReverse: sizeReverse || undefined })} label="reversed (largest values smallest)" />
                <Toggle value={!!st.sizeArea} onChange={(sizeArea) => set({ sizeArea: sizeArea || undefined })} label="by area (as the eye reads bubbles)" />
                <Toggle value={!!st.sizeKey} onChange={(sizeKey) => set({ sizeKey: sizeKey || undefined })} label="size key in the legend" />
              </Row>
            </>
          )}
        </Section>
      </Sections>
    ) : (
      <div className="prop-note">Symbols are drawn with the styles Points and Both (line and symbols).</div>
    );
  else if (tab === 'errors') {
    const ex = st.errX;
    const setX = (p: Partial<typeof ex>) => set({ errX: { ...ex, ...p } });
    const dirs: ['both' | 'plus' | 'minus', string][] = [
      ['both', '±'],
      ['plus', '+ only'],
      ['minus', '− only'],
    ];
    body = (
      <Sections panel="curve-errors" open={['y', 'x']}>
        <Section value="y" title="Error bars" aside={st.errStyle === 'band' ? 'band' : 'bars'}>
          <Row label="±Y from" hint="The ±Y column (port), the same value for every point, or a percentage of |y|">
            <Choice
              value={st.errFrom}
              onChange={(errFrom) => set({ errFrom })}
              options={[
                ['column', 'Its column'],
                ['value', 'A value'],
                ['percent', '% of y'],
              ]}
            />
            {st.errFrom !== 'column' && <NumField value={st.errValue} min={0} unit={st.errFrom === 'percent' ? '%' : undefined} onChange={(v) => set({ errValue: num(v) })} />}
          </Row>
          <Row label="− error" hint="Different + and − errors: ±Y is the + error, the port “−Y” the − error">
            <Toggle value={st.errAsym} onChange={(errAsym) => set({ errAsym })} label="its own column" />
          </Row>
          {hasYErr || hasXErr ? (
            <>
              <Row label="Draw as">
                <Choice
                  value={st.errStyle}
                  onChange={(errStyle) => set({ errStyle })}
                  options={[
                    ['bars', 'Bars'],
                    ['band', 'Band', 'A shaded band y ± error'],
                  ]}
                />
              </Row>
              <Row label="Direction">
                <Choice value={st.errDir} onChange={(errDir) => set({ errDir })} options={dirs} />
              </Row>
              <Row label="Width">
                <WidthField value={st.errWidth} onChange={(v) => set({ errWidth: num(v) })} max={3} />
              </Row>
              <Row label="Dashes">
                <PictureGrid value={st.errDash} onChange={(errDash) => set({ errDash })} options={DASH_PICS} cols={4} />
              </Row>
              <Row label="Caps" hint="The width of the caps (0: none)">
                <SliderField value={st.errCap} onChange={(v) => set({ errCap: num(v) })} min={0} max={12} step={0.5} unit="pt" />
              </Row>
              <Row label="Cap line" hint="The thickness of the caps (auto: as the bar)">
                <AutoSlider value={Number.isFinite(st.errCapWidth) ? st.errCapWidth : undefined} def={st.errWidth} onChange={(v) => set({ errCapWidth: v ?? NaN })} min={0} max={3} step={0.05} unit="pt" />
              </Row>
              <Row label="Colour" hint="auto: the curve's colour">
                <ColorField value={st.errColor} auto={st.color} onChange={(errColor) => set({ errColor })} />
              </Row>
              {st.errStyle === 'band' ? (
                <>
                  <Row label="Band opacity">
                    <OpacityField value={st.fillOpacity} onChange={(v) => set({ fillOpacity: Math.min(1, num(v)) })} />
                  </Row>
                  <Row label="Band edges" hint="Lines along the edges of the band (0: none)">
                    <SliderField value={st.errBandEdge} onChange={(v) => set({ errBandEdge: num(v) })} min={0} max={3} step={0.05} unit="pt" />
                  </Row>
                </>
              ) : (
                <>
                  <Row label="Opacity">
                    <OpacityField value={st.errOpacity} onChange={(v) => set({ errOpacity: Math.min(1, num(v)) })} />
                  </Row>
                  <Row label="Every N-th" hint="A bar on every N-th point only (dense data)">
                    <SliderField value={st.errEvery} onChange={(v) => set({ errEvery: Math.max(1, Math.floor(v) || 1) })} min={1} max={20} step={1} />
                  </Row>
                </>
              )}
              <Row label="Also">
                <Toggle value={st.errGap} onChange={(errGap) => set({ errGap })} label="stop at the symbol" />
                <Toggle value={st.errAbove} onChange={(errAbove) => set({ errAbove })} label="over the symbols" />
              </Row>
            </>
          ) : (
            <div className="prop-note">Connect a ±Y or ±X column to this curve (or take ±Y as a value or a % of y) to draw its errors.</div>
          )}
        </Section>
        {hasXErr && (
          <Section value="x" title="X error bars" aside={ex.same ? 'as the Y ones' : undefined}>
            <Row label="Look">
              <Toggle value={ex.same} onChange={(same) => setX({ same })} label="as the Y ones" />
            </Row>
            {!ex.same && (
              <>
                <Row label="Width">
                  <WidthField value={ex.width} onChange={(v) => setX({ width: num(v) })} max={3} />
                </Row>
                <Row label="Caps" hint="0: none">
                  <SliderField value={ex.cap} onChange={(v) => setX({ cap: num(v) })} min={0} max={12} step={0.5} unit="pt" />
                </Row>
                <Row label="Colour" hint="auto: the curve's colour">
                  <ColorField value={ex.color} auto={st.color} onChange={(color) => setX({ color })} />
                </Row>
                <Row label="Dashes">
                  <PictureGrid value={ex.dash} onChange={(dash) => setX({ dash })} options={DASH_PICS} cols={4} />
                </Row>
                <Row label="Direction">
                  <Choice value={ex.dir} onChange={(dir) => setX({ dir })} options={dirs} />
                </Row>
              </>
            )}
          </Section>
        )}
      </Sections>
    );
  } else if (tab === 'colour')
    body = (
      <>
        <Row label="Points coloured by" hint="Colour every point of this curve from a value (the curves by group: Colours, above the curves)">
          <MSelect
            value={st.colorBy}
            onChange={(v) => v && set({ colorBy: v as CurveStyle['colorBy'] })}
            data={[
              { value: 'none', label: 'One colour' },
              { value: 'index', label: 'Position (row)' },
              { value: 'x', label: 'x value' },
              { value: 'y', label: 'y value' },
              { value: 'column', label: 'A column (port)' },
            ]}
          />
        </Row>
        {st.colorBy !== 'none' && (
          <>
            <Row label="Applies to">
              <Choice
                value={st.colorTarget}
                onChange={(colorTarget) => set({ colorTarget })}
                options={[
                  ['both', 'Both', 'Line and symbols'],
                  ['symbols', 'Symbols'],
                  ['line', 'Line'],
                ]}
              />
            </Row>
            <Row label="Categories" hint="Integers or texts: one palette colour each">
              <Toggle value={st.categorical} onChange={(categorical) => set({ categorical })} />
            </Row>
            {!st.categorical && (
              <>
                <Row label="Colour map">
                  <MSelect value={st.cmap} data={CMAP_OPTIONS.map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => v && set({ cmap: v as CurveStyle['cmap'] })} />
                </Row>
                <Row label="Range" hint="Empty: the data">
                  <NumPair a={st.cmapMin} b={st.cmapMax} names={['from', 'to']} onA={(cmapMin) => set({ cmapMin })} onB={(cmapMax) => set({ cmapMax })} />
                </Row>
                {st.cmap === 'custom' && (
                  <Row label="Colours" hint="Two or three colours: low, (middle), high">
                    <div className="prop-btns">
                      {[0, 1, 2].map((k) => (
                        <ColorField
                          key={k}
                          value={st.cmapColors[k] ?? ''}
                          none
                          onChange={(c) => {
                            const cs = [...st.cmapColors];
                            if (c) cs[k] = c;
                            else cs.splice(k, 1);
                            set({ cmapColors: cs.filter(Boolean).slice(0, 3) });
                          }}
                        />
                      ))}
                    </div>
                  </Row>
                )}
                <Row label="Also">
                  <Toggle value={st.cmapReverse} onChange={(cmapReverse) => set({ cmapReverse })} label="reversed" />
                  <Toggle value={st.cmapLog} onChange={(cmapLog) => set({ cmapLog })} label="log scale" />
                </Row>
              </>
            )}
          </>
        )}
      </>
    );
  else
    body = (
      <Sections panel="curve-more" open={['labels', 'axes']}>
        <Section value="labels" title="Labels at points" aside={st.labels === 'none' ? 'none' : undefined}>
          <Row label="Labels">
            <Choice
              value={st.labels}
              onChange={(labels) => set({ labels })}
              options={[
                ['none', 'None'],
                ['y', 'y'],
                ['x', 'x'],
                ['column', 'Column', 'A column (port)'],
              ]}
            />
          </Row>
          {st.labels !== 'none' && (
            <>
              <Row label="Where">
                <MSelect
                  value={st.labelPos}
                  onChange={(v) => v && set({ labelPos: v as CurveStyle['labelPos'] })}
                  data={[
                    { value: 'above', label: 'Above' },
                    { value: 'below', label: 'Below' },
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' },
                    { value: 'aboveLeft', label: 'Above, ending at it' },
                    { value: 'belowLeft', label: 'Below, ending at it' },
                    { value: 'aboveRight', label: 'Above, starting at it' },
                    { value: 'belowRight', label: 'Below, starting at it' },
                  ]}
                />
              </Row>
              <Row label="Digits" hint="Significant digits">
                <SliderField value={st.labelDigits} onChange={(v) => set({ labelDigits: Math.max(1, Math.min(12, Math.floor(v) || 3)) })} min={1} max={12} step={1} />
              </Row>
              <TextStyleRows value={st.labelText} onChange={(labelText) => set({ labelText })} />
            </>
          )}
          <Row label="Name at end" hint="The curve's name written right of its last point, in its colour (the frame makes room)">
            <Toggle value={!!st.endLabel} onChange={(endLabel) => set({ endLabel: endLabel || undefined })} />
          </Row>
        </Section>
        <Section value="axes" title="Axes" aside={`${st.axisX}, ${st.axisY}`}>
          <Row label="X axis" hint="The axis it is on: X1 bottom, X2 top, X3 … added ones; + new: an axis of its own (as in its row above)">
            <MSelect
              value={st.axisX}
              onChange={(axisX) => axisX && (axes ? axes.pick('x', axisX) : set({ axisX }))}
              data={(
                axes?.x ?? [
                  ['bottom', 'X1 bottom'],
                  ['top', 'X2 top'],
                  ['x3', 'X3'],
                  ['x4', 'X4'],
                  ['x5', 'X5'],
                ]
              ).map(([v, l]) => ({ value: v, label: l }))}
            />
          </Row>
          <Row label="Y axis" hint="The axis it is on: Y1 left, Y2 right, Y3 … added ones; + new: an axis of its own (as in its row above)">
            <MSelect
              value={st.axisY}
              onChange={(axisY) => axisY && (axes ? axes.pick('y', axisY) : set({ axisY }))}
              data={(
                axes?.y ?? [
                  ['left', 'Y1 left'],
                  ['right', 'Y2 right'],
                  ['y3', 'Y3'],
                  ['y4', 'Y4'],
                  ['y5', 'Y5'],
                ]
              ).map(([v, l]) => ({ value: v, label: l }))}
            />
          </Row>
        </Section>
      </Sections>
    );
  return (
    <div className="curve-style props-panel props-embed nodrag" onKeyDown={ownKeys}>
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
