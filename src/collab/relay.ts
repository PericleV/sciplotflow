// A session by link, through a small relay (a Cloudflare Worker of ours: relay/). The host starts it and gets a link;
// anyone who opens the link joins, as long as the host is there. Each guest is linked to the host (a star, as the other
// links of a session): first a direct WebRTC data channel, set up through the relay (offer, answer, the ways to reach
// each side); not open within DIRECT_MS, the same bytes go through the relay's WebSocket instead.
//
// End-to-end encryption: the link is …#s=<room>.<key> — the fragment (after #) never leaves the browser, so the relay
// never has the key. Everything sent through the relay (the signalling — whose descriptions hold IP addresses — and the
// data) is sealed with AES-GCM 256 and a random 12-byte IV per message; the sender, the receiver and the kind are
// bound to it (additional data), so the relay cannot pass a message off as another's. The relay sees the envelope
// (kind, from, to) and sizes only.
//
// The relay's own protocol (frames, control messages, close codes) is described in relay/src/room.ts.
import { channelLink, ICE } from './links.ts';
import type { Link } from './sync.ts';

// The relay of the published app (deployed 2026-11-18 on the Workers Free plan): “Start a session” works with no
// setting. A relay of one's own is set in Collaborate ▸ Advanced (kept in this browser).
export const RELAY_URL = 'wss://sciplotflow-relay.sciplotflow.workers.dev';
const RELAY_KEY = 'graph-flow:relay';

export function relayUrl(): string {
  try {
    return (localStorage.getItem(RELAY_KEY) ?? '').trim() || RELAY_URL;
  } catch {
    return RELAY_URL;
  }
}
export function setRelayUrl(u: string) {
  try {
    if (u.trim()) localStorage.setItem(RELAY_KEY, u.trim());
    else localStorage.removeItem(RELAY_KEY);
  } catch {
    /* storage blocked: the default stays */
  }
}
// the relay's address as a WebSocket base (https:// → wss://, http:// → ws://, no / at the end); null: not an address
export function socketBase(u: string): string | null {
  const t = u.trim().replace(/\/+$/, '');
  const m = /^(wss?|https?):\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.exec(t);
  if (!m) return null;
  return t.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
}

export const DIRECT_MS = 8000;
export const GRACE_MS = 60_000;
// a relay message: a little under 1 MiB (the relay takes up to 4 MiB; fewer, bigger messages cost less)
export const RELAY_CHUNK = (1 << 20) - 1024;
export const KIND_SIGNAL = 1;
export const KIND_DATA = 2;
const PING_MS = 30_000;

// ---- names, keys, the link ----

export const b64u = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const newRoomId = () => b64u(random(16)); // 128 bits: 22 characters
export const newPeerId = () => b64u(random(12)); // 16 characters
export const newToken = () => b64u(random(32));
export async function newKey(): Promise<{ key: CryptoKey; text: string }> {
  const raw = random(32);
  return { key: await importKey(b64u(raw)), text: b64u(raw) };
}
export function importKey(text: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64u(text), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
const ROOM_RE = /^[A-Za-z0-9_-]{22}$/;
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;
// a session's link (or its fragment, or room.key): the room and the key; null when it is not one (or cut short)
export function parseSession(s: string): { room: string; key: string } | null {
  const m = /(?:^|#s=)([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\s*$/.exec(s.trim());
  if (!m || !ROOM_RE.test(m[1]) || !KEY_RE.test(m[2])) return null;
  return { room: m[1], key: m[2] };
}
export const sessionLink = (room: string, key: string, page = `${location.origin}${location.pathname}`) => `${page}#s=${room}.${key}`;

// ---- sealing ----

const enc = new TextEncoder();
const dec = new TextDecoder();
export const aadOf = (kind: number, from: string, to: string) => enc.encode(`sciplotflow|${kind}|${from}|${to}`);
// [iv: 12 bytes][ciphertext + tag]
export async function seal(key: CryptoKey, aad: Uint8Array, plain: Uint8Array): Promise<Uint8Array> {
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad as Uint8Array<ArrayBuffer> }, key, plain as Uint8Array<ArrayBuffer>));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}
// null: not sealed with this key (a wrong link), or changed on the way
export async function unseal(key: CryptoKey, aad: Uint8Array, sealed: Uint8Array): Promise<Uint8Array | null> {
  if (sealed.length < 28) return null;
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.subarray(0, 12) as Uint8Array<ArrayBuffer>, additionalData: aad as Uint8Array<ArrayBuffer> }, key, sealed.subarray(12) as Uint8Array<ArrayBuffer>));
  } catch {
    return null;
  }
}

// ---- framing (the relay's envelope: [kind][n][id][payload]) ----

export function frame(kind: number, id: string, payload: Uint8Array): Uint8Array {
  const idb = enc.encode(id);
  const out = new Uint8Array(2 + idb.length + payload.length);
  out[0] = kind;
  out[1] = idb.length;
  out.set(idb, 2);
  out.set(payload, 2 + idb.length);
  return out;
}
export function unframe(b: Uint8Array): { kind: number; id: string; payload: Uint8Array } | null {
  if (b.length < 2 || b.length < 2 + b[1]) return null;
  return { kind: b[0], id: dec.decode(b.subarray(2, 2 + b[1])), payload: b.subarray(2 + b[1]) };
}

// ---- the relay's answers ----

export type Control =
  | { t: 'welcome'; you: string; role: 'host' | 'guest'; host: string; peers: string[]; hostOnline: boolean; graceMs?: number }
  | { t: 'join'; peer: string }
  | { t: 'leave'; peer: string }
  | { t: 'host-lost'; ms: number }
  | { t: 'host-back' }
  | { t: 'ended'; why: 'left' | 'timeout' };

// why a socket to the relay closed, for the person (opened: whether it ever opened)
export function relayError(code: number, opened: boolean): string {
  if (code === 4403) return "The relay does not accept this page's address (its ALLOWED_ORIGINS list).";
  if (code === 4404) return 'This session is over (or the link is wrong): ask for a new link.';
  if (code === 4409) return 'This session is full (16 people at most).';
  if (code === 4401) return 'Only the person who started this session can come back as its host.';
  if (code === 4400) return 'The relay did not understand the request (an older app?).';
  if (code === 1009) return 'A message was too large for the relay.';
  if (!opened) return "The relay's daily free limit is reached (or the relay cannot be reached): use “Without a server” today.";
  return 'The connection to the relay was lost.';
}

// a message between the two sides of a link, sealed (the relay passes it on)
export type Signal = { t: 'offer' | 'answer'; n: number; sdp: string } | { t: 'ice'; n: number; c: RTCIceCandidateInit } | { t: 'relay'; n: number };

export type SocketFactory = (url: string) => WebSocket;
export type ClientOptions = { base: string; room: string; key: CryptoKey; role: 'host' | 'guest'; peer?: string; token?: string; socket?: SocketFactory };

// The WebSocket to the relay: sealing, framing, keep-alive, and coming back after a lost connection (a host within
// GRACE_MS, with its token: the session goes on).
export class RelayClient {
  readonly role: 'host' | 'guest';
  readonly peer: string;
  readonly room: string;
  readonly token: string;
  host = '';
  // the relay closed for good (the session over, or not reachable again)
  done = false;
  // messages that could not be opened (a wrong key)
  bad = 0;
  private key: CryptoKey;
  private base: string;
  private make: SocketFactory;
  private ws: WebSocket | null = null;
  private tx: Promise<void> = Promise.resolve();
  private rx: Promise<void> = Promise.resolve();
  private ping: ReturnType<typeof setInterval> | 0 = 0;
  private retry: ReturnType<typeof setTimeout> | 0 = 0;
  private welcomed = false;
  private mine = false; // closed by this side
  private downSince = 0;
  onControl: (c: Control) => void = () => {};
  onSignal: (from: string, s: Signal) => void | Promise<void> = () => {};
  onData: (from: string, n: number, bytes: Uint8Array) => void = () => {};
  // the socket went down (until: when the session would end) / came back / gave up (why)
  onDown: (until: number) => void = () => {};
  onGone: (why: string) => void = () => {};
  onBad: () => void = () => {};
  constructor(o: ClientOptions) {
    this.role = o.role;
    this.room = o.room;
    this.key = o.key;
    this.base = o.base;
    this.peer = o.peer ?? newPeerId();
    this.token = o.role === 'host' ? (o.token ?? newToken()) : '';
    this.make = o.socket ?? ((u) => new WebSocket(u));
  }
  get online() {
    return this.ws?.readyState === 1 && this.welcomed;
  }
  private url(resume: boolean) {
    const q = new URLSearchParams({ peer: this.peer, role: this.role });
    if (this.token) q.set('token', this.token);
    if (resume) q.set('resume', '1');
    return `${this.base}/r/${this.room}?${q}`;
  }
  // the first connection: null once the relay has welcomed this side, else why not
  connect(resume = false): Promise<string | null> {
    return new Promise((done) => {
      let opened = false;
      let settled = false;
      const settle = (r: string | null) => {
        if (!settled) {
          settled = true;
          done(r);
        }
      };
      let ws: WebSocket;
      try {
        ws = this.make(this.url(resume));
      } catch {
        return settle(relayError(0, false));
      }
      this.ws = ws;
      this.welcomed = false;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        opened = true;
      };
      ws.onmessage = (e: MessageEvent<string | ArrayBuffer>) => {
        if (typeof e.data === 'string') {
          if (e.data === 'pong') return;
          let c: Control;
          try {
            c = JSON.parse(e.data) as Control;
          } catch {
            return;
          }
          if (c.t === 'welcome') {
            this.host = c.host;
            this.welcomed = true;
            this.downSince = 0;
            if (!this.ping) this.ping = setInterval(() => this.ws?.readyState === 1 && this.ws.send('ping'), PING_MS);
            settle(null);
          }
          if (c.t === 'ended') this.done = true;
          // in the order they came, after the messages before them
          this.rx = this.rx.then(() => this.onControl(c));
          return;
        }
        const bytes = new Uint8Array(e.data);
        this.rx = this.rx.then(() => this.receive(bytes)).catch(() => {});
      };
      ws.onclose = (e: CloseEvent) => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (!settled) {
          settle(relayError(e.code, opened));
          return;
        }
        if (this.mine || this.done) return;
        if (e.code === 4404 || e.code === 4401 || e.code === 4000) return this.giveUp(e.code === 4000 ? 'ended' : relayError(e.code, true));
        // lost: tried again (with resume for the host) until the session would end
        if (!this.downSince) {
          this.downSince = Date.now();
          this.rx = this.rx.then(() => this.onDown(this.downSince + GRACE_MS));
        }
        this.again();
      };
      ws.onerror = () => {};
    });
  }
  private again() {
    if (this.retry || this.mine || this.done) return;
    const left = this.downSince + GRACE_MS - Date.now();
    if (left <= 0) return this.giveUp('lost');
    const wait = Math.min(left, Math.min(5000, 1000 * 2 ** Math.min(3, Math.floor((Date.now() - this.downSince) / 4000))));
    this.retry = setTimeout(() => {
      this.retry = 0;
      if (this.mine || this.done) return;
      void this.connect(this.role === 'host').then((err) => {
        if (err === null) return;
        if (/over|only the person/i.test(err)) this.giveUp(err);
        else this.again();
      });
    }, wait);
  }
  private giveUp(why: string) {
    if (this.done) return;
    this.done = true;
    this.stop();
    this.rx = this.rx.then(() => this.onGone(why));
  }
  private stop() {
    if (this.ping) clearInterval(this.ping);
    if (this.retry) clearTimeout(this.retry);
    this.ping = this.retry = 0;
  }
  private async receive(bytes: Uint8Array) {
    const f = unframe(bytes);
    if (!f || (f.kind !== KIND_SIGNAL && f.kind !== KIND_DATA)) return;
    const plain = await unseal(this.key, aadOf(f.kind, f.id, this.peer), f.payload);
    if (!plain) {
      if (this.bad++ === 0) this.onBad();
      return;
    }
    if (f.kind === KIND_SIGNAL) {
      let s: Signal;
      try {
        s = JSON.parse(dec.decode(plain)) as Signal;
      } catch {
        return;
      }
      await this.onSignal(f.id, s);
    } else if (plain.length >= 4) this.onData(f.id, new DataView(plain.buffer, plain.byteOffset, 4).getUint32(0), plain.subarray(4));
  }
  private post(kind: number, to: string, plain: Uint8Array) {
    const ws = this.ws;
    if (!ws) return;
    this.tx = this.tx
      .then(async () => {
        const sealed = await seal(this.key, aadOf(kind, this.peer, to), plain);
        if (ws.readyState === 1 && this.ws === ws) ws.send(frame(kind, to, sealed) as Uint8Array<ArrayBuffer>);
      })
      .catch(() => {});
  }
  signal(to: string, s: Signal) {
    if (this.ws) this.post(KIND_SIGNAL, to, enc.encode(JSON.stringify(s)));
  }
  data(to: string, n: number, bytes: Uint8Array) {
    if (!this.ws) return;
    const m = new Uint8Array(4 + bytes.length);
    new DataView(m.buffer).setUint32(0, n);
    m.set(bytes, 4);
    this.post(KIND_DATA, to, m);
  }
  // the host leaves: the relay ends the session for everyone (sent at once: also from a page being closed)
  bye() {
    if (this.role === 'host' && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'bye' }));
  }
  // the messages queued go first, then the socket closes
  close(wait = 0) {
    this.mine = true;
    this.stop();
    const ws = this.ws;
    const end = () => {
      try {
        ws?.close(1000, 'leaving');
      } catch {
        /* closed */
      }
    };
    void this.tx.then(() => (wait > 0 ? setTimeout(end, wait) : end()));
  }
  // a socket dropped on purpose (for the checks: a network that drops)
  drop() {
    this.ws?.close(4100, 'dropped');
  }
}

// ---- the links of a session through the relay ----

export type Status = { s: 'connecting' } | { s: 'live' } | { s: 'host-lost'; until: number } | { s: 'reconnecting'; until: number } | { s: 'ended'; why: string };
type Conn = { peer: string; n: number; kind: 'trying' | 'direct' | 'relay'; pc?: RTCPeerConnection; timer?: ReturnType<typeof setTimeout>; link?: Link; deliver?: (b: Uint8Array) => void; dead?: boolean };
export type PeersOptions = { rtc?: boolean; directMs?: number };

// For each guest, a link to the host — direct when WebRTC connects within DIRECT_MS, else through the relay — given to
// the session's hub (add); made again when it is lost while both are still there, or when the host comes back.
export class RelayPeers {
  readonly client: RelayClient;
  status: Status = { s: 'connecting' };
  private add: (l: Link) => void;
  private rtc: boolean;
  private directMs: number;
  private conns = new Map<string, Conn>();
  // the host's attempts, numbered across all guests (never twice the same: an old message is told apart)
  private seq = 0;
  private statusL = new Set<(s: Status) => void>();
  private changeL = new Set<() => void>();
  private readonly hide = () => this.client.bye();
  constructor(client: RelayClient, add: (l: Link) => void, o: PeersOptions = {}) {
    this.client = client;
    this.add = add;
    this.rtc = (o.rtc ?? true) && typeof RTCPeerConnection === 'function';
    this.directMs = o.directMs ?? DIRECT_MS;
    client.onControl = (c) => this.control(c);
    client.onSignal = (from, s) => this.signal(from, s);
    client.onData = (from, n, b) => {
      const c = this.conns.get(from);
      if (c && c.n === n && c.kind === 'relay') c.deliver?.(b);
    };
    client.onDown = (until) => {
      if (client.role === 'host') {
        // the relay links went with the socket (a direct one may live on: kept when the relay comes back)
        for (const c of this.conns.values()) if (c.kind === 'relay') c.link?.close();
      } else {
        // a guest: the relay tells the host it left, so every link goes (made again when it is back)
        for (const c of this.conns.values()) this.drop(c);
        this.conns.clear();
      }
      this.changed();
      this.set({ s: 'reconnecting', until });
    };
    client.onGone = (why) => this.end(why);
    // the host closing its page: the session ends for everyone at once (not after the minute of a lost connection)
    if (client.role === 'host' && typeof addEventListener === 'function') addEventListener('pagehide', this.hide);
  }
  start(): Promise<string | null> {
    return this.client.connect();
  }
  onStatus(f: (s: Status) => void) {
    this.statusL.add(f);
    return () => void this.statusL.delete(f);
  }
  // a link made, its kind changed, someone connecting
  onChange(f: () => void) {
    this.changeL.add(f);
    return () => void this.changeL.delete(f);
  }
  private set(s: Status) {
    this.status = s;
    this.statusL.forEach((f) => f(s));
  }
  private changed() {
    this.changeL.forEach((f) => f());
  }
  // how a link of the hub goes: directly, or through the relay
  kindOf(linkId: string): 'direct' | 'relay' | undefined {
    for (const c of this.conns.values()) if (c.link?.id === linkId) return c.kind === 'trying' ? undefined : c.kind;
    return undefined;
  }
  // the peers still connecting (no link yet)
  connecting(): number {
    let n = 0;
    for (const c of this.conns.values()) if (!c.link) n++;
    return n;
  }
  private control(c: Control) {
    const host = this.client.role === 'host';
    if (c.t === 'welcome') {
      if (host) for (const p of c.peers) if (!this.conns.get(p)?.link) this.connect(p);
      this.set(c.hostOnline ? { s: 'live' } : { s: 'host-lost', until: Date.now() + (c.graceMs ?? GRACE_MS) });
    } else if (c.t === 'join' && host) this.connect(c.peer);
    else if (c.t === 'leave' && host) {
      const k = this.conns.get(c.peer);
      if (k) this.drop(k);
      this.conns.delete(c.peer);
      this.changed();
    } else if (c.t === 'host-lost' && !host) {
      for (const k of this.conns.values()) if (k.kind === 'relay') k.link?.close();
      this.set({ s: 'host-lost', until: Date.now() + c.ms });
    } else if (c.t === 'host-back' && !host) this.set({ s: 'live' });
    else if (c.t === 'ended') this.end(c.why);
  }
  private end(why: string) {
    if (this.status.s === 'ended') return;
    for (const k of this.conns.values()) this.drop(k);
    this.conns.clear();
    this.client.close();
    if (typeof removeEventListener === 'function') removeEventListener('pagehide', this.hide);
    this.set({ s: 'ended', why });
  }
  private drop(c: Conn) {
    c.dead = true;
    if (c.timer) clearTimeout(c.timer);
    c.link?.close();
    c.pc?.close();
  }
  // a link made: given to the hub; when it is lost while both are still here, the host makes another
  private attach(c: Conn, link: Link, kind: 'direct' | 'relay') {
    c.link = link;
    c.kind = kind;
    link.onClose(() => {
      if (c.link !== link) return;
      c.link = undefined;
      c.kind = 'trying';
      this.changed();
      if (this.client.role === 'host' && !c.dead)
        setTimeout(() => {
          if (this.conns.get(c.peer) === c && !c.link && !c.dead && this.client.online) this.connect(c.peer);
        }, 1000);
    });
    this.add(link);
    this.changed();
  }
  private viaRelay(c: Conn) {
    if (c.dead || c.kind === 'relay') return;
    if (c.timer) clearTimeout(c.timer);
    c.link?.close();
    c.pc?.close();
    c.pc = undefined;
    const bytes: ((b: Uint8Array) => void)[] = [];
    const closeL: (() => void)[] = [];
    let open = true;
    const link: Link = {
      id: `relay-${c.peer}-${c.n}`,
      chunk: RELAY_CHUNK,
      compress: true,
      send: (b) => {
        if (open) this.client.data(c.peer, c.n, b);
      },
      onBytes: (f) => void bytes.push(f),
      onClose: (f) => void closeL.push(f),
      close: () => {
        if (!open) return;
        open = false;
        c.deliver = undefined;
        closeL.forEach((f) => f());
      },
    };
    c.deliver = (b) => bytes.forEach((f) => f(b));
    this.attach(c, link, 'relay');
  }
  // the host: a link to a guest (a new attempt replaces the one before)
  private connect(peer: string) {
    const prev = this.conns.get(peer);
    if (prev) this.drop(prev);
    const c: Conn = { peer, n: ++this.seq, kind: 'trying' };
    this.conns.set(peer, c);
    this.changed();
    const fallBack = () => {
      if (c.dead || c.link) return;
      this.client.signal(peer, { t: 'relay', n: c.n });
      this.viaRelay(c);
    };
    if (!this.rtc) return fallBack();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    c.pc = pc;
    const ch = pc.createDataChannel('sciplotflow', { ordered: true });
    pc.onicecandidate = (e) => {
      if (e.candidate && !c.dead) this.client.signal(peer, { t: 'ice', n: c.n, c: e.candidate.toJSON() });
    };
    ch.addEventListener(
      'open',
      () => {
        if (c.dead || c.link) return;
        if (c.timer) clearTimeout(c.timer);
        this.attach(c, channelLink(pc, ch, `rtc-${peer}-${c.n}`), 'direct');
      },
      { once: true },
    );
    c.timer = setTimeout(fallBack, this.directMs);
    void pc
      .createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() => !c.dead && this.client.signal(peer, { t: 'offer', n: c.n, sdp: pc.localDescription!.sdp }))
      .catch(fallBack);
  }
  private async signal(from: string, s: Signal) {
    const host = this.client.role === 'host';
    if (!host && from !== this.client.host) return;
    let c = this.conns.get(from);
    if (s.t === 'offer' && !host) {
      if (c && s.n < c.n) return;
      if (c) this.drop(c);
      const k: Conn = { peer: from, n: s.n, kind: 'trying' };
      c = k;
      this.conns.set(from, k);
      this.changed();
      if (!this.rtc) {
        this.client.signal(from, { t: 'relay', n: k.n });
        return this.viaRelay(k);
      }
      const pc = new RTCPeerConnection({ iceServers: ICE });
      k.pc = pc;
      pc.onicecandidate = (e) => {
        if (e.candidate && !k.dead) this.client.signal(from, { t: 'ice', n: k.n, c: e.candidate.toJSON() });
      };
      pc.ondatachannel = (e) => {
        const ch = e.channel;
        const go = () => !k.dead && !k.link && this.attach(k, channelLink(pc, ch, `rtc-${from}-${k.n}`), 'direct');
        if (ch.readyState === 'open') go();
        else ch.addEventListener('open', go, { once: true });
      };
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: s.sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        if (!k.dead) this.client.signal(from, { t: 'answer', n: k.n, sdp: pc.localDescription!.sdp });
      } catch {
        this.client.signal(from, { t: 'relay', n: k.n });
        this.viaRelay(k);
      }
    } else if (s.t === 'answer' && host) {
      if (c && c.n === s.n && c.pc && !c.dead) await c.pc.setRemoteDescription({ type: 'answer', sdp: s.sdp }).catch(() => {});
    } else if (s.t === 'ice') {
      if (c && c.n === s.n && c.pc && !c.dead) await c.pc.addIceCandidate(s.c).catch(() => {});
    } else if (s.t === 'relay') {
      if (host) {
        if (c && c.n === s.n) this.viaRelay(c);
      } else {
        if (c && s.n < c.n) return;
        if (!c || s.n > c.n) {
          if (c) this.drop(c);
          c = { peer: from, n: s.n, kind: 'trying' };
          this.conns.set(from, c);
        }
        this.viaRelay(c);
      }
    }
  }
  // out of the session: a host ends it for everyone (bye), a guest just goes; the messages queued (the hub's BYE)
  // leave first
  leave(wait = 300) {
    if (this.status.s === 'ended') return;
    if (this.client.role === 'host') this.client.bye();
    if (typeof removeEventListener === 'function') removeEventListener('pagehide', this.hide);
    this.client.close(this.client.role === 'host' ? 0 : wait);
    const conns = [...this.conns.values()];
    this.conns.clear();
    this.status = { s: 'ended', why: 'left' };
    setTimeout(() => conns.forEach((c) => this.drop(c)), wait);
  }
}
