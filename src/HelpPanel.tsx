// Help: getting started, the nodes by section, keyboard and mouse, the examples.
import { useEffect } from 'react';
import { GETTING_STARTED, NODE_HELP, NODE_SHORT, SHORTCUTS } from './help.ts';
import { GROUP_COLORS, HIDDEN_NODES, NODE_SECTION, NODE_TITLES } from './nodeColors.ts';
import type { NodeType } from './types.ts';
import { X } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';

// focus: a node's entry opened, shown and marked (a node's “More in Help”; n: every request, also for the same node)
export function HelpPanel({ onClose, examples, focus }: { onClose: () => void; examples: { group: string; name: string }[]; focus?: { type: NodeType; n: number } | null }) {
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
        <strong>Help — SciPlotFlow</strong>
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
      <h4>Open-source software</h4>
      <p className="hint">
        SciPlotFlow is built with React, React Flow, fflate, SheetJS (spreadsheets), CodeMirror (the Python editor) Tiptap / ProseMirror (the editor of a Note) and KaTeX (its formulas); a Python script runs Pyodide with numpy, scipy, pandas, matplotlib and the other libraries it imports, loaded from jsDelivr when first used. Their licences (MIT, ISC, BSD, Apache-2.0, MPL-2.0):{' '}
        <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`} target="_blank" rel="noreferrer">
          the full texts
        </a>
        . The colour palettes (viridis, turbo, ColorBrewer, Okabe–Ito, Paul Tol) and the example data (Johnson &amp; Christy’s gold, the Palmer penguins) are cited in THIRD_PARTY_NOTICES.md.
      </p>
    </aside>
  );
}
