// Audit of the nodes over the examples: the warnings every node gives, and the node types no example uses.
// Run: node scripts/audit-nodes.ts
import { EXAMPLES } from '../src/examples.ts';
import { evaluateGraph } from '../src/engine/evaluate.ts';
import { NODE_HELP } from '../src/help.ts';

const used = new Map<string, number>();
for (const ex of EXAMPLES) {
  const p = ex.make();
  const res = evaluateGraph(p.nodes, p.edges);
  for (const n of p.nodes) {
    used.set(n.type ?? '?', (used.get(n.type ?? '?') ?? 0) + 1);
    const r = res.get(n.id);
    if (!r) continue;
    for (const w of r.warnings) console.log(`WARN  ${ex.name} · ${n.type} ${n.id}: ${w}`);
    for (const e of r.errors) console.log(`ERROR ${ex.name} · ${n.type} ${n.id}: ${e}`);
  }
}
const all = Object.keys(NODE_HELP);
console.log('\nUsed in examples:', [...used.entries()].sort((a, b) => b[1] - a[1]).map(([t, k]) => `${t} ${k}`).join(', '));
console.log('Never used in an example:', all.filter((t) => !used.has(t)).join(', '));
