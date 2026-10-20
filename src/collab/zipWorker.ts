// Compressing and expanding a long message of a session (an imported file) apart from the page, so the page never
// stops meanwhile: the browser's own deflate (CompressionStream).
type Job = { id: number; op: 'deflate' | 'inflate'; bytes: Uint8Array };

const pipe = async (u: Uint8Array, s: CompressionStream | DecompressionStream) => new Uint8Array(await new Response(new Blob([u as Uint8Array<ArrayBuffer>]).stream().pipeThrough(s)).arrayBuffer());

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, op, bytes } = e.data;
  try {
    const out = await pipe(bytes, op === 'deflate' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
    (self as unknown as Worker).postMessage({ id, bytes: out }, [out.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
