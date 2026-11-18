// The relay for real (not part of npm run check: it needs one running). In relay/: npx wrangler dev (local, no
// account), then: node scripts/relay-live.ts [ws://127.0.0.1:8787] [--grace]
// 1. The protocol by hand: a host and two guests, a signal sealed on the way (the relay passes it with the sender's id
//    and cannot read it), data both ways, a page from another origin refused, the host's drop / return / bye.
// 2. The app's own relay links and SyncHub through it (relayScenario of check-collab-relay.ts); --grace also waits the
//    minute out (the session ends for the guests when the host does not come back).
import { aadOf, frame, KIND_DATA, KIND_SIGNAL, newKey, newPeerId, newRoomId, newToken, seal, unframe, unseal } from '../src/collab/relay.ts';
import { relayScenario, until } from './check-collab-relay.ts';

const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'ws://127.0.0.1:8787';
const ORIGIN = 'http://localhost:5180';
const t0 = Date.now();
let passed = 0;
let failed = 0;
const ok = (c: boolean, what: string) => {
  if (c) passed++;
  else failed++;
  console.log(`${c ? 'ok  ' : 'FAIL'} ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} s  ${what}`);
};
const socket = (url: string, origin = ORIGIN) => new WebSocket(url, { headers: { Origin: origin } } as unknown as string[]);

type Raw = { ws: WebSocket; peer: string; got: (string | Uint8Array)[]; closed: number; opened: boolean };
function raw(room: string, role: 'host' | 'guest', peer = newPeerId(), token = '', resume = false, origin = ORIGIN): Promise<Raw> {
  const q = new URLSearchParams({ peer, role });
  if (token) q.set('token', token);
  if (resume) q.set('resume', '1');
  const ws = socket(`${base}/r/${room}?${q}`, origin);
  ws.binaryType = 'arraybuffer';
  const r: Raw = { ws, peer, got: [], closed: 0, opened: false };
  return new Promise((done) => {
    ws.onopen = () => (r.opened = true);
    ws.onmessage = (e) => {
      r.got.push(typeof e.data === 'string' ? e.data : new Uint8Array(e.data as ArrayBuffer));
      if (typeof e.data === 'string' && e.data.includes('welcome')) done(r);
    };
    ws.onclose = (e) => {
      r.closed = e.code || 1005;
      done(r);
    };
    ws.onerror = () => {};
  });
}
const controls = (r: Raw) => r.got.filter((m): m is string => typeof m === 'string' && m.startsWith('{')).map((m) => JSON.parse(m) as { t: string; why?: string; ms?: number });
const binaries = (r: Raw) => r.got.filter((m): m is Uint8Array => typeof m !== 'string');


{
  const { key } = await newKey();
  const room = newRoomId();
  const token = newToken();
  const bad = await raw(room, 'guest', undefined, '', false, 'https://evil.example');
  ok(bad.closed === 4403, `live relay: a page from an origin not allowed is refused (closed ${bad.closed})`);
  const none = await raw(room, 'guest');
  ok(none.closed === 4404, `live relay: a guest before the host is refused (closed ${none.closed})`);
  const host = await raw(room, 'host', newPeerId(), token);
  const g1 = await raw(room, 'guest');
  const g2 = await raw(room, 'guest');
  ok(!host.closed && !g1.closed && !g2.closed && (await until(() => controls(host).filter((c) => c.t === 'join').length === 2)), 'live relay: a host and two guests in; the host told of each');
  // a signal sealed (an SDP with an address): the relay passes it on with the sender's id; nobody on the way reads it
  const sdp = 'v=0\r\na=candidate:1 1 udp 2122260223 192.168.1.132 54321 typ host';
  const sealed = await seal(key, aadOf(KIND_SIGNAL, g1.peer, host.peer), new TextEncoder().encode(JSON.stringify({ t: 'offer', n: 1, sdp })));
  const out = frame(KIND_SIGNAL, host.peer, sealed);
  g1.ws.send(out);
  ok(await until(() => binaries(host).length === 1), 'live relay: the signal arrives');
  const f = unframe(binaries(host)[0])!;
  const opened = await unseal(key, aadOf(KIND_SIGNAL, f.id, host.peer), f.payload);
  ok(f.id === g1.peer && !new TextDecoder('latin1').decode(out).includes('192.168') && !!opened && new TextDecoder().decode(opened).includes('192.168.1.132'), 'live relay: sealed on the wire (no address readable), from the right guest, opened by the host');
  // data both ways, 1 MiB
  const big = crypto.getRandomValues(new Uint8Array(65536));
  const mib = new Uint8Array(1 << 20);
  for (let i = 0; i < 16; i++) mib.set(big, i * 65536);
  host.ws.send(frame(KIND_DATA, g2.peer, await seal(key, aadOf(KIND_DATA, host.peer, g2.peer), mib)));
  g2.ws.send(frame(KIND_DATA, host.peer, await seal(key, aadOf(KIND_DATA, g2.peer, host.peer), mib.subarray(0, 1000))));
  ok(await until(() => binaries(g2).length === 1 && binaries(host).length === 2), 'live relay: data both ways (1 MiB host → guest, 1 kB back)');
  const d = unframe(binaries(g2)[0])!;
  const dOpen = await unseal(key, aadOf(KIND_DATA, d.id, g2.peer), d.payload);
  ok(!!dOpen && dOpen.length === mib.length && dOpen[123456] === mib[123456], 'live relay: 1 MiB arrives whole and opens');
  // a guest to another guest: dropped
  g1.ws.send(frame(KIND_DATA, g2.peer, new Uint8Array(40)));
  await new Promise((r) => setTimeout(r, 300));
  ok(binaries(g2).length === 1, 'live relay: a guest cannot send to another guest');
  // over 4 MiB: closed
  const huge = await raw(room, 'guest');
  huge.ws.send(new Uint8Array(4 * 1024 * 1024 + 10));
  ok(await until(() => huge.closed !== 0), `live relay: a message over 4 MiB closes the socket (closed ${huge.closed})`);
  // the host drops (no bye): the guests are told; back with its token within the minute
  host.ws.close(4100, 'dropped');
  ok(await until(() => controls(g1).some((c) => c.t === 'host-lost')), `live relay: the host's connection lost — the guests told (${controls(g1).find((c) => c.t === 'host-lost')?.ms} ms to come back)`);
  const thief = await raw(room, 'host', newPeerId(), newToken(), true);
  ok(thief.closed === 4401, `live relay: another token cannot take the host's place (closed ${thief.closed})`);
  const back = await raw(room, 'host', host.peer, token, true);
  ok(!back.closed && (await until(() => controls(g1).some((c) => c.t === 'host-back'))), 'live relay: the host back with its token — the guests told');
  // ping: answered by the platform
  back.ws.send('ping');
  ok(await until(() => back.got.includes('pong')), 'live relay: ping answered (pong)');
  // the host leaves
  back.ws.send(JSON.stringify({ t: 'bye' }));
  ok(await until(() => g1.closed === 4000 && g2.closed === 4000) && controls(g2).at(-1)?.why === 'left', `live relay: the host leaves — ended for everyone (closed ${g1.closed}, ${g2.closed})`);
  const after = await raw(room, 'guest');
  ok(after.closed === 4404, 'live relay: nothing left of the session afterwards (a guest is refused)');
}

// the app's own links and SyncHub through it
await relayScenario(ok, base, (u) => socket(u), 'live relay, the app’s links', process.argv.includes('--grace') ? async () => {} : undefined);
console.log(`${passed} passed, ${failed} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
