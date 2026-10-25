// Searching texts by their words, in the browser, with nothing downloaded: Help now, the assistant's recipes later.
// Words lower-cased, without accents, their English endings taken off (peaks → peak, fitted → fit, smoothing → smooth);
// some synonyms (background ↔ baseline, graph ↔ plot …); a word mistyped by one letter still found (smoth → smooth); the
// last word typed matched by its beginning (as it is being typed). Documents ranked by BM25, their title counting more
// than their text. Pure.

const STOP = new Set('a an the of to in on at by for with and or is are be it its this that these those my me i we you your how do does can what which where when from into as not no so than then there their them all any each every also just only about up out over under get make'.split(' '));

// the accents taken off, lower case; letters, digits and Greek kept, the rest a space
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9Ͱ-Ͽ]+/g, ' ')
    .trim();
}

// an English word without its ending (a light stemmer: plurals, -ing, -ed, -ly)
export function stem(w: string): string {
  if (w.length <= 3 || /^\d/.test(w)) return w;
  if (/(ss|is|us)$/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (/ing$/.test(w) && w.length > 5) return undouble(w.slice(0, -3));
  if (/ed$/.test(w) && w.length > 4) return undouble(w.slice(0, -2));
  if (/ly$/.test(w) && w.length > 5) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}
// fitted → fit, mapped → map (not: added → add, stays)
const undouble = (w: string) => (/([bdfgmnprt])\1$/.test(w) ? w.slice(0, -1) : w);

export const tokens = (s: string): string[] =>
  normalize(s)
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map(stem);

// words that mean the same here (each group: any of them finds the others, counted a little less)
const SYNONYM_GROUPS = [
  ['baseline', 'background'],
  ['smooth', 'denoise', 'noise'],
  ['plot', 'graph', 'chart', 'figure'],
  ['fit', 'regression', 'model'],
  ['remove', 'delete', 'drop'],
  ['average', 'mean'],
  ['sd', 'std', 'deviation', 'stdev'],
  ['fwhm', 'width'],
  ['derivative', 'differentiate'],
  ['integral', 'integrate', 'area'],
  ['import', 'open', 'load', 'read'],
  ['export', 'save'],
  ['heatmap', 'contour'],
  ['interpolate', 'resample', 'interpolation'],
  ['normalize', 'normalise', 'rescale'],
  ['combine', 'merge', 'join', 'append'],
  ['column', 'col', 'columns'],
  ['row', 'rows'],
  ['picture', 'image', 'photo', 'micrograph'],
  ['color', 'colour'],
  ['gray', 'grey'],
  ['shortcut', 'key', 'keyboard'],
].map((g) => g.map(stem));
const SYNONYMS = new Map<string, string[]>();
for (const g of SYNONYM_GROUPS) for (const w of g) SYNONYMS.set(w, [...new Set([...(SYNONYMS.get(w) ?? []), ...g.filter((x) => x !== w)])]);

// one letter added, taken off, changed or two swapped
function nearWord(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export type SearchDoc = { id: string; title: string; text: string };
export type SearchHit = { id: string; score: number; terms: string[] };

// The index of some documents: their words counted, the title's three times
export function makeIndex(docs: SearchDoc[]) {
  const tf: Map<string, number>[] = [];
  const lens: number[] = [];
  const df = new Map<string, number>();
  docs.forEach((d) => {
    const m = new Map<string, number>();
    const add = (w: string, k: number) => m.set(w, (m.get(w) ?? 0) + k);
    tokens(d.title).forEach((w) => add(w, 3));
    tokens(d.text).forEach((w) => add(w, 1));
    tf.push(m);
    lens.push([...m.values()].reduce((a, b) => a + b, 0));
    for (const w of m.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  });
  const vocab = [...df.keys()];
  const avg = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const N = docs.length;
  const idf = (w: string) => Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
  // the words of the index a query word stands for: itself, its synonyms, the ones it begins (the last word, being
  // typed), the ones one letter off (a typo): each with how much it counts
  const expand = (w: string, last: boolean): [string, number][] => {
    const out = new Map<string, number>();
    if (df.has(w)) out.set(w, 1);
    for (const s of SYNONYMS.get(w) ?? []) if (df.has(s)) out.set(s, Math.max(out.get(s) ?? 0, 0.6));
    if (last && w.length >= 2) for (const v of vocab) if (v.length > w.length && v.startsWith(w)) out.set(v, Math.max(out.get(v) ?? 0, 0.8));
    if (!out.size && w.length >= 4) for (const v of vocab) if (nearWord(w, v)) out.set(v, 0.7);
    return [...out];
  };
  function search(query: string, limit = 30): SearchHit[] {
    const q = tokens(query);
    if (!q.length) return [];
    const typedLast = !/\s$/.test(query);
    const groups = q.map((w, k) => expand(w, typedLast && k === q.length - 1));
    const [k1, b] = [1.2, 0.75];
    const hits: SearchHit[] = [];
    docs.forEach((d, i) => {
      let score = 0;
      let matched = 0;
      const terms: string[] = [];
      for (const g of groups) {
        let best = 0;
        for (const [w, weight] of g) {
          const f = tf[i].get(w);
          if (!f) continue;
          const s = weight * idf(w) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * lens[i]) / avg)));
          if (s > best) best = s;
          terms.push(w);
        }
        if (best > 0) matched++;
        score += best;
      }
      // every word of the query found counts more than one word found many times
      if (score > 0) hits.push({ id: d.id, score: score * (matched / groups.length) ** 2, terms });
    });
    return hits.sort((a, c) => c.score - a.score).slice(0, limit);
  }
  return { search };
}

// A piece of a text around the words found (about `len` characters), cut into parts found and not, to highlight them
export function snippet(text: string, terms: string[], len = 180): { t: string; hit: boolean }[] {
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
  const isHit = (w: string) => terms.includes(stem(normalize(w)));
  const at = words.filter((m) => isHit(m[0])).map((m) => m.index ?? 0);
  // the window with the most words found
  let start = 0;
  let best = -1;
  for (const a of at) {
    const n = at.filter((x) => x >= a - 20 && x < a - 20 + len).length;
    if (n > best) [best, start] = [n, Math.max(0, a - 20)];
  }
  let s = start;
  if (s > 0) {
    const sp = text.indexOf(' ', s);
    s = sp >= 0 && sp < s + 20 ? sp + 1 : s;
  }
  let e = Math.min(text.length, s + len);
  if (e < text.length) {
    const sp = text.lastIndexOf(' ', e);
    e = sp > s ? sp : e;
  }
  const piece = text.slice(s, e);
  const out: { t: string; hit: boolean }[] = [];
  if (s > 0) out.push({ t: '… ', hit: false });
  let last = 0;
  for (const m of piece.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (!isHit(m[0])) continue;
    const i = m.index ?? 0;
    if (i > last) out.push({ t: piece.slice(last, i), hit: false });
    out.push({ t: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < piece.length) out.push({ t: piece.slice(last), hit: false });
  if (e < text.length) out.push({ t: ' …', hit: false });
  return out;
}

// A whole text cut into the parts found and not (the words of `terms`), to highlight them
export function highlight(text: string, terms: string[]): { t: string; hit: boolean }[] {
  if (!terms.length) return [{ t: text, hit: false }];
  const out: { t: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (!terms.includes(stem(normalize(m[0])))) continue;
    const i = m.index ?? 0;
    if (i > last) out.push({ t: text.slice(last, i), hit: false });
    out.push({ t: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), hit: false });
  return out;
}
