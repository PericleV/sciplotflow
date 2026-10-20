// Films the app for the README: `npm run gifs` (every scene) or `npm run gifs -- smooth fit` (those named).
// Starts the app (Vite, port 5190) and Microsoft Edge without a window (the Chrome DevTools Protocol, through the
// WebSocket Node has), opens the page in recording mode (?record: window.__rec, src/tour/RecordLayer.tsx), and for
// every scene of scenes.ts: sets it up, films what it does (every frame the page draws, with its time), then makes
// a GIF of the part of the page worth seeing with ffmpeg (a palette of its own, at most 900 px wide) in docs/media.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { SCENES, type Scene } from './scenes.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, 'docs', 'media');
const W = 1280;
const H = 800;
const APP_PORT = 5190;
const CDP_PORT = 9333;
const EDGE = [process.env.EDGE, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => p && existsSync(p));
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- the DevTools Protocol: a request and its answer, the events ----
type Msg = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string } };
class Cdp {
  private ws: WebSocket;
  private seq = 0;
  private waiting = new Map<number, { ok: (r: Record<string, unknown>) => void; fail: (e: Error) => void }>();
  private on = new Map<string, (p: Record<string, unknown>) => void>();
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Msg;
      if (m.id !== undefined) {
        const w = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        if (m.error) w?.fail(new Error(m.error.message));
        else w?.ok(m.result ?? {});
      } else if (m.method) this.on.get(m.method)?.(m.params ?? {});
    };
  }
  static connect(url: string) {
    return new Promise<Cdp>((ok, fail) => {
      const ws = new WebSocket(url);
      ws.onopen = () => ok(new Cdp(ws));
      ws.onerror = () => fail(new Error(`no connection to ${url}`));
    });
  }
  send(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<Record<string, unknown>>((ok, fail) => this.waiting.set(id, { ok, fail }));
  }
  listen(method: string, f: (p: Record<string, unknown>) => void) {
    this.on.set(method, f);
  }
  // page code run and awaited; its value back (or the error it threw)
  async run<T>(code: string): Promise<T> {
    const r = (await this.send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true })) as { result?: { value?: T }; exceptionDetails?: { exception?: { description?: string }; text?: string } };
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'page error');
    return r.result?.value as T;
  }
  close() {
    this.ws.close();
  }
}

type Box = { x: number; y: number; w: number; h: number };
// a scene's code, run in the page with the recording helpers (window.__rec) as `rec`
const inPage = (body: string) => `(async (rec) => { ${body} })(window.__rec)`;

async function film(cdp: Cdp, scene: Scene, dir: string): Promise<{ frames: { file: string; t: number }[]; box: Box }> {
  await cdp.send('Page.navigate', { url: `http://localhost:${APP_PORT}/?record` });
  for (let k = 0; k < 100 && !(await cdp.run<boolean>('!!window.__rec').catch(() => false)); k++) await sleep(100);
  await sleep(600);
  await cdp.run(inPage(scene.setup));
  await sleep(scene.settle ?? 1200);
  const box = (await cdp.run<Box | null>(inPage(scene.box ?? 'return null'))) ?? { x: 0, y: 0, w: W, h: H };
  const frames: { file: string; t: number }[] = [];
  let filming = true;
  cdp.listen('Page.screencastFrame', (p) => {
    // (a frame still on its way after the end: answered, not kept)
    if (!filming) return void cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId });
    const file = join(dir, `f${String(frames.length).padStart(5, '0')}.png`);
    writeFileSync(file, Buffer.from(String(p.data), 'base64'));
    frames.push({ file, t: Number((p.metadata as { timestamp: number }).timestamp) });
    void cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId });
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: W, maxHeight: H });
  await sleep(scene.lead ?? 700);
  await cdp.run(inPage(scene.act));
  await sleep(scene.hold ?? 1800);
  filming = false;
  await cdp.send('Page.stopScreencast');
  return { frames, box };
}

// the frames, each as long as it stayed on the screen, into a GIF of the box (a palette made for it)
function gif(frames: { file: string; t: number }[], box: Box, out: string, dir: string, hold: number) {
  const list = frames.map((f, k) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${(k + 1 < frames.length ? frames[k + 1].t - f.t : hold / 1000).toFixed(3)}`);
  list.push(`file '${frames.at(-1)!.file.replace(/\\/g, '/')}'`);
  const listFile = join(dir, 'list.txt');
  writeFileSync(listFile, list.join('\n'));
  const width = Math.min(900, box.w - (box.w % 2));
  const vf = `crop=${box.w}:${box.h}:${box.x}:${box.y},fps=12,scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=200:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', vf, '-loop', '0', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr || r.error?.message}`);
}

async function main() {
  if (!EDGE) throw new Error('No Edge or Chrome found (set EDGE to its path).');
  const wanted = process.argv.slice(2);
  const scenes = wanted.length ? SCENES.filter((s) => wanted.includes(s.name)) : SCENES;
  if (!scenes.length) throw new Error(`No scene named ${wanted.join(', ')}. Scenes: ${SCENES.map((s) => s.name).join(', ')}`);
  mkdirSync(OUT, { recursive: true });
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: APP_PORT, strictPort: true } });
  await server.listen();
  const profile = join(tmpdir(), `sciplotflow-gifs-${Date.now()}`);
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  try {
    let target: { type: string; webSocketDebuggerUrl: string } | undefined;
    for (let k = 0; k < 100 && !target; k++) {
      await sleep(150);
      target = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
        .then((r) => r.json() as Promise<{ type: string; webSocketDebuggerUrl: string }[]>)
        .then((l) => l.find((t) => t.type === 'page'))
        .catch(() => undefined);
    }
    if (!target) throw new Error('Edge did not open its debugging port.');
    const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    // every scene from the same start: light theme, the usual colours, no welcome window, no minimap
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('graph-flow:welcome', 'off'); localStorage.setItem('graph-flow:theme', 'light'); localStorage.removeItem('graph-flow:colors'); localStorage.setItem('graph-flow:canvas', JSON.stringify({ snap: false, step: 20, arrows: false, shape: 'curved', minimap: false })); } catch {}" });
    const failed: string[] = [];
    for (const scene of scenes) {
      const dir = join(tmpdir(), `sciplotflow-frames-${scene.name}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const t0 = Date.now();
      // a scene that fails is said, the others go on
      try {
        const { frames, box } = await film(cdp, scene, dir);
        if (!frames.length) throw new Error('no frame filmed');
        const out = join(OUT, `${scene.file ?? scene.name}.gif`);
        mkdirSync(resolve(out, '..'), { recursive: true });
        gif(frames, box, out, dir, scene.hold ?? 1800);
        console.log(`${scene.name}: ${frames.length} frames, ${box.w}×${box.h}, ${(statSync(out).size / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      } catch (e) {
        failed.push(scene.name);
        console.log(`${scene.name}: FAILED, ${(e as Error).message.split('\n')[0]}`);
      }
      rmSync(dir, { recursive: true, force: true });
    }
    cdp.close();
    if (failed.length) console.log(`\nFailed: ${failed.join(' ')}`);
  } finally {
    edge.kill();
    await server.close();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
