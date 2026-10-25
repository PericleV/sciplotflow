// Help as documents to read and to search: a node's help cut into its subsections (a sentence beginning with a name and
// a colon, “Calibration: …”, “Find like this (template matching): …”, starts one), getting started, the shortcuts, the
// topics, the examples. Pure.
import { GETTING_STARTED, HELP_TOPICS, NODE_HELP, NODE_SHORT, SHORTCUTS } from '../help.ts';
import { HIDDEN_NODES, NODE_SECTION, NODE_TITLES } from '../nodeColors.ts';
import type { NodeType } from '../types.ts';
import type { SearchDoc } from './textSearch.ts';

export type HelpPart = { heading: string; text: string };

// a sentence that starts a subsection: a short name (capitalized, a few words, perhaps with ▸ and a part in brackets),
// then a colon; the name its heading
const HEAD = /^((?:[A-Z][\w’'-]*|[A-Z0-9]{2,})(?:[ -][\w’'.+-]+){0,4}(?: ▸ [\w’' -]+)?)(?: \([^()]{1,90}\))?: /;
// words that start a sentence but are no heading
const NOT_HEAD = /^(Empty|Off|On|Auto|None|Also|Then|Else|Here|Note|Default|Example|Tip|Both|Each|Every|All|One|Two|The|A|An|Its|Their|Older)\b/;

// the sentences of a text: each ends at “. ” (or “; ” never), not inside brackets, before a capital letter
function sentences(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if (c === '.' && depth === 0 && text[i + 1] === ' ' && /[A-Z0-9“(]/.test(text[i + 2] ?? '') && !/\b(e\.g|i\.e|etc|vs|cf|al|Fig|No)$/.test(text.slice(Math.max(0, i - 4), i))) {
      out.push(text.slice(start, i + 1));
      start = i + 2;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// A help text cut into its subsections (a short text: one, with no heading)
export function helpParts(text: string): HelpPart[] {
  if (text.length < 900) return [{ heading: '', text }];
  const parts: HelpPart[] = [{ heading: '', text: '' }];
  for (const s of sentences(text)) {
    const m = HEAD.exec(s);
    const cur = parts[parts.length - 1];
    // a heading only when what came before is long enough to stand alone
    if (m && !NOT_HEAD.test(m[1]) && cur.text.length > 160) parts.push({ heading: m[1], text: s });
    else cur.text = cur.text ? `${cur.text} ${s}` : s;
  }
  return parts.filter((p) => p.text);
}

export const shownNodes = () => (Object.keys(NODE_SECTION) as NodeType[]).filter((t) => !HIDDEN_NODES.has(t));

// Every piece of Help as a document: id node:<type>:<part>, start:<k>, key:<k>, topic:<id>, example:<name>
export function helpDocs(examples: { group: string; name: string; desc?: string }[]): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const t of shownNodes()) {
    const parts = helpParts(NODE_HELP[t] ?? '');
    parts.forEach((p, k) => docs.push({ id: `node:${t}:${k}`, title: `${NODE_TITLES[t]}${p.heading ? ` ▸ ${p.heading}` : ''}`, text: k === 0 ? `${NODE_SHORT[t] ?? ''} ${p.text}` : p.text }));
  }
  GETTING_STARTED.forEach((s, k) => docs.push({ id: `start:${k}`, title: 'Getting started', text: s }));
  SHORTCUTS.forEach(([a, b], k) => docs.push({ id: `key:${k}`, title: a, text: `${b} (a mouse and keyboard shortcut)` }));
  HELP_TOPICS.forEach((tp) => docs.push({ id: `topic:${tp.id}`, title: tp.title, text: tp.text }));
  examples.forEach((e) => docs.push({ id: `example:${e.name}`, title: e.name, text: `${e.group}. ${e.desc ?? ''}` }));
  return docs;
}
