// The trainable classifier's step in the Image analysis editor: its classes (each with its colour and its examples —
// selections drawn on the image and added to it), the class that makes the mask, its trees, smoothing and output.
import { useState } from 'react';
import { classesOf, STEP_DEFS, targetClass, type ImgStep } from '../image/steps.ts';
import type { Roi } from '../image/roi.ts';
import type { StepHist } from '../image/imageWorker.ts';
import { ParamField } from './ImageParams.tsx';
import { TextInput } from './ui.tsx';
import { CLASS_COLORS } from '../image/classify.ts';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';

export function ClassifierEditor({ s, set, rois, sel, setRois, note, hist }: { s: ImgStep; set: (p: Partial<ImgStep['p']>) => void; rois: Roi[]; sel: string | null; setRois: (r: Roi[]) => void; note?: string; hist?: StepHist }) {
  const [name, setName] = useState('');
  const classes = classesOf(
    s,
    rois.filter((r) => r.train).map((r) => ({ cls: r.train!, pts: [], line: false, width: 1 })),
  );
  const target = targetClass(s, classes);
  const picked = rois.find((r) => r.id === sel);
  const color = (c: string) => CLASS_COLORS[Math.max(0, classes.indexOf(c)) % CLASS_COLORS.length];
  const count = (c: string) => rois.filter((r) => r.train === c).length;
  const give = (c: string) => picked && setRois(rois.map((r) => (r.id === picked.id ? { ...r, train: c, color: color(c), role: undefined, bg: undefined } : r)));
  const addClass = () => {
    const n = name.trim().replace(/,/g, ' ');
    if (n && !classes.includes(n)) set({ classes: [...classes, n].join(',') });
    setName('');
  };
  return (
    <div className="ie-classifier">
      <div className="hint">Draw on the image with any tool (a line along a few particles, a rectangle on the background), then add the selection picked to its class. Edge: lines just outside a particle and along the gap between touching ones; it teaches the classifier where one particle ends, so clusters come apart. Only the classes with examples are learnt; the examples are not measured.</div>
      {classes.map((c) => (
        <div key={c} className="row ie-class-row">
          <input className="nodrag" type="radio" checked={target === c} title="The class that makes the mask" onChange={() => set({ target: c })} />
          <span className="ie-class-dot" style={{ background: color(c) }} />
          <b className="grow ellipsis" title={c}>
            {c}
          </b>
          <span className="muted">
            {count(c)} example{count(c) === 1 ? '' : 's'}
          </span>
          <button className="nodrag" disabled={!picked} title={picked ? `${picked.name}: an example of ${c}` : 'Pick a selection on the image first'} onClick={() => give(c)}>
            + picked
          </button>
          <button className="nodrag ts-btn" disabled={count(c) > 0 || classes.length <= 2} title="Remove the class (when it has no examples)" onClick={() => set({ classes: classes.filter((x) => x !== c).join(','), ...(s.p.target === c ? { target: '' } : {}) })}>
            <X {...IC} />
          </button>
        </div>
      ))}
      <div className="row">
        <TextInput className="grow" value={name} placeholder="another class (edge, debris …)" onChange={setName} />
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
      <div className="ie-params">
        {STEP_DEFS.classify.params.map((q) => (
          <ParamField key={q.key} q={q} value={s.p[q.key]} hist={hist} set={(v) => set({ [q.key]: v as never })} />
        ))}
      </div>
      {note && <div className="hint">{note}</div>}
    </div>
  );
}
