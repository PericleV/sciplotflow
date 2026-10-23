// The catalog of the app for language models (an LLM given the link of the app): llms.txt, api/nodes.json (every node:
// its section, help, ports, options and defaults), api/project.schema.json, api/recipes.json (the examples) and
// api/check.mjs (the evaluator of the app bundled: a project file checked as the app would run it). Everything is read
// from the code, nothing written by hand but scripts/llms.md, so the catalog follows the app.
// Run after the build: node scripts/api.ts dist   (npm run build does it); npm run check checks it without writing.
import ts from 'typescript';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as DEFAULTS from '../src/defaults.ts';
import { NODE_HELP } from '../src/help.ts';
import { NODE_SECTION, NODE_TITLES } from '../src/nodeColors.ts';
import { PORT_LABELS, sourcePort, targetAccepts, type PortType } from '../src/engine/ports.ts';
import type { AppNode } from '../src/types.ts';
import { STATS } from '../src/engine/stats.ts';
import { LIBRARY, SHAPE_NAMES } from '../src/engine/fitModels.ts';
import { PALETTE } from '../src/figure/spec.ts';
import { PROJECT_VERSION, stringifyProject } from '../src/project.ts';
import { EXAMPLES } from '../src/examples.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

export type ApiPort = { id: string; pattern?: boolean; types: string[]; label?: string; about?: string };
export type ApiOption = { type: string; optional?: boolean; about?: string };
export type ApiNode = {
  type: string;
  title: string;
  menu?: string;
  section: string;
  hidden?: boolean;
  help: string;
  inputs: ApiPort[];
  outputs: ApiPort[];
  defaults: unknown;
  // what the data of the node are as a whole (the comment over their type), then every field
  dataAbout?: string;
  options: Record<string, ApiOption>;
};

// ---- the source, parsed once -------------------------------------------------------------------------------------
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []));
let program: ts.Program | undefined;
const getProgram = () =>
  (program ??= ts.createProgram(files(SRC), { jsx: ts.JsxEmit.ReactJSX, allowImportingTsExtensions: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true }));
const source = (file: string) => getProgram().getSourceFile(join(SRC, file))!;

// a text of the code: its literal values (both sides of a ?:), a template with what it fills in as `fill` (null: the
// name of what fills it, <k>, <name> …)
function texts(e: ts.Expression | undefined, fill: string | null): string[] {
  if (!e) return [];
  if (ts.isParenthesizedExpression(e)) return texts(e.expression, fill);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  const named = (x: ts.Expression) => fill ?? `<${ts.isPropertyAccessExpression(x) ? x.name.text : ts.isIdentifier(x) ? x.text : 'k'}>`;
  if (ts.isTemplateExpression(e)) return [e.head.text + e.templateSpans.map((s) => named(s.expression) + s.literal.text).join('')];
  if (ts.isConditionalExpression(e)) return [...texts(e.whenTrue, fill), ...texts(e.whenFalse, fill)];
  // the helpers that name the ports of rows: row 0 'y', row k 'y-k' (rowHandle, curveOpPort); a step's part
  if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
    const f = e.expression.text;
    const a0 = e.arguments[0];
    if (f === 'rowHandle' && a0 && ts.isStringLiteral(a0)) return [a0.text, `${a0.text}-<k>`];
    if (f === 'curveOpPort') return ['out', 'out-<k>'];
    if (f === 'partHandle') return ['s-<step>', 's-<step>-<part>'];
  }
  // Descriptive statistics on rows: a column output per statistic, by its key
  if (ts.isPropertyAccessExpression(e) && e.name.text === 'key' && ts.isIdentifier(e.expression) && e.expression.text === 'st') return STATS.map((s) => s.key);
  return [];
}
function attr(el: ts.JsxOpeningLikeElement, name: string): ts.Expression | undefined | null {
  for (const p of el.attributes.properties) {
    if (!ts.isJsxAttribute(p) || !ts.isIdentifier(p.name) || p.name.text !== name) continue;
    if (!p.initializer) return null;
    if (ts.isStringLiteral(p.initializer)) return p.initializer;
    if (ts.isJsxExpression(p.initializer)) return p.initializer.expression;
  }
  return undefined;
}

// The ports every component of src/nodes draws (InPort / OutPort, in it or in the components it draws).
type Drawn = { dir: 'in' | 'out'; ids: string[]; types: string[]; label?: string; about?: string };
function componentPorts(): Map<string, { ports: Drawn[]; uses: Set<string> }> {
  const comps = new Map<string, { ports: Drawn[]; uses: Set<string> }>();
  for (const file of files(join(SRC, 'nodes')).filter((f) => f.endsWith('.tsx'))) {
    const sf = getProgram().getSourceFile(file)!;
    const visitTop = (name: string, body: ts.Node) => {
      const c = { ports: [] as Drawn[], uses: new Set<string>() };
      const walk = (n: ts.Node) => {
        if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
          const tag = n.tagName.getText(sf);
          if (tag === 'InPort' || tag === 'OutPort') {
            const idE = attr(n, 'id');
            const ids = idE === undefined && tag === 'OutPort' ? ['out'] : texts(idE ?? undefined, null);
            const label = texts(attr(n, 'label') ?? undefined, '…')[0];
            const about = texts(attr(n, 'title') ?? undefined, '…').sort((a, b) => b.length - a.length)[0];
            c.ports.push({ dir: tag === 'InPort' ? 'in' : 'out', ids, types: texts(attr(n, 'port') ?? undefined, ''), label, about });
          } else if (/^[A-Z]/.test(tag)) c.uses.add(tag);
        }
        ts.forEachChild(n, walk);
      };
      walk(body);
      const had = comps.get(name);
      if (had) {
        had.ports.push(...c.ports);
        for (const u of c.uses) had.uses.add(u);
      } else comps.set(name, c);
    };
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name) visitTop(st.name.text, st);
      else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) visitTop(d.name.text, d.initializer);
    }
  }
  return comps;
}

// node type -> its view component, from App.tsx (baseNodeTypes) and the imports' renames
function viewsOfTypes(): Map<string, string> {
  const sf = source('App.tsx');
  const renamed = new Map<string, string>();
  const out = new Map<string, string>();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings))
      for (const el of st.importClause.namedBindings.elements) if (el.propertyName) renamed.set(el.name.text, el.propertyName.text);
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const init = d.initializer;
      if (!ts.isIdentifier(d.name) || !init || !ts.isObjectLiteralExpression(init)) continue;
      if (d.name.text !== 'baseNodeTypes' && d.name.text !== 'nodeTypes') continue;
      for (const p of init.properties) if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.initializer)) out.set(p.name.getText(sf), renamed.get(p.initializer.text) ?? p.initializer.text);
    }
  }
  return out;
}

// The nodes panel (App.tsx GROUPS): the type, its name in the menu, its defaults (the name of the defaults constant)
function palette(): { type: string; label: string; data: string; hidden: boolean }[] {
  const sf = source('App.tsx');
  const out: { type: string; label: string; data: string; hidden: boolean }[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isObjectLiteralExpression(n)) {
      const get = (k: string) => n.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === k)?.initializer;
      const type = get('type');
      const label = get('label');
      const data = get('data');
      if (type && label && data && ts.isStringLiteral(type) && ts.isStringLiteral(label)) {
        out.push({ type: type.text, label: label.text, data: data.getText(sf), hidden: get('hidden')?.kind === ts.SyntaxKind.TrueKeyword });
        return;
      }
    }
    ts.forEachChild(n, walk);
  };
  for (const st of sf.statements) if (ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => d.name.getText(sf) === 'GROUPS')) walk(st);
  return out;
}

// The options of a node: the fields of the type of its defaults, with the comment written over each.
function optionsOf(constName: string): { options: Record<string, ApiOption>; about?: string } {
  const checker = getProgram().getTypeChecker();
  // the constant as defaults.ts exports it (declared there, or re-exported from the engine)
  let sym = checker.getExportsOfModule(checker.getSymbolAtLocation(source('defaults.ts'))!).find((s) => s.name === constName);
  if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
  const decl = sym?.valueDeclaration;
  if (!decl || !ts.isVariableDeclaration(decl)) return { options: {} };
  const type = decl.type ? checker.getTypeFromTypeNode(decl.type) : checker.getTypeAtLocation(decl.name);
  // the comment over the type of the node's data (what the data are as a whole)
  const tdecl = (type.aliasSymbol ?? type.getSymbol())?.declarations?.[0];
  const about = tdecl ? commentOver(ts.isTypeLiteralNode(tdecl) ? tdecl.parent : tdecl) : '';
  return { options: fieldsOf(type), ...(about ? { about } : {}) };
}

// The named types the options use (CurveRow, AxesStyle …), each once: its fields, or what it is (a union …)
export const typeDefs = new Map<string, { fields?: Record<string, ApiOption>; type?: string; about?: string }>();
const commentOver = (d: ts.Node) => {
  const file = d.getSourceFile();
  return (ts.getLeadingCommentRanges(file.text, d.getFullStart()) ?? [])
    .map((r) => file.text.slice(r.pos, r.end).replace(/^\/\/ ?|^\/\*+|\*+\/$/g, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ');
};
const FMT = ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType;
function fieldsOf(type: ts.Type): Record<string, ApiOption> {
  const checker = getProgram().getTypeChecker();
  const out: Record<string, ApiOption> = {};
  for (const prop of checker.getPropertiesOfType(type)) {
    const d = prop.declarations?.[0];
    if (!d) continue;
    const t = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(prop, d));
    let text = checker.typeToString(t, undefined, FMT);
    if (text.length > 300) text = text.slice(0, 297) + '…';
    collectNamed(t);
    const about = commentOver(d);
    out[prop.name] = { type: text, ...(prop.flags & ts.SymbolFlags.Optional ? { optional: true } : {}), ...(about ? { about } : {}) };
  }
  return out;
}
// the types of the app named in a type (through unions, arrays, Partial<…>, Record<…>), described in typeDefs
function collectNamed(t: ts.Type) {
  const checker = getProgram().getTypeChecker();
  const alias = t.aliasSymbol;
  const isOurs = (s?: ts.Symbol) => !!s?.declarations?.[0]?.getSourceFile().fileName.replace(/\\/g, '/').startsWith(SRC.replace(/\\/g, '/'));
  if (t.isUnion() && !(alias && isOurs(alias))) return t.types.forEach(collectNamed);
  if (checker.isArrayType(t)) return checker.getTypeArguments(t as ts.TypeReference).forEach(collectNamed);
  const sym = alias ?? t.getSymbol();
  const decl = sym?.declarations?.[0];
  const ours = isOurs(sym);
  if (alias && !ours) return (t.aliasTypeArguments ?? []).forEach(collectNamed); // Partial<X>, Record<K, X>
  if (!ours || !sym || typeDefs.has(sym.name) || /^__/.test(sym.name)) return;
  const about = commentOver(ts.isVariableDeclaration(decl!) ? decl!.parent.parent : decl!);
  if (t.flags & ts.TypeFlags.Object && checker.getPropertiesOfType(t).length) {
    typeDefs.set(sym.name, { ...(about ? { about } : {}) });
    typeDefs.set(sym.name, { ...(about ? { about } : {}), fields: fieldsOf(t) });
  } else typeDefs.set(sym.name, { type: checker.typeToString(t, undefined, FMT | ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.NoTruncation), ...(about ? { about } : {}) });
}

// ---- the catalog ---------------------------------------------------------------------------------------------------
export function nodesCatalog(): ApiNode[] {
  const comps = componentPorts();
  const views = viewsOfTypes();
  const menu = new Map(palette().map((p) => [p.type, p]));
  // the ports a component draws, with those of the components it draws (by name), once each
  const portsOf = (name: string, seen = new Set<string>()): Drawn[] => {
    if (seen.has(name)) return [];
    seen.add(name);
    const c = comps.get(name);
    if (!c) return [];
    return [...c.ports, ...[...c.uses].flatMap((u) => portsOf(u, seen))];
  };
  const merge = (drawn: Drawn[], dir: 'in' | 'out'): ApiPort[] => {
    const by = new Map<string, ApiPort>();
    for (const p of drawn.filter((d) => d.dir === dir))
      for (const id of p.ids) {
        const had = by.get(id);
        const types = [...new Set([...(had?.types ?? []), ...p.types])];
        const about = [had?.about, p.about].filter(Boolean).sort((a, b) => b!.length - a!.length)[0];
        by.set(id, { id, ...(/<\w+>/.test(id) ? { pattern: true } : {}), types, ...(had?.label ?? p.label ? { label: had?.label ?? p.label } : {}), ...(about ? { about } : {}) });
      }
    return [...by.values()];
  };
  const types = Object.keys(NODE_TITLES).filter((t) => t !== 'frame');
  return types.map((type) => {
    const view = views.get(type);
    const drawn = view ? portsOf(view) : [];
    // a Reroute draws its handles itself: one in, one out, of the type of what reaches it
    const reroute = type === 'reroute';
    const m = menu.get(type);
    const constName = m && /^[A-Z0-9_]+$/.test(m.data) ? m.data : undefined;
    const defaults = constName ? (DEFAULTS as Record<string, unknown>)[constName] : m ? {} : undefined;
    // the types the engine gives / accepts (a pattern tried as its first row), with those the view draws
    const opts = constName ? optionsOf(constName) : { options: {} as Record<string, ApiOption>, about: undefined };
    const node = { id: 'n', type, position: { x: 0, y: 0 }, data: defaults ?? {} } as unknown as AppNode;
    const sample = (id: string) => id.replace(/<\w+>/g, '1');
    const typed = (ports: ApiPort[], dir: 'in' | 'out'): ApiPort[] =>
      ports.map((p) => {
        let real: string[] = [];
        try {
          real = dir === 'in' ? targetAccepts(node, sample(p.id)) : [sourcePort(node, sample(p.id)) ?? ''].filter(Boolean);
        } catch {
          // (data a pattern does not fit: the drawn types)
        }
        const types = [...new Set([...real, ...p.types])];
        return { ...p, types: types.length > 1 ? types.filter((t) => t !== 'any') : types.length ? types : ['any'] };
      });
    return {
      type,
      title: NODE_TITLES[type as keyof typeof NODE_TITLES],
      ...(m && m.label !== NODE_TITLES[type as keyof typeof NODE_TITLES] ? { menu: m.label } : {}),
      section: NODE_SECTION[type as keyof typeof NODE_SECTION],
      ...(!m || m.hidden ? { hidden: true } : {}),
      help: NODE_HELP[type as keyof typeof NODE_HELP] ?? '',
      inputs: reroute ? [{ id: 'in', types: ['any'] }] : typed(merge(drawn, 'in'), 'in'),
      outputs: reroute ? [{ id: 'out', types: ['any'] }] : typed(merge(drawn, 'out'), 'out'),
      defaults: defaults ?? null,
      ...(opts.about ? { dataAbout: opts.about } : {}),
      options: opts.options,
    };
  });
}

export function projectSchema(nodes: ApiNode[]) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'SciPlotFlow project file',
    description: 'Open it in the app with Open project (or drop it on the canvas). The data of every node is described in nodes.json; missing optional fields take their defaults.',
    type: 'object',
    required: ['app', 'version', 'nodes', 'edges'],
    properties: {
      app: { const: 'graph-flow' },
      version: { const: PROJECT_VERSION, description: 'The format of the file. Older formats are converted on opening; write this one.' },
      name: { type: 'string' },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'type', 'position', 'data'],
          properties: {
            id: { type: 'string', description: 'Unique in the project' },
            type: { enum: [...nodes.map((n) => n.type), 'frame'] },
            position: { type: 'object', required: ['x', 'y'], properties: { x: { type: 'number' }, y: { type: 'number' } }, description: 'On the canvas, in pixels (nodes are about 300 px wide: leave 400 px between columns)' },
            data: { type: 'object', description: 'The options of the node: start from its defaults in nodes.json and change what the task needs' },
            parentId: { type: 'string', description: 'Inside a group (subgraph) or a frame: its id; the position is then relative to it' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'source', 'sourceHandle', 'target', 'targetHandle'],
          properties: {
            id: { type: 'string' },
            source: { type: 'string', description: 'The id of the node the value comes from' },
            sourceHandle: { type: 'string', description: 'Its output port (nodes.json: outputs[].id)' },
            target: { type: 'string' },
            targetHandle: { type: 'string', description: 'The input port (nodes.json: inputs[].id)' },
          },
        },
      },
    },
  };
}

// The examples of the app: what each does, its chain of nodes; the whole project file when it is small
export function recipes() {
  return EXAMPLES.map((ex) => {
    const p = ex.make();
    const text = stringifyProject(p);
    const title = new Map(p.nodes.map((n) => [n.id, n.type]));
    return {
      group: ex.group,
      name: ex.name,
      about: ex.desc,
      nodes: p.nodes.filter((n) => n.type !== 'frame' && n.type !== 'note').map((n) => `${n.id}: ${n.type}`),
      connections: p.edges.map((e) => `${e.source}.${e.sourceHandle ?? 'out'} (${title.get(e.source)}) → ${e.target}.${e.targetHandle ?? ''} (${title.get(e.target)})`),
      ...(text.length < 30_000 ? { project: JSON.parse(text) } : {}),
    };
  });
}

export function llmsTxt(nodes: ApiNode[]): string {
  const head = readFileSync(join(ROOT, 'scripts', 'llms.md'), 'utf8').replace('{{VERSION}}', String(PROJECT_VERSION));
  const types = Object.entries(PORT_LABELS).map(([t, l]) => `- ${t}: ${l}`).join('\n');
  const bySection = new Map<string, ApiNode[]>();
  for (const n of nodes.filter((n) => !n.hidden)) bySection.set(n.section, [...(bySection.get(n.section) ?? []), n]);
  const first = (s: string) => {
    const m = /^(.{40,300}?\.)\s/.exec(s);
    return m ? m[1] : `${s.slice(0, 300).trim()} …`;
  };
  const list = [...bySection].map(([s, ns]) => `### ${s}\n` + ns.map((n) => `- ${n.type} (${n.menu ?? n.title}): ${first(n.help)}`).join('\n')).join('\n\n');
  return head.replace('{{PORT_TYPES}}', types).replace('{{NODES}}', list);
}

// The names some options take: the models of the fit library (Fit: model.kind 'library', model.model = its id), the
// peak shapes (model.shape, Peak analyzer)
export const lists = () => ({
  fitModels: Object.entries(LIBRARY).map(([id, d]) => ({ id, group: d.group, label: d.label, ...(d.note ? { formula: d.note } : {}), params: d.params.map(([n]) => n) })),
  peakShapes: SHAPE_NAMES,
  // the colours the app gives curves 1, 2, 3 … (colour-blind safe)
  curveColors: PALETTE,
});

// The checker bundled into one file (the engine of the app; it runs with Node, nothing to install)
export async function bundleChecker(outFile: string) {
  const { build } = await import('rolldown');
  await build({
    input: join(ROOT, 'scripts', 'api-check.ts'),
    platform: 'node',
    logLevel: 'silent',
    resolve: { alias: { paper: 'paper/dist/paper-core.js' } },
    output: { file: outFile, format: 'esm', codeSplitting: false, minify: true, comments: false, banner: '// SciPlotFlow project checker. Run: node check.mjs project.json' },
  });
}

// What the published files must never hold: the paths of this computer, addresses, keys
export const PRIVATE = [/[A-Za-z]:[\\/]{1,2}Users[\\/]/, /\/home\/[a-z]/i, /\/Users\/[A-Za-z]/, /AppData/, /[\w.+-]+@(?!users\.noreply)[\w-]+\.(com|ro|org|net|eu)\b/, /sk-ant-|ghp_[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}/];
export const privateHits = (text: string) => PRIVATE.filter((r) => r.test(text)).map((r) => String(r));

export async function writeApi(outDir: string) {
  const nodes = nodesCatalog();
  const files: Record<string, string> = {
    'llms.txt': llmsTxt(nodes),
    // (numbers that are not finite as a project file writes them)
    'api/nodes.json': JSON.stringify({ version: PROJECT_VERSION, portTypes: PORT_LABELS as Record<PortType, string>, nodes, types: Object.fromEntries([...typeDefs].sort(([a], [b]) => a.localeCompare(b))), lists: lists() }, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? { $num: String(v) } : v), 1),
    'api/project.schema.json': JSON.stringify(projectSchema(nodes), null, 1),
    'api/recipes.json': JSON.stringify(recipes(), null, 1),
  };
  mkdirSync(join(outDir, 'api'), { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(outDir, f), text);
  await bundleChecker(join(outDir, 'api', 'check.mjs'));
  const all = [...Object.keys(files), 'api/check.mjs'];
  const bad = all.filter((f) => privateHits(readFileSync(join(outDir, f), 'utf8')).length);
  if (bad.length) throw new Error(`private text in ${bad.join(', ')}`);
  return all.map((f) => `${relative(ROOT, join(outDir, f))} ${(readFileSync(join(outDir, f)).length / 1024).toFixed(0)} kB`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] ?? join(ROOT, 'dist');
  for (const line of await writeApi(out)) console.log(line);
}
