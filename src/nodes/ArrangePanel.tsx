// Arrangement (Image analysis ▸ Objects): how the particles lie — its settings and its numbers in the panel, and over the
// image (a toggle) the line from every particle to its nearest (coloured by its length), the Delaunay links, or the
// Voronoi cells (coloured by their neighbours: 5 red, 6 green, 7 blue). The tables go to the workbook, for the other
// nodes (Histogram, Plot, the statistics).
import { ARRANGE_DEFAULTS, type ArrangeResult, type ArrangeSpec } from '../image/arrangement.ts';
import { Check, NumInput, Select } from './ui.tsx';

const fmt = (v: number, d = 3) => (Number.isFinite(v) ? String(+v.toPrecision(d)) : '–');
// a length from blue (least) to red (most)
const hue = (v: number, lo: number, hi: number) => `hsl(${240 - 240 * Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)))}, 90%, 55%)`;
// a Voronoi cell by its neighbours: the defects of a hexagonal packing stand out
const SIDES: Record<number, string> = { 4: '#bf5af2', 5: '#ff453a', 6: '#30d158', 7: '#0a84ff', 8: '#64d2ff' };

export function ArrangeOverlay({ res, spec, k, W, H }: { res: ArrangeResult; spec: ArrangeSpec; k: number; W: number; H: number }) {
  const s = { ...ARRANGE_DEFAULTS, ...spec };
  const P = res.pts;
  const at = ([x, y]: [number, number]) => `${(x * k).toFixed(1)},${(y * k).toFixed(1)}`;
  const nnd = res.rows.map((r) => r.nnd).filter(Number.isFinite);
  const [lo, hi] = [Math.min(...nnd), Math.max(...nnd)];
  return (
    <svg className="ie-overlay ie-arrange" width={W} height={H}>
      {s.show === 'voronoi' &&
        res.cells.map((c, i) => (c ? <polygon key={i} points={c.map(at).join(' ')} className={res.rows[i].onEdge ? 'cut' : ''} style={{ fill: SIDES[res.rows[i].coord] ?? '#8e8e93', stroke: '#ffffff' }} /> : null))}
      {s.show === 'delaunay' && res.links.map(([a, b], i) => <line key={i} x1={P[a][0] * k} y1={P[a][1] * k} x2={P[b][0] * k} y2={P[b][1] * k} className="link" />)}
      {s.show === 'nearest' &&
        res.rows.map((r, i) =>
          r.nearest < 0 ? null : (
            <g key={i}>
              <line x1={P[i][0] * k} y1={P[i][1] * k} x2={P[r.nearest][0] * k} y2={P[r.nearest][1] * k} className="near" style={{ stroke: hue(r.nnd, lo, hi) }} />
              {s.labels && (
                <text x={((P[i][0] + P[r.nearest][0]) / 2) * k} y={((P[i][1] + P[r.nearest][1]) / 2) * k - 2} className="label">
                  {fmt(r.nnd)}
                </text>
              )}
            </g>
          ),
        )}
    </svg>
  );
}

export function ArrangePanel(p: { spec: ArrangeSpec; set: (s: Partial<ArrangeSpec>) => void; res?: ArrangeResult; error?: string; groups: string[]; k: number; u: string }) {
  const s = { ...ARRANGE_DEFAULTS, ...p.spec };
  const m = p.res?.summary;
  const L = (v: number) => `${fmt(v * p.k)} ${p.u}`;
  const nnd = p.res ? p.res.rows.map((r) => r.nnd).filter(Number.isFinite) : [];
  const pattern = !m || !Number.isFinite(m.R) ? '' : m.p >= 0.05 ? 'random' : m.R < 1 ? 'clustered' : 'regular';
  return (
    <>
      <div className="ie-section">Arrangement</div>
      <Check
        label="how the particles lie"
        title="The particles found: every one's nearest (centre to centre, edge to edge), its k nearest, its Delaunay neighbours, its Voronoi cell, ψ6, its cluster; of all of them Clark–Evans R (with z and p), g(r), Ripley's L(r) − r with the band at random. In the workbook: the sheets Arrangement, Neighbours, g(r), Ripley L, NND distribution (for Histogram, Plot, the statistics nodes)"
        value={!!p.spec.on}
        onChange={(on) => p.set({ on: on || undefined })}
      />
      {p.error && <div className="msg warn">{p.error}</div>}
      {p.spec.on && (
        <>
          <div className="ie-params">
            <span className="ie-label">Of</span>
            <Select<string> value={p.spec.group ?? ''} title="The particles of one group, or all" options={[['', 'every particle'], ...p.groups.map((g): [string, string] => [g, g])]} onChange={(group) => p.set({ group: group || undefined })} />
            <span className="ie-label">Show</span>
            <span className="row">
              <Select<NonNullable<ArrangeSpec['show']>>
                value={s.show}
                title="Over the image: the line to every particle's nearest (coloured by its length), the Delaunay links (the particles that face each other), the Voronoi cells (coloured by their neighbours: 5 red, 6 green, 7 blue), or nothing"
                options={[
                  ['nearest', 'nearest'],
                  ['delaunay', 'Delaunay'],
                  ['voronoi', 'Voronoi'],
                  ['off', 'nothing'],
                ]}
                onChange={(show) => p.set({ show })}
              />
              {s.show === 'nearest' && <Check label="lengths" title="The distance written on every line" value={s.labels} onChange={(labels) => p.set({ labels: labels || undefined })} />}
            </span>
            <span className="ie-label">k nearest</span>
            <NumInput className="short" min={1} step={1} value={s.k} title="The mean distance to this many nearest (a column of Neighbours)" onChange={(k) => p.set({ k: k >= 1 ? Math.round(k) : undefined })} />
            <span className="ie-label">Cluster gap</span>
            <NumInput className="short" min={0} value={+(s.gap * p.k).toPrecision(6)} title={`Particles this near, edge to edge (${p.u}), are one cluster (0: touching)`} onChange={(v) => p.set({ gap: v >= 0 ? v / p.k : undefined })} />
            <span className="ie-label">Up to r</span>
            <NumInput className="short" min={0} value={s.rmax > 0 ? +(s.rmax * p.k).toPrecision(6) : NaN} placeholder="auto" title={`The largest r of g(r) and L(r) (${p.u}; empty: a quarter of the shorter side)`} onChange={(v) => p.set({ rmax: v > 0 ? v / p.k : undefined })} />
          </div>
          {s.show === 'nearest' && nnd.length > 0 && (
            <div className="row ie-net-scale">
              <span className="muted">{L(Math.min(...nnd))}</span>
              <span className="ie-net-bar" />
              <span className="muted">{L(Math.max(...nnd))}</span>
            </div>
          )}
          {s.show === 'voronoi' && <div className="hint">cells: 5 neighbours red, 6 green, 7 blue (hatched: cut by the edge)</div>}
          {m && (
            <div className="hint">
              {m.n} particles, <b>{pattern}</b> (Clark–Evans R {fmt(m.R)}, p {m.p < 0.001 ? '< 0.001' : fmt(m.p, 2)}) · nearest {L(m.nnd)} ± {L(m.nndSd)}, edge to edge {L(m.edge)} · {fmt(m.coord)} neighbours, ψ6 {fmt(m.psi6, 2)} · {m.clusters} cluster{m.clusters === 1 ? '' : 's'} ({fmt(100 * m.isolated, 3)} % alone){Number.isFinite(m.peak) ? ` · g(r) peak at ${L(m.peak)}` : ''}
            </div>
          )}
          <div className="hint">The tables (Neighbours, g(r), Ripley L, NND distribution) are in the workbook: a Histogram or a Plot of them.</div>
        </>
      )}
    </>
  );
}
