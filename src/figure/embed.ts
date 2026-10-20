// Editable figures: the project written inside an exported SVG (in its <metadata>) or PNG (an iTXt chunk) — the figure
// in a document carries what made it. The project compressed (as the share links), with its identity (an id that stays
// with the project, the revision: a hash of its content), the figure (the node of the Plot / Merge and the groups it is
// in), when it was exported, and whether the imported data are in it. Read back from such a file to open the project at
// that figure, and by the document update. Pure.
import { decodeProject, encodeProject, stringifyProject, type Project } from '../project.ts';

export type FigureRef = { node: string; path: string[]; name: string };
export type Embedded = { app: 'graph-flow'; kind: 'figure'; v: 1; projectId: string; revision: string; figure: FigureRef; exported: string; data: 'full' | 'nodata'; projectName?: string; project: string };
export const EMBED_KEY = 'graph-flow';
// Editable figures hidden for now (the user, 2026-10-19): the exports carry no project, “project inside” and Update
// document… are not shown; a file exported before still opens at its figure. true shows them again.
export const EDITABLE_FIGURES = false;

export const newProjectId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// the revision: the first 16 hex digits of the SHA-256 of the project (its nodes and connections; not its name or id)
export async function projectRevision(p: Project): Promise<string> {
  const text = stringifyProject({ app: p.app, version: p.version, nodes: p.nodes, edges: p.edges });
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(hash.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

// the project without its imported data: every Import node keeps its options, its files to be opened again
export function withoutImported(p: Project): Project {
  return {
    ...p,
    nodes: p.nodes.map((n) => (n.type === 'import' ? ({ ...n, data: { ...n.data, text: '', textRef: undefined, sheets: n.data.sheets?.map((s) => ({ ...s, text: '', textRef: undefined })) } } as typeof n) : n)),
  };
}

export async function makeEmbedded(p: Project, id: string, figure: FigureRef, data: 'full' | 'nodata'): Promise<Embedded> {
  const q = data === 'nodata' ? withoutImported(p) : p;
  return { app: 'graph-flow', kind: 'figure', v: 1, projectId: id, revision: await projectRevision(p), figure, exported: new Date().toISOString(), data, ...(p.name ? { projectName: p.name } : {}), project: await encodeProject({ ...q, id }) };
}

export const openEmbedded = (e: Embedded): Promise<Project | string> => decodeProject(e.project);

const valid = (e: unknown): e is Embedded => {
  const q = e as Embedded;
  return !!q && q.app === 'graph-flow' && q.kind === 'figure' && typeof q.project === 'string' && typeof q.projectId === 'string' && !!q.figure && typeof q.figure.node === 'string';
};

// ---- SVG: empty groups after the opening tag, the data in their ids — Word and PowerPoint draw an SVG inserted again
// and keep only what is drawn: <metadata>, <title>, <desc>, data-* attributes and links are dropped, the ids of groups
// stay (tried with Word 16). <g id="graph-flow-h-…"> the rest of the JSON (base64url of its UTF-8), then the project
// (base64url already) in pieces <g id="graph-flow-p000-…">. Read also: the <metadata> of the first exports. ----
const PIECE = 8000;
const b64url = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const CARRIER = /<g id="graph-flow-[hp][^"]*"\s*(?:\/>|><\/g>)/g;
const OLD_META = /<metadata>\s*<graph-flow\b[\s\S]*?<\/graph-flow>\s*<\/metadata>/;
export function svgWithProject(svg: string, e: Embedded): string {
  const clean = svg.replace(OLD_META, '').replace(CARRIER, '');
  const open = /<svg\b[^>]*>/.exec(clean);
  if (!open) return clean;
  const { project, ...head } = e;
  const groups = [`<g id="graph-flow-h-${b64url(new TextEncoder().encode(JSON.stringify(head)))}"></g>`];
  for (let i = 0, k = 0; i < project.length; i += PIECE, k++) groups.push(`<g id="graph-flow-p${String(k).padStart(3, '0')}-${project.slice(i, i + PIECE)}"></g>`);
  const at = open.index + open[0].length;
  return `${clean.slice(0, at)}${groups.join('')}${clean.slice(at)}`;
}
const xmlUnescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export function svgProject(svg: string): Embedded | null {
  try {
    const h = /id="graph-flow-h-([A-Za-z0-9_-]+)"/.exec(svg);
    if (h) {
      const pieces = [...svg.matchAll(/id="graph-flow-p(\d{3})-([A-Za-z0-9_-]*)"/g)].sort((a, b) => Number(a[1]) - Number(b[1]));
      const e = { ...JSON.parse(new TextDecoder().decode(unb64url(h[1]))), project: pieces.map((m) => m[2]).join('') };
      return valid(e) && pieces.every((m, k) => Number(m[1]) === k) ? e : null;
    }
    const m = /<graph-flow\b[^>]*>([\s\S]*?)<\/graph-flow>/.exec(svg);
    if (!m) return null;
    const e = JSON.parse(xmlUnescape(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')));
    return valid(e) ? e : null;
  } catch {
    return null;
  }
}

// ---- PNG: an iTXt chunk (keyword graph-flow, not compressed: the project is) before IEND ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
export const isPng = (b: Uint8Array) => b.length > 8 && PNG_SIG.every((v, i) => b[i] === v);
// the chunks of a PNG: type, start of the chunk (its length field), data
function chunks(b: Uint8Array): { type: string; at: number; data: Uint8Array }[] {
  const out: { type: string; at: number; data: Uint8Array }[] = [];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8;
  while (p + 12 <= b.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(...b.subarray(p + 4, p + 8));
    if (p + 12 + len > b.length) break;
    out.push({ type, at: p, data: b.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}
export function pngWithProject(png: Uint8Array, e: Embedded): Uint8Array {
  const cs = chunks(png);
  const iend = cs.find((c) => c.type === 'IEND');
  if (!iend) return png;
  // an older graph-flow chunk left out
  const keep = cs.filter((c) => !(c.type === 'iTXt' && keyword(c.data) === EMBED_KEY));
  const enc = new TextEncoder();
  // keyword, 0, compression flag 0, method 0, language tag "", 0, translated keyword "", 0, the text
  const text = enc.encode(JSON.stringify(e));
  const key = enc.encode(EMBED_KEY);
  const data = new Uint8Array(key.length + 5 + text.length);
  data.set(key, 0);
  data.set(text, key.length + 5);
  const chunk = new Uint8Array(12 + data.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length);
  chunk.set(enc.encode('iTXt'), 4);
  chunk.set(data, 8);
  dv.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  const parts = [png.subarray(0, 8), ...keep.filter((c) => c.type !== 'IEND').map((c) => png.subarray(c.at, c.at + 12 + c.data.length)), chunk, png.subarray(iend.at, iend.at + 12)];
  const out = new Uint8Array(parts.reduce((s, q) => s + q.length, 0));
  let o = 0;
  for (const q of parts) {
    out.set(q, o);
    o += q.length;
  }
  return out;
}
const keyword = (d: Uint8Array) => {
  const z = d.indexOf(0);
  return new TextDecoder().decode(d.subarray(0, z < 0 ? d.length : z));
};
export function pngProject(png: Uint8Array): Embedded | null {
  if (!isPng(png)) return null;
  for (const c of chunks(png)) {
    if (c.type !== 'iTXt' && c.type !== 'tEXt') continue;
    if (keyword(c.data) !== EMBED_KEY) continue;
    // iTXt: after the keyword's 0: flag, method, language\0, translated keyword\0; tEXt: the text right after the 0
    let p = EMBED_KEY.length + 1;
    if (c.type === 'iTXt') {
      if (c.data[p] !== 0) return null; // compressed: not written by us
      p += 2;
      p = c.data.indexOf(0, p) + 1;
      p = c.data.indexOf(0, p) + 1;
    }
    try {
      const e = JSON.parse(new TextDecoder().decode(c.data.subarray(p)));
      return valid(e) ? e : null;
    } catch {
      return null;
    }
  }
  return null;
}

// a file of either kind
export function fileProject(bytes: Uint8Array): Embedded | null {
  if (isPng(bytes)) return pngProject(bytes);
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  return /<svg\b/.test(head) || /^\s*<\?xml/.test(head) ? svgProject(new TextDecoder().decode(bytes)) : null;
}
