// The results of all the quick fits of a Plot in one table: a row per parameter (and the peaks' areas, R², n) of every
// fit of every curve, every range; copied (tab-separated: paste into a spreadsheet) or saved as CSV.
import type { QuickFitView } from '../engine/evaluate.ts';
import { paramText } from '../engine/quickfit.ts';
import { fmtNum } from '../engine/table.ts';

function tableRows(fits: QuickFitView[]): string[][] {
  const out: string[][] = [['curve', 'fit', 'range', 'parameter', 'value', 'error']];
  for (const f of fits)
    for (const r of f.results) {
      const at = r.range || 'all';
      for (const p of [...r.params, ...r.derived]) out.push([f.curveLabel, f.name, at, p.name, String(p.value), Number.isFinite(p.error) ? String(p.error) : '']);
      if (Number.isFinite(r.r2)) out.push([f.curveLabel, f.name, at, 'R2', String(r.r2), '']);
      out.push([f.curveLabel, f.name, at, 'n', String(r.n), '']);
    }
  return out;
}
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function QuickFitResults({ fits }: { fits: QuickFitView[] }) {
  const copy = () => void navigator.clipboard.writeText(tableRows(fits).map((row) => row.join('\t')).join('\n'));
  const save = () => {
    const blob = new Blob([tableRows(fits).map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quick fits.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <details open className="qf-results">
      <summary>Quick fit results</summary>
      <div className="row wrap">
        <span className="hint">also on the “fits” port</span>
        <span className="grow" />
        <button className="nodrag" title="The results as a table (tab-separated: paste into a spreadsheet)" onClick={copy}>
          Copy
        </button>
        <button className="nodrag" title="The results as a CSV file" onClick={save}>
          Save CSV
        </button>
      </div>
      <table className="qf-table">
        <thead>
          <tr>
            <th>curve · fit</th>
            <th>parameter</th>
            <th>value ± error</th>
          </tr>
        </thead>
        <tbody>
          {fits.flatMap((f) =>
            f.results.flatMap((r, i) => {
              const head = `${f.name}${r.range ? ` (${r.range})` : ''}`;
              const ps = [...r.params, ...r.derived];
              return [
                ...ps.map((p, k) => (
                  <tr key={`${f.curve}-${f.fit}-${i}-${p.name}`} className={k === 0 ? 'first' : ''}>
                    <td className="ellipsis" title={head}>
                      {k === 0 ? head : ''}
                    </td>
                    <td>{p.name}</td>
                    <td className="mono">{paramText(p).replace(/^[^=]*= /, '')}</td>
                  </tr>
                )),
                <tr key={`${f.curve}-${f.fit}-${i}-stats`} className={ps.length ? 'stats' : 'first stats'}>
                  <td className="ellipsis" title={head}>
                    {ps.length ? '' : head}
                  </td>
                  <td className="muted">R², n</td>
                  <td className="mono muted">
                    {Number.isFinite(r.r2) ? fmtNum(r.r2, 5) : '—'}, {r.n}
                  </td>
                </tr>,
              ];
            }),
          )}
        </tbody>
      </table>
    </details>
  );
}
