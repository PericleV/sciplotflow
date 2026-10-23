// The trainable classifier's step in the Image analysis editor: its classes (each with its colour, its brush and its
// examples — strokes painted and selections drawn while the class is picked, or selections added to it), the class that
// makes the mask, its trees, smoothing, the edges made from the outlines and the output.
import { useState } from 'react';
import { STEP_DEFS, stepClasses, targetClass, type ImgStep } from '../image/steps.ts';
import type { Roi } from '../image/roi.ts';
import type { StepHist } from '../image/imageWorker.ts';
import { ParamField } from './ImageParams.tsx';
import { NumInput, TextInput } from './ui.tsx';
import { classColor, edgeClassOf } from '../image/classify.ts';
import { Brush, X } from 'lucide-react';
import { IC } from './iconProps.ts';

export function ClassifierEditor({ s, set, rois, sel, setRois, note, hist, paint, setPaint, brush, setBrush }: { s: ImgStep; set: (p: Partial<ImgStep['p']>) => void; rois: Roi[]; sel: string | null; setRois: (r: Roi[]) => void; note?: string; hist?: StepHist; paint: string | null; setPaint: (c: string | null) => void; brush: number; setBrush: (w: number) => void }) {
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
  return (
    <div className="ie-classifier">
      <div className="hint">
        Pick a class (its brush, or the keys 1, 2, 3 …) and paint on the image: every stroke, and any selection drawn while a class is picked (wand, polygon …), is an example of it. Outline a few whole objects with the wand or a polygon: with Edges from outlines, the ring around them and the gaps between touching ones teach the edge class by themselves. Output ▸ objects split by edges separates touching particles. The examples are not measured.
      </div>
      {classes.map((c, j) => (
        <div key={c} className="row ie-class-row">
          <input className="nodrag" type="radio" checked={target === c} title="The class that makes the mask" onChange={() => set({ target: c })} />
          <span className="ie-class-dot" style={{ background: color(c) }} />
          <b className="grow ellipsis" title={c}>
            {c}
          </b>
          <span className="muted" title={`${count(c)} example${count(c) === 1 ? '' : 's'}${c === edgeCls && ring > 0 ? `, and a ring of ${ring} px around every ${target} outlined` : ''}`}>
            {count(c)}
            {c === edgeCls && ring > 0 ? ' + ring' : ''}
          </span>
          <button className={`nodrag ts-btn${paint === c ? ' on' : ''}`} title={paint === c ? `Painting ${c}: click to stop (Esc)` : `Paint ${c}${j < 9 ? ` (key ${j + 1})` : ''}: strokes on the image, and any selection drawn now, are examples of it`} onClick={() => setPaint(paint === c ? null : c)}>
            <Brush {...IC} />
          </button>
          <button className="nodrag" disabled={!picked} title={picked ? `${picked.name}: an example of ${c}` : 'Pick a selection on the image first'} onClick={() => give(c)}>
            + picked
          </button>
          <button className="nodrag ts-btn" disabled={count(c) > 0 || classes.length <= 2} title="Remove the class (when it has no examples)" onClick={() => set({ classes: classes.filter((x) => x !== c).join(','), ...(s.p.target === c ? { target: '' } : {}) })}>
            <X {...IC} />
          </button>
        </div>
      ))}
      {paint && (
        <div className="row ie-paint">
          <span className="ie-class-dot" style={{ background: color(paint) }} />
          <span className="grow">Painting {paint}</span>
          <span className="muted">brush</span>
          <NumInput value={brush} min={1} max={60} step={1} title="The width of the strokes (pixels of the image)" onChange={(v) => setBrush(Math.max(1, Math.min(60, Math.round(v))))} />
          <span className="muted">px</span>
        </div>
      )}
      <div className="row">
        <TextInput className="grow" value={name} placeholder="another class (debris …)" onChange={setName} />
        <button className="nodrag" disabled={!name.trim()} onClick={addClass}>
          Add class
        </button>
      </div>
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
        <button className={`nodrag grow${unsure ? ' on' : ''}`} title="Show where the classifier hesitates (bright): paint an example there and it learns most; click again to go back to the output before" onClick={() => set(unsure ? { output: String(s.p.lastOutput ?? 'mask') } : { output: 'uncertainty', lastOutput: String(s.p.output ?? 'mask') })}>
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
