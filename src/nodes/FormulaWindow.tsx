// Set column values (a Workbook's own column, as in Origin): the formula of the sheet's columns, the rows it is set on
// (the others kept or emptied), and whether it stays (Auto: marked ƒ, computed again when its columns change) or its
// values are written once; the first values it gives, what is said about it; New random values for rand() ….
import { Button, Group, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dices } from 'lucide-react';
import { columnLetter } from '../engine/csv.ts';
import { fmtNum, roleOf, type Column } from '../engine/table.ts';
import { formulaColumn, formulaKept, formulaOfKept, type ColFormula } from '../engine/sheetFormula.ts';
import type { RowSelect } from '../engine/rowsel.ts';
import { Choice, Row } from '../ui/props.tsx';
import { RowsControls } from './RowsPanel.tsx';
import { FormulaEditor } from './FormulaEditor.tsx';

const SHOWN = 8;

// columns, keys: the sheet as shown and every column's key; sheet: its name; j: the column set; given: its formula (kept
// by the keys); onSave: the formula kept (auto), or its values written once (values)
export function FormulaWindow({ columns, keys, sheet, j, given, onSave, onClose }: { columns: Column[]; keys: string[]; sheet: string; j: number; given?: ColFormula; onSave: (f: ColFormula, once: Float64Array | null) => void; onClose: () => void }) {
  const [text, setText] = useState(() => (given ? formulaOfKept(given.formula, columns, keys) : ''));
  const [rows, setRows] = useState<RowSelect>(given?.rows ?? { mode: 'all' });
  const [others, setOthers] = useState<'keep' | 'empty'>(given?.others ?? 'keep');
  const [mode, setMode] = useState<'auto' | 'once'>('auto');
  const [seed, setSeed] = useState(given?.seed);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const f: ColFormula = { formula: formulaKept(text, columns, keys), ...(rows.mode !== 'all' ? { rows, ...(others === 'empty' ? { others } : {}) } : {}), ...(seed ? { seed } : {}) };
  const res = text.trim() ? formulaColumn(f, columns, keys, j, `${sheet}|${keys[j]}`) : null;
  const col = columns[j];
  const letter = columnLetter(j);
  const save = (close: boolean) => {
    if (!res || typeof res === 'string') return;
    onSave(f, mode === 'once' ? res.values : null);
    if (close) onClose();
  };
  return createPortal(
    <div className="fx-shade" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fx-dlg props-panel" role="dialog" aria-label="Set column values" onKeyDown={(e) => e.stopPropagation()}>
        <div className="fx-head">
          <b>Set column values</b>
          <span className="muted">
            {letter}
            {col?.name && col.name !== letter ? ` · ${col.name}` : ''}
          </span>
        </div>
        <div className="fx-body">
          <Text size="xs" c="dimmed">
            {letter} = a formula of the columns of the sheet (their letters, or [their names]); i the row, n the rows.
          </Text>
          <FormulaEditor value={text} onChange={setText} columns={columns.map((c, q) => ({ letter: columnLetter(q), name: c.name }))} autoFocus />
          <div className="fx-rows">
            <RowsControls value={rows} onChange={setRows} hasX={columns.some((_, q) => roleOf(columns, q) === 'x')} names={columns.map((c) => c.name)} />
            {rows.mode !== 'all' && (
              <Row label="Other rows" hint="The rows not chosen: kept as they are, or emptied">
                <Choice<'keep' | 'empty'> value={others} onChange={setOthers} options={[['keep', 'Kept'], ['empty', 'Emptied']]} />
              </Row>
            )}
            <Row label="Recalculate" hint="Auto: the formula stays with the column (ƒ by its letter) and it is computed again whenever the columns it uses change. Once: its values are written in the cells, as typed, and the formula is not kept">
              <Choice<'auto' | 'once'> value={mode} onChange={setMode} options={[['auto', 'Auto (ƒ)'], ['once', 'Once']]} />
            </Row>
          </div>
          {/rand(n|int)?\s*\(/.test(text) && (
            <Group gap={6}>
              <Button variant="default" size="xs" leftSection={<Dices size={13} />} onClick={() => setSeed(1 + Math.floor(Math.random() * 1e9))}>
                New random values
              </Button>
              <Text size="xs" c="dimmed">
                The same values every time it is computed, until asked for new ones.
              </Text>
            </Group>
          )}
          <div className="fx-out">
            {!res ? (
              <Text size="xs" c="dimmed">
                The first values show here.
              </Text>
            ) : typeof res === 'string' ? (
              <div className="msg error">{res}</div>
            ) : (
              <>
                <table className="fx-preview">
                  <tbody>
                    {Array.from({ length: Math.min(SHOWN, res.values.length) }, (_, i) => (
                      <tr key={i}>
                        <th>{i + 1}</th>
                        <td>{Number.isFinite(res.values[i]) ? fmtNum(res.values[i], 6) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Text size="xs" c="dimmed">
                  {res.values.length > SHOWN ? `… ${res.values.length} rows; ` : ''}
                  {res.changed} set by the formula
                </Text>
                {res.notes.map((t) => (
                  <div key={t} className="msg warn">
                    {t}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <Group justify="flex-end" gap={6} className="fx-foot">
          <Button variant="default" size="xs" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" size="xs" disabled={!res || typeof res === 'string'} onClick={() => save(false)}>
            Apply
          </Button>
          <Button size="xs" disabled={!res || typeof res === 'string'} onClick={() => save(true)}>
            OK
          </Button>
        </Group>
      </div>
    </div>,
    document.body,
  );
}
