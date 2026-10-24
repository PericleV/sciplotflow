// The validation report (npm run validation → VALIDATION.md): every check of npm run check, grouped by what its result
// is compared with — the reference values of a script of scripts/fixtures (computed with SciPy, statsmodels …; the
// script is the one whose values the check's block reads), a library or program named in the check, or else exact
// values, definitions and properties.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// file and line: where ok() was called from
export type CheckRecord = { pass: boolean; what: string; file: string; line: number };

// the caller of ok() from a stack (the frame after ok's own)
export function callSite(stack: string): { file: string; line: number } {
  const frames = stack.split('\n').filter((l) => /\.tsx?:\d+:\d+\)?$/.test(l.trim()));
  const m = /(file:\/\/\/[^\s)]+?\.tsx?):(\d+):\d+\)?$/.exec((frames[1] ?? '').trim());
  return m ? { file: fileURLToPath(m[1]), line: +m[2] } : { file: '', line: 0 };
}

// the programs a check may name when it compares with their conventions, without reference values
const NAMED: { name: string; re: RegExp }[] = [
  { name: 'ImageJ', re: /ImageJ|Fiji/ },
  { name: 'MATLAB', re: /MATLAB/ },
  { name: 'R', re: /\bR's\b|\bin R\b|\bas R\b/ },
  { name: 'Origin', re: /\bOrigin\b/ },
  { name: 'SciPy', re: /scipy/i },
  { name: 'NumPy', re: /numpy/i },
  { name: 'statsmodels', re: /statsmodels/i },
  { name: 'PyWavelets', re: /PyWavelets|pywt/i },
  { name: 'matplotlib', re: /matplotlib|contourpy/i },
  { name: 'scikit-image', re: /scikit-image|skimage/i },
];
const PY: Record<string, string> = { scipy: 'SciPy', numpy: 'NumPy', statsmodels: 'statsmodels', pingouin: 'pingouin', lifelines: 'lifelines', sklearn: 'scikit-learn', skimage: 'scikit-image', matplotlib: 'matplotlib', contourpy: 'contourpy', pywt: 'PyWavelets', pycwt: 'pycwt', pybaselines: 'pybaselines', ruptures: 'ruptures', differint: 'differint', astropy: 'astropy', reliability: 'reliability', pandas: 'pandas' };
const OTHER = 'Exact values, definitions and properties';

const root = fileURLToPath(new URL('..', import.meta.url));
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// a reference script: what it computes (its header comment) and the Python libraries it imports
function fixtures(): Map<string, { about: string; libs: string[] }> {
  const dir = join(root, 'scripts', 'fixtures');
  const out = new Map<string, { about: string; libs: string[] }>();
  for (const f of readdirSync(dir).filter((q) => q.endsWith('.py')).sort()) {
    const text = readFileSync(join(dir, f), 'utf8');
    const head: string[] = [];
    for (const l of text.split(/\r?\n/)) {
      if (!l.startsWith('#')) break;
      const t = l.replace(/^#\s?/, '').trim();
      // (how to run it: in the report's own section)
      if (/^(python\b|Run:|Run in)/.test(t)) continue;
      head.push(t);
    }
    const libs = new Set<string>();
    for (const m of text.matchAll(/^\s*(?:from|import)\s+([\w., ]+)/gm))
      for (const name of m[1].split(',')) {
        const lib = PY[name.trim().split(/[.\s]/)[0]];
        if (lib) libs.add(lib);
      }
    // (what it computes: its header without the words every header has, nor the files it is for)
    const about = head
      .join(' ')
      .replace(/\s*python -W ignore \S+/g, '')
      .replace(/^(The )?reference (values )?(of npm run check )?for (the )?/i, '')
      .replace(/^References for /i, '')
      .replace(/\s*\((?:[^()]*(?:scripts|src)\/[^()]*)\)/g, '')
      .replace(/^src\/[\w/.]+(?: and [\w.]+)?:\s*/i, '')
      .replace(/[:\s]+$/, '.');
    out.set(f.replace(/\.py$/, ''), { about: about.charAt(0).toUpperCase() + about.slice(1), libs: [...libs] });
  }
  return out;
}

// The reference script a check reads: a variable read from a fixtures/…-ref.json, in scope at the check's line (by the
// indentation: from its definition to the end of the block it is defined in), used in the block of statements around
// the check (a `{` alone on a line, at the indentation of the file's blocks; the strings left out)
const indent = (l: string) => l.length - l.trimStart().length;
function fixtureOf(file: string, line: number, cache: Map<string, string[]>): string | null {
  if (!file) return null;
  let lines = cache.get(file);
  if (!lines) {
    lines = readFileSync(file, 'utf8').split(/\r?\n/);
    cache.set(file, lines);
  }
  const L = line - 1;
  // (the outermost block of statements around the line: in check.ts at column 0, in the others inside their function)
  const top = /check\.ts$/.test(file) ? /^\{\s*(\/\/.*)?$/ : /^ {2}\{\s*(\/\/.*)?$/;
  const end = /check\.ts$/.test(file) ? /^\}\s*$/ : /^ {2}\}\s*$/;
  let a = L;
  while (a >= 0 && !top.test(lines[a])) a--;
  let b = Math.max(a, 0);
  while (b < lines.length && !(b > a && end.test(lines[b]))) b++;
  if (a < 0 || b < L) return null;
  const block = lines
    .slice(a, b + 1)
    .join('\n')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
  // (of the reference values in scope and used, those read last before the line: a block may read several in turn)
  let best: { at: number; fx: string } | null = null;
  for (let i = 0; i <= L; i++) {
    const d = /const (\w+) = JSON\.parse\(readFileSync\((?:new URL\('\.\/fixtures\/|'scripts\/fixtures\/)([\w-]+)\.json'/.exec(lines[i]);
    if (!d) continue;
    let e = i + 1;
    while (e < lines.length && (!lines[e].trim() || indent(lines[e]) >= indent(lines[i]))) e++;
    if (L >= e) continue;
    const uses = (block.match(new RegExp(`\\b${d[1]}\\b`, 'g')) ?? []).length - (i >= a && i <= b ? 1 : 0);
    if (uses > 0 && (!best || i > best.at)) best = { at: i, fx: d[2] };
  }
  return best?.fx ?? null;
}

export function writeValidation(records: CheckRecord[], version: string) {
  const fx = fixtures();
  const cache = new Map<string, string[]>();
  const groups = new Map<string, CheckRecord[]>();
  for (const r of records) {
    const f = fixtureOf(r.file, r.line, cache);
    const key = f && fx.has(f) ? `fixture:${f}` : (NAMED.find((q) => q.re.test(r.what))?.name ?? OTHER);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const fixtureKeys = [...fx.keys()].map((f) => `fixture:${f}`).filter((k) => groups.has(k));
  const namedKeys = NAMED.map((q) => q.name).filter((n) => groups.has(n));
  const nRef = fixtureKeys.reduce((s, k) => s + groups.get(k)!.length, 0);
  const nNamed = namedKeys.reduce((s, k) => s + groups.get(k)!.length, 0);
  const passed = records.filter((r) => r.pass).length;
  const date = new Date().toISOString().slice(0, 10);
  const libsAll = new Set<string>();
  for (const k of fixtureKeys) for (const l of fx.get(k.slice(8))!.libs) libsAll.add(l);
  const title = (k: string) => (k.startsWith('fixture:') ? `${k.slice(8)}.py` : k);
  const out: string[] = [];
  const p = (s = '') => out.push(s);
  p('# Validation');
  p();
  p(`SciPlotFlow ${version}, ${date}: **${passed} of ${records.length} checks pass**${passed === records.length ? '' : ` (${records.length - passed} fail, marked ✗ below)`}.`);
  p();
  p('Every computation of SciPlotFlow is checked by `npm run check`:');
  p();
  p(`- **${nRef} checks** compare a result with reference values computed in Python by established libraries (${[...libsAll].join(', ')}). The scripts that compute them are in [\`scripts/fixtures\`](scripts/fixtures); their values are stored next to them as JSON, so the checks run without Python.`);
  p(`- **${nNamed} checks** compare with the conventions of a library or program they name (${namedKeys.join(', ')}), without stored values.`);
  p(`- **${groups.get(OTHER)?.length ?? 0} checks** compare with exact values: a known answer, a formula, an identity (a transform and its inverse, the energy kept), a property (a test that must not change when the data are shifted), or the behaviour of the interface (a file read, a figure laid out, a project opened). Methods that no library does (or none does right) are written from their publications, cited in the code.`);
  p();
  p('Each check states what it compares and how close the result is; one check often compares many values (the statistical tests against SciPy: one check, 267 values). This file is made by `npm run validation`, which runs every check and writes it.');
  p();
  p('## How to reproduce');
  p();
  p('```bash');
  p('npm install');
  p('npm run check');
  p('```');
  p();
  p('To compute the reference values again: a Python environment with the libraries of the table below');
  p('(`pip install scipy statsmodels pingouin lifelines scikit-learn scikit-image matplotlib contourpy PyWavelets pycwt pybaselines ruptures differint astropy reliability pandas`),');
  p('then run a script, for example `python scripts/fixtures/sigpack-ref.py`. The versions used are named in the scripts.');
  p();
  p('## Reference values');
  p();
  p('| Script | Checks | What it computes | Libraries |');
  p('|---|---:|---|---|');
  for (const k of fixtureKeys) {
    const f = fx.get(k.slice(8))!;
    const rs = groups.get(k)!;
    p(`| [\`${k.slice(8)}.py\`](scripts/fixtures/${k.slice(8)}.py) | ${rs.filter((r) => r.pass).length} / ${rs.length} | ${esc(f.about || '(see the script)')} | ${f.libs.join(', ')} |`);
  }
  p();
  if (namedKeys.length) {
    p('## Conventions of a named library or program');
    p();
    p('| Compared with | Checks |');
    p('|---|---:|');
    for (const k of namedKeys) p(`| ${k} | ${groups.get(k)!.filter((r) => r.pass).length} / ${groups.get(k)!.length} |`);
    p();
  }
  p('## Every check');
  p();
  for (const k of [...fixtureKeys, ...namedKeys, ...(groups.has(OTHER) ? [OTHER] : [])]) {
    const rs = groups.get(k)!;
    p(`<details><summary><b>${title(k)}</b>: ${rs.length} checks</summary>`);
    p();
    for (const r of rs) p(`- ${r.pass ? '✓' : '✗'} ${esc(r.what)}`);
    p();
    p('</details>');
    p();
  }
  writeFileSync(join(root, 'VALIDATION.md'), out.join('\n'));
  return { fixtures: nRef, named: nNamed, other: groups.get(OTHER)?.length ?? 0, unread: [...fx.keys()].filter((f) => !groups.has(`fixture:${f}`)) };
}
