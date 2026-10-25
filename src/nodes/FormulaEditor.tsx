// A formula of columns being written, as in the formula windows (Workbook ▸ Set column values, Columns, Math column): its
// text; the columns as buttons (a click puts its letter in, where the cursor is); ƒ Functions, every function by group
// with what it does and an example (searched; a click puts it in, its first part selected to be typed over); Value from
// a row…, a value of another row of a column: by its number, or the first, the last or a statistic of the rows where
// conditions are true (put in as at(…), first(…), mean(…) …).
import { ActionIcon, Button, Group, Popover, ScrollArea, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { useRef, useState } from 'react';
import { useInsert, type Insert } from './useInsert.ts';
import { Plus, Sigma, TableProperties, X } from 'lucide-react';
import { FORMULA_GROUPS, type FormulaFunction } from '../engine/formulaHelp.ts';
import { Choice, ListField, NumField } from '../ui/props.tsx';

export type FormulaColumnRef = { letter: string; name: string };

export function FormulaEditor({ value, onChange, columns, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; columns: FormulaColumnRef[]; placeholder?: string; autoFocus?: boolean }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const insert = useInsert(box, value, onChange);
  return (
    <div className="fx-editor">
      <Textarea ref={box} value={value} onChange={(e) => onChange(e.currentTarget.value)} placeholder={placeholder ?? 'A * 2, (B - C) / C * 100, if(A > 0, A, 0) …'} autosize minRows={2} maxRows={6} spellCheck={false} autoFocus={autoFocus} aria-label="Formula" className="fx-text" />
      <div className="fx-cols">
        {columns.map((c) => (
          <Tooltip key={c.letter} label={`${c.name}: put ${c.letter} in the formula`}>
            <button type="button" className="fx-col" onClick={() => insert(c.letter)}>
              <b>{c.letter}</b> <span className="ellipsis">{c.name}</span>
            </button>
          </Tooltip>
        ))}
      </div>
      <FormulaTools columns={columns} insert={insert} />
    </div>
  );
}

// ƒ Functions and Value from a row …, under a formula's field (insert: what puts a text in it, at its cursor)
export function FormulaTools({ columns, insert }: { columns: FormulaColumnRef[]; insert: Insert }) {
  return (
    <Group gap={6} className="fx-tools">
      <FunctionsMenu onPick={(f) => insertFunction(f, insert)} />
      <ValueFromRow columns={columns} onInsert={(t) => insert(t)} />
    </Group>
  );
}

// a function put in: its first form as written (“between(x, low, high)”), its first part selected; a name alone (i, n,
// pi) as it is
function insertFunction(f: FormulaFunction, insert: Insert) {
  const sig = f.sig.split(' · ')[0];
  const open = sig.indexOf('(');
  if (open < 0) return insert(sig);
  const end = sig.indexOf(',', open) >= 0 ? sig.indexOf(',', open) : sig.indexOf(')', open);
  insert(sig, open + 1, end);
}

// ƒ Functions: every function by group, searched by its name or what it does
function FunctionsMenu({ onPick }: { onPick: (f: FormulaFunction) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const find = q.trim().toLowerCase();
  const groups = FORMULA_GROUPS.map((g) => ({ ...g, items: g.items.filter((f) => !find || `${f.name} ${f.sig} ${f.text}`.toLowerCase().includes(find)) })).filter((g) => g.items.length);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start" width={380} trapFocus returnFocus={false}>
      <Popover.Target>
        <Button variant="default" size="xs" leftSection={<Sigma size={13} />} onClick={() => setOpen(!open)}>
          Functions
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={8} className="fx-menu">
        <TextInput value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Search: between, random, mean …" aria-label="Search the functions" data-autofocus />
        <ScrollArea.Autosize mah={360} mt={6} type="auto">
          {groups.map((g) => (
            <div key={g.group} className="fx-group">
              <div className="fx-group-name">{g.group}</div>
              {g.items.map((f) => {
                const shown = g.group === 'Operators';
                return (
                  <button
                    key={f.name}
                    type="button"
                    className={`fx-item${shown ? ' shown' : ''}`}
                    onClick={() => {
                      if (shown) return;
                      onPick(f);
                      setOpen(false);
                    }}
                  >
                    <code>{f.sig}</code>
                    <span className="fx-what">{f.text}</span>
                    <span className="fx-example">e.g. {f.example}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {!groups.length && (
            <Text size="xs" c="dimmed" p={6}>
              No function like “{q}”.
            </Text>
          )}
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}

// ---- Value from a row ----
type Pick = 'row' | 'first' | 'last' | 'mean' | 'sum' | 'median' | 'sd' | 'count' | 'minif' | 'maxif';
const PICKS: [Pick, string][] = [
  ['row', 'in the row number'],
  ['first', 'in the first row where'],
  ['last', 'in the last row where'],
  ['mean', 'the mean of the rows where'],
  ['sum', 'the sum of the rows where'],
  ['median', 'the median of the rows where'],
  ['sd', 'the SD of the rows where'],
  ['count', 'how many rows where'],
  ['minif', 'the smallest of the rows where'],
  ['maxif', 'the largest of the rows where'],
];
type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'between' | 'in';
const OPS: [Op, string][] = [
  ['==', '='],
  ['!=', '≠'],
  ['<', '<'],
  ['<=', '≤'],
  ['>', '>'],
  ['>=', '≥'],
  ['between', 'between'],
  ['in', 'is one of'],
];
type Cond = { col: string; op: Op; a: number; b: number; list: string };
const num = (x: number) => (Number.isFinite(x) ? String(+x.toPrecision(12)) : '?');
// a condition as written in a formula
function condText(c: Cond): string {
  if (c.op === 'between') return `between(${c.col}, ${num(c.a)}, ${num(c.b)})`;
  if (c.op === 'in') {
    const vs = c.list.split(/[\s,;]+/).filter(Boolean);
    return `isin(${c.col}, ${vs.length ? vs.join(', ') : '?'})`;
  }
  return `${c.col} ${c.op} ${num(c.a)}`;
}
function valueFromRowText(col: string, pick: Pick, row: number, conds: Cond[], join: 'and' | 'or'): string {
  if (pick === 'row') return `at(${col}, ${Number.isFinite(row) ? Math.round(row) : '?'})`;
  const cond = conds.map(condText).join(` ${join} `) || '?';
  return `${pick}(${col}, ${cond})`;
}

function ValueFromRow({ columns, onInsert }: { columns: FormulaColumnRef[]; onInsert: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const first = columns[0]?.letter ?? 'A';
  const [col, setCol] = useState(first);
  const [pick, setPick] = useState<Pick>('first');
  const [row, setRow] = useState(1);
  const [join, setJoin] = useState<'and' | 'or'>('and');
  const [conds, setConds] = useState<Cond[]>([{ col: columns[1]?.letter ?? first, op: 'between', a: NaN, b: NaN, list: '' }]);
  const setCond = (k: number, p: Partial<Cond>) => setConds(conds.map((c, j) => (j === k ? { ...c, ...p } : c)));
  const options: [string, string][] = columns.map((c) => [c.letter, `${c.letter} · ${c.name}`]);
  const text = valueFromRowText(col, pick, row, conds, join);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start" width={400} trapFocus returnFocus={false}>
      <Popover.Target>
        <Button variant="default" size="xs" leftSection={<TableProperties size={13} />} onClick={() => setOpen(!open)}>
          Value from a row…
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={10} className="fx-row-menu props-panel props-embed">
        <Text size="xs" c="dimmed" mb={6}>
          One value of a column, taken from another row, in every row of the formula.
        </Text>
        <div className="fx-row-line">
          <span className="fx-word">The value of</span>
          <ListField value={col} onChange={setCol} options={options} label="Column" />
        </div>
        <div className="fx-row-line">
          <ListField value={pick} onChange={setPick} options={PICKS} label="Which row" />
          {pick === 'row' && <NumField value={row} onChange={setRow} min={1} step={1} />}
        </div>
        {pick !== 'row' && (
          <>
            {conds.length > 1 && <Choice<'and' | 'or'> value={join} onChange={setJoin} options={[['and', 'All are true'], ['or', 'Any is true']]} />}
            {conds.map((c, k) => (
              <div key={k} className="where-cond">
                <div className="where-line">
                  <span className="where-word">{k ? join : 'where'}</span>
                  <ListField value={c.col} onChange={(v) => setCond(k, { col: v })} options={options} label="Column" />
                  {conds.length > 1 && (
                    <ActionIcon variant="subtle" size="sm" onClick={() => setConds(conds.filter((_, j) => j !== k))} aria-label="Remove this condition">
                      <X size={14} />
                    </ActionIcon>
                  )}
                </div>
                <div className="where-line">
                  <span className="where-op">
                    <ListField value={c.op} onChange={(op) => setCond(k, { op })} options={OPS} label="Comparison" />
                  </span>
                  {c.op === 'in' ? (
                    <TextInput className="grow" value={c.list} placeholder="2, 5, 7" onChange={(e) => setCond(k, { list: e.currentTarget.value })} aria-label="Values" />
                  ) : (
                    <NumField value={c.a} placeholder="value" onChange={(a) => setCond(k, { a })} />
                  )}
                  {c.op === 'between' && (
                    <>
                      <span className="where-word">and</span>
                      <NumField value={c.b} placeholder="value" onChange={(b) => setCond(k, { b })} />
                    </>
                  )}
                </div>
              </div>
            ))}
            <Button variant="default" size="xs" leftSection={<Plus size={13} />} onClick={() => setConds([...conds, { ...conds[conds.length - 1], a: NaN, b: NaN, list: '' }])}>
              Add condition
            </Button>
          </>
        )}
        <code className="fx-preview-text">{text}</code>
        <Group justify="flex-end" gap={6} mt={8}>
          <Button variant="default" size="xs" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="xs"
            disabled={text.includes('?')}
            onClick={() => {
              onInsert(text);
              setOpen(false);
            }}
          >
            Put in the formula
          </Button>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
