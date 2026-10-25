// Structure (Image analysis): the network of the mask drawn over the image (its branches coloured by their length,
// thickness or type, its junctions and free ends) and its panel — the settings, the tools to change it by hand (select,
// draw, erase, add a node; a node dragged moves it, dropped on another merges them), the ligament picked explained
// (its path, the inscribed circles its thickness is read from, how its length is made), the cut learnt from the edits.
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { branchAt, learnRatio, midOf, NETWORK_DEFAULTS, type HandKind, type NetBranch, type NetworkResult, type NetworkSettings, type NetworkSpec } from '../image/network.ts';
import type { Pt } from '../image/roi.ts';
import { Check, NumInput, Select } from './ui.tsx';

export type NetTool = 'select' | 'draw' | 'erase' | 'node';
// (the pointer kept by the element pressed while it moves; none when the event is not a real pointer's)
const capture = (e: RPointerEvent) => {
  try {
    (e.target as Element).setPointerCapture?.(e.pointerId);
  } catch {
    // (no pointer of that id)
  }
};
const TYPE_COLOR: Record<NetBranch['type'], string> = { junction: '#30d158', end: '#ff9f0a', free: '#bf5af2', loop: '#64d2ff' };
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? String(+v.toPrecision(d)) : '–');

// the colour of a branch: by its type, or its length / thickness from blue (least) to red (most)
function colourer(net: NetworkResult, by: NonNullable<NetworkSpec['colorBy']>) {
  if (by === 'type') return { of: (b: NetBranch) => TYPE_COLOR[b.type], lo: NaN, hi: NaN };
  const val = (b: NetBranch) => (by === 'length' ? b.length : b.diameter);
  const vs = net.branches.filter((b) => b.counted).map(val).filter(Number.isFinite).sort((a, b) => a - b);
  const lo = vs[Math.floor(vs.length * 0.02)] ?? 0;
  const hi = vs[Math.floor(vs.length * 0.98)] ?? 1;
  return { of: (b: NetBranch) => `hsl(${240 - 240 * Math.max(0, Math.min(1, (val(b) - lo) / (hi - lo || 1)))}, 90%, 55%)`, lo, hi };
}

export function NetworkOverlay(p: {
  net: NetworkResult;
  spec: NetworkSpec;
  k: number;
  ox: number;
  oy: number;
  W: number;
  H: number;
  tool: NetTool;
  sel: Pt | null;
  eraseR: number;
  onSelect: (p: Pt | null) => void;
  onEdit: (kind: HandKind, v: unknown) => void;
}) {
  const { net, k, ox, oy } = p;
  const s = { ...NETWORK_DEFAULTS, ...p.spec };
  const at = ([x, y]: Pt) => `${((x - ox) * k).toFixed(1)},${((y - oy) * k).toFixed(1)}`;
  const nodeXY = (id: number): Pt => [net.nodes[id]?.x ?? NaN, net.nodes[id]?.y ?? NaN];
  const line = (b: NetBranch) => [nodeXY(b.a), ...b.path, nodeXY(b.b)].map(at).join(' ');
  const col = colourer(net, s.colorBy);
  const picked = branchAt(net, p.sel);
  const svg = useRef<SVGSVGElement>(null);
  // (a stroke drawn or erased, a node dragged: in pixels of the image)
  const [stroke, setStroke] = useState<Pt[] | null>(null);
  const [dragging, setDragging] = useState<{ id: number; to: Pt } | null>(null);
  const imgOf = (e: RPointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / k + ox, (e.clientY - r.top) / k + oy];
  };
  const drawing = p.tool === 'draw' || p.tool === 'erase';
  const down = (e: RPointerEvent) => {
    if (!drawing || e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    setStroke([imgOf(e)]);
  };
  const move = (e: RPointerEvent) => {
    if (stroke) {
      const q = imgOf(e);
      const last = stroke[stroke.length - 1];
      if (Math.hypot(q[0] - last[0], q[1] - last[1]) * k > 3) setStroke([...stroke, q]);
    } else if (dragging) setDragging({ ...dragging, to: imgOf(e) });
  };
  const up = () => {
    if (stroke) {
      if (p.tool === 'draw' && stroke.length > 1) p.onEdit('add', stroke);
      if (p.tool === 'erase') p.onEdit('erase', { pts: stroke, r: p.eraseR });
      setStroke(null);
    }
    if (dragging) {
      const from = nodeXY(dragging.id);
      const onto = net.nodes.find((n) => n.id !== dragging.id && Math.hypot(n.x - dragging.to[0], n.y - dragging.to[1]) * k < 8);
      if (onto) p.onEdit('merge', [from, [onto.x, onto.y]]);
      else if (Math.hypot(dragging.to[0] - from[0], dragging.to[1] - from[1]) * k > 3) p.onEdit('move', [from, dragging.to]);
      setDragging(null);
    }
  };
  const branchDown = (e: RPointerEvent, b: NetBranch) => {
    if (e.button !== 0 || drawing) return;
    e.stopPropagation();
    if (p.tool === 'node') p.onEdit('split', imgOf(e));
    else p.onSelect(midOf(b));
  };
  return (
    <svg ref={svg} className={`ie-overlay ie-net${drawing ? ' drawing' : ''}`} width={p.W} height={p.H} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      {net.branches.map((b) => (
        <g key={b.id} className={`ie-net-branch${b.counted ? '' : ' faint'}${b.edge ? ' edge' : ''}`}>
          <polyline points={line(b)} style={{ stroke: col.of(b) }} />
          <polyline points={line(b)} className="ie-net-hit" onPointerDown={(e) => branchDown(e, b)}>
            <title>{`L${b.id + 1}: ${fmt(b.length)} px long, ${fmt(b.diameter)} px thick`}</title>
          </polyline>
        </g>
      ))}
      {picked && (
        <g className="ie-net-picked">
          <polyline points={line(picked)} />
          {picked.circles.map((c, j) => (
            <circle key={j} cx={(c.x - ox) * k} cy={(c.y - oy) * k} r={c.r * k} />
          ))}
        </g>
      )}
      {net.nodes.map((n) => {
        const [x, y] = dragging?.id === n.id ? dragging.to : [n.x, n.y];
        return (
          <circle
            key={n.id}
            className={`ie-net-node${n.degree >= 3 || n.hand ? ' junction' : ' end'}`}
            cx={(x - ox) * k}
            cy={(y - oy) * k}
            r={n.degree >= 3 || n.hand ? 3.5 : 2.5}
            onPointerDown={(e) => {
              if (e.button !== 0 || drawing) return;
              e.stopPropagation();
              capture(e);
              setDragging({ id: n.id, to: [n.x, n.y] });
            }}
          >
            <title>{`J${n.id + 1}: ${n.degree} branch${n.degree === 1 ? '' : 'es'} (drag: move it; drop it on another node: merge them)`}</title>
          </circle>
        );
      })}
      {stroke && <polyline className={`ie-net-stroke${p.tool === 'erase' ? ' erase' : ''}`} points={stroke.map(at).join(' ')} style={p.tool === 'erase' ? { strokeWidth: 2 * p.eraseR * k } : undefined} />}
    </svg>
  );
}

export function NetworkPanel(p: {
  net: NetworkResult | undefined;
  error?: string;
  spec: NetworkSpec;
  set: (s: Partial<NetworkSpec>) => void;
  k: number;
  u: string;
  tool: NetTool;
  setTool: (t: NetTool) => void;
  sel: Pt | null;
  setSel: (p: Pt | null) => void;
  eraseR: number;
  setEraseR: (r: number) => void;
  onEdit: (kind: HandKind, v: unknown) => void;
  toggle: (kind: 'keep' | 'excl', b: NetBranch) => void;
  undo: () => void;
}) {
  const s = { ...NETWORK_DEFAULTS, ...p.spec };
  const hand = p.spec.hand ?? {};
  const edits = hand.order?.length ?? 0;
  const net = p.net;
  const [msg, setMsg] = useState('');
  const b = branchAt(net, p.sel);
  const L = (v: number) => `${fmt(v * p.k)} ${p.u}`;
  const counted = net?.branches.filter((q) => q.counted) ?? [];
  const med = (v: number[]) => (v.length ? [...v].sort((x, y) => x - y)[v.length >> 1] : NaN);
  const col = net && s.colorBy !== 'type' ? colourer(net, s.colorBy) : null;
  const learn = () => {
    const r = learnRatio(net?.examples ?? []);
    if (!r) return setMsg('Delete a few spurs (and keep a few short branches) first: the cut is learnt from them.');
    p.set({ prune: 'ratio', ratio: r.ratio });
    setMsg(`Learnt: an end branch shorter than ${fmt(r.ratio)} × the thickness at its junction is a spur (${r.right} of your ${r.of} edits agree).`);
  };
  const tools: [NetTool, string, string][] = [
    ['select', 'Select', 'Click a branch: how it is measured; Delete removes it. Drag a node: move it; drop it on another: merge them'],
    ['draw', 'Draw', 'Draw a branch that is missing (its ends joined to the skeleton near them)'],
    ['erase', 'Erase', 'Erase a piece of the skeleton'],
    ['node', 'Add node', 'Click a branch: a node there (the branch made two ligaments)'],
  ];
  return (
    <>
      <div className="ie-section">Network</div>
      <Check label="find the network of the mask" title="The last mask of the steps (a threshold, a trainable classifier) thinned to its skeleton: its ligaments, junctions and pores measured, in the workbook (sheets Network, Ligaments, Junctions, Pores)" value={!!p.spec.on} onChange={(on) => p.set({ on: on || undefined })} />
      {p.error && <div className="msg warn">{p.error}</div>}
      {p.spec.on && (
        <>
          <div className="ie-params">
            <span className="ie-label">Spurs</span>
            <span className="row">
              <Select<NonNullable<NetworkSpec['prune']>>
                value={s.prune}
                title="The short branches to a free end (from the bumps of the outline) cut: shorter than a share of the thickness at their junction, shorter than a length, or none"
                options={[
                  ['ratio', 'shorter than × thickness'],
                  ['length', 'shorter than'],
                  ['off', 'none cut'],
                ]}
                onChange={(prune) => p.set({ prune })}
              />
              {s.prune === 'ratio' && <NumInput className="short" min={0} step={0.1} value={s.ratio} onChange={(ratio) => p.set({ ratio: ratio > 0 ? ratio : undefined })} />}
              {s.prune === 'length' && <NumInput className="short" min={0} value={+(s.length * p.k).toPrecision(6)} title={`In ${p.u}`} onChange={(v) => p.set({ length: v > 0 ? v / p.k : undefined })} />}
            </span>
            <span className="ie-label">Length</span>
            <Select<NonNullable<NetworkSpec['measure']>>
              value={s.measure}
              title="The ligament length of the statistics: between the centres of its junctions, or between their surfaces (their radii taken off); the table gives both"
              options={[
                ['centre', 'centre to centre'],
                ['surface', 'surface to surface'],
              ]}
              onChange={(measure) => p.set({ measure })}
            />
            <span className="ie-label">Edge</span>
            <Select<NonNullable<NetworkSpec['edge']>> seg
              value={s.edge}
              title="The branches touching the image's edge (cut by it): left out of the statistics, or counted"
              options={[
                ['exclude', 'left out'],
                ['keep', 'counted'],
              ]}
              onChange={(edge) => p.set({ edge })}
            />
            <span className="ie-label">Colour</span>
            <Select<NonNullable<NetworkSpec['colorBy']>>
              value={s.colorBy}
              options={[
                ['length', 'by length'],
                ['diameter', 'by thickness'],
                ['type', 'by type'],
              ]}
              onChange={(colorBy) => p.set({ colorBy })}
            />
          </div>
          {col && (
            <div className="row ie-net-scale">
              <span className="muted">{L(col.lo)}</span>
              <span className="ie-net-bar" />
              <span className="muted">{L(col.hi)}</span>
            </div>
          )}
          {s.colorBy === 'type' && <div className="hint">green: between junctions (ligaments) · orange: to a free end · violet: free</div>}
          {net && (
            <div className="hint">
              {counted.length} ligament{counted.length === 1 ? '' : 's'} counted, {net.nodes.filter((n) => n.degree >= 3).length} junctions, {net.pruned} spur{net.pruned === 1 ? '' : 's'} cut · median {L(med(counted.map((q) => (s.measure === 'surface' ? q.surface : q.length))))} long, {L(med(counted.map((q) => q.diameter).filter(Number.isFinite)))} thick
            </div>
          )}
          <div className="ie-section">By hand</div>
          <div className="row wrap">
            {tools.map(([t, label, title]) => (
              <button key={t} className={`nodrag${p.tool === t ? ' on' : ''}`} title={title} onClick={() => p.setTool(t)}>
                {label}
              </button>
            ))}
            {p.tool === 'erase' && (
              <>
                <span className="muted">width</span>
                <NumInput className="short" min={0.5} step={0.5} value={p.eraseR * 2} title="The eraser's width (px of the image)" onChange={(v) => p.setEraseR(v > 0 ? v / 2 : 1.5)} />
              </>
            )}
          </div>
          <div className="row wrap">
            <button className="nodrag" disabled={!edits} title="The last change by hand undone" onClick={p.undo}>
              Undo
            </button>
            <button className="nodrag" disabled={!edits} title="Every change by hand undone: the network as found" onClick={() => p.set({ hand: undefined })}>
              Reset hand edits{edits ? ` (${edits})` : ''}
            </button>
            <button className="nodrag" disabled={!net?.examples.some((e) => e.cut)} title="The cut of the spurs learnt from the spurs you deleted (and the short end branches you kept), then used on the whole image" onClick={learn}>
              Learn from my edits
            </button>
          </div>
          {msg && <div className="hint">{msg}</div>}
          {b && net ? (
            <Explain b={b} net={net} k={p.k} u={p.u} spec={s} onDelete={() => (p.onEdit('del', midOf(b)), p.setSel(null))} onToggle={(kind) => p.toggle(kind, b)} onClose={() => p.setSel(null)} />
          ) : (
            p.spec.on && <div className="hint">Select, then click a branch: how it was measured.</div>
          )}
        </>
      )}
    </>
  );
}

// how a branch was measured: its length step by step, its thickness from the circles drawn on it
function Explain({ b, net, k, u, spec, onDelete, onToggle, onClose }: { b: NetBranch; net: NetworkResult; k: number; u: string; spec: NetworkSettings & NetworkSpec; onDelete: () => void; onToggle: (kind: 'keep' | 'excl') => void; onClose: () => void }) {
  const A = net.nodes[b.a];
  const B = net.nodes[b.b];
  const L = (v: number) => `${fmt(v)} px${k !== 1 ? ` = ${fmt(v * k)} ${u}` : ''}`;
  const TYPE = { junction: 'between two junctions (a ligament)', end: 'from a junction to a free end', free: 'between two free ends', loop: 'a loop' };
  const ja = (A?.degree ?? 0) >= 3 || !!A?.hand;
  const jb = (B?.degree ?? 0) >= 3 || !!B?.hand;
  return (
    <div className="ie-net-explain">
      <div className="row">
        <b className="grow">
          L{b.id + 1}: {TYPE[b.type]}, J{b.a + 1} to J{b.b + 1}
        </b>
        <button className="nodrag" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="hint">
        Length along its skeleton: {b.steps.straight} straight steps × 1 px + {b.steps.diagonal} diagonal steps × 1.414 px + {fmt(b.steps.ends)} px from its ends to the centres of its nodes = <b>{L(b.length)}</b> (centre to centre).
      </div>
      {(ja || jb) && (
        <div className="hint">
          Minus the radii of its junctions ({ja ? `${fmt(A.r)} px` : 'none'} + {jb ? `${fmt(B.r)} px` : 'none'}, the largest circles inside them) = <b>{L(b.surface)}</b> (surface to surface).
        </div>
      )}
      <div className="hint">
        Thickness: {b.circles.length} circle{b.circles.length === 1 ? '' : 's'} drawn on its middle, away from its junctions, each touching the edge; diameter = 2 × the distance to the edge (the pixel counted once). Median <b>{L(b.diameter)}</b>, mean {L(b.mean)}, neck {L(b.neck)}.
      </div>
      <div className="hint">
        Straightness {fmt(b.straight)} (end to end over the length) · direction {fmt(b.angle)}° · {b.counted ? 'counted in the statistics' : `not counted (${b.excl ? 'left out by hand' : b.edge && spec.edge === 'exclude' ? 'on the edge' : 'not between two junctions'})`}
      </div>
      <div className="row wrap">
        <button className="nodrag danger" title="Remove this branch (Delete)" onClick={onDelete}>
          Delete
        </button>
        <button className={`nodrag${b.keep ? ' on' : ''}`} title="Never cut as a spur (an example for Learn from my edits)" onClick={() => onToggle('keep')}>
          Keep
        </button>
        <button className={`nodrag${b.excl ? ' on' : ''}`} title="Left out of the statistics (still drawn, faint)" onClick={() => onToggle('excl')}>
          Leave out
        </button>
      </div>
    </div>
  );
}
