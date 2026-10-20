// Keeping a shared document in step over links to other peers (a data channel of WebRTC, the tabs of this browser):
// when a link opens, each side says what it has (its state vector) and gets back what it lacks; then every change of
// the document goes out on every link but the one it came from — so a peer joined to two others passes their changes
// on (one host and its guests). Messages are bytes: a kind, then the content; a long one (an imported file in the first
// exchange) is cut into chunks and put back together on the other side. Pure: the links are given.
import * as Y from 'yjs';
import { deflate, inflate } from './zip.ts';

// A link to one peer (or to all the tabs of this browser): bytes in, bytes out.
export interface Link {
  readonly id: string;
  // the longest message it carries at once (absent: CHUNK)
  readonly chunk?: number;
  // long messages compressed on it (between computers: a slow network)
  readonly compress?: boolean;
  send(bytes: Uint8Array): void;
  onBytes(f: (bytes: Uint8Array) => void): void;
  onClose(f: () => void): void;
  close(): void;
}

const SV = 1; // my state vector: send me what I lack
const UPDATE = 2; // an update of the document
const HELLO = 3; // who I am (my name, as UTF-8)
const BYE = 4; // I leave (the link closing next is not a lost connection)
const AWARE = 5; // where someone is (presence: a cursor, the nodes selected) — passed on to the other links, never kept
const ZIP = 6; // a long message compressed (deflate): expanded, then read as itself
// a message longer than this is compressed on a link that asks for it
export const ZIP_MIN = 512 * 1024;

export const CHUNK = 16 * 1024; // a data channel carries 16 kB messages everywhere
const HEAD = 9; // 1: 0xff, 4: the message's number, 2: the chunk's index, 2: the number of chunks

// A message cut into chunks of CHUNK bytes at most (a short one: as it is; its first byte is never 0xff).
export function chunked(msg: Uint8Array, id: number, max = CHUNK): Uint8Array[] {
  if (msg.length <= max) return [msg];
  const size = max - HEAD;
  const n = Math.ceil(msg.length / size);
  if (n > 0xffff) throw new Error('message too long');
  const out: Uint8Array[] = [];
  for (let k = 0; k < n; k++) {
    const part = msg.subarray(k * size, (k + 1) * size);
    const c = new Uint8Array(HEAD + part.length);
    const v = new DataView(c.buffer);
    c[0] = 0xff;
    v.setUint32(1, id >>> 0);
    v.setUint16(5, k);
    v.setUint16(7, n);
    c.set(part, HEAD);
    out.push(c);
  }
  return out;
}

// The chunks put back together: a whole message when its last chunk came (null meanwhile).
export class Joiner {
  private parts = new Map<number, { got: number; chunks: Uint8Array[] }>();
  add(c: Uint8Array): Uint8Array | null {
    if (c[0] !== 0xff) return c;
    const v = new DataView(c.buffer, c.byteOffset, c.byteLength);
    const [id, k, n] = [v.getUint32(1), v.getUint16(5), v.getUint16(7)];
    let p = this.parts.get(id);
    if (!p) this.parts.set(id, (p = { got: 0, chunks: new Array(n) }));
    if (!p.chunks[k]) p.got++;
    p.chunks[k] = c.subarray(HEAD);
    if (p.got < n) return null;
    this.parts.delete(id);
    const out = new Uint8Array(p.chunks.reduce((s, q) => s + q.length, 0));
    let at = 0;
    for (const q of p.chunks) {
      out.set(q, at);
      at += q.length;
    }
    return out;
  }
}

const framed = (kind: number, body: Uint8Array) => {
  const m = new Uint8Array(body.length + 1);
  m[0] = kind;
  m.set(body, 1);
  return m;
};

export type Peer = { link: Link; name: string; synced: boolean };

// The document kept in step over its links. onSynced: the first time a link has sent what this side lacked (a peer
// joining knows then that it has the project); onPeers: a link added, named, in step, or gone.
export class SyncHub {
  readonly peers = new Map<string, Peer>();
  // the links whose peer said it leaves (their closing is not a lost connection)
  readonly left = new Set<string>();
  private seq = 1;
  private joiners = new Map<string, Joiner>();
  private syncedOnce = false;
  private syncedL = new Set<() => void>();
  private peersL = new Set<() => void>();
  // presence: a message from a link (passed on to the others), and a link gone (whose presence goes with it)
  private awareL = new Set<(bytes: Uint8Array, from: string) => void>();
  private goneL = new Set<(link: string) => void>();
  private readonly onUpdate = (u: Uint8Array, origin: unknown) => {
    for (const p of this.peers.values()) if (p.link !== origin) this.send(p.link, framed(UPDATE, u));
  };
  readonly doc: Y.Doc;
  private name: string;
  constructor(doc: Y.Doc, name = '') {
    this.doc = doc;
    this.name = name;
    doc.on('update', this.onUpdate);
  }
  private send(link: Link, msg: Uint8Array) {
    if (link.compress && msg.length > ZIP_MIN) {
      // compressed apart from the page (it may arrive after a later short message: the document puts them in order)
      void deflate(msg).then(
        (z) => this.sendAs(link, framed(ZIP, z)),
        () => this.sendAs(link, msg),
      );
      return;
    }
    this.sendAs(link, msg);
  }
  private sendAs(link: Link, msg: Uint8Array) {
    for (const c of chunked(msg, this.seq++, link.chunk ?? CHUNK)) link.send(c);
  }
  // a new link: what each side has is exchanged
  add(link: Link) {
    const peer: Peer = { link, name: '', synced: false };
    this.peers.set(link.id, peer);
    this.joiners.set(link.id, new Joiner());
    link.onBytes((bytes) => this.receive(peer, bytes));
    link.onClose(() => {
      this.peers.delete(link.id);
      this.joiners.delete(link.id);
      this.goneL.forEach((f) => f(link.id));
      this.peersL.forEach((f) => f());
    });
    this.send(link, framed(HELLO, new TextEncoder().encode(this.name)));
    this.send(link, framed(SV, Y.encodeStateVector(this.doc)));
    this.peersL.forEach((f) => f());
  }
  private receive(peer: Peer, bytes: Uint8Array) {
    const msg = this.joiners.get(peer.link.id)?.add(bytes);
    if (!msg?.length) return;
    if (msg[0] === ZIP) {
      void inflate(msg.subarray(1)).then((m) => this.peers.get(peer.link.id) === peer && this.handle(peer, m));
      return;
    }
    this.handle(peer, msg);
  }
  private handle(peer: Peer, msg: Uint8Array) {
    if (!msg.length) return;
    const body = msg.subarray(1);
    if (msg[0] === SV) this.send(peer.link, framed(UPDATE, Y.encodeStateAsUpdate(this.doc, body)));
    else if (msg[0] === UPDATE) {
      Y.applyUpdate(this.doc, body, peer.link);
      if (!peer.synced) {
        // the first update from a link answers this side's state vector: in step with it
        peer.synced = true;
        this.peersL.forEach((f) => f());
        if (!this.syncedOnce) {
          this.syncedOnce = true;
          this.syncedL.forEach((f) => f());
        }
      }
    } else if (msg[0] === HELLO) {
      peer.name = new TextDecoder().decode(body);
      this.peersL.forEach((f) => f());
    } else if (msg[0] === BYE) this.left.add(peer.link.id);
    else if (msg[0] === AWARE) {
      for (const p of this.peers.values()) if (p !== peer) this.send(p.link, msg);
      this.awareL.forEach((f) => f(body, peer.link.id));
    }
  }
  onSynced(f: () => void) {
    this.syncedL.add(f);
    if (this.syncedOnce) f();
  }
  // presence: sent to every link; heard from any (and the links that go)
  sendAware(bytes: Uint8Array) {
    for (const p of this.peers.values()) this.send(p.link, framed(AWARE, bytes));
  }
  onAware(f: (bytes: Uint8Array, from: string) => void) {
    this.awareL.add(f);
    return () => void this.awareL.delete(f);
  }
  onGone(f: (link: string) => void) {
    this.goneL.add(f);
    return () => void this.goneL.delete(f);
  }
  onPeers(f: () => void) {
    this.peersL.add(f);
    return () => void this.peersL.delete(f);
  }
  // leaving: each peer told first, the links closed a moment later (the message has time to go)
  close(wait = 300) {
    this.doc.off('update', this.onUpdate);
    const links = [...this.peers.values()].map((p) => p.link);
    for (const l of links) this.send(l, new Uint8Array([BYE]));
    this.peers.clear();
    const end = () => links.forEach((l) => l.close());
    if (wait > 0) setTimeout(end, wait);
    else end();
  }
}
