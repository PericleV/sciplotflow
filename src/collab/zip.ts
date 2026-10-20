// Long messages between computers compressed (deflate): an imported file of 100 MB of numbers becomes about a quarter
// of it — on a home Wi-Fi (a few MB/s) it arrives two to three times sooner. Done apart from the page (it never stops
// it), in several workers at once: the message cut into parts (8 MB at least), each compressed on its own, written one
// after the other with their lengths — and expanded the same way. Without workers (the checks, in Node), here, with
// the same CompressionStream.

const pipe = async (u: Uint8Array, s: CompressionStream | DecompressionStream) => new Uint8Array(await new Response(new Blob([u as Uint8Array<ArrayBuffer>]).stream().pipeThrough(s)).arrayBuffer());

const PART = 8 * 1024 * 1024;
const workers: Worker[] = [];
let seq = 0;
const waiting = new Map<number, { ok: (u: Uint8Array) => void; fail: (e: Error) => void }>();
const canWork = () => typeof window !== 'undefined' && typeof Worker !== 'undefined';
// as many workers as the computer has cores to spare (1 to 4)
const poolSize = () => Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
function worker(k: number): Worker | null {
  if (!canWork()) return null;
  if (workers[k]) return workers[k];
  try {
    const w = new Worker(new URL('./zipWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; bytes?: Uint8Array; error?: string }>) => {
      const job = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (!job) return;
      if (e.data.bytes) job.ok(e.data.bytes);
      else job.fail(new Error(e.data.error ?? 'compression failed'));
    };
    workers[k] = w;
    return w;
  } catch {
    return null;
  }
}
function run(op: 'deflate' | 'inflate', bytes: Uint8Array, k: number): Promise<Uint8Array> {
  const w = worker(k);
  if (!w) return pipe(bytes, op === 'deflate' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
  return new Promise((ok, fail) => {
    const id = ++seq;
    waiting.set(id, { ok, fail });
    // a copy goes to the worker (the message may still be sent elsewhere as it is)
    const copy = bytes.slice();
    w.postMessage({ id, op, bytes: copy }, [copy.buffer]);
  });
}

// the parts written one after the other: their number (1 byte), then each one's length (4 bytes) and bytes
function pack(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(1 + parts.reduce((s, p) => s + 4 + p.length, 0));
  const v = new DataView(out.buffer);
  out[0] = parts.length;
  let at = 1;
  for (const p of parts) {
    v.setUint32(at, p.length);
    out.set(p, at + 4);
    at += 4 + p.length;
  }
  return out;
}
function unpack(u: Uint8Array): Uint8Array[] {
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const parts: Uint8Array[] = [];
  let at = 1;
  for (let k = 0; k < u[0]; k++) {
    const n = v.getUint32(at);
    parts.push(u.subarray(at + 4, at + 4 + n));
    at += 4 + n;
  }
  return parts;
}

export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const k = Math.max(1, Math.min(canWork() ? poolSize() : 1, Math.ceil(bytes.length / PART)));
  const size = Math.ceil(bytes.length / k);
  const parts = Array.from({ length: k }, (_, i) => bytes.subarray(i * size, Math.min(bytes.length, (i + 1) * size)));
  return pack(await Promise.all(parts.map((p, i) => run('deflate', p, i))));
}
export async function inflate(packed: Uint8Array): Promise<Uint8Array> {
  const parts = await Promise.all(unpack(packed).map((p, i) => run('inflate', p, i % Math.max(1, canWork() ? poolSize() : 1))));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
