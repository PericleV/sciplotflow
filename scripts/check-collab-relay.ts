// A session by link, through the relay: the relay's room (relay/src/room.ts, pure: a clock and sockets of our own), the
// sealing (AES-GCM, the envelope holds no plaintext), the framing, the session's link; then the app's own relay links
// and SyncHub through a relay in memory (the same room logic, sockets that behave as the Durable Object's): a host and
// two guests, the project in step, the host's connection lost and back (the work done meanwhile merged), the grace
// minute run out, the host leaving. relayScenario is also run against a real relay (wrangler dev): scripts/relay-live.ts.
import * as Y from 'yjs';
import { CLOSE, envelope, GRACE_MS, hashToken, MAX_MESSAGE, MAX_PEERS, RoomLogic, withId, type RoomIO, type RoomState, type Sock } from '../relay/src/room.ts';
import { aadOf, b64u, frame, importKey, KIND_DATA, KIND_SIGNAL, newKey, newRoomId, parseSession, RelayClient, RelayPeers, seal, sessionLink, socketBase, unframe, unseal, type SocketFactory, type Status } from '../src/collab/relay.ts';
import { SyncHub } from '../src/collab/sync.ts';

type Ok = (cond: boolean, what: string) => void;

// ---- the room alone ----

class FakeSock implements Sock {
  readonly peer: string;
  readonly role: 'host' | 'guest';
  sent: (string | Uint8Array)[] = [];
  closedWith = 0;
  constructor(peer: string, role: 'host' | 'guest') {
    this.peer = peer;
    this.role = role;
  }
  send(m: string | Uint8Array) {
    if (this.closedWith) throw new Error('closed');
    this.sent.push(m);
  }
  close(code: number) {
    if (!this.closedWith) this.closedWith = code;
  }
  controls() {
    return this.sent.filter((m): m is string => typeof m === 'string').map((m) => JSON.parse(m) as { t: string; [k: string]: unknown });
  }
  last() {
    return this.controls().at(-1);
  }
}

function roomChecks(ok: Ok, hashes: { good: string; bad: string }) {
  let clock = 1_000_000;
  let saved: RoomState | null = null;
  let alarmAt: number | null = null;
  let socks: FakeSock[] = [];
  const io: RoomIO = { sockets: () => socks.filter((s) => !s.closedWith), save: (s) => void (saved = s), alarm: (at) => void (alarmAt = at), now: () => clock };
  const room = new RoomLogic(io, null);
  const join = (peer: string, role: 'host' | 'guest', hash = '', resume = false) => {
    const s = new FakeSock(peer, role);
    socks.push(s);
    room.join(s, hash, resume);
    return s;
  };
  const gone = (s: FakeSock) => {
    s.close(1006);
    room.closed(s);
  };

  const early = join('guest-early', 'guest');
  ok(early.closedWith === CLOSE.noSession && saved === null, 'relay room: a guest before the host is refused (4404), nothing kept');
  const host = join('host-peer1', 'host', hashes.good);
  ok(host.last()?.t === 'welcome' && (saved as RoomState | null)?.host === 'host-peer1' && (saved as RoomState | null)?.tokenHash === hashes.good && !JSON.stringify(saved).includes('secret'), 'relay room: the host makes the session (its peer id and the hash of its token kept, never the token)');
  const g1 = join('guest-one1', 'guest');
  const g2 = join('guest-two2', 'guest');
  ok(g1.last()?.t === 'welcome' && g1.last()?.host === 'host-peer1' && g1.last()?.hostOnline === true && host.controls().filter((c) => c.t === 'join').map((c) => c.peer).join() === 'guest-one1,guest-two2', 'relay room: guests join; the host is told of each');

  // routing: guest → host with the sender's id; host → guest; guest → guest refused (a star)
  const payload = new Uint8Array([9, 8, 7, 6]);
  room.message(g1, withId(KIND_SIGNAL, 'host-peer1', payload));
  const atHost = host.sent.at(-1) as Uint8Array;
  const eh = envelope(atHost);
  ok(eh?.id === 'guest-one1' && eh.kind === KIND_SIGNAL && atHost.subarray(eh.at).join() === '9,8,7,6', 'relay room: a guest’s message reaches the host, marked with whom it comes from');
  room.message(host, withId(KIND_DATA, 'guest-two2', payload));
  const eg = envelope(g2.sent.at(-1) as Uint8Array);
  ok(eg?.id === 'host-peer1' && eg.kind === KIND_DATA, 'relay room: the host’s message reaches the guest it is for');
  const before = g2.sent.length;
  room.message(g1, withId(KIND_DATA, 'guest-two2', payload));
  ok(g2.sent.length === before, 'relay room: a guest cannot send to another guest (only to the host)');
  room.message(g1, new Uint8Array(MAX_MESSAGE + 1));
  ok(g1.closedWith === CLOSE.tooBig, 'relay room: a message over 4 MiB closes the socket (1009)');
  room.closed(g1);
  ok(host.last()?.t === 'leave' && host.last()?.peer === 'guest-one1', 'relay room: a guest gone — the host is told');

  // 16 at most
  const many: FakeSock[] = [];
  for (let i = 0; i < 20; i++) many.push(join(`guest-many-${String(i).padStart(2, '0')}`, 'guest'));
  const inRoom = io.sockets().length;
  ok(inRoom === MAX_PEERS && many.filter((s) => s.closedWith === CLOSE.full).length === 20 - (MAX_PEERS - 2), `relay room: ${MAX_PEERS} sockets at most in a room (the others refused with 4409; ${inRoom} in)`);
  for (const s of many) if (!s.closedWith) gone(s);

  // a wrong token: refused without disturbing the host (even with the host's own peer id)
  const thief = join('host-peer1', 'host', hashes.bad);
  ok(thief.closedWith === CLOSE.token && !host.closedWith, 'relay room: a host with a wrong token is refused (4401) and the real host stays');
  const fakeGuest = join('host-peer1', 'guest');
  ok(fakeGuest.closedWith === CLOSE.bad && !host.closedWith, 'relay room: a guest cannot take the host’s id');

  // the host's connection lost: the guests told, the grace minute in storage and an alarm
  gone(host);
  ok(g2.last()?.t === 'host-lost' && g2.last()?.ms === GRACE_MS && saved?.graceUntil === clock + GRACE_MS && alarmAt === clock + GRACE_MS, 'relay room: the host’s connection lost — the guests told (60 s), the deadline kept and an alarm set');
  clock += 20_000;
  const late = join('guest-late3', 'guest');
  ok(late.last()?.t === 'welcome' && late.last()?.hostOnline === false && late.last()?.graceMs === GRACE_MS - 20_000, 'relay room: a guest coming meanwhile is told the host is away, and for how long yet');
  room.message(late, withId(KIND_DATA, 'host-peer1', payload));
  const wrong = join('host-peer1', 'host', hashes.bad, true);
  ok(wrong.closedWith === CLOSE.token && saved?.graceUntil !== undefined, 'relay room: a wrong token cannot take the host’s place while it is away');
  clock += 30_000;
  const back = join('host-peer1', 'host', hashes.good, true);
  ok(!back.closedWith && back.last()?.t === 'welcome' && ((back.last()?.peers as string[] | undefined) ?? []).sort().join() === 'guest-late3,guest-two2' && g2.last()?.t === 'host-back' && saved?.graceUntil === undefined && alarmAt === null, 'relay room: the host back within the minute with its token — the guests told, the guests listed for it, the deadline cleared');
  // the same host again (a reconnection before the old socket was seen closed): the old one replaced, no grace
  const again = join('host-peer1', 'host', hashes.good, true);
  room.closed(back);
  ok(back.closedWith === CLOSE.replaced && !again.closedWith && saved?.graceUntil === undefined, 'relay room: a socket of the same peer replaces the old one (its closing is not a lost connection)');

  // the minute runs out
  gone(again);
  clock += GRACE_MS - 1;
  room.alarm();
  ok(saved?.graceUntil !== undefined && !g2.closedWith, 'relay room: an alarm before the deadline changes nothing');
  clock += 2;
  room.alarm();
  ok(g2.controls().at(-1)?.t === 'ended' && g2.controls().at(-1)?.why === 'timeout' && g2.closedWith === CLOSE.ended && late.closedWith === CLOSE.ended && saved === null && alarmAt === null, 'relay room: the minute out — ended for everyone, every socket closed, nothing kept');
  const resume = join('host-peer1', 'host', hashes.good, true);
  ok(resume.closedWith === CLOSE.noSession && saved === null, 'relay room: a host coming back after the end does not make the session again');

  // the host leaves (bye): ended at once
  socks = [];
  const h2 = join('host-peer2', 'host', hashes.good);
  const g3 = join('guest-three', 'guest');
  room.message(g3, JSON.stringify({ t: 'bye' }));
  ok(!g3.closedWith, 'relay room: a guest cannot end the session');
  room.message(h2, JSON.stringify({ t: 'bye' }));
  ok(g3.controls().at(-1)?.t === 'ended' && g3.controls().at(-1)?.why === 'left' && g3.closedWith === CLOSE.ended && h2.closedWith === CLOSE.ended && saved === null, 'relay room: the host leaves — ended for everyone at once, nothing kept');
  room.closed(h2);
  ok(saved === null && alarmAt === null, 'relay room: the host’s socket closing after its bye starts no grace');
}

// ---- a relay in memory: the room logic behind sockets that behave as a browser's WebSocket ----

export class MemoryRelay {
  clock = Date.now();
  rooms = new Map<string, { logic: RoomLogic; socks: Set<Sock & { open: boolean }>; alarmAt: number | null }>();
  // the bytes the relay saw (what it could read)
  seen: Uint8Array[] = [];
  private queue: (() => void)[] = [];
  private busy = false;
  private post(f: () => void) {
    this.queue.push(f);
    if (!this.busy) {
      this.busy = true;
      setTimeout(() => {
        this.busy = false;
        const q = this.queue.splice(0);
        for (const g of q) g();
      }, 0);
    }
  }
  room(name: string) {
    let r = this.rooms.get(name);
    if (!r) {
      const socks = new Set<Sock & { open: boolean }>();
      const rr = { logic: null as unknown as RoomLogic, socks, alarmAt: null as number | null };
      rr.logic = new RoomLogic({ sockets: () => [...socks].filter((s) => s.open), save: () => {}, alarm: (at) => void (rr.alarmAt = at), now: () => this.clock }, null);
      this.rooms.set(name, (r = rr));
    }
    return r;
  }
  // time passes on the relay: its alarms ring
  advance(ms: number) {
    this.clock += ms;
    for (const r of this.rooms.values()) if (r.alarmAt !== null && r.alarmAt <= this.clock) r.logic.alarm();
  }
  socket: SocketFactory = (url: string) => {
    const u = new URL(url);
    const name = u.pathname.split('/')[2];
    const peer = u.searchParams.get('peer') ?? '';
    const role = u.searchParams.get('role') as 'host' | 'guest';
    const token = u.searchParams.get('token') ?? '';
    const r = this.room(name);
    const ws = {
      readyState: 0,
      binaryType: 'arraybuffer',
      onopen: null as null | (() => void),
      onmessage: null as null | ((e: { data: string | ArrayBuffer }) => void),
      onclose: null as null | ((e: { code: number }) => void),
      onerror: null as null | (() => void),
      send: (m: string | Uint8Array) => {
        if (ws.readyState !== 1) throw new Error('not open');
        const data = typeof m === 'string' ? m : m.slice();
        if (typeof data !== 'string') this.seen.push(data);
        this.post(() => sock.open && r.logic.message(sock, data));
      },
      close: (code = 1000) => {
        if (ws.readyState === 3) return;
        ws.readyState = 3;
        this.post(() => {
          if (sock.open) {
            sock.open = false;
            r.logic.closed(sock);
          }
          ws.onclose?.({ code });
        });
      },
    };
    const sock: Sock & { open: boolean } = {
      peer,
      role,
      open: true,
      send: (m) => {
        if (!sock.open) throw new Error('closed');
        const data = typeof m === 'string' ? m : (m.slice().buffer as ArrayBuffer);
        this.post(() => ws.readyState === 1 && ws.onmessage?.({ data }));
      },
      close: (code) => {
        if (!sock.open) return;
        sock.open = false;
        this.post(() => {
          r.logic.closed(sock);
          if (ws.readyState !== 3) {
            ws.readyState = 3;
            ws.onclose?.({ code });
          }
        });
      },
    };
    void hashToken(token).then((h) => {
      ws.readyState = 1;
      ws.onopen?.();
      r.socks.add(sock);
      r.logic.join(sock, token ? h : '', u.searchParams.get('resume') === '1');
    });
    return ws as unknown as WebSocket;
  };
}

// until a condition holds (or the time is up)
export async function until(cond: () => boolean, ms = 5000): Promise<boolean> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

// A host and two guests through a relay, with the app's own relay links and SyncHub (no WebRTC: the relay links).
// expire: how to make the host's minute run out (the relay in memory: its clock; a real one: wait for it), or none.
export async function relayScenario(ok: Ok, base: string, socket: SocketFactory, label: string, expire?: () => Promise<void>) {
  const mk = async (role: 'host' | 'guest', key: CryptoKey, room: string, name: string) => {
    const doc = new Y.Doc();
    const hub = new SyncHub(doc, name);
    const client = new RelayClient({ base, room, key, role, socket });
    const peers = new RelayPeers(client, (l) => hub.add(l), { rtc: false });
    const statuses: Status['s'][] = [];
    peers.onStatus((s) => statuses.push(s.s));
    const err = await peers.start();
    return { doc, hub, client, peers, statuses, err, m: doc.getMap<unknown>('m') };
  };
  const { key, text } = await newKey();
  const room = newRoomId();
  const H = await mk('host', key, room, 'Host');
  H.m.set('a', 1);
  const G1 = await mk('guest', key, room, 'Ana');
  const G2 = await mk('guest', key, room, 'Bob');
  ok(H.err === null && G1.err === null && G2.err === null && H.statuses.includes('live') && G1.statuses.includes('live'), `${label}: a host and two guests in the session (${H.err ?? G1.err ?? G2.err ?? 'welcomed'})`);
  const inStep = await until(() => G1.m.get('a') === 1 && G2.m.get('a') === 1);
  const hostLinks = [...H.hub.peers.keys()];
  ok(inStep && hostLinks.length === 2 && hostLinks.every((id) => H.peers.kindOf(id) === 'relay') && [...H.hub.peers.values()].map((p) => p.name).sort().join() === 'Ana,Bob', `${label}: the guests get the project through the relay links (shown as “through the relay”)`);
  G1.m.set('b', 'from Ana');
  ok(await until(() => G2.m.get('b') === 'from Ana' && H.m.get('b') === 'from Ana'), `${label}: a guest's change reaches the host and the other guest (through the host)`);
  // a big change: several relay messages, compressed
  let big = '';
  for (let i = 0; big.length < 3_000_000; i++) big += `${i},${Math.sin(i).toFixed(9)}\n`;
  H.m.set('big', big);
  ok(await until(() => G2.m.get('big') === big && G1.m.get('big') === big, 20000), `${label}: a ${(big.length / 1e6).toFixed(1)} MB change reaches both guests whole`);
  G2.m.set('c', 'from Bob');
  ok(await until(() => H.m.get('c') === 'from Bob'), `${label}: data both ways`);

  // the host's connection lost: the guests see the countdown; the host comes back by itself (its token) and the
  // links are made again — what a guest did meanwhile merged
  H.client.drop();
  ok(await until(() => G1.peers.status.s === 'host-lost' && G2.peers.status.s === 'host-lost'), `${label}: the host's connection lost — the guests see the countdown`);
  G1.m.set('d', 'while the host was away');
  H.m.set('e', 'host meanwhile');
  ok(await until(() => G1.peers.status.s === 'live' && H.peers.status.s === 'live', 10000), `${label}: the host comes back (its token) — the session goes on`);
  ok(await until(() => H.m.get('d') === 'while the host was away' && G2.m.get('d') === 'while the host was away' && G1.m.get('e') === 'host meanwhile', 10000), `${label}: the links made again — what both did meanwhile merged, everywhere`);

  // someone else with the link but not the token cannot be the host
  const thief = new RelayClient({ base, room, key, role: 'host', socket });
  const terr = await thief.connect(true);
  ok(!!terr && /only the person/i.test(terr), `${label}: only the host (its token) can come back as the host (${terr})`);
  // a link to no session
  const lone = new RelayClient({ base, room: newRoomId(), key, role: 'guest', socket });
  const lerr = await lone.connect();
  ok(!!lerr && /over/i.test(lerr), `${label}: a link to no session is refused (${lerr})`);
  // the wrong key: the messages cannot be opened (counted, not used)
  const other = await importKey(b64u(crypto.getRandomValues(new Uint8Array(32))));
  const G3 = await mk('guest', other, room, 'Eve');
  await until(() => G3.client.bad > 0, 3000);
  ok(G3.client.bad > 0 && G3.m.size === 0, `${label}: a guest with the wrong key gets nothing it can read`);
  G3.peers.leave(0);

  H.peers.leave();
  ok(await until(() => G1.peers.status.s === 'ended' && G2.peers.status.s === 'ended') && (G1.peers.status as { why: string }).why === 'left' && G2.m.get('c') === 'from Bob', `${label}: the host leaves — the session over for everyone at once, their project kept`);
  if (expire) {
    // another session: its host gone for good without a bye — the minute runs out, the session ends for the guest
    // (its work kept)
    const k2 = await newKey();
    const room2 = newRoomId();
    const H2 = await mk('host', k2.key, room2, 'Host');
    H2.m.set('x', 'kept');
    const G4 = await mk('guest', k2.key, room2, 'Ana');
    await until(() => G4.m.get('x') === 'kept');
    H2.client.close();
    ok(await until(() => G4.peers.status.s === 'host-lost'), `${label}: the host gone without a bye — the guest sees the countdown`);
    await expire();
    ok(await until(() => G4.peers.status.s === 'ended', 70000) && (G4.peers.status as { why: string }).why === 'timeout' && G4.m.get('x') === 'kept', `${label}: the minute out — the session over for the guest (${G4.peers.status.s === 'ended' ? (G4.peers.status as { why: string }).why : G4.peers.status.s}), its project kept`);
    G4.peers.leave(0);
    for (const x of [H2, G4]) x.hub.close(0);
  }
  for (const x of [G1, G2]) x.peers.leave(0);
  for (const x of [H, G1, G2]) x.hub.close(0);
  return { text };
}

export async function checkCollabRelay(ok: Ok) {
  // ---- the room ----
  roomChecks(ok, { good: await hashToken('secret-token-1'), bad: await hashToken('another') });

  // ---- sealing ----
  const { key, text } = await newKey();
  ok(text.length === 43 && newRoomId().length === 22 && newRoomId() !== newRoomId(), 'relay sealing: a 256-bit key (43 characters) and a 128-bit room (22)');
  const plain = new TextEncoder().encode('v=0\r\no=- 4611 2 IN IP4 192.168.1.132\r\na=candidate:1 1 udp 2122260223 192.168.1.132 54321 typ host');
  const aad = aadOf(KIND_SIGNAL, 'peer-from-1', 'peer-to-2');
  const s1 = await seal(key, aad, plain);
  const s2 = await seal(key, aad, plain);
  const back = await unseal(key, aad, s1);
  ok(!!back && new TextDecoder().decode(back) === new TextDecoder().decode(plain), 'relay sealing: what is sealed opens again with the key');
  ok(s1.subarray(0, 12).join() !== s2.subarray(0, 12).join() && s1.join() !== s2.join(), 'relay sealing: a random IV for every message (the same text sealed twice differs)');
  const wire = frame(KIND_SIGNAL, 'peer-to-2', s1);
  const wireText = new TextDecoder('latin1').decode(wire);
  const env = unframe(wire);
  ok(env?.kind === KIND_SIGNAL && env.id === 'peer-to-2' && !wireText.includes('192.168') && !wireText.includes('candidate') && !wireText.includes('v=0') && env.payload.length === plain.length + 28, 'relay sealing: the envelope holds the kind, the receiver and the size — no address, no description');
  const other = await importKey(b64u(crypto.getRandomValues(new Uint8Array(32))));
  const tampered = s1.slice();
  tampered[20] ^= 1;
  ok((await unseal(other, aad, s1)) === null && (await unseal(key, aadOf(KIND_SIGNAL, 'someone-else', 'peer-to-2'), s1)) === null && (await unseal(key, aadOf(KIND_DATA, 'peer-from-1', 'peer-to-2'), s1)) === null && (await unseal(key, aad, tampered)) === null, 'relay sealing: another key, another sender, another kind or a changed byte — not opened');

  // ---- framing: the app's frames are the relay's envelopes ----
  const p = new Uint8Array([1, 2, 3]);
  const f = frame(KIND_DATA, 'abcdefgh12', p);
  const e = envelope(f);
  ok(!!e && e.kind === KIND_DATA && e.id === 'abcdefgh12' && f.subarray(e.at).join() === '1,2,3' && withId(KIND_DATA, 'abcdefgh12', p).join() === f.join() && unframe(new Uint8Array([2, 9, 1])) === null, 'relay framing: the app and the relay read the same envelope ([kind][n][id][payload]); a cut one is refused');

  // ---- the session's link ----
  const room = newRoomId();
  const link = sessionLink(room, text, 'https://periclev.github.io/sciplotflow/');
  const parsed = parseSession(link);
  ok(link === `https://periclev.github.io/sciplotflow/#s=${room}.${text}` && parsed?.room === room && parsed.key === text && parseSession(`#s=${room}.${text}`)?.key === text && parseSession(`${room}.${text}`)?.room === room, 'relay link: the room and the key in the fragment, read back from the link, the fragment or room.key');
  ok(parseSession(`${link.slice(0, -1)}`) === null && parseSession(`#s=${room}`) === null && parseSession('#join=abc') === null && parseSession(`#s=${room.slice(1)}.${text}`) === null, 'relay link: a link cut short (or not a session’s) is refused');
  ok(socketBase('https://relay.example.workers.dev/') === 'wss://relay.example.workers.dev' && socketBase('http://localhost:8787') === 'ws://localhost:8787' && socketBase('wss://a.b') === 'wss://a.b' && socketBase('relay.example') === null && socketBase('') === null, 'relay link: the relay’s address as a WebSocket base');

  // ---- the app's links through a relay in memory ----
  const mem = new MemoryRelay();
  await relayScenario(ok, 'wss://relay.test', mem.socket, 'relay in memory', async () => mem.advance(GRACE_MS + 1));
  const sealedOnly = mem.seen.every((b) => {
    const t = new TextDecoder('latin1').decode(b);
    return !t.includes('from Ana') && !t.includes('Host') && !t.includes('"t":"relay"');
  });
  ok(mem.seen.length > 10 && sealedOnly, `relay in memory: none of the ${mem.seen.length} messages the relay passed holds a readable change, name or signal`);
}
