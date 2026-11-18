// One session's room on the relay. The routing is a pure class (RoomLogic: no Cloudflare types, the sockets as an
// interface, the clock and the storage given), so it is checked from scripts/; Room, at the end, is the thin Durable
// Object around it (WebSocket Hibernation: the room sleeps between messages, its small state kept in storage).
//
// What the relay sees: who is in the room (random peer ids, which one is the host), the kind of each message (signal or
// data), who sends it to whom, and its size. Never its content: everything the browsers send each other is encrypted
// with a key the relay never gets (it is in the link's fragment, after #, which a browser never sends).
//
// The protocol. A browser opens /r/<room>?peer=<id>&role=host|guest[&token=<secret>][&resume=1].
// - The host comes first: the room is made with the host's peer id and the SHA-256 of its secret token. A guest that
//   comes to a room without a session is refused (4404). At most MAX_PEERS sockets in a room (4409).
// - Binary messages are frames: [kind][n][id: n bytes][payload]. A browser writes the id it sends to; the relay passes
//   the frame on with the id it comes from. A guest may send only to the host (a star, as the links of a session).
// - Text messages are control: from a browser {"t":"bye"} (the host leaves: the session ends) and "ping" (answered by
//   the platform itself, "pong", without waking the room); from the relay JSON: welcome, join, leave, host-lost,
//   host-back, ended.
// - The host's socket closes without a bye (a network that dropped): the guests are told (host-lost, with the time
//   left); the host coming back within GRACE_MS with its token continues the session (host-back); else it ends.

export const MAX_PEERS = 16;
export const MAX_MESSAGE = 4 * 1024 * 1024;
export const GRACE_MS = 60_000;

// close codes (4000–4999: the application's own)
export const CLOSE = { ended: 4000, replaced: 4001, bad: 4400, token: 4401, origin: 4403, noSession: 4404, full: 4409, tooBig: 1009 } as const;

export type Role = 'host' | 'guest';
export interface Sock {
  readonly peer: string;
  readonly role: Role;
  send(m: string | Uint8Array): void;
  close(code: number, reason: string): void;
}
// the room's state: who the host is, its token's hash, until when it may come back (ms, the relay's clock)
export type RoomState = { host: string; tokenHash: string; graceUntil?: number };
export interface RoomIO {
  sockets(): Sock[]; // the sockets open now
  save(s: RoomState | null): void; // null: the session is over, nothing kept
  alarm(at: number | null): void;
  now(): number;
}
export type Control =
  | { t: 'welcome'; you: string; role: Role; host: string; peers: string[]; hostOnline: boolean; graceMs?: number }
  | { t: 'join'; peer: string }
  | { t: 'leave'; peer: string }
  | { t: 'host-lost'; ms: number }
  | { t: 'host-back' }
  | { t: 'ended'; why: 'left' | 'timeout' };

export const PEER_RE = /^[A-Za-z0-9_-]{8,32}$/;
export const ROOM_RE = /^[A-Za-z0-9_-]{22}$/;

export async function hashToken(token: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// a frame's envelope: its kind, the id it is for (or from), where its payload starts
export function envelope(b: Uint8Array): { kind: number; id: string; at: number } | null {
  if (b.length < 2) return null;
  const n = b[1];
  if (b.length < 2 + n) return null;
  return { kind: b[0], id: new TextDecoder().decode(b.subarray(2, 2 + n)), at: 2 + n };
}
export function withId(kind: number, id: string, payload: Uint8Array): Uint8Array {
  const idb = new TextEncoder().encode(id);
  const out = new Uint8Array(2 + idb.length + payload.length);
  out[0] = kind;
  out[1] = idb.length;
  out.set(idb, 2);
  out.set(payload, 2 + idb.length);
  return out;
}

export class RoomLogic {
  state: RoomState | null;
  private io: RoomIO;
  constructor(io: RoomIO, state: RoomState | null) {
    this.io = io;
    this.state = state;
  }
  private set(s: RoomState | null) {
    this.state = s;
    this.io.save(s);
  }
  private others(sock: Sock) {
    return this.io.sockets().filter((s) => s !== sock);
  }
  private tell(to: Sock[], c: Control) {
    const m = JSON.stringify(c);
    for (const s of to) {
      try {
        s.send(m);
      } catch {
        /* a socket closing */
      }
    }
  }
  private hostSock() {
    const h = this.state?.host;
    return h ? this.io.sockets().find((s) => s.role === 'host' && s.peer === h) : undefined;
  }
  // a socket accepted: in the room, or closed with why not (false)
  join(sock: Sock, tokenHash: string, resume = false): boolean {
    const st = this.state;
    const refuse = (code: number, why: string) => {
      sock.close(code, why);
      return false;
    };
    // first who it may be (a refused socket changes nothing)
    if (sock.role === 'host') {
      if (!st && (resume || !tokenHash)) return refuse(CLOSE.noSession, 'no session');
      if (st && st.tokenHash !== tokenHash) return refuse(CLOSE.token, 'not the host');
    } else {
      if (!st) return refuse(CLOSE.noSession, 'no session');
      if (sock.peer === st.host) return refuse(CLOSE.bad, 'that id is the host');
    }
    const others = this.others(sock);
    const rest = others.filter((o) => o.peer !== sock.peer);
    if (rest.length >= MAX_PEERS) return refuse(CLOSE.full, 'the session is full');
    // the same peer again (a reconnection the relay has not seen closed yet): the old socket goes
    for (const o of others) if (o.peer === sock.peer) o.close(CLOSE.replaced, 'replaced');
    if (sock.role === 'host') {
      const back = st?.graceUntil !== undefined;
      this.set({ host: sock.peer, tokenHash });
      if (back) {
        this.io.alarm(null);
        this.tell(rest, { t: 'host-back' });
      }
      this.tell([sock], { t: 'welcome', you: sock.peer, role: 'host', host: sock.peer, peers: rest.filter((o) => o.role === 'guest').map((o) => o.peer), hostOnline: true });
      return true;
    }
    const host = this.hostSock();
    const graceMs = st!.graceUntil !== undefined ? Math.max(0, st!.graceUntil - this.io.now()) : undefined;
    this.tell([sock], { t: 'welcome', you: sock.peer, role: 'guest', host: st!.host, peers: [], hostOnline: !!host, ...(graceMs !== undefined ? { graceMs } : {}) });
    if (host) this.tell([host], { t: 'join', peer: sock.peer });
    return true;
  }
  message(sock: Sock, data: string | Uint8Array | ArrayBuffer) {
    if (typeof data === 'string') {
      if (data.length > MAX_MESSAGE) return sock.close(CLOSE.tooBig, 'too big');
      if (data === 'ping') return sock.send('pong');
      let c: { t?: string } | null = null;
      try {
        c = JSON.parse(data) as { t?: string };
      } catch {
        return;
      }
      if (c?.t === 'bye' && sock.role === 'host' && this.state?.host === sock.peer) this.end('left');
      return;
    }
    const b = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (b.length > MAX_MESSAGE) return sock.close(CLOSE.tooBig, 'too big');
    const st = this.state;
    const env = envelope(b);
    if (!st || !env) return;
    // a guest speaks only to the host; the host to any guest
    if (sock.role === 'guest' && env.id !== st.host) return;
    if (sock.role === 'host' && st.host !== sock.peer) return;
    const to = this.io.sockets().find((s) => s.peer === env.id && s !== sock);
    if (!to) return;
    try {
      to.send(withId(env.kind, sock.peer, b.subarray(env.at)));
    } catch {
      /* closing */
    }
  }
  // a socket closed (or failed)
  closed(sock: Sock) {
    const st = this.state;
    const others = this.others(sock);
    // replaced by a newer socket of the same peer: nothing changed
    if (others.some((o) => o.peer === sock.peer)) return;
    if (!st) return;
    if (sock.role === 'host' && sock.peer === st.host) {
      if (st.graceUntil !== undefined) return;
      const graceUntil = this.io.now() + GRACE_MS;
      this.set({ ...st, graceUntil });
      this.io.alarm(graceUntil);
      this.tell(others, { t: 'host-lost', ms: GRACE_MS });
      return;
    }
    const host = this.hostSock();
    if (host && host !== sock) this.tell([host], { t: 'leave', peer: sock.peer });
  }
  alarm() {
    const st = this.state;
    if (!st || st.graceUntil === undefined) return;
    if (this.io.now() >= st.graceUntil) this.end('timeout');
    else this.io.alarm(st.graceUntil);
  }
  // the session is over: everyone told, every socket closed, nothing kept
  end(why: 'left' | 'timeout') {
    const all = this.io.sockets();
    this.tell(all, { t: 'ended', why });
    this.set(null);
    this.io.alarm(null);
    for (const s of all) {
      try {
        s.close(CLOSE.ended, 'the session is over');
      } catch {
        /* closed */
      }
    }
  }
}

// ---- the Durable Object (Cloudflare): a thin wrapper ----

// the few Cloudflare types used here (no @cloudflare/workers-types: one dependency fewer)
interface CfSocket {
  readonly readyState: number;
  accept(): void;
  send(m: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(v: unknown): void;
  deserializeAttachment(): unknown;
}
interface CfState {
  acceptWebSocket(ws: CfSocket): void;
  getWebSockets(): CfSocket[];
  setWebSocketAutoResponse(pair: unknown): void;
  blockConcurrencyWhile<T>(f: () => Promise<T>): Promise<T>;
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, v: unknown): Promise<void>;
    deleteAll(): Promise<void>;
    setAlarm(at: number): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
}
declare const WebSocketPair: { new (): { 0: CfSocket; 1: CfSocket } };
declare const WebSocketRequestResponsePair: { new (req: string, res: string): unknown };

export class Room {
  private ctx: CfState;
  private logic: RoomLogic | null = null;
  private socks = new WeakMap<CfSocket, Sock>();
  constructor(ctx: CfState, _env: unknown) {
    this.ctx = ctx;
    // keep-alives answered without waking the room (they cost nothing)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void ctx.blockConcurrencyWhile(async () => {
      const st = (await ctx.storage.get<RoomState>('s')) ?? null;
      this.logic = new RoomLogic(
        {
          sockets: () => this.ctx.getWebSockets().filter((w) => w.readyState === 1).map((w) => this.sock(w)),
          save: (s) => void (s ? this.ctx.storage.put('s', s) : this.ctx.storage.deleteAll()),
          alarm: (at) => void (at === null ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(at)),
          now: () => Date.now(),
        },
        st,
      );
    });
  }
  private sock(ws: CfSocket): Sock {
    let s = this.socks.get(ws);
    if (!s) {
      const a = ws.deserializeAttachment() as { peer: string; role: Role };
      s = { peer: a.peer, role: a.role, send: (m) => ws.send(m), close: (code, reason) => ws.close(code, reason) };
      this.socks.set(ws, s);
    }
    return s;
  }
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const peer = url.searchParams.get('peer') ?? '';
    const role = url.searchParams.get('role');
    const token = url.searchParams.get('token') ?? '';
    const tokenHash = token ? await hashToken(token) : '';
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // decided first: a socket let in is accepted for hibernation (with who it is), then gets what was sent to it
    // meanwhile (its welcome); a refused one is closed at once as a plain socket (closing a hibernatable socket before
    // the answer is sent reaches the page only seconds later)
    const held: (string | Uint8Array)[] = [];
    let refused: { code: number; reason: string } | null = null;
    const pending: Sock = { peer, role: role === 'host' ? 'host' : 'guest', send: (m) => void held.push(m), close: (code, reason) => void (refused = { code, reason }) };
    const ok = PEER_RE.test(peer) && (role === 'host' || role === 'guest') && this.logic!.join(pending, tokenHash, url.searchParams.get('resume') === '1');
    if (ok) {
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ peer, role });
      this.socks.set(server, { peer: pending.peer, role: pending.role, send: (m) => server.send(m), close: (code, reason) => server.close(code, reason) });
      for (const m of held) server.send(m);
    } else {
      const r = refused as { code: number; reason: string } | null;
      server.accept();
      server.close(r?.code ?? CLOSE.bad, r?.reason ?? 'bad request');
    }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }
  webSocketMessage(ws: CfSocket, m: string | ArrayBuffer) {
    this.logic!.message(this.sock(ws), m);
  }
  webSocketClose(ws: CfSocket, code: number, reason: string) {
    this.logic!.closed(this.sock(ws));
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      /* already closed */
    }
  }
  webSocketError(ws: CfSocket) {
    this.logic!.closed(this.sock(ws));
  }
  alarm() {
    this.logic!.alarm();
  }
}
