// The SciPlotFlow relay: a Cloudflare Worker. GET /r/<room> with Upgrade: websocket goes to that room's Durable Object
// (one per session, by name); anything else is 404. A page from an origin not in ALLOWED_ORIGINS gets a socket closed
// at once with 4403 (so the app can say why), without waking any room.
import { CLOSE, ROOM_RE } from './room.ts';

export { Room } from './room.ts';

interface Env {
  ROOMS: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } };
  ALLOWED_ORIGINS?: string;
}
interface CfSocket {
  accept(): void;
  close(code?: number, reason?: string): void;
}
declare const WebSocketPair: { new (): { 0: CfSocket; 1: CfSocket } };

// a socket that closes at once with a reason the page can read
function refused(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = /^\/r\/([^/]+)$/.exec(url.pathname);
    if (req.method !== 'GET' || !m || !ROOM_RE.test(m[1]) || req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Not found', { status: 404 });
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') ?? '';
    if (!allowed.includes(origin)) return refused(CLOSE.origin, 'origin not allowed');
    return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
  },
};
