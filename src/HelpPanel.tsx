// Help: getting started, the nodes by section, keyboard and mouse, the examples.
import { useEffect } from 'react';
import { GETTING_STARTED, NODE_HELP, NODE_SHORT, SHORTCUTS } from './help.ts';
import { GROUP_COLORS, HIDDEN_NODES, NODE_SECTION, NODE_TITLES } from './nodeColors.ts';
import type { NodeType } from './types.ts';
import { House, X } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';
import { MadeBy } from './Welcome.tsx';

// focus: a node's entry opened, shown and marked (a node's “More in Help”; n: every request, also for the same node)
export function HelpPanel({ onClose, examples, focus, onWelcome }: { onClose: () => void; examples: { group: string; name: string }[]; focus?: { type: NodeType; n: number } | null; onWelcome?: () => void }) {
  const groups = [...new Set(examples.map((e) => e.group))];
  const sections = Object.keys(GROUP_COLORS) as (keyof typeof GROUP_COLORS)[];
  // after the panel has slid in
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => document.getElementById(`help-${focus.type}`)?.scrollIntoView({ block: 'start' }), 250);
    return () => clearTimeout(t);
  }, [focus]);
  return (
    <aside className="library help-panel">
      <header>
        <strong>Help: SciPlotFlow</strong>
        {onWelcome && (
          <button onClick={onWelcome} title="The welcome window: import your data, open a project, the examples">
            <House {...IC} /> Welcome
          </button>
        )}
        <button onClick={onClose} aria-label="Close"><X {...IC} /></button>
      </header>
      <h4>Getting started</h4>
      <ol>
        {GETTING_STARTED.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <h4>Nodes</h4>
      {sections.map((s) => (
        <details key={focus && NODE_SECTION[focus.type] === s ? `${s}-${focus.n}` : s} open={focus && NODE_SECTION[focus.type] === s ? true : undefined}>
          <summary style={{ color: GROUP_COLORS[s] }}>{s}</summary>
          <dl>
            {(Object.keys(NODE_SECTION) as NodeType[])
              .filter((t) => NODE_SECTION[t] === s && !HIDDEN_NODES.has(t))
              .map((t) => (
                <div key={t} id={`help-${t}`} className={focus?.type === t ? 'help-focus' : undefined}>
                  <dt>{NODE_TITLES[t]}</dt>
                  <dd>
                    <p className="help-short">{NODE_SHORT[t]}</p>
                    <p>{NODE_HELP[t]}</p>
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      ))}
      <h4>Mouse and keyboard</h4>
      <table className="help-table">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Examples</h4>
      {groups.map((g) => (
        <details key={g}>
          <summary>{g}</summary>
          <ul className="help-examples">
            {examples
              .filter((e) => e.group === g)
              .map((e) => (
                <li key={e.name}>{e.name}</li>
              ))}
          </ul>
        </details>
      ))}
      <h4>Working together</h4>
      <p className="hint">
        Collaborate (in the toolbar): write your name, Start a session with this project, then Invite someone; a link with an invitation for one person, to send them (e-mail, chat …); they open it, Join, and send back their answer code; you paste it and Connect. Every change then appears for everyone, at once; each one's mouse shows on the others' canvas as an arrow in their colour with their name, and the nodes they select are outlined in it (only at the same level: inside the same group or at the top; the colour chosen in the panel, kept in this browser); two people changing different settings of one node both keep theirs. Undo undoes only your own changes. Open in a new tab: the session in another tab of this browser (no codes). Leave: the project stays with you as it is. A connection lost (a network that dropped, a computer asleep) is shown in the panel: the host makes a New invitation, the other person pastes it under Join again; they stay in the session, and what both did meanwhile is merged. In the same network and it does not connect (a browser hides its local address behind a made-up “.local” name that many routers and institute networks do not let the other computer look up): in the panel, “Same network and it does not connect?”; show the local addresses (the microphone allowed once, closed at once, nothing recorded: Chrome then writes the real local address in the codes), or type the other computer's local address (ipconfig ▸ IPv4 Address); on both computers, then a new invitation. A Python script whose code someone else changed does not run on your computer until you allow it again. Opening another project (an example, New, Open) leaves the session first. Inside a group, a change from the others brings you back to the top level.
      </p>
      <h4>Network &amp; privacy</h4>
      <p className="hint">
        Your projects and data stay in this browser; SciPlotFlow has no server. What it connects to: cdn.jsdelivr.net: Python (Pyodide) and its libraries, downloaded when a Python script first runs (nothing of yours is sent); only while working together, the other people's browsers directly (WebRTC: encrypted, browser to browser) and a public STUN server, stun.l.google.com:19302 (UDP), which only tells each browser its address seen from outside: it sees IP addresses, never the data. For a firewall: HTTPS to this site and to cdn.jsdelivr.net; to work together across networks, outgoing UDP (WebRTC) and to stun.l.google.com:19302: without them, only within the same local network. The invitation and answer codes are passed on by the people themselves; they hold the sender's network addresses (as every WebRTC connection does), so send them only to the person you work with.
      </p>
      <h4>Open-source software</h4>
      <p className="hint">
        SciPlotFlow is built with React, React Flow, fflate, SheetJS (spreadsheets), CodeMirror (the Python editor) Tiptap / ProseMirror (the editor of a Note) and KaTeX (its formulas); a Python script runs Pyodide with numpy, scipy, pandas, matplotlib and the other libraries it imports, loaded from jsDelivr when first used. Their licences (MIT, ISC, BSD, Apache-2.0, MPL-2.0):{' '}
        <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`} target="_blank" rel="noreferrer">
          the full texts
        </a>
        . The colour palettes (viridis, turbo, ColorBrewer, Okabe–Ito, Paul Tol) and the example data (Johnson &amp; Christy’s gold, the Palmer penguins) are cited in THIRD_PARTY_NOTICES.md.
      </p>
      <h4>About</h4>
      <MadeBy />
    </aside>
  );
}
