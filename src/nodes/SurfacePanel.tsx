// Surface (Image analysis, AFM): the image as heights (their unit, what one value is), its form taken off (a Level
// step), its areal roughness (ISO 25178) and of its area selections, the roughness along its lines (ISO 4287), the
// histogram of the heights, the PSD, the autocorrelation, the step between two selections: the panel.
import type { SurfaceSpec } from '../image/surface.ts';
import type { SurfaceView } from '../image/node.ts';
import { Check, NumInput, Select } from './ui.tsx';

const fmt = (v: number, d = 4) => (Number.isFinite(v) ? String(+v.toPrecision(d)) : '–');
const Z_UNITS: [string, string][] = [
  ['', 'none'],
  ['pm', 'pm'],
  ['Å', 'Å'],
  ['nm', 'nm'],
  ['µm', 'µm'],
  ['mm', 'mm'],
];

export function SurfacePanel(p: {
  spec: SurfaceSpec;
  set: (s: Partial<SurfaceSpec>) => void;
  u: string; // the calibrated unit
  areas: { id: string; name: string }[]; // the area selections
  view?: SurfaceView;
  levelled: boolean; // a Level step on
  level: () => void; // a Level step added (a plane), shown
  part?: 'heights' | 'areal' | 'profile' | 'step'; // one part (a step of the task Surface; areal: with the distributions); absent: all
}) {
  const S = p.spec;
  const zu = S.zUnit ?? '';
  const Z = (v: number) => `${fmt(v)}${zu ? ` ${zu}` : ''}`;
  const units = Z_UNITS.some(([v]) => v === zu) ? Z_UNITS : [...Z_UNITS, [zu, zu] as [string, string]];
  const heights = (
    <>
      <div className="ie-section">Heights</div>
      <div className="row wrap">
        <span className="muted">1 value =</span>
        <NumInput className="short" min={0} value={S.zScale ?? 1} title="What one value of the image is in the unit of the heights (a height map read: 1; an 8 or 16-bit image: the height of one level)" onChange={(zScale) => p.set({ zScale: zScale > 0 && zScale !== 1 ? zScale : undefined })} />
        <Select<string> value={zu} title="The unit of the heights (a Gwyddion file or a text with its units: read from it)" options={units} onChange={(v) => p.set({ zUnit: v || undefined })} />
      </div>
      {!p.levelled && (
        <div className="row wrap">
          <span className="hint grow">The roughness is from the mean plane: level the image first.</span>
          <button className="nodrag" title="A Level step (Background): a plane fitted and taken off; a polynomial or the highest part left out in its settings" onClick={p.level}>
            Level
          </button>
        </div>
      )}
    </>
  );
  const areal = (
    <>
      {!p.part && <div className="ie-section">Roughness (ISO 25178)</div>}
      <Check label="of the image and of every area selection" title="Sa, Sq (the mean and rms height), Sp, Sv, Sz (the highest peak, the deepest valley, both), Ssk, Sku (the skewness and kurtosis of the heights), Sdq (the rms slope), Sdr (the surface larger than flat, %); a sheet Roughness" value={!!S.areal} onChange={(areal) => p.set({ areal: areal || undefined })} />
      {S.areal &&
        p.view?.areal?.map((r) => (
          <div key={r.name} className="hint">
            <b>{r.name}</b>: Sa {Z(r.Sa)} · Sq {Z(r.Sq)} · Sz {Z(r.Sz)} · Ssk {fmt(r.Ssk, 3)} · Sku {fmt(r.Sku, 3)}
            {Number.isFinite(r.Sdr) ? ` · Sdr ${fmt(r.Sdr, 3)} %` : ''}
          </div>
        ))}
    </>
  );
  const profile = (
    <>
      {!p.part && <div className="ie-section">Profile roughness (ISO 4287)</div>}
      <Check label="along every line selection" title="Ra, Rq, Rp, Rv, Rt, Rz (the mean of the largest height in five parts), Rsk, Rku of the profile from its mean line; a sheet Profile roughness" value={!!S.profile} onChange={(profile) => p.set({ profile: profile || undefined })} />
      {S.profile && (
        <>
          <div className="row wrap">
            <span className="muted">λc</span>
            <NumInput className="short" min={0} value={S.lc ?? NaN} placeholder="none" title={`The cut-off (${p.u}): what is longer than it (the waviness) taken off by a Gaussian filter; none: only the profile's tilt`} onChange={(lc) => p.set({ lc: lc > 0 ? lc : undefined })} />
            <span className="muted">{p.u}</span>
          </div>
          {p.view?.profiles?.length ? (
            p.view.profiles.map((r) => (
              <div key={r.name} className="hint">
                <b>{r.name}</b>: Ra {Z(r.Ra)} · Rq {Z(r.Rq)} · Rz {Z(r.Rz)} · Rt {Z(r.Rt)}
              </div>
            ))
          ) : (
            <div className="hint">Draw a line across the surface (the Line tool).</div>
          )}
        </>
      )}
    </>
  );
  const dists = (
    <>
      <div className="ie-section">Distributions</div>
      <div className="row wrap">
        <Check label="height histogram" title="The histogram of the heights with the material ratio (the Abbott–Firestone curve); a sheet Height histogram" value={!!S.hist} onChange={(hist) => p.set({ hist: hist || undefined })} />
        {S.hist && <NumInput className="short" min={2} step={1} value={S.bins ?? 100} title="The number of bins" onChange={(bins) => p.set({ bins: bins >= 2 && bins !== 100 ? Math.round(bins) : undefined })} />}
      </div>
      <Check label="power spectral density (radial)" title="The power of the heights against the spatial frequency, averaged in rings (∫ PSD 2πk dk = Sq²); a sheet PSD" value={!!S.psd} onChange={(psd) => p.set({ psd: psd || undefined })} />
      <Check label="autocorrelation" title="How alike the heights are at a distance, averaged in rings; the correlation length (where it falls to 1/e), Sal (the shortest distance at which it falls to 0.2) and Str (near 0: a surface of one direction, near 1: the same every way); a sheet ACF" value={!!S.acf} onChange={(acf) => p.set({ acf: acf || undefined })} />
      {S.acf && p.view?.acf && (
        <div className="hint">
          Correlation length {fmt(p.view.acf.lcorr)} {p.u} · Sal {fmt(p.view.acf.Sal)} {p.u} · Str {fmt(p.view.acf.Str, 3)}
        </div>
      )}
    </>
  );
  const step = (
    <>
      {!p.part && <div className="ie-section">Step height</div>}
      {p.areas.length < 2 ? (
        <div className="hint">Draw two area selections: one on the upper level, one on the lower.</div>
      ) : (
        <>
          <div className="row wrap">
            <span className="muted">upper</span>
            <Select<string> value={S.step?.[0] ?? ''} options={[['', 'none'], ...p.areas.map((a): [string, string] => [a.id, a.name])]} onChange={(a) => p.set({ step: a ? [a, S.step?.[1] ?? p.areas.find((x) => x.id !== a)!.id] : undefined })} />
            <span className="muted">lower</span>
            <Select<string> value={S.step?.[1] ?? ''} options={[['', 'none'], ...p.areas.map((a): [string, string] => [a.id, a.name])]} onChange={(b) => p.set({ step: b ? [S.step?.[0] ?? p.areas.find((x) => x.id !== b)!.id, b] : undefined })} />
          </div>
          {p.view?.step && (
            <div className="hint">
              Step <b>{Z(p.view.step.ma - p.view.step.mb)}</b> ({p.view.step.a} {Z(p.view.step.ma)} ± {fmt(p.view.step.sa, 3)}, {p.view.step.b} {Z(p.view.step.mb)} ± {fmt(p.view.step.sb, 3)}); a sheet Step height
            </div>
          )}
        </>
      )}
    </>
  );
  const plot3d = <div className="hint">The matrix output carries the heights (in their unit): a Plot 3D draws them as a surface.</div>;
  if (p.part === 'heights')
    return (
      <>
        {heights}
        {plot3d}
      </>
    );
  if (p.part === 'areal')
    return (
      <>
        {areal}
        {dists}
      </>
    );
  if (p.part === 'profile') return profile;
  if (p.part === 'step') return step;
  return (
    <>
      {heights}
      {areal}
      {profile}
      {dists}
      {step}
      {plot3d}
    </>
  );
}
