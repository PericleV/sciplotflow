// The links of a session. Between the tabs of this browser: a BroadcastChannel of the room, seen as one link to each
// other tab (every message says who sends it and to whom). Between browsers: WebRTC, with no server of ours — the two
// people hand each other a code (an invitation, then an answer: the description of each side's connection, compressed);
// a public STUN server (Google's) tells each browser its address seen from outside, so two different networks can
// connect (it sees addresses, never the data; the data go straight from browser to browser, encrypted by WebRTC).
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { Link } from './sync.ts';

export const STUN = 'stun:stun.l.google.com:19302';
// a session's room in another tab of this browser; an invitation as a link (the page opens with it)
export const roomLink = (room: string) => `${location.origin}${location.pathname}#c=${room}`;
export const joinLink = (code: string) => `${location.origin}${location.pathname}#join=${code}`;
const ICE: RTCIceServer[] = [{ urls: STUN }];

const newId = () => crypto.randomUUID().slice(0, 8);

// ---- the tabs of this browser ----

type TabMsg = { from: string; to?: string; hello?: true; bye?: true; bytes?: Uint8Array };

// The tabs in the room: a link to every other tab, made when it says hello (a tab answers a hello it did not know).
export function tabLinks(room: string, onLink: (l: Link) => void): () => void {
  const me = newId();
  const bc = new BroadcastChannel(`sciplotflow-collab-${room}`);
  const links = new Map<string, { bytes: ((b: Uint8Array) => void)[]; close: (() => void)[] }>();
  const open = (other: string) => {
    if (links.has(other)) return;
    const h = { bytes: [] as ((b: Uint8Array) => void)[], close: [] as (() => void)[] };
    links.set(other, h);
    onLink({
      id: `tab-${other}`,
      // the tabs pass a message of any size: 1 MB at a time
      chunk: 1 << 20,
      send: (bytes) => bc.postMessage({ from: me, to: other, bytes } satisfies TabMsg),
      onBytes: (f) => void h.bytes.push(f),
      onClose: (f) => void h.close.push(f),
      close: () => {
        links.delete(other);
        h.close.forEach((f) => f());
      },
    });
  };
  bc.onmessage = (e: MessageEvent<TabMsg>) => {
    const m = e.data;
    if (m.from === me) return;
    if (m.hello) {
      const known = links.has(m.from);
      open(m.from);
      if (!known) bc.postMessage({ from: me, hello: true } satisfies TabMsg);
    } else if (m.bye) links.get(m.from)?.close.forEach((f) => f());
    else if (m.to === me && m.bytes) {
      if (!links.has(m.from)) open(m.from);
      links.get(m.from)?.bytes.forEach((f) => f(m.bytes!));
    }
  };
  bc.postMessage({ from: me, hello: true } satisfies TabMsg);
  return () => {
    bc.postMessage({ from: me, bye: true } satisfies TabMsg);
    for (const h of links.values()) h.close.forEach((f) => f());
    links.clear();
    bc.close();
  };
}

// ---- another browser: WebRTC with codes ----

// a code: the connection's description and who sends it, compressed, in URL-safe base64; an answer also says when both
// sides start trying (at: the time, ms since 1970 — clock: the answering computer's time when it made the answer)
type Signal = { t: 'offer' | 'answer'; sdp: string; room: string; name: string; at?: number; clock?: number };

// The synchronized start. A browser lets in a packet from the other side only after it has sent one there itself (the
// firewall of Windows, a home router), and a browser that tries alone gives up after about 15 s. The codes are passed by
// hand — a minute may go by — so the guest does not try at once: both sides keep the other's ways aside and start
// trying at the same moment, written in the answer (START_MS after it is made); a host that pastes it later than
// LATE_MS after that moment is told to make a new invitation (the guest has stopped trying).
export const START_MS = 40000;
export const LATE_MS = 8000;

// A description without its ways to reach that side (kept apart, to be added at the start): each with the media
// section it belongs to.
export function splitCandidates(sdp: string): { sdp: string; candidates: RTCIceCandidateInit[] } {
  const candidates: RTCIceCandidateInit[] = [];
  const kept: string[] = [];
  let index = -1;
  let mid: string | null = null;
  for (const line of sdp.split(/\r\n|\n/)) {
    if (line.startsWith('m=')) {
      index++;
      mid = null;
    } else if (line.startsWith('a=mid:')) mid = line.slice(6);
    if (line.startsWith('a=candidate:')) {
      candidates.push({ candidate: line.slice(2), sdpMLineIndex: index, ...(mid !== null ? { sdpMid: mid } : {}) });
      continue;
    }
    if (line.startsWith('a=end-of-candidates')) continue;
    kept.push(line);
  }
  // a candidate before its section's mid line: its mid from the section
  const mids: (string | null)[] = [];
  let k = -1;
  for (const line of kept) {
    if (line.startsWith('m=')) mids[++k] = null;
    else if (line.startsWith('a=mid:') && k >= 0) mids[k] = line.slice(6);
  }
  for (const c of candidates) if (c.sdpMid === undefined && typeof c.sdpMLineIndex === 'number' && mids[c.sdpMLineIndex] != null) c.sdpMid = mids[c.sdpMLineIndex]!;
  return { sdp: kept.join('\r\n'), candidates };
}
// ---- the same network: the local addresses ----
// A browser does not write its local address (192.168.1.132) in its code: it writes a made-up name (….local) that the
// other computer must look up on the network (mDNS) — many routers and institute networks block that look-up, and then
// the two cannot find each other inside the same network. Two ways around it:
// 1. Chrome writes the real local address for a page that may use the microphone or the camera (as a video call):
//    the permission asked once, the microphone closed at once (nothing recorded); the codes made afterwards have it.
// 2. The other computer's local address typed by hand: added beside each made-up name of its code, on the same port.

// the microphone asked for, then closed at once: null when allowed, else why not
export async function revealLocalAddresses(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser cannot ask for the microphone here.';
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    return `Not allowed (${(e as Error).name}): the local addresses stay hidden. The browser's site settings (the icon left of the address) can allow it later.`;
  }
}
// whether this page may use the microphone (so its codes carry the real local addresses)
export async function micAllowed(): Promise<boolean> {
  try {
    return (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state === 'granted';
  } catch {
    return false;
  }
}
// an address typed by hand: IPv4 (192.168.1.132) or IPv6
export const isAddress = (s: string) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s.trim()) || (/^[0-9a-f:]+$/i.test(s.trim()) && s.includes(':'));
// beside each way of the other side that is a made-up local name, the same way at the address typed
export function withAddress(candidates: RTCIceCandidateInit[], address: string | undefined): RTCIceCandidateInit[] {
  const a = address?.trim();
  if (!a || !isAddress(a)) return candidates;
  const out: RTCIceCandidateInit[] = [];
  for (const c of candidates) {
    out.push(c);
    const parts = (c.candidate ?? '').split(' ');
    // candidate:foundation component protocol priority ADDRESS port typ host …
    if (parts.length > 7 && parts[4].endsWith('.local') && parts[7] === 'host') {
      parts[0] = `${parts[0]}9`;
      parts[4] = a;
      out.push({ ...c, candidate: parts.join(' ') });
    }
  }
  return out;
}

// at `at`, the other side's ways added: the checks begin, on both sides at once
function startAt(pc: RTCPeerConnection, candidates: RTCIceCandidateInit[], at: number) {
  setTimeout(
    () => {
      if (pc.signalingState === 'closed') return;
      mark(pc, `start: ${candidates.length} ways of the other side added`);
      for (const c of candidates) void pc.addIceCandidate(c).catch((e: Error) => mark(pc, `a way refused: ${e.message}`));
    },
    Math.max(0, at - Date.now()),
  );
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const encodeSignal = (s: Signal) => b64(deflateSync(strToU8(JSON.stringify(s)), { level: 9 }));
export function decodeSignal(code: string): Signal | string {
  try {
    const s = JSON.parse(strFromU8(inflateSync(unb64(code.trim().replace(/^.*#join=/, ''))))) as Signal;
    return s && (s.t === 'offer' || s.t === 'answer') && typeof s.sdp === 'string' ? s : 'Not a SciPlotFlow collaboration code.';
  } catch {
    return 'Not a SciPlotFlow collaboration code (copy it whole).';
  }
}

// every way to reach this browser found (or a few seconds passed): the description is complete for the code
function gathered(pc: RTCPeerConnection, ms = 4000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((ok) => {
    const t = setTimeout(ok, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        ok();
      }
    });
  });
}

// A data channel as a link (bytes; a full buffer waits until it has room).
function channelLink(pc: RTCPeerConnection, ch: RTCDataChannel, id: string): Link {
  ch.binaryType = 'arraybuffer';
  ch.bufferedAmountLowThreshold = 256 * 1024;
  const queue: Uint8Array[] = [];
  const closeL: (() => void)[] = [];
  let closed = false;
  const flush = () => {
    while (queue.length && ch.readyState === 'open' && ch.bufferedAmount < 1024 * 1024) ch.send(queue.shift()! as Uint8Array<ArrayBuffer>);
  };
  ch.addEventListener('bufferedamountlow', flush);
  ch.addEventListener('open', flush);
  const gone = () => {
    if (closed) return;
    closed = true;
    closeL.forEach((f) => f());
  };
  ch.addEventListener('close', gone);
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') gone();
  });
  return {
    id,
    // as long as the connection takes (256 kB in Chrome), 64 kB when it does not say: fewer, larger messages
    get chunk() {
      return Math.min(256 * 1024, pc.sctp?.maxMessageSize || 64 * 1024);
    },
    // between computers the network is the slow part: long messages go compressed
    compress: true,
    send: (b) => {
      queue.push(b);
      flush();
    },
    onBytes: (f) => ch.addEventListener('message', (e: MessageEvent<ArrayBuffer>) => f(new Uint8Array(e.data))),
    onClose: (f) => void closeL.push(f),
    close: () => {
      ch.close();
      pc.close();
      gone();
    },
  };
}

// What happened to a connection and when (seconds since it was made): its states, and the steps of the codes — for the
// diagnostics (a guest that waits too long for the host to paste its answer gives up)
const timelines = new WeakMap<RTCPeerConnection, { t0: number; events: string[] }>();
function watch(pc: RTCPeerConnection) {
  const tl = { t0: performance.now(), events: [] as string[] };
  timelines.set(pc, tl);
  const add = (what: string) => tl.events.push(`${((performance.now() - tl.t0) / 1000).toFixed(1)} s ${what}`);
  add('made');
  pc.addEventListener('icegatheringstatechange', () => add(`gathering ${pc.iceGatheringState}`));
  pc.addEventListener('iceconnectionstatechange', () => add(`ICE ${pc.iceConnectionState}`));
  pc.addEventListener('connectionstatechange', () => add(`connection ${pc.connectionState}`));
  pc.addEventListener('signalingstatechange', () => add(`signaling ${pc.signalingState}`));
}
const mark = (pc: RTCPeerConnection, what: string) => {
  const tl = timelines.get(pc);
  if (tl) tl.events.push(`${((performance.now() - tl.t0) / 1000).toFixed(1)} s ${what}`);
};
// The ways to reach a side written in its description (the code): their kinds — a local address hidden by the browser
// under a name ending in .local counted apart (the other side must find it on the network: mDNS) — no address shown.
export function candidatesIn(sdp: string | undefined): string {
  if (!sdp) return 'no description';
  const c: Record<string, number> = {};
  for (const line of sdp.split(/\r?\n/)) {
    const m = /^a=candidate:\S+ \d+ (\w+) \d+ (\S+) \d+ typ (\w+)/i.exec(line);
    if (!m) continue;
    const k = `${m[3]}${m[3] === 'host' ? (m[2].endsWith('.local') ? ' (hidden .local name)' : ' (address)') : ''}/${m[1].toLowerCase()}`;
    c[k] = (c[k] ?? 0) + 1;
  }
  return Object.entries(c).map(([k, v]) => `${k}×${v}`).join(', ') || 'none';
}

// an invitation: its code, its connection, the answer accepted (null, or what is wrong), then when both sides start
export type Invitation = { code: string; pc: RTCPeerConnection; accept: (answer: string, address?: string) => Promise<string | null>; startsAt?: number };

// The host: an invitation (its code, to send), then the guest's answer accepted; the link comes when the channel opens.
export async function invite(room: string, name: string, onLink: (l: Link, peerName: string) => void): Promise<Invitation> {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  watch(pc);
  const ch = pc.createDataChannel('sciplotflow', { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  mark(pc, 'invitation made');
  const code = encodeSignal({ t: 'offer', sdp: pc.localDescription!.sdp, room, name });
  const inv: Invitation = {
    code,
    pc,
    accept: async (answer, address) => {
      const s = decodeSignal(answer);
      if (typeof s === 'string') return s;
      if (s.t !== 'answer') return 'This is an invitation, not an answer: paste the code your guest sent back.';
      if (s.room !== room) return 'This answer is for another session.';
      const at = s.at ?? Date.now();
      // too late: the guest started trying alone and has given up
      if (Date.now() > at + LATE_MS) return `This answer came too late: the other computer started at ${new Date(at).toLocaleTimeString()} and has stopped trying. Make a new invitation and paste the answer within ${START_MS / 1000} s.`;
      const { sdp, candidates } = splitCandidates(s.sdp);
      try {
        mark(pc, `answer pasted (made ${s.clock ? ((Date.now() - s.clock) / 1000).toFixed(1) : '?'} s ago by the other computer's clock; start in ${((at - Date.now()) / 1000).toFixed(1)} s)`);
        await pc.setRemoteDescription({ type: 'answer', sdp });
      } catch {
        return 'This answer does not fit this invitation (each invitation is for one person: make a new one).';
      }
      if (address?.trim()) mark(pc, `their local address typed: ${isAddress(address) ? 'used' : 'not an address, left out'}`);
      startAt(pc, withAddress(candidates, address), at);
      inv.startsAt = at;
      const link = channelLink(pc, ch, `rtc-${newId()}`);
      ch.addEventListener('open', () => onLink(link, s.name), { once: true });
      if (ch.readyState === 'open') onLink(link, s.name);
      return null;
    },
  };
  return inv;
}

// The guest: the invitation read, its answer made (to send back, with the moment both sides start: START_MS later —
// until then the host's ways are kept aside, so nothing is tried and nothing gives up); the link comes when the channel
// opens.
export async function answer(code: string, name: string, onLink: (l: Link, peerName: string) => void, address?: string): Promise<{ code: string; room: string; host: string; pc: RTCPeerConnection; at: number } | string> {
  const s = decodeSignal(code);
  if (typeof s === 'string') return s;
  if (s.t !== 'offer') return 'This is an answer, not an invitation: the invitation comes from the person who started the session.';
  const pc = new RTCPeerConnection({ iceServers: ICE });
  watch(pc);
  pc.addEventListener('datachannel', (e) => {
    const link = channelLink(pc, e.channel, `rtc-${newId()}`);
    if (e.channel.readyState === 'open') onLink(link, s.name);
    else e.channel.addEventListener('open', () => onLink(link, s.name), { once: true });
  });
  const { sdp, candidates } = splitCandidates(s.sdp);
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp });
  } catch {
    return 'This invitation cannot be read (copy it whole).';
  }
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  const now = Date.now();
  const at = now + START_MS;
  mark(pc, `answer made (to send back); start at ${new Date(at).toLocaleTimeString()}`);
  if (address?.trim()) mark(pc, `their local address typed: ${isAddress(address) ? 'used' : 'not an address, left out'}`);
  startAt(pc, withAddress(candidates, address), at);
  return { code: encodeSignal({ t: 'answer', sdp: pc.localDescription!.sdp, room: s.room, name, at, clock: now }), room: s.room, host: s.name, pc, at };
}

// How a connection was made, from its statistics: the pair of addresses WebRTC chose — both local (host): directly
// in the same network; one seen from outside (srflx / prflx, found by STUN): through the internet; a relay (TURN):
// through a server. And its round-trip time.
type Stat = Record<string, unknown> & { type: string; id: string };
async function chosenPair(pc: RTCPeerConnection): Promise<{ stats: Map<string, Stat>; pair?: Stat }> {
  const report = await pc.getStats();
  const stats = new Map<string, Stat>();
  report.forEach((r: Stat) => stats.set(r.id, r));
  let pair: Stat | undefined;
  for (const r of stats.values()) if (r.type === 'transport' && typeof r.selectedCandidatePairId === 'string') pair = stats.get(r.selectedCandidatePairId);
  if (!pair) for (const r of stats.values()) if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r;
  return { stats, pair };
}
export type LinkKind = { how: string; rtt?: number };
export async function linkKind(pc: RTCPeerConnection): Promise<LinkKind | null> {
  if (pc.connectionState !== 'connected') return null;
  const { stats, pair } = await chosenPair(pc);
  if (!pair) return null;
  const [l, r] = [stats.get(pair.localCandidateId as string), stats.get(pair.remoteCandidateId as string)];
  const types = [l?.candidateType, r?.candidateType];
  const how = types.includes('relay') ? 'through a relay server (TURN)' : types.every((t) => t === 'host') ? 'directly, in the same network' : 'through the internet (addresses found by STUN)';
  const rtt = typeof pair.currentRoundTripTime === 'number' ? Math.round(pair.currentRoundTripTime * 1000) : undefined;
  return { how, ...(rtt !== undefined ? { rtt } : {}) };
}
// Everything about a connection that helps to find why it does (not) work — without any address: the browser, the
// states, how many ways to reach each side were found and of which kind, the pair chosen, its protocol and time.
export async function diagnostics(pc: RTCPeerConnection, role: string): Promise<string> {
  const { stats, pair } = await chosenPair(pc);
  const count = (type: 'local-candidate' | 'remote-candidate') => {
    const c: Record<string, number> = {};
    for (const s of stats.values()) if (s.type === type) c[`${s.candidateType}/${s.protocol}`] = (c[`${s.candidateType}/${s.protocol}`] ?? 0) + 1;
    return Object.entries(c).map(([k, v]) => `${k}×${v}`).join(', ') || 'none';
  };
  const pairs = [...stats.values()].filter((s) => s.type === 'candidate-pair');
  const l = pair && stats.get(pair.localCandidateId as string);
  const r = pair && stats.get(pair.remoteCandidateId as string);
  const kind = await linkKind(pc);
  return [
    `SciPlotFlow collaboration diagnostics (${new Date().toISOString()})`,
    `role: ${role}`,
    `browser: ${navigator.userAgent}`,
    `secure page: ${window.isSecureContext}; microphone allowed (local addresses shown): ${await micAllowed()}`,
    `connection: ${pc.connectionState}; ICE: ${pc.iceConnectionState}; gathering: ${pc.iceGatheringState}; signaling: ${pc.signalingState}`,
    `STUN server: ${STUN}`,
    `ways found here: ${count('local-candidate')}`,
    `ways of the other side: ${count('remote-candidate')}`,
    `in my code: ${candidatesIn(pc.localDescription?.sdp)}`,
    `in the other side's code: ${candidatesIn(pc.remoteDescription?.sdp)}`,
    `pairs tried: ${pairs.length} (${pairs.map((p) => p.state).join(', ') || '—'})`,
    `pair chosen: ${pair ? `${l?.candidateType}/${l?.protocol} ↔ ${r?.candidateType}/${r?.protocol}, ${pair.state}` : 'none'}`,
    `connected: ${kind ? `${kind.how}${kind.rtt !== undefined ? `, ${kind.rtt} ms round trip` : ''}` : 'no'}`,
    `what happened: ${timelines.get(pc)?.events.join(' · ') ?? '—'}`,
  ].join('\n');
}

// how a connection goes, for the person: trying, connected (directly), failed
export const connectionWord = (pc: RTCPeerConnection) => ({ new: 'waiting', connecting: 'connecting…', connected: 'connected', disconnected: 'disconnected (they left, or the network dropped)', failed: 'failed (the networks do not let the browsers reach each other)', closed: 'closed' })[pc.connectionState];
