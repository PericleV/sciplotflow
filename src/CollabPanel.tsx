// Collaborate: work on the project together, in real time, browser to browser. Start a session with this project, then
// invite someone on another computer (an invitation code to send them, their answer code to paste back) or open it in
// another tab of this browser; or join a session with an invitation. Who is in it, and how each one is connected.
import { useEffect, useState } from 'react';
import { Check, Copy, LogOut, Users, X } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';
import { connectionWord, diagnostics, isAddress, joinLink, linkKind, micAllowed, revealLocalAddresses, roomLink, STUN, type Invitation, type LinkKind } from './collab/links.ts';
import { myName, setMyColor, setMyName } from './theme.ts';
import type { CollabSession } from './collab/session.ts';

function CopyBox({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="collab-copy">
      <textarea readOnly rows={4} value={text} onFocus={(e) => e.currentTarget.select()} />
      <button
        title={`Copy ${label}`}
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
        }
      >
        {done ? <Check {...IC} /> : <Copy {...IC} />} {done ? 'Copied' : `Copy ${label}`}
      </button>
    </div>
  );
}

// the state of a WebRTC connection, kept up to date
function useConnection(pc: RTCPeerConnection | null | undefined) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!pc) return;
    const f = () => tick((n) => n + 1);
    pc.addEventListener('connectionstatechange', f);
    return () => pc.removeEventListener('connectionstatechange', f);
  }, [pc]);
  return pc ? connectionWord(pc) : '';
}

// Inside the same network and it does not connect: why, and the two ways around it: the real local addresses shown
// (the microphone allowed, then closed at once; or the browser's own setting), or the other computer's local address
// typed (kept by the panel and used at Join, Join again and Connect), with how to find it on Windows, macOS and Linux.
function SameNetwork({ address, setAddress }: { address: string; setAddress: (a: string) => void }) {
  const [mic, setMic] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    void micAllowed().then(setMic);
  }, []);
  const bad = address.trim() !== '' && !isAddress(address);
  return (
    <details className="collab-step">
      <summary>
        <b>Same network and it does not connect?</b>
      </summary>
      <p className="hint">
        Two computers on the same network (at home, at work) connect directly, using their local addresses, such as 192.168.1.132. For privacy, browsers don't put that address in the codes. They put a made-up name ending in <code>.local</code> instead, and the other computer has to look it up on the network (this is called mDNS). Many routers and office networks block that look-up, so the two browsers can't find each other. In the diagnostics you then see only “hidden .local name” addresses and no working pair.
      </p>
      <p className="hint">There are two ways around it. Use one of them on both computers, then make a new invitation and answer.</p>
      <p className="hint">
        <b>1. Show the local addresses.</b> Browsers give the real local address to a page that is allowed to use the microphone or camera, as for a video call. Chrome, Edge, Brave, Opera and Safari work this way, and Firefox usually does too. Allow the microphone with the button below. SciPlotFlow turns it off straight away and records nothing: only the permission matters. You can take it back any time in the browser's site settings.
      </p>
      <p className="hint">
        If that is not enough, the setting can be changed in the browser itself. In Chrome, Edge, Brave or Opera, open <code>chrome://flags/#enable-webrtc-hide-local-ips-with-mdns</code> (Edge: <code>edge://flags</code>, same name) and set it to Disabled. In Firefox, open <code>about:config</code> and set <code>media.peerconnection.ice.obfuscate_host_addresses</code> to false. Restart the browser afterwards.
      </p>
      <div className="row wrap">
        <button
          disabled={mic === true}
          onClick={() =>
            void revealLocalAddresses().then((e) => {
              setMsg(e ?? '');
              void micAllowed().then(setMic);
            })
          }
        >
          {mic ? 'Local addresses shown' : 'Show local addresses (allow the microphone)'}
        </button>
        {mic && <span className="hint">The codes made from now on carry this computer's local address.</span>}
      </div>
      {msg && <div className="msg err">{msg}</div>}
      <p className="hint">
        <b>2. Type the other computer's local address.</b> Each person looks up their own address and tells it to the other. Write theirs here before you press Join, Join again or Connect. SciPlotFlow then tries that address as well as the made-up name. No permission is needed. It won't help if the two computers are on different parts (subnets) of a large network.
      </p>
      <ul className="hint">
        <li>
          <b>Windows:</b> open Command Prompt, type <code>ipconfig</code> and look for “IPv4 Address” under the adapter you use (Wi-Fi or Ethernet).
        </li>
        <li>
          <b>macOS:</b> System Settings, Wi-Fi, Details, then “IP address”. Or in Terminal: <code>ipconfig getifaddr en0</code>.
        </li>
        <li>
          <b>Linux:</b> in a terminal, <code>hostname -I</code> (the first address), or <code>ip -4 addr</code> and the address after “inet” on your Wi-Fi or Ethernet card (not 127.0.0.1). The network settings of your desktop show it too.
        </li>
      </ul>
      <label>
        Their local address
        <input value={address} placeholder="e.g. 192.168.1.140" onChange={(e) => setAddress(e.target.value)} />
      </label>
      {bad && <div className="msg err">Not an address: write it as 192.168.1.140 (IPv4) or an IPv6 address.</div>}
    </details>
  );
}

// The seconds until both computers start trying (the synchronized start), counted down; then nothing.
function StartCountdown({ at, before }: { at: number; before: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const s = Math.ceil((at - now) / 1000);
  if (s <= 0) return null;
  return (
    <div className="msg">
      {before} <b>{s} s</b>.
    </div>
  );
}

// a connection to another browser: its state, how it was made and its round trip (every 2 s), the diagnostics to copy
function LinkStatus({ pc, role }: { pc: RTCPeerConnection; role: string }) {
  const state = useConnection(pc);
  const [kind, setKind] = useState<LinkKind | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    const look = () => void linkKind(pc).then((k) => live && setKind(k));
    look();
    const t = setInterval(look, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [pc]);
  return (
    <div className="row wrap">
      <span className="hint">
        Connection: {state}
        {kind && ` (${kind.how}${kind.rtt !== undefined ? `, ${kind.rtt} ms` : ''})`}
        {pc.connectionState === 'failed' && '. On the same network? See “Same network and it does not connect?” below.'}
      </span>
      <button
        title="Copies what helps to find out why a connection works or not: the browser, the connection states, the kinds of addresses tried and chosen, the round trip. No actual addresses. Paste it in a message."
        onClick={() =>
          void diagnostics(pc, role)
            .then((t) => navigator.clipboard.writeText(t))
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
        }
      >
        {copied ? <Check {...IC} /> : <Copy {...IC} />} {copied ? 'Copied' : 'Copy diagnostics'}
      </button>
    </div>
  );
}

function InviteBox({ session, address }: { session: CollabSession; address: string }) {
  const [inv, setInv] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState('');
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);
  if (!inv)
    return (
      <button
        disabled={busy}
        title="An invitation for one person on another computer: a code to send them (by e-mail, chat …); they send back an answer code"
        onClick={() => {
          setBusy(true);
          void session.invite().then((i) => {
            setInv(i);
            setBusy(false);
          });
        }}
      >
        <Users {...IC} /> {busy ? 'Preparing the invitation…' : 'Invite someone (another computer)…'}
      </button>
    );
  return (
    <div className="collab-step">
      <div>
        <b>1.</b> Send this invitation to the person (it is for one person; the link opens SciPlotFlow with it):
      </div>
      <CopyBox text={joinLink(inv.code)} label="the invitation" />
      <div>
        <b>2.</b> Paste the answer they send back:
      </div>
      <textarea rows={3} value={ans} placeholder="their answer code" onChange={(e) => setAns(e.target.value)} />
      <div className="row wrap">
        <button
          disabled={!ans.trim() || sent}
          onClick={() =>
            void inv.accept(ans, address).then((err) => {
              if (err) setMsg(err);
              else {
                setMsg('');
                setSent(true);
              }
            })
          }
        >
          Connect
        </button>
        {(sent || msg) && (
          <button
            title="Another person: a new invitation"
            onClick={() => {
              setInv(null);
              setAns('');
              setMsg('');
              setSent(false);
            }}
          >
            New invitation
          </button>
        )}
      </div>
      {sent && inv.startsAt && <StartCountdown at={inv.startsAt} before="Both computers start connecting at the same moment, in" />}
      {sent && <LinkStatus pc={inv.pc} role="host (invited)" />}
      {msg && <div className="msg err">{msg}</div>}
    </div>
  );
}

export function CollabPanel(props: {
  onClose: () => void;
  session: CollabSession | null;
  // the guest's answer to send back (joined by an invitation), with the host's name and the connection
  answer: { code: string; host: string; pc: RTCPeerConnection; at: number } | null;
  joinCode: string; // an invitation that opened the page (#join=…)
  onStart: (name: string) => void;
  onJoin: (code: string, name: string, address?: string) => Promise<string | null>;
  // a guest in the session: a new invitation (after the connection was lost) answered within it
  onRejoin: (code: string, address?: string) => Promise<string | null>;
  onLeave: () => void;
}) {
  const [name, setName] = useState(myName);
  const [code, setCode] = useState(props.joinCode);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState('');
  const [againErr, setAgainErr] = useState('');
  // the other computer's local address, typed (the same network, when the made-up names are not found)
  const [address, setAddress] = useState('');
  const [, tick] = useState(0);
  const s = props.session;
  useEffect(() => (s ? s.onPeers(() => tick((n) => n + 1)) : undefined), [s]);
  useEffect(() => (s ? s.presence.onChange(() => tick((n) => n + 1)) : undefined), [s]);
  const named = name.trim();
  return (
    <aside className="library collab-panel">
      <header>
        <strong>Collaborate</strong>
        <button onClick={props.onClose} aria-label="Close">
          <X {...IC} />
        </button>
      </header>
      {!s && (
        <>
          <p className="hint">
            Work on this project together, in real time: every change shows up for everyone. It goes from browser to browser, encrypted, with no server of ours in between. A public STUN server ({STUN.replace('stun:', '')}) only tells each browser what its address looks like from outside.
          </p>
          <label>
            Your name
            <input value={name} placeholder="shown to the others" onChange={(e) => setName(e.target.value)} onBlur={() => setMyName(named)} />
          </label>
          <h4>Start</h4>
          <button
            disabled={!named}
            title={named ? 'A session with this project: then invite the others' : 'Write your name first'}
            onClick={() => {
              setMyName(named);
              props.onStart(named);
            }}
          >
            <Users {...IC} /> Start a session with this project
          </button>
          <h4>Join</h4>
          <textarea rows={4} value={code} placeholder="the invitation you received (the link or the code)" onChange={(e) => setCode(e.target.value)} />
          <div className="row">
            <button
              disabled={!named || !code.trim() || busy}
              title={named ? 'Join: your answer code appears, to send back' : 'Write your name first'}
              onClick={() => {
                setMyName(named);
                setBusy(true);
                setErr('');
                void props.onJoin(code, named, address).then((e) => {
                  setBusy(false);
                  if (e) setErr(e);
                });
              }}
            >
              {busy ? 'Preparing the answer…' : 'Join'}
            </button>
            <span className="hint">The project you have open now is kept in Projects.</span>
          </div>
          {err && <div className="msg err">{err}</div>}
          <SameNetwork address={address} setAddress={setAddress} />
        </>
      )}
      {s && (
        <>
          <p>
            <b>{s.role === 'host' ? 'You started this session' : 'You joined this session'}</b> as {s.name}.{' '}
            {s.joined ? 'Every change here goes to the others, and theirs come here.' : 'Waiting for the project…'}
          </p>
          {props.answer && (
            <div className="collab-step">
              <div>Send this answer back to {props.answer.host || 'the person who invited you'}:</div>
              <CopyBox text={props.answer.code} label="the answer" />
              <StartCountdown at={props.answer.at} before="It must be pasted there (and Connect pressed) before both computers start connecting, in" />
              <LinkStatus pc={props.answer.pc} role="guest (answered)" />
            </div>
          )}
          {s.lost().map((n) => (
            <div key={n} className="msg err">
              The connection with <b>{n}</b> was lost (a network that dropped, a computer asleep).{' '}
              {s.role === 'host' ? `Make a New invitation below and send it to ${n}: they join again with it, and what both of you did meanwhile is merged.` : `Ask ${n} for a new invitation and paste it under “Join again”: you stay in the session, and what both of you did meanwhile is merged.`}
            </div>
          ))}
          <h4>In the session</h4>
          <ul className="collab-peers">
            <li>
              <span className="collab-dot" style={{ background: s.presence.mine.color }} />
              <b>{s.name}</b> (you) ·{' '}
              <label className="radio" title="The colour of your mouse and of the nodes you select, on the others' canvas (kept in this browser)">
                your colour{' '}
                <input
                  type="color"
                  value={s.presence.mine.color}
                  onChange={(e) => {
                    s.presence.set({ color: e.target.value });
                    setMyColor(e.target.value);
                    tick((n) => n + 1);
                  }}
                />
              </label>
            </li>
            {s.peers().map((p) => (
              <li key={p.id}>
                <span className="collab-dot" style={{ background: s.presence.list().find((o) => o.name === p.name)?.color ?? 'var(--border)' }} />
                <b>{p.name}</b> · {p.via === 'tab' ? 'another tab of this browser' : 'browser to browser'}
                {p.synced ? '' : ' · getting in step…'}
              </li>
            ))}
          </ul>
          {s.role === 'host' && <InviteBox key={s.room} session={s} address={address} />}
          {s.role === 'guest' && (
            <>
              <h4>Join again</h4>
              <textarea rows={3} value={again} placeholder="a new invitation (after the connection was lost)" onChange={(e) => setAgain(e.target.value)} />
              <div className="row">
                <button
                  disabled={!again.trim()}
                  title="Your new answer appears above, to send back; you stay in the session and keep your work"
                  onClick={() => {
                    setAgainErr('');
                    void props.onRejoin(again, address).then((e) => {
                      if (e) setAgainErr(e);
                      else setAgain('');
                    });
                  }}
                >
                  Join again
                </button>
              </div>
              {againErr && <div className="msg err">{againErr}</div>}
            </>
          )}
          <SameNetwork address={address} setAddress={setAddress} />
          <h4>Another tab of this browser</h4>
          <div className="row wrap">
            <button title="The session in a new tab of this browser (to try it, or to see two places at once)" onClick={() => window.open(roomLink(s.room), '_blank')}>
              Open in a new tab
            </button>
          </div>
          <h4>Leave</h4>
          <button title="Out of the session: the project stays here as it is now (and in Projects); the others go on without you" onClick={props.onLeave}>
            <LogOut {...IC} /> Leave the session
          </button>
          <p className="hint">Undo (Ctrl+Z) undoes only your own changes while you work together. A Python script changed by someone else does not run here until you allow it again.</p>
        </>
      )}
    </aside>
  );
}
