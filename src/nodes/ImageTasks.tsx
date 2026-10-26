// The tasks of the Image analysis editor: what is being done (particles, a network, a TEM lattice, an AFM surface; or
// every panel at once, as the tabs of before), its numbered steps on the left in the order they are done, the ways the
// particles can be found (one picked, its options under it), and the card shown over the image while a long piece of
// work runs (what it is doing, how far, the time, Cancel).
import type { ReactNode } from 'react';
import { FIND_TITLES, type FindMethod } from '../image/tasks.ts';

// the steps of a task, numbered; done: those with something done in them (marked)
export function TaskSteps({ steps, stage, done, onPick }: { steps: [string, string][]; stage: number; done: boolean[]; onPick: (k: number) => void }) {
  return (
    <div className="ie-task-steps">
      {steps.map(([name, what], k) => (
        <button key={name} className={`nodrag ie-task-step${k === stage ? ' on' : ''}${done[k] && k !== stage ? ' done' : ''}`} title={`${name}: ${what}`} onClick={() => onPick(k)}>
          <span className="ie-task-n">{done[k] && k !== stage ? '✓' : k + 1}</span>
          <span className="ie-task-text">
            <span>{name}</span>
            <span className="muted">{what}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// the ways to find the particles, one picked: its options under it
export function MethodCards({ methods, value, onPick, children }: { methods: [FindMethod, string, string][]; value: FindMethod; onPick: (m: FindMethod) => void; children: ReactNode }) {
  return (
    <>
      <div className="muted">How to find them</div>
      {methods.map(([m, label, what]) => (
        <div key={m}>
          <button className={`nodrag ie-method${m === value ? ' on' : ''}`} title={FIND_TITLES[m]} onClick={() => onPick(m)}>
            <b>{label}</b> <span className="muted">· {what}</span>
          </button>
          {m === value && <div className="ie-method-body">{children}</div>}
        </div>
      ))}
    </>
  );
}

// a long piece of work: what, what it is doing, how far (done of total, when counted), since when
export type Job = { of: 'image' | 'particles' | 'match' | 'refine' | 'sam'; label: string; stage?: string; done?: number; total?: number; t0: number; step?: string; bytes?: [number, number]; note?: string };
const secs = (ms: number) => (ms < 60000 ? `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
const mb = (b: number) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`;
// the card over the image: the work, its stage, a bar (how far; else moving), the time, Cancel (cancel: what it does)
export function BusyCard({ job, now, cancel, cancelLabel = 'Cancel', cancelTitle }: { job: Job; now: number; cancel?: () => void; cancelLabel?: string; cancelTitle?: string }) {
  const ms = Math.max(0, now - job.t0);
  const frac = job.bytes ? job.bytes[0] / Math.max(1, job.bytes[1]) : job.total ? Math.min(1, (job.done ?? 0) / job.total) : null;
  // (the time left, from how fast it went so far: once a tenth is done)
  const left = frac !== null && frac > 0.1 && frac < 1 ? (ms / frac) * (1 - frac) : null;
  const speed = job.bytes && ms > 500 ? job.bytes[0] / (ms / 1000) : null;
  return (
    <div className="ie-busy" role="status" aria-live="polite">
      <div className="ie-busy-card" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <div className="row">
          <b className="grow">{job.label}</b>
          <span className="muted">{secs(ms)}</span>
        </div>
        {job.stage && <div className="muted ie-busy-stage">{job.stage}</div>}
        <div className={`ie-busy-bar${frac === null ? ' moving' : ''}`}>
          <span style={frac === null ? undefined : { width: `${Math.round(frac * 100)}%` }} />
        </div>
        <div className="row">
          <span className="muted grow">
            {/* (the image's steps: their count is in the stage) */}
            {job.bytes ? `${mb(job.bytes[0])} of ${mb(job.bytes[1])}${speed ? ` · ${mb(speed)}/s` : ''}` : job.total && job.of !== 'image' ? `${job.done ?? 0} of ${job.total}` : ''}
            {left !== null ? `${job.bytes || (job.total && job.of !== 'image') ? ' · ' : ''}about ${secs(left)} left` : ''}
          </span>
          {cancel && (
            <button className="nodrag" title={cancelTitle} onClick={cancel}>
              {cancelLabel}
            </button>
          )}
        </div>
        {job.note && <div className="hint">{job.note}</div>}
      </div>
    </div>
  );
}
