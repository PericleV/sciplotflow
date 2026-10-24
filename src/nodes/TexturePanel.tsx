// Structure ▸ grain size (ASTM E112 intercepts), orientation (the structure tensor, as OrientationJ) and fractal
// dimension (box counting): the panel, and what is drawn over the image (the test lines with their crossings; the
// image coloured by the direction and the coherency).
import type { Pt } from '../image/roi.ts';
import type { TextureSpec } from '../image/texture.ts';
import type { TextureView } from '../image/node.ts';
import { Check, NumInput, Select } from './ui.tsx';

const fmt = (v: number, d = 4) => (Number.isFinite(v) ? String(+v.toPrecision(d)) : '–');

export function TextureOverlay({ view, spec, k, ox, oy, W, H, w, h }: { view: TextureView; spec: TextureSpec; k: number; ox: number; oy: number; W: number; H: number; w: number; h: number }) {
  const at = ([x, y]: Pt) => `${((x - ox) * k).toFixed(1)},${((y - oy) * k).toFixed(1)}`;
  return (
    <svg className="ie-overlay ie-texture" width={W} height={H}>
      {spec.orient?.show && view.orient?.png && <image href={view.orient.png} x={0} y={0} width={w * k} height={h * k} preserveAspectRatio="none" className="orient" />}
      {spec.grains?.show &&
        view.grains?.paths.map((q, i) => (q.closed ? <polygon key={i} points={q.pts.map(at).join(' ')} className="test" /> : <polyline key={i} points={q.pts.map(at).join(' ')} className="test" />))}
      {spec.grains?.show && view.grains?.marks.map((m, i) => <circle key={i} cx={(m[0] - ox) * k} cy={(m[1] - oy) * k} r={3} className="hit" />)}
    </svg>
  );
}

export function TexturePanel({ spec, set, view, u }: { spec: TextureSpec; set: (s: Partial<TextureSpec>) => void; view?: TextureView; u: string }) {
  const G = spec.grains ?? {};
  const O = spec.orient ?? {};
  const F = spec.fractal ?? {};
  const setG = (p: Partial<NonNullable<TextureSpec['grains']>>) => set({ grains: { ...G, ...p } });
  const setO = (p: Partial<NonNullable<TextureSpec['orient']>>) => set({ orient: { ...O, ...p } });
  const setF = (p: Partial<NonNullable<TextureSpec['fractal']>>) => set({ fractal: { ...F, ...p } });
  return (
    <>
      <div className="ie-section">Grain size (ASTM E112)</div>
      <Check label="the intercepts of test lines" title="Test lines laid over the mask, the grain boundaries they cross counted: the mean lineal intercept, the ASTM grain size number G and the grains per mm²; a sheet Grain size" value={!!G.on} onChange={(on) => setG({ on: on || undefined })} />
      {G.on && (
        <>
          <div className="row wrap">
            <Select<'boundaries' | 'grains'>
              value={G.of ?? 'boundaries'}
              title="What the mask is: the boundaries (thin lines), or the grains (the boundaries what is between them)"
              options={[
                ['boundaries', 'the mask: boundaries'],
                ['grains', 'the mask: grains'],
              ]}
              onChange={(of) => setG({ of: of === 'boundaries' ? undefined : of })}
            />
            <Select<'grid' | 'circles'>
              value={G.lines ?? 'grid'}
              title="The test lines: a grid of horizontal and vertical lines (the grains elongated: compare the two), or three concentric circles (as Abrams’s, no direction favoured)"
              options={[
                ['grid', 'a grid of lines'],
                ['circles', 'three circles'],
              ]}
              onChange={(lines) => setG({ lines: lines === 'grid' ? undefined : lines })}
            />
            {(G.lines ?? 'grid') === 'grid' && <NumInput className="short" min={1} step={1} value={G.n ?? 5} title="The lines each way" onChange={(n) => setG({ n: n >= 1 && n !== 5 ? Math.round(n) : undefined })} />}
          </div>
          <Check label="the lines and their crossings over the image" value={!!G.show} onChange={(show) => setG({ show: show || undefined })} />
          {view?.grains?.rows.map((r) => (
            <div key={r.name} className="hint">
              <b>{r.name}</b>: ℓ = {fmt(r.l)} {u} ({fmt(r.hits, 5)} crossings){Number.isFinite(r.G) ? ` · G ${fmt(r.G, 3)}` : ''}
            </div>
          ))}
        </>
      )}
      <div className="ie-section">Orientation</div>
      <Check label="the directions of the structures" title="The structure tensor of the gradient averaged over a window (as OrientationJ): at every pixel the direction and its coherency (1: one direction, 0: none); the dominant direction and the distribution of the directions; a sheet Orientation" value={!!O.on} onChange={(on) => setO({ on: on || undefined })} />
      {O.on && (
        <>
          <div className="row wrap">
            <span className="muted">window σ</span>
            <NumInput className="short" min={0.5} step={0.5} value={O.sigma ?? 4} title="The size of the window the tensor is averaged over (px): about the width of the structures" onChange={(sigma) => setO({ sigma: sigma > 0 && sigma !== 4 ? sigma : undefined })} />
            <span className="muted">px</span>
          </div>
          <Check label="the image coloured by them" title="The hue the direction (red at ±90°, through yellow, green, cyan, blue, magenta), the saturation the coherency, the brightness the image's" value={!!O.show} onChange={(show) => setO({ show: show || undefined })} />
          {view?.orient && (
            <div className="hint">
              Dominant direction <b>{fmt(view.orient.dominant, 3)}°</b> (counter-clockwise from the x axis) · coherency {fmt(view.orient.coherency, 3)}
            </div>
          )}
        </>
      )}
      <div className="ie-section">Fractal dimension</div>
      <Check label="by box counting" title="Boxes of 1, 2, 4 … px laid over the mask (or its edges), those with any of it counted: D the slope of log N against log 1/size; a sheet Fractal" value={!!F.on} onChange={(on) => setF({ on: on || undefined })} />
      {F.on && (
        <>
          <Select<'edges' | 'mask'>
            value={F.of ?? 'edges'}
            title="Of the edges of the mask (an outline: between 1 and 2), or of the mask itself (an area: up to 2)"
            options={[
              ['edges', 'of the edges of the mask'],
              ['mask', 'of the mask'],
            ]}
            onChange={(of) => setF({ of: of === 'edges' ? undefined : of })}
          />
          {view?.fractal && (
            <div className="hint">
              D = <b>{fmt(view.fractal.D, 4)}</b> (R² {fmt(view.fractal.r2, 4)})
            </div>
          )}
        </>
      )}
    </>
  );
}
