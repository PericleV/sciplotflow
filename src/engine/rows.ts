// Rows chosen by a short text, as in Math column rules, Plot (Rows), Data manipulation.
// "3, 7, 10-20, 1:2:100, 50-end" → row indices (from 0), within n rows.
export function parseRows(spec: string, n: number): number[] | string {
  const out = new Set<number>();
  const num = (s: string) => (s.trim().toLowerCase() === 'end' ? n : Number(s));
  for (const part of spec.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    let m: RegExpExecArray | null;
    if ((m = /^(\d+|end)\s*:\s*(\d+)\s*:\s*(\d+|end)$/i.exec(part))) {
      const [a, s, b] = [num(m[1]), Number(m[2]), num(m[3])];
      if (!(s > 0)) return `Step 0 in “${part}”.`;
      for (let r = a; r <= b; r += s) out.add(r);
    } else if ((m = /^(\d+|end)\s*[-–:]\s*(\d+|end)$/i.exec(part))) {
      const [a, b] = [num(m[1]), num(m[2])];
      for (let r = Math.min(a, b); r <= Math.max(a, b); r++) out.add(r);
    } else if (/^(\d+|end)$/i.test(part)) out.add(num(part));
    else return `Cannot read “${part}”: write rows as 3, 7, 10-20, 1:2:100 or 50-end (rows count from 1).`;
  }
  return [...out].filter((r) => r >= 1 && r <= n).map((r) => r - 1).sort((a, b) => a - b);
}
