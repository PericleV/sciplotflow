// Help in a window of its own (as the welcome window): a search over everything at the top (the nodes' help cut into
// its subsections, getting started, the shortcuts, the topics, the examples; the words found highlighted), the contents
// on the left (getting started, the nodes by section, mouse and keyboard, the examples, the topics, about) and the page
// chosen on the right. A node's “More in Help” opens it at that node.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GETTING_STARTED, HELP_TOPICS, NODE_HELP, NODE_SHORT, SHORTCUTS } from './help.ts';
import { GROUP_COLORS, NODE_SECTION, NODE_TITLES } from './nodeColors.ts';
import type { NodeType } from './types.ts';
import { House, Search, X } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';
import { MadeBy } from './Welcome.tsx';
import { helpDocs, helpParts, shownNodes } from './search/helpDocs.ts';
import { highlight, makeIndex, snippet } from './search/textSearch.ts';

type Page = { kind: 'start' } | { kind: 'node'; type: NodeType; part?: number } | { kind: 'keys' } | { kind: 'examples' } | { kind: 'topic'; id: string } | { kind: 'about' };
type Example = { group: string; name: string; desc?: string };

// a text with the words searched for marked
const Marked = ({ text, terms }: { text: string; terms: string[] }) => (
  <>
    {highlight(text, terms).map((p, k) => (p.hit ? <mark key={k}>{p.t}</mark> : <Fragment key={k}>{p.t}</Fragment>))}
  </>
);

export function HelpWindow({ onClose, examples, focus, onWelcome, onExample }: { onClose: () => void; examples: Example[]; focus?: { type: NodeType; n: number } | null; onWelcome?: () => void; onExample?: (name: string) => void }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<Page>(() => (focus ? { kind: 'node', type: focus.type } : { kind: 'start' }));
  // the words of the search that led to the page shown (marked in it)
  const [terms, setTerms] = useState<string[]>([]);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const index = useMemo(() => {
    const docs = helpDocs(examples);
    return { docs: new Map(docs.map((d) => [d.id, d])), ...makeIndex(docs) };
  }, [examples]);
  const hits = useMemo(() => (query.trim() ? index.search(query, 40) : []), [index, query]);
  // a node asked for (its “More in Help”), also once the window is open
  const [seen, setSeen] = useState(focus);
  if (focus !== seen) {
    setSeen(focus);
    if (focus) {
      setPage({ kind: 'node', type: focus.type });
      setQuery('');
      setTerms([]);
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (query) setQuery('');
        else onClose();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, query]);
  useEffect(() => input.current?.focus(), []);
  // a page opened: at its top, or at the part asked for
  useEffect(() => {
    const part = page.kind === 'node' ? page.part : undefined;
    const el = part !== undefined ? document.getElementById(`help-part-${part}`) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else body.current?.scrollTo({ top: 0 });
  }, [page]);
  const open = (p: Page, t: string[] = []) => {
    setPage(p);
    setTerms(t);
    setQuery('');
  };
  // a result opened: its page, at its part, the words found marked
  const openHit = (id: string, t: string[]) => {
    const [kind, a, b] = id.split(':');
    if (kind === 'node') open({ kind: 'node', type: a as NodeType, part: Number(b) }, t);
    else if (kind === 'start') open({ kind: 'start' }, t);
    else if (kind === 'key') open({ kind: 'keys' }, t);
    else if (kind === 'topic') open({ kind: 'topic', id: a }, t);
    else open({ kind: 'examples' }, t);
  };
  const sections = Object.keys(GROUP_COLORS) as (keyof typeof GROUP_COLORS)[];
  const groups = [...new Set(examples.map((e) => e.group))];
  const isPage = (p: Page) => !query && JSON.stringify({ ...p, part: undefined }) === JSON.stringify({ ...page, part: undefined });
  const nav = (p: Page, label: ReactNode, color?: string) => (
    <button className={`help-nav-item${isPage(p) ? ' on' : ''}`} style={color ? { color } : undefined} onClick={() => open(p)}>
      {label}
    </button>
  );
  // the results by kind
  const kindOf = (id: string) => (id.startsWith('node:') ? 'Nodes' : id.startsWith('example:') ? 'Examples' : id.startsWith('key:') ? 'Mouse and keyboard' : 'Getting started and topics');
  // (the kind with the best result first)
  const byKind = ['Nodes', 'Getting started and topics', 'Mouse and keyboard', 'Examples']
    .map((k) => [k, hits.filter((h) => kindOf(h.id) === k)] as const)
    .filter(([, hs]) => hs.length)
    .sort((a, b) => b[1][0].score - a[1][0].score);
  return (
    <div className="help-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="help-window" role="dialog" aria-label="Help">
        <header className="help-head">
          <strong>Help</strong>
          <label className="help-search">
            <Search {...IC} />
            <input ref={input} value={query} placeholder="Search the help: a node, an option, a word…" onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button className="help-clear" title="Clear the search (Esc)" onClick={() => setQuery('')}>
                <X {...IC} />
              </button>
            )}
          </label>
          {onWelcome && (
            <button onClick={onWelcome} title="The welcome window: the tutorial and the tours, import your data, open a project, the examples">
              <House {...IC} /> Welcome
            </button>
          )}
          <button className="help-x" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X {...IC} />
          </button>
        </header>
        <div className="help-main">
          <nav className="help-nav">
            {nav({ kind: 'start' }, 'Getting started')}
            <div className="help-nav-title">Nodes</div>
            {sections.map((s) => (
              <details key={s} open={page.kind === 'node' && NODE_SECTION[page.type] === s ? true : undefined}>
                <summary style={{ color: GROUP_COLORS[s] }}>{s}</summary>
                {shownNodes()
                  .filter((t) => NODE_SECTION[t] === s)
                  .map((t) => (
                    <Fragment key={t}>{nav({ kind: 'node', type: t }, NODE_TITLES[t])}</Fragment>
                  ))}
              </details>
            ))}
            <div className="help-nav-title">More</div>
            {nav({ kind: 'keys' }, 'Mouse and keyboard')}
            {nav({ kind: 'examples' }, 'Examples')}
            {HELP_TOPICS.map((tp) => (
              <Fragment key={tp.id}>{nav({ kind: 'topic', id: tp.id }, tp.title)}</Fragment>
            ))}
            {nav({ kind: 'about' }, 'About')}
          </nav>
          <div className="help-body" ref={body}>
            {query.trim() ? (
              <div className="help-results">
                <div className="muted">{hits.length ? `${hits.length}${hits.length === 40 ? '+' : ''} found` : 'Nothing found: try other words, or fewer'}</div>
                {byKind.map(([k, hs]) => (
                  <section key={k}>
                    <h4>{k}</h4>
                    {hs.map((h) => {
                      const d = index.docs.get(h.id)!;
                      return (
                        <button key={h.id} className="help-hit" onClick={() => openHit(h.id, h.terms)}>
                          <b>{d.title}</b>
                          <span>{snippet(d.text, h.terms).map((p, i) => (p.hit ? <mark key={i}>{p.t}</mark> : <Fragment key={i}>{p.t}</Fragment>))}</span>
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : (
              <HelpPage page={page} terms={terms} examples={examples} groups={groups} onExample={onExample} open={open} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HelpPage({ page, terms, examples, groups, onExample, open }: { page: Page; terms: string[]; examples: Example[]; groups: string[]; onExample?: (name: string) => void; open: (p: Page) => void }) {
  if (page.kind === 'start')
    return (
      <article>
        <h2>Getting started</h2>
        <ol className="help-steps">
          {GETTING_STARTED.map((t) => (
            <li key={t}>
              <Marked text={t} terms={terms} />
            </li>
          ))}
        </ol>
      </article>
    );
  if (page.kind === 'node') {
    const t = page.type;
    const parts = helpParts(NODE_HELP[t] ?? '');
    return (
      <article>
        <h2 style={{ color: GROUP_COLORS[NODE_SECTION[t]] }}>{NODE_TITLES[t]}</h2>
        <p className="help-short">
          <Marked text={NODE_SHORT[t] ?? ''} terms={terms} />
        </p>
        {parts.length > 2 && (
          <div className="help-toc">
            {parts.map((p, k) =>
              p.heading ? (
                <button key={k} onClick={() => document.getElementById(`help-part-${k}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
                  {p.heading}
                </button>
              ) : null,
            )}
          </div>
        )}
        {parts.map((p, k) => (
          <section key={k} id={`help-part-${k}`} className={page.part === k && terms.length ? 'help-found' : undefined}>
            {p.heading && <h3>{p.heading}</h3>}
            <p>
              <Marked text={p.text} terms={terms} />
            </p>
          </section>
        ))}
      </article>
    );
  }
  if (page.kind === 'keys')
    return (
      <article>
        <h2>Mouse and keyboard</h2>
        <table className="help-table help-keys">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <Marked text={k} terms={terms} />
                </td>
                <td>
                  <Marked text={v} terms={terms} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    );
  if (page.kind === 'examples')
    return (
      <article>
        <h2>Examples</h2>
        <p className="muted">Each opens as a project of its own, with a note on what it shows; the project you have open stays in Projects.</p>
        {groups.map((g) => (
          <section key={g}>
            <h3>{g}</h3>
            <ul className="help-example-list">
              {examples
                .filter((e) => e.group === g)
                .map((e) => (
                  <li key={e.name}>
                    {onExample ? (
                      <button className="help-link" title="Open this example" onClick={() => onExample(e.name)}>
                        <Marked text={e.name} terms={terms} />
                      </button>
                    ) : (
                      <b>
                        <Marked text={e.name} terms={terms} />
                      </b>
                    )}
                    {e.desc && (
                      <div className="muted">
                        <Marked text={e.desc} terms={terms} />
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </article>
    );
  if (page.kind === 'topic') {
    const tp = HELP_TOPICS.find((x) => x.id === page.id);
    if (!tp) return null;
    return (
      <article>
        <h2>{tp.title}</h2>
        <p>
          <Marked text={tp.text} terms={terms} />
        </p>
        {tp.id === 'licenses' && (
          <p>
            <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`} target="_blank" rel="noreferrer">
              The full texts of the licences
            </a>
          </p>
        )}
      </article>
    );
  }
  return (
    <article>
      <h2>About</h2>
      <MadeBy />
      <p className="muted">
        <button className="help-link" onClick={() => open({ kind: 'topic', id: 'licenses' })}>
          Open-source software
        </button>
      </p>
    </article>
  );
}
