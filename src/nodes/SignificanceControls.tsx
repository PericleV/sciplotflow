// The significance brackets of a Bar chart / Box & violin: where the p come from (a test here, the p values port, written),
// which pairs, how they are shown, their look.
import { SIG_DEFAULTS, type SigSpec } from '../engine/signif.ts';
import { Check, Field, NumInput, Select, TextInput } from './ui.tsx';

export function SignificanceControls({ value, onChange, groups, subgroups }: { value: Partial<SigSpec> | undefined; onChange: (v: Partial<SigSpec>) => void; groups: string[]; subgroups: boolean }) {
  const s = { ...SIG_DEFAULTS, ...value };
  const set = (p: Partial<SigSpec>) => onChange({ ...value, ...p });
  const listHint = groups.length > 1 ? `e.g. ${groups[0]} vs ${groups[1]}${s.source === 'typed' ? ' = 0.003' : ''}` : 'A vs B';
  return (
    <div className="col-form">
      <span>Brackets</span>
      <span className="row wrap">
        <Check label="Shown" value={s.on} onChange={(on) => set({ on })} />
        {s.on && (
          <Select<SigSpec['source']>
            value={s.source}
            title="Tested here from the values of the groups, read from a table on the p values port (e.g. an ANOVA node's post hoc), or written"
            options={[
              ['test', 'tested here'],
              ['table', 'from the p values port'],
              ['typed', 'written'],
            ]}
            onChange={(source) => set({ source })}
          />
        )}
      </span>
      {s.on && s.source === 'test' && (
        <>
          <span>Test</span>
          <span className="row wrap">
            <Select<SigSpec['test']>
              value={s.test}
              options={[
                ['welch', 'Welch t (pairs)'],
                ['student', 'Student t (pairs)'],
                ['mw', 'Mann–Whitney (pairs)'],
                ['tukey', 'Tukey (ANOVA)'],
                ['gameshowell', 'Games–Howell'],
                ['dunn', 'Dunn (Kruskal–Wallis)'],
              ]}
              onChange={(test) => set({ test })}
            />
            {(s.test === 'welch' || s.test === 'student' || s.test === 'mw' || s.test === 'dunn') && (
              <Select<SigSpec['adjust']>
                value={s.adjust}
                title="The p adjusted for the number of pairs compared"
                options={[
                  ['holm', 'Holm'],
                  ['bonferroni', 'Bonferroni'],
                  ['none', 'not adjusted'],
                ]}
                onChange={(adjust) => set({ adjust })}
              />
            )}
          </span>
        </>
      )}
      {s.on && s.source !== 'typed' && (
        <>
          <span>Pairs</span>
          <span className="row wrap">
            {s.source === 'test' && (
              <Select<SigSpec['pairs']>
                value={s.pairs}
                options={[
                  ['all', 'all'],
                  ['control', 'each vs the first'],
                  ['adjacent', 'neighbours'],
                  ['list', 'a list'],
                ]}
                onChange={(pairs) => set({ pairs })}
              />
            )}
            {subgroups && s.source === 'test' && (
              <Select<SigSpec['among']>
                value={s.among}
                title="Between the groups (for each subgroup), or between the subgroups (in each group)"
                options={[
                  ['groups', 'between groups'],
                  ['subgroups', 'within each group'],
                ]}
                onChange={(among) => set({ among })}
              />
            )}
          </span>
        </>
      )}
      {s.on && (s.source === 'typed' || (s.source === 'test' && s.pairs === 'list')) && (
        <>
          <span>{s.source === 'typed' ? 'p values' : 'List'}</span>
          <TextInput value={s.list} placeholder={listHint} title={`Separated by ; — the groups by name or number (1 vs 3). Groups: ${groups.join(', ')}`} onChange={(list) => set({ list })} />
        </>
      )}
      {s.on && (
        <>
          <span>Shown</span>
          <span className="row wrap">
            <Select<SigSpec['show']>
              value={s.show}
              title="Stars: * < 0.05, ** < 0.01, *** < 0.001, **** < 0.0001"
              options={[
                ['stars', 'stars'],
                ['p', 'p'],
                ['both', 'stars and p'],
              ]}
              onChange={(show) => set({ show })}
            />
            <Check label="Ns too" title="The pairs that do not differ (p ≥ α) drawn as “ns”" value={s.ns} onChange={(ns) => set({ ns })} />
            <Field label="α">
              <NumInput className="tiny" min={0.0001} max={0.5} step={0.01} value={s.alpha} onChange={(alpha) => set({ alpha: Math.min(0.5, Math.max(0.0001, alpha || 0.05)) })} />
            </Field>
          </span>
          <span>Look</span>
          <span className="row wrap">
            <input className="nodrag color" type="color" value={s.color || '#000000'} onChange={(e) => set({ color: e.target.value })} />
            <Field label="Line">
              <NumInput className="tiny" min={0.25} step={0.25} value={s.width} onChange={(width) => set({ width: Math.max(0.25, width || 0.75) })} />
            </Field>
            <Field label="Text pt">
              <NumInput className="tiny" min={4} step={0.5} value={s.textSize} placeholder="auto" onChange={(textSize) => set({ textSize: textSize > 0 ? textSize : NaN })} />
            </Field>
          </span>
        </>
      )}
    </div>
  );
}
