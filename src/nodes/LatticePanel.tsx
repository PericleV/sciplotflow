// Lattice (Image analysis, TEM): the spots of the spectrum picked with a click (their d and directions, the angles
// between them; a Bragg filter of them, or them taken out), the fringes' period along the line selections, and a
// diffraction pattern's rings (its centre found, d from the reciprocal size of a pixel, matched with known phases) —
// the panel, and what is drawn over the spectrum (the spots) and over the image (the rings).
import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { planeAngle, PHASES, spotOf, type LatticeSpec } from '../image/lattice.ts';
import type { Pt } from '../image/roi.ts';
import { Check, NumInput, TextInput } from './ui.tsx';

const fmt = (v: number, d = 4) => (Number.isFinite(v) ? String(+v.toPrecision(d)) : '–');

// over the spectrum (N × N, drawn k screen px per its px): the spots and their mirrors; a click: the place clicked (u, v,
// spectrum px from its middle), the spot found there by the worker on the magnitudes
export function SpotsOverlay({ spots, N, k, pick, onClick }: { spots: [number, number][]; N: number; k: number; pick: boolean; onClick: (u: number, v: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const half = N / 2;
  const down = (e: RPointerEvent) => {
    if (!pick || e.button !== 0) return;
    e.stopPropagation();
    const r = svg.current!.getBoundingClientRect();
    const [x, y] = [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
    onClick(x - half, y - half);
  };
  return (
    <svg ref={svg} className={`ie-overlay ie-spots${pick ? ' picking' : ''}`} width={N * k} height={N * k} onPointerDown={down}>
      {spots.map(([fx, fy], i) =>
        [1, -1].map((s) => (
          <g key={`${i}${s}`}>
            <circle cx={(half + s * fx * N) * k} cy={(half + s * fy * N) * k} r={7} />
            {s === 1 && (
              <text x={(half + fx * N) * k + 9} y={(half + fy * N) * k - 6}>
                S{i + 1}
              </text>
            )}
          </g>
        )),
      )}
    </svg>
  );
}

// over the image: a diffraction pattern's centre and its rings, each named by the reflection it matched
export function RingsOverlay({ centre, rings, labels, k, ox, oy, W, H }: { centre: Pt; rings: number[]; labels: string[]; k: number; ox: number; oy: number; W: number; H: number }) {
  const [cx, cy] = [(centre[0] - ox) * k, (centre[1] - oy) * k];
  return (
    <svg className="ie-overlay ie-rings" width={W} height={H}>
      {rings.map((R, i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={R * k} />
          <text x={cx + R * k * Math.SQRT1_2 + 3} y={cy - R * k * Math.SQRT1_2 - 3}>
            R{i + 1}
            {labels[i] ? ` ${labels[i]}` : ''}
          </text>
        </g>
      ))}
      <path d={`M${cx - 8},${cy}H${cx + 8}M${cx},${cy - 8}V${cy + 8}`} className="centre" />
    </svg>
  );
}

export function LatticePanel(p: {
  spec: LatticeSpec;
  set: (s: Partial<LatticeSpec>) => void;
  k: number;
  u: string;
  showing: boolean; // the spectrum shown
  showSpectrum: (on: boolean) => void;
  bragg: (mode: 'keep' | 'remove') => void;
  fringes?: { name: string; period: number; count: number }[];
  rings?: { R: number; label: string }[];
  ringRows?: { d: number; phase: string; hkl: string; err: number }[];
  centre?: Pt;
  part?: 'spots' | 'fringes' | 'rings'; // one part (a step of the task Lattice); absent: all
}) {
  const spots = (p.spec.spots ?? []).map(([fx, fy]) => spotOf(fx, fy));
  const L = (v: number) => `${fmt(v * p.k)} ${p.u}`;
  const spotsPart = (
    <>
      {!p.part && <div className="ie-section">Spots of the spectrum</div>}
      <Check label="show the spectrum" title="The image's FFT spectrum shown (Image ▸ View): click its spots to measure them" value={p.showing} onChange={p.showSpectrum} />
      <div className="hint">{p.showing ? 'Click a spot of the spectrum: it is moved onto its brightest place, its mirror taken with it.' : 'Show the spectrum, then click its spots.'}</div>
      {spots.map((s, i) => (
        <div key={i} className="row">
          <span className="grow">
            <b>S{i + 1}</b> d = {L(s.d)} · {fmt(s.angle, 3)}°
          </span>
          <button className="nodrag" title="This spot forgotten" onClick={() => p.set({ spots: (p.spec.spots ?? []).filter((_, j) => j !== i) })}>
            ✕
          </button>
        </div>
      ))}
      {spots.length > 1 && (
        <div className="hint">
          Angles between their planes:{' '}
          {spots
            .flatMap((a, i) => spots.slice(i + 1).map((b, j) => `S${i + 1}–S${i + j + 2} ${fmt(planeAngle(a, b), 3)}°`))
            .join(' · ')}
        </div>
      )}
      {spots.length > 0 && (
        <div className="row wrap">
          <button className="nodrag" title="A Spectrum mask step keeping only these spots: the lattice alone, its fringes clean (a Bragg filter)" onClick={() => p.bragg('keep')}>
            Bragg filter
          </button>
          <button className="nodrag" title="A Spectrum mask step taking these spots out (a periodic noise, a moiré)" onClick={() => p.bragg('remove')}>
            Take them out
          </button>
          <button className="nodrag" onClick={() => p.set({ spots: undefined })}>
            Clear
          </button>
        </div>
      )}
    </>
  );
  const fringesPart = (
    <>
      {!p.part && <div className="ie-section">Fringes</div>}
      <Check label="the period along every line" title="Along every line selection drawn across the fringes: the period of its profile (its strongest frequency) and how many fringes; a sheet Fringes" value={!!p.spec.fringes} onChange={(fringes) => p.set({ fringes: fringes || undefined })} />
      {p.spec.fringes &&
        (p.fringes?.length ? (
          p.fringes.map((f) => (
            <div key={f.name} className="hint">
              {f.name}: period <b>{fmt(f.period)} {p.u}</b> ({fmt(f.count, 3)} fringes)
            </div>
          ))
        ) : (
          <div className="hint">Draw a line across the fringes (the Line tool), as long as it can be.</div>
        ))}
    </>
  );
  const ringsPart = (
    <>
      {!p.part && <div className="ie-section">Diffraction rings (SAED)</div>}
      <Check label="the image is a diffraction pattern" title="Its centre found where it is symmetric, its radial profile, the rings in it; their d from the reciprocal size of a pixel, matched with the phases ticked; sheets Rings and Radial profile" value={!!p.spec.saed} onChange={(saed) => p.set({ saed: saed || undefined })} />
      {p.spec.saed && (
        <>
          <div className="row wrap">
            <span className="muted">1 px =</span>
            <NumInput className="short" min={0} value={p.spec.recip ?? NaN} placeholder="none" title={`The size of a pixel of the pattern in reciprocal units (1/${p.u}), from the camera length`} onChange={(recip) => p.set({ recip: recip > 0 ? recip : undefined })} />
            <span className="muted">1/{p.u}</span>
          </div>
          {p.centre && (
            <div className="hint">
              Centre at x {fmt(p.centre[0], 5)}, y {fmt(p.centre[1], 5)} px {p.spec.centre ? '(set)' : '(found)'}
              {p.spec.centre && (
                <button className="nodrag" onClick={() => p.set({ centre: undefined })}>
                  Find it
                </button>
              )}
            </div>
          )}
          <div className="ie-shapes">
            {Object.keys(PHASES).map((ph) => (
              <Check key={ph} label={ph} title={`The reflections of ${ph} (a = ${PHASES[ph].a} nm, ${PHASES[ph].kind})`} value={(p.spec.phases ?? []).includes(ph)} onChange={(on) => p.set({ phases: on ? [...(p.spec.phases ?? []), ph] : (p.spec.phases ?? []).filter((x) => x !== ph) })} />
            ))}
          </div>
          <div className="row wrap">
            <span className="muted">d of my own</span>
            <TextInput value={p.spec.own ?? ''} placeholder={`e.g. 0.235, 0.204 (${p.u})`} onChange={(own) => p.set({ own: own.trim() ? own : undefined })} />
          </div>
          {(p.ringRows ?? []).map((r, i) => (
            <div key={i} className="hint">
              R{i + 1}: d = {Number.isFinite(r.d) ? `${fmt(r.d)} ${p.u}` : '– (give 1 px = … above)'}
              {r.phase ? ` · ${r.phase} ${r.hkl} (${fmt(r.err, 2)} %)` : ''}
            </div>
          ))}
        </>
      )}
    </>
  );
  if (p.part === 'spots') return spotsPart;
  if (p.part === 'fringes') return fringesPart;
  if (p.part === 'rings') return ringsPart;
  return (
    <>
      {spotsPart}
      {fringesPart}
      {ringsPart}
    </>
  );
}
