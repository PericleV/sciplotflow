// The trainable classifier's step in the Image analysis editor: its classes (a click on one picks it: what is drawn is
// an example of it), the tools that draw (Fill: an outline drawn is filled; Brush: a stroke as wide as the slider;
// Eraser: the examples it passes over taken away), the class the mask is made of, the particles found made examples of
// the object, its trees, smoothing, the edges made from the outlines and the output.
import { useState } from 'react';
import { Brush, Eraser, PenTool, X } from 'lucide-react';
import { STEP_DEFS, stepClasses, targetClass, type ImgStep } from '../image/steps.ts';
import type { Roi } from '../image/roi.ts';
import type { StepHist } from '../image/imageWorker.ts';
import { ParamField } from './ImageParams.tsx';
import { Select, TextInput } from './ui.tsx';
import { classColor, edgeClassOf } from '../image/classify.ts';
import { IC } from './iconProps.ts';

export type PaintTool = 'fill' | 'brush' | 'eraser';

export function ClassifierEditor({ s, set, rois, sel, setRois, note, hist, paint, setPaint, tool, setTool, brush, setBrush }: { s: ImgStep; set: (p: Partial<ImgStep['p']>) => void; rois: Roi[]; sel: string | null; setRois: (r: Roi[]) => void; note?: string; hist?: StepHist; paint: string | null; setPaint: (c: string | null) => void; tool: PaintTool; setTool: (t: PaintTool) => void; brush: number; setBrush: (w: number) => void }) {
  const [name, setName] = useState('');
  const classes = stepClasses(s, rois);
  const target = targetClass(s, classes);
  const picked = rois.find((r) => r.id === sel);
  const color = (c: string) => classColor(classes, c);
  const count = (c: string) => rois.filter((r) => r.train === c).length;
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
    <button className={`nodrag${tool === t && paint ? ' on' : ''}`} title={title} onClick={() => (setTool(t), !paint && setPaint(t === 'eraser' ? classes[0] : target))}>
      {icon} {label}
    </button>
  );
  return (
    <div className="ie-classifier">
      <div className="hint">
        Click a class (or press 1, 2, 3 …), then draw on the image: Fill: draw around a particle or a piece of the ground, the inside is the example; Brush: a stroke as wide as the slider; Eraser: takes away the examples it passes over. Edge needs nothing drawn: the ring around every particle filled, and the gap between touching ones, is learnt by itself; only where two particles still come out joined, brush a short line across the gap between them. Esc: stop drawing.
      </div>
      <div className="row ie-paint-tools">
        {toolBtn('fill', <PenTool {...IC} />, 'Fill', 'Draw around a particle (or a piece of the ground): the inside is an example of the class picked')}
        {toolBtn('brush', <Brush {...IC} />, 'Brush', 'A stroke as wide as the slider: an example of the class picked (for the edge: a short line across a gap)')}
        {toolBtn('eraser', <Eraser {...IC} />, 'Eraser', 'The examples the eraser passes over are taken away')}
      </div>
      <div className="row ie-paint-width" title="The width of the brush and the eraser (pixels of the image)">
        <span className="muted">width</span>
        <input className="nodrag grow" type="range" min={1} max={40} step={1} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
        <span className="muted">{brush} px</span>
      </div>
      {classes.map((c, j) => (
        <div key={c} className={`row ie-class-row${paint === c ? ' on' : ''}`} title={`Click: draw ${c}${j < 9 ? ` (key ${j + 1})` : ''}; again: stop`} onClick={() => setPaint(paint === c ? null : c)}>
          <span className="ie-class-dot" style={{ background: color(c) }} />
          <b className="grow ellipsis">{c}</b>
          <span className="muted" title={`${count(c)} example${count(c) === 1 ? '' : 's'}${c === edgeCls && ring > 0 ? `, and a ring of ${ring} px around every ${target} filled` : ''}`}>
            {c === edgeCls && ring > 0 ? `auto: ring ${ring} px${count(c) ? ` + ${count(c)}` : ''}` : count(c)}
          </span>
          <button className="nodrag" disabled={!picked} title={picked ? `${picked.name}: an example of ${c}` : 'Pick a selection on the image first'} onClick={(e) => (e.stopPropagation(), give(c))}>
            + picked
          </button>
          <button className="nodrag ts-btn" disabled={count(c) > 0 || classes.length <= 2} title="Remove the class (when it has no examples)" onClick={(e) => (e.stopPropagation(), set({ classes: classes.filter((x) => x !== c).join(','), ...(s.p.target === c ? { target: '' } : {}) }))}>
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
