// The project checker of the catalog (api/check.mjs, bundled by scripts/api.ts): a project file read as the app reads
// it, every connection tried by the app's own rule, the graph evaluated by the app's engine, and every node's result:
// its errors and warnings and what each output holds (the columns of a dataset, the rows …).
// Run: node check.mjs project.json [--json]   (exit code 1 when there are errors)
import { readFileSync } from 'node:fs';
import type { Edge } from '@xyflow/react';
import { parseProject, PROJECT_VERSION } from '../src/project.ts';
import { evaluateGraph, type NodeResult } from '../src/engine/evaluate.ts';
import { canConnect, isMultiInput, sourcePort, targetAccepts } from '../src/engine/ports.ts';
import { NODE_TITLES } from '../src/nodeColors.ts';
import type { AppNode } from '../src/types.ts';

export type NodeReport = { id: string; type: string; errors: string[]; warnings: string[]; outputs: Record<string, string> };
export type Report = { ok: boolean; errors: string[]; warnings: string[]; nodes: NodeReport[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// what a value holds, in a line
function describe(v: NodeResult['outputs'][string]): string {
  switch (v.t) {
    case 'dataset':
      return `dataset: ${Math.max(0, ...v.v.columns.map((c) => c.values.length))} rows; columns: ${v.v.columns.map((c) => c.name).join(', ')}`;
    case 'column':
      return `column “${v.v.name}”: ${v.v.values.length} rows`;
    case 'scalar':
      return `value ${v.v.name} = ${v.v.value}`;
    case 'workbook':
      return `workbook: ${v.v.sheets.length} sheets (${v.v.sheets.map((s) => s.name).slice(0, 8).join(', ')}${v.v.sheets.length > 8 ? ' …' : ''})`;
    case 'matrix':
      return `matrix ${v.v.rows} × ${v.v.cols}`;
    case 'figure':
      return 'figure';
    default:
      return (v as { t: string }).t;
  }
}

export function checkProject(text: string): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (e: string): Report => ({ ok: false, errors: [...errors, e], warnings, nodes: [] });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return fail(`Not valid JSON: ${(e as Error).message}`);
  }
  if (!isObj(raw)) return fail('The file must be a JSON object.');
  if (raw.app !== 'graph-flow') errors.push('"app" must be "graph-flow".');
  if (raw.version !== PROJECT_VERSION) (typeof raw.version === 'number' && raw.version < PROJECT_VERSION ? warnings : errors).push(`"version" should be ${PROJECT_VERSION} (the current format); it is ${JSON.stringify(raw.version)}.`);
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  if (!Array.isArray(raw.nodes)) errors.push('"nodes" must be an array.');
  if (!Array.isArray(raw.edges)) errors.push('"edges" must be an array.');
  // the nodes as written: an id, a known type, data, a position
  const seen = new Set<string>();
  rawNodes.forEach((n, k) => {
    if (!isObj(n)) return errors.push(`nodes[${k}] is not an object.`);
    const at = `node ${typeof n.id === 'string' ? `“${n.id}”` : `nodes[${k}]`}`;
    if (typeof n.id !== 'string' || !n.id) errors.push(`${at}: "id" must be a non-empty string.`);
    else if (seen.has(n.id)) errors.push(`${at}: the id is used twice.`);
    else seen.add(n.id);
    if (typeof n.type !== 'string' || !(n.type in NODE_TITLES)) errors.push(`${at}: unknown type ${JSON.stringify(n.type)} (the types are in api/nodes.json).`);
    if (!isObj(n.data)) errors.push(`${at}: "data" must be an object (start from the node's defaults in api/nodes.json).`);
    if (!isObj(n.position) || typeof n.position.x !== 'number' || typeof n.position.y !== 'number') warnings.push(`${at}: no "position" {x, y}; it is placed at (0, 0).`);
  });
  const edgeIds = new Set<string>();
  rawEdges.forEach((e, k) => {
    if (!isObj(e)) return errors.push(`edges[${k}] is not an object.`);
    const at = `edge ${typeof e.id === 'string' ? `“${e.id}”` : `edges[${k}]`}`;
    if (typeof e.id !== 'string' || !e.id) errors.push(`${at}: "id" must be a non-empty string.`);
    else if (edgeIds.has(e.id)) errors.push(`${at}: the id is used twice.`);
    else edgeIds.add(e.id);
    for (const f of ['source', 'target'] as const) if (typeof e[f] !== 'string' || !seen.has(e[f] as string)) errors.push(`${at}: "${f}" ${JSON.stringify(e[f])} is not the id of a node.`);
    for (const f of ['sourceHandle', 'targetHandle'] as const) if (typeof e[f] !== 'string' || !e[f]) errors.push(`${at}: "${f}" must name a port (api/nodes.json: ${f === 'sourceHandle' ? 'outputs' : 'inputs'}[].id).`);
  });
  if (errors.length) return { ok: false, errors, warnings, nodes: [] };

  // as the app opens it (older formats converted, damaged parts left out)
  const p = parseProject(text);
  if (typeof p === 'string') return fail(p);
  if (p.repaired) errors.push(p.repaired);
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const label = (n: AppNode) => `${n.type} “${n.id}”`;
  const ctx = { node: (id: string) => byId.get(id), edges: p.edges };
  // every connection by the app's rule; a single input fed twice keeps only one
  const into = new Map<string, Edge[]>();
  for (const e of p.edges) {
    const s = byId.get(e.source)!;
    const t = byId.get(e.target)!;
    const out = sourcePort(s, e.sourceHandle, ctx);
    const acc = targetAccepts(t, e.targetHandle);
    if (!out) errors.push(`edge “${e.id}”: ${label(s)} has no output “${e.sourceHandle}” (with these options).`);
    else if (!acc.length) errors.push(`edge “${e.id}”: ${label(t)} has no input “${e.targetHandle}” (with these options).`);
    else if (!canConnect(s, t, e.targetHandle, e.sourceHandle, ctx)) errors.push(`edge “${e.id}”: ${label(s)}.${e.sourceHandle} gives a ${out}; ${label(t)}.${e.targetHandle} takes ${acc.join(' or ')}.`);
    const k = `${e.target}\u0000${e.targetHandle}`;
    into.set(k, [...(into.get(k) ?? []), e]);
  }
  for (const [k, es] of into) {
    const [t, h] = k.split('\u0000');
    if (es.length > 1 && !isMultiInput(byId.get(t), h)) errors.push(`${label(byId.get(t)!)}: input “${h}” takes one connection; it has ${es.length} (${es.map((e) => e.id).join(', ')}).`);
  }

  // the graph run by the app's engine
  let res: Map<string, NodeResult>;
  try {
    res = evaluateGraph(p.nodes, p.edges);
  } catch (e) {
    return fail(`The evaluation failed: ${(e as Error).message}`);
  }
  // an output the source does not give (the rule of a few nodes takes any name: a misspelled port is found here)
  for (const e of p.edges) {
    const s = byId.get(e.source)!;
    const r = res.get(s.id);
    if (!r || r.errors.length || s.type === 'python' || s.type === 'reroute' || s.type === 'subgraph' || s.type === 'groupin') continue;
    if (e.sourceHandle && !(e.sourceHandle in r.outputs)) errors.push(`edge “${e.id}”: ${label(s)} has no output “${e.sourceHandle}” (it gives: ${Object.keys(r.outputs).join(', ') || 'nothing'}).`);
  }
  const nodes: NodeReport[] = [];
  for (const n of p.nodes) {
    const r = res.get(n.id);
    const py = n.type === 'python';
    const rep: NodeReport = {
      id: n.id,
      type: n.type,
      errors: py ? [] : [...(r?.errors ?? [])],
      warnings: py ? ['Python runs in the browser only: not run here (check its code and its outputs by hand).'] : [...(r?.warnings ?? [])],
      outputs: Object.fromEntries(Object.entries(r?.outputs ?? {}).map(([h, v]) => [h, describe(v)])),
    };
    for (const e of rep.errors) errors.push(`${label(n)}: ${e}`);
    nodes.push(rep);
  }
  return { ok: errors.length === 0, errors, warnings, nodes };
}

function print(r: Report) {
  const lines: string[] = [];
  for (const n of r.nodes) {
    lines.push(`${n.errors.length ? 'ERROR' : n.warnings.length ? 'warn ' : 'ok   '} ${n.type} “${n.id}”`);
    for (const e of n.errors) lines.push(`        error: ${e}`);
    for (const w of n.warnings) lines.push(`        warning: ${w}`);
    for (const [h, v] of Object.entries(n.outputs)) lines.push(`        ${h} → ${v}`);
  }
  const top = r.errors.filter((e) => !r.nodes.some((n) => n.errors.some((x) => e.endsWith(x))));
  if (top.length) lines.push('', ...top.map((e) => `ERROR ${e}`));
  if (r.warnings.length) lines.push('', ...r.warnings.map((w) => `warn  ${w}`));
  const warned = r.nodes.filter((n) => n.warnings.length).length + r.warnings.length;
  lines.push(
    '',
    !r.ok ? `${r.errors.length} error(s): fix them and check again.`
    : warned ? `OK: the project opens and every node runs, with warnings on ${warned} node(s): read them (a warning often means a column was not found or an option does not fit the data).`
    : 'OK: the project opens and every node runs.',
  );
  return lines.join('\n');
}

const file = process.argv[2];
if (file && !file.startsWith('--')) {
  const r = checkProject(readFileSync(file, 'utf8'));
  console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 1) : print(r));
  process.exitCode = r.ok ? 0 : 1;
}
