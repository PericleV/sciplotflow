// The trainable classifier's step in the Image analysis editor: its classes (a click on one picks it: what is drawn is
// painted with it), the tools that paint (Fill: the inside of an outline drawn; Brush: under its circle; Eraser: the
// paint under its circle taken away), Live update, the class the mask is made of, the particles found made examples of
// the object, its trees, smoothing, the edges made from the outlines and the output.
import { useState } from 'react';
import { Brush, Eraser, PenTool, X } from 'lucide-react';
import { STEP_DEFS, stepClasses, targetClass, type ImgStep } from '../image/steps.ts';
import type { Roi } from '../image/roi.ts';
import type { StepHist } from '../image/imageWorker.ts';
import { ParamField } from './ImageParams.tsx';
import { Check, Select, TextInput } from './ui.tsx';
import { classColor, edgeClassOf } from '../image/classify.ts';
import { IC } from './iconProps.ts';

export type PaintTool = 'fill' | 'brush' | 'eraser';

// painted: the pixels painted of every class; live: the classifier learns at the end of every stroke, else at Update now
// (pending: something painted since)
export function ClassifierEditor({ s, set, rois, sel, setRois, note, hist, paint, setPaint, tool, setTool, brush, setBrush, painted, clearPaint, live, setLive, pending, updateNow }: { s: ImgStep; set: (p: Partial<ImgStep['p']>) => void; rois: Roi[]; sel: string | null; setRois: (r: Roi[]) => void; note?: string; hist?: StepHist; paint: string | null; setPaint: (c: string | null, t?: PaintTool) => void; tool: PaintTool; setTool: (t: PaintTool) => void; brush: number; setBrush: (w: number) => void; painted: Record<string, number>; clearPaint: (cls: string) => void; live: boolean; setLive: (on: boolean) => void; pending: boolean; updateNow: () => void }) {
  const [name, setName] = useState('');
  const classes = stepClasses(s, rois);
  const target = targetClass(s, classes);
  const picked = rois.find((r) => r.id === sel);
  const color = (c: string) => classColor(classes, c);
  const count = (c: string) => rois.filter((r) => r.train === c).length;
  const px = (c: string) => painted[c] ?? 0;
  const pxText = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k px` : `${n} px`);
  // (a particle found made an example: kept when the particles are found again)
  const give = (c: string) => picked && setRois(rois.map((r) => (r.id === picked.id ? { ...r, train: c, color: color(c), role: undefined, bg: undefined, auto: undefined } : r)));
  const addClass = () => {
    const n = name.trim().replace(/,/g, ' ');
    if (n && !classes.includes(n)) set({ classes: [...classes, n].join(',') });
    setName('');
  };
  // (a step of an older project has no edges from the outlines)
  const ring = Number(s.p.edges ?? 0);
  const edgeCls = edgeClassOf(classes);
  const unsure = s.p.output === 'uncertainty';
  // the particles found (Find particles, Find like this) made examples of the object: their outlines, and with Edges
  // from outlines the ring around them
  const found = rois.filter((r) => r.auto);
  const useFound = () => setRois(rois.map((r) => (r.auto ? { ...r, train: target, color: color(target), auto: undefined, group: undefined } : r)));
  const toolBtn = (t: PaintTool, icon: React.ReactNode, label: string, title: string) => (
    <button className={`nodrag${tool === t && paint ? ' on' : ''}`} title={title} onClick={() => (setTool(t), !paint && setPaint(t === 'eraser' ? classes[0] : target, t))}>
      {icon} {label}
    </button>
  );
  return (
    <div className="ie-classifier">
      <div className="hint">
        Click a class (or press 1, 2, 3 …), then paint on the image: Brush paints under its circle, Fill paints the inside of what you draw around, Eraser takes the paint away under its circle. Its size: the slider, [ and ], or Alt and the wheel. The classifier learns when a stroke ends. Edge needs nothing painted: the ring around every particle painted, and the gap between touching ones, is learnt by itself; only where two particles still come out joined, brush a short line across the gap between them. Esc: stop painting.
      </div>
      <div className="row ie-paint-tools">
        {toolBtn('fill', <PenTool {...IC} />, 'Fill', 'Draw around a particle (or a piece of the ground): its inside painted the class picked')}
        {toolBtn('brush', <Brush {...IC} />, 'Brush', 'Paints the class picked under its circle (for the edge: a short line across a gap)')}
        {toolBtn('eraser', <Eraser {...IC} />, 'Eraser', 'Takes the paint away under its circle (and an example drawn as a selection it touches)')}
      </div>
      <div className="row ie-paint-width" title="The size of the brush and the eraser (pixels of the image; also [ and ], or Alt and the wheel)">
        <span className="muted">size</span>
        <input className="nodrag grow" type="range" min={1} max={100} step={1} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
        <span className="muted">{brush} px</span>
      </div>
      <div className="row wrap">
        <Check label="Live update" title="The classifier learns at the end of every stroke; off: only at Update now (paint a lot, then learn once)" value={live} onChange={setLive} />
        {!live && (
          <button className="nodrag" disabled={!pending} title="The classifier learns from all that is painted now" onClick={updateNow}>
            Update now
          </button>
        )}
      </div>
      {classes.map((c, j) => (
        <div key={c} className={`row ie-class-row${paint === c ? ' on' : ''}`} title={`Click: draw ${c}${j < 9 ? ` (key ${j + 1})` : ''}; again: stop`} onClick={() => setPaint(paint === c ? null : c)}>
          <span className="ie-class-dot" style={{ background: color(c) }} />
          <b className="grow ellipsis">{c}</b>
          <span className="muted" title={`${pxText(px(c))} painted, ${count(c)} example${count(c) === 1 ? '' : 's'} drawn as selections${c === edgeCls && ring > 0 ? `, and a ring of ${ring} px around every ${target} painted` : ''}`}>
            {c === edgeCls && ring > 0 ? `auto: ring ${ring} px${px(c) || count(c) ? ` + ${px(c) ? pxText(px(c)) : count(c)}` : ''}` : px(c) ? `${pxText(px(c))}${count(c) ? ` + ${count(c)}` : ''}` : count(c)}
          </span>
          {px(c) > 0 && (
            <button className="nodrag ts-btn" title={`Take away all the paint of ${c}`} onClick={(e) => (e.stopPropagation(), clearPaint(c))}>
              <Eraser {...IC} />
            </button>
          )}
          <button className="nodrag" disabled={!picked} title={picked ? `${picked.name}: an example of ${c}` : 'Pick a selection on the image first'} onClick={(e) => (e.stopPropagation(), give(c))}>
            + picked
          </button>
          <button className="nodrag ts-btn" disabled={count(c) > 0 || px(c) > 0 || classes.length <= 2} title="Remove the class (when it has no examples, nothing painted)" onClick={(e) => (e.stopPropagation(), set({ classes: classes.filter((x) => x !== c).join(','), ...(s.p.target === c ? { target: '' } : {}) }))}>
            <X {...IC} />
          </button>
        </div>
      ))}
      <div className="row">
        <TextInput className="grow" value={name} placeholder="another class (debris …)" onChange={setName} />
        <button className="nodrag" disabled={!name.trim()} onClick={addClass}>
          Add class
        </button>
      </div>
      <div className="row">
        <span className="muted">Mask of</span>
        <Select<string> value={target} title="The class the mask is made of (its pixels: 1)" options={classes.map((c): [string, string] => [c, c])} onChange={(t) => set({ target: t })} />
      </div>
      {found.length > 0 && (
        <button className="nodrag" title={`The ${found.length} particles found (Find particles, Find like this) made examples of ${target}: their outlines, and the ring around them as the edge`} onClick={useFound}>
          Use the {found.length} particles found as {target} examples
        </button>
      )}
      {picked?.train && (
        <div className="row wrap">
          <span className="muted">
            {picked.name}: an example of {picked.train}
          </span>
          <button className="nodrag" onClick={() => setRois(rois.map((r) => (r.id === picked.id ? { ...r, train: undefined, color: undefined } : r)))}>
            Not an example
          </button>
        </div>
      )}
      <div className="row">
        <button className={`nodrag grow${unsure ? ' on' : ''}`} title="Show where the classifier hesitates (bright): an example there teaches it most; click again to go back to the output before" onClick={() => set(unsure ? { output: String(s.p.lastOutput ?? 'mask') } : { output: 'uncertainty', lastOutput: String(s.p.output ?? 'mask') })}>
          {unsure ? 'Back to the output' : 'Where it hesitates'}
        </button>
      </div>
      <div className="ie-params">
        {STEP_DEFS.classify.params.map((q) => (
          <ParamField key={q.key} q={q} value={q.key === 'edges' ? ring : s.p[q.key]} hist={hist} set={(v) => set({ [q.key]: v as never })} />
        ))}
      </div>
      {note && <div className="hint">{note}</div>}
    </div>
  );
}
