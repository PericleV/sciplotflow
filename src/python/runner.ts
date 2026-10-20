// The runs of the Python scripts, from the main thread: the evaluation asks for a run (a node, the digest of its code and
// data); the newest asked of every node waits a moment (typing does not start a run per key), then runs in the Python
// worker, one at a time; its result goes back to the evaluation. Stop ends the run under way (its node: “Stopped”).
// Code that came with a project from outside (a link, a file) runs only once it is allowed — as a notebook from elsewhere
// is trusted first: Python in this page could read the other projects kept in the browser and send them away. The
// projects allowed are kept by their id.
import { useSyncExternalStore } from 'react';
import type { PyJob, PyResult } from '../engine/python.ts';
import type { PyReply, PyRequest } from './pyWorker.ts';

type Done = (id: string, r: PyResult) => void;
// allowed: the code of the project open may run (blocked: runs asked for and held)
export type PyState = { text: string; running: string | null; allowed: boolean; held: number };

let state: PyState = { text: '', running: null, allowed: true, held: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<PyState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
export const usePython = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
  );

let worker: Worker | null = null;
let busy: { id: string; job: PyJob; done: Done } | null = null;
const queue = new Map<string, { job: PyJob; done: Done; at: number }>();
// the digests already given back (a job asked again by every evaluation is not run twice)
const given = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;
const WAIT = 350;

function start() {
  if (busy || !queue.size) return;
  const now = Date.now();
  const ready = [...queue].find(([, q]) => now - q.at >= WAIT);
  if (!ready) {
    if (!timer) timer = setTimeout(() => ((timer = null), start()), WAIT);
    return;
  }
  const [id, q] = ready;
  queue.delete(id);
  busy = { id, job: q.job, done: q.done };
  if (!worker) {
    worker = new Worker(new URL('./pyWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PyReply>) => {
      if (e.data.type === 'status') return set({ text: e.data.text });
      const b = busy;
      busy = null;
      set({ text: '', running: null });
      if (b && b.id === e.data.id) {
        given.set(b.id, e.data.result.key);
        b.done(b.id, e.data.result);
      }
      start();
    };
    worker.onerror = (e) => {
      const b = busy;
      busy = null;
      worker?.terminate();
      worker = null;
      set({ text: '', running: null });
      if (b) b.done(b.id, failed(b.job, `The Python worker failed: ${e.message || 'unknown error'}`));
      start();
    };
  }
  set({ running: id, text: 'Running…' });
  worker.postMessage({ id, job: q.job } satisfies PyRequest);
}

const failed = (job: PyJob, message: string): PyResult => ({ key: job.key, run: job.run, outputs: [], skipped: [], console: '', error: { message }, figures: [], files: [], ms: 0 });

// a run asked for a node: the newest of each node waits a moment, then runs (held while the project is not allowed)
const heldJobs = new Map<string, { job: PyJob; done: Done }>();
export function requestRun(id: string, job: PyJob, done: Done) {
  if (given.get(id) === job.key || (busy?.id === id && busy.job.key === job.key) || queue.get(id)?.job.key === job.key) return;
  if (!state.allowed) {
    heldJobs.set(id, { job, done });
    set({ held: heldJobs.size });
    return;
  }
  queue.set(id, { job, done, at: Date.now() });
  start();
}

// ---- which projects may run their code ----
const TRUST_KEY = 'graph-flow:python-allowed';
const allowedIds = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(TRUST_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
};
let projectId = '';
// a project opened: its code runs when it was allowed before, or when it has none from outside (fresh: false — it came
// from a link, a file, a document)
export function openProject(id: string, fresh: boolean) {
  projectId = id;
  heldJobs.clear();
  given.clear();
  set({ allowed: fresh || allowedIds().includes(id), held: 0 });
}
// the project open allowed to run its code (kept): the runs held start
export function allowProject() {
  try {
    localStorage.setItem(TRUST_KEY, JSON.stringify([...allowedIds().filter((x) => x !== projectId), projectId].slice(-500)));
  } catch {
    // storage unavailable: allowed for this visit
  }
  set({ allowed: true, held: 0 });
  for (const [id, h] of heldJobs) queue.set(id, { ...h, at: 0 });
  heldJobs.clear();
  start();
}
// code changed by someone else (working together): nothing more runs until it is allowed again (Allow and run); the
// runs waiting are held
export function distrustProject() {
  try {
    localStorage.setItem(TRUST_KEY, JSON.stringify(allowedIds().filter((x) => x !== projectId)));
  } catch {
    // storage unavailable: held for this visit
  }
  for (const [id, q] of queue) heldJobs.set(id, { job: q.job, done: q.done });
  queue.clear();
  set({ allowed: false, held: heldJobs.size });
}

// the run under way ended (its node gets “Stopped”), and those waiting dropped
export function stopPython() {
  const b = busy;
  busy = null;
  queue.clear();
  worker?.terminate();
  worker = null;
  set({ text: '', running: null });
  if (b) {
    given.set(b.id, b.job.key);
    b.done(b.id, failed(b.job, 'Stopped (the run did not end). Python starts again at the next run.'));
  }
}
