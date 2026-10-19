// Help: getting started, the nodes by section, keyboard and mouse, the examples.
import { GETTING_STARTED, NODE_HELP, SHORTCUTS } from './help.ts';
import { GROUP_COLORS, HIDDEN_NODES, NODE_SECTION, NODE_TITLES } from './nodeColors.ts';
import type { NodeType } from './types.ts';
import { X } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';

export function HelpPanel({ onClose, examples }: { onClose: () => void; examples: { group: string; name: string }[] }) {
  const groups = [...new Set(examples.map((e) => e.group))];
  const sections = Object.keys(GROUP_COLORS) as (keyof typeof GROUP_COLORS)[];
  return (
    <aside className="library help-panel">
      <header>
        <strong>Help — Graph Flow</strong>
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
        <details key={s}>
          <summary style={{ color: GROUP_COLORS[s] }}>{s}</summary>
          <dl>
            {(Object.keys(NODE_SECTION) as NodeType[])
              .filter((t) => NODE_SECTION[t] === s && !HIDDEN_NODES.has(t))
              .map((t) => (
                <div key={t}>
                  <dt>{NODE_TITLES[t]}</dt>
                  <dd>{NODE_HELP[t]}</dd>
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
      <h4>Open-source software</h4>
      <p className="hint">
        Graph Flow is built with React, React Flow, fflate, SheetJS (spreadsheets) and CodeMirror (the Python editor); a Python script runs Pyodide with numpy, scipy, pandas, matplotlib and the other libraries it imports, loaded from jsDelivr when first used. Their licences (MIT, ISC, BSD, Apache-2.0, MPL-2.0):{' '}
        <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`} target="_blank" rel="noreferrer">
          the full texts
        </a>
        . The colour palettes (viridis, turbo, ColorBrewer, Okabe–Ito, Paul Tol) and the example data (Johnson &amp; Christy’s gold, the Palmer penguins) are cited in THIRD_PARTY_NOTICES.md.
      </p>
    </aside>
  );
}
