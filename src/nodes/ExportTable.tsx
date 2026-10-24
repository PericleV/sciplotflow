// Export of a worksheet (Import, Workbook): the sheet shown or all of them, as CSV, tab-separated or text with a
// delimiter of your own (the decimal point or comma, the header, missing and masked values, digits, line ends, a
// byte-order mark so Excel reads the units' signs), or as an Excel book (.xlsx, a sheet each); several text files go in
// a .zip. Also copied as text.
import { strToU8, zipSync } from 'fflate';
import { Copy, Download } from 'lucide-react';
import { delimiterOf, exportOptions, extensionOf, safeName, tableCells, tableText, type ExportDelimiter, type TableExport, type TableFormat } from '../engine/exportTable.ts';
import type { Dataset, Workbook } from '../engine/table.ts';
import { download } from '../figure/export.ts';
import { Fold } from './Fold.tsx';
import { IC } from './iconProps.ts';
import { Check, Field, NumInput, Select, TextInput } from './ui.tsx';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TEXT_MIME: Record<string, string> = { csv: 'text/csv', tsv: 'text/tab-separated-values' };
// the delimiters, as in Import
const DELIMS: [ExportDelimiter, string][] = [
  [',', 'comma ,'],
  [';', 'semicolon ;'],
  ['\t', 'tab'],
  [' ', 'spaces'],
  ['|', 'bar |'],
  ['custom', 'other'],
];

// the sheets as an Excel book: numbers as numbers, the sheet names made unique and short enough (31 characters)
async function xlsxBytes(sheets: Dataset[], o: TableExport): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  sheets.forEach((ds, j) => {
    const rows = tableCells(ds, o).map((r) => r.map((c) => (typeof c === 'number' && Number.isNaN(c) ? null : c)));
    let nm = (ds.name || `Sheet${j + 1}`).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || `Sheet${j + 1}`;
    for (let k = 2; used.has(nm.toLowerCase()); k++) nm = `${nm.slice(0, 27)} (${k})`;
    used.add(nm.toLowerCase());
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), nm);
  });
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

export function ExportTable({ name, shown, book, value, onChange }: { name: string; shown?: Dataset; book?: Workbook; value?: Partial<TableExport>; onChange: (v: Partial<TableExport>) => void }) {
  const o: TableExport = exportOptions(value);
  const set = (p: Partial<TableExport>) => onChange({ ...value, ...p });
  const many = (book?.sheets.length ?? 0) > 1;
  const sheets = o.sheets === 'all' && many && book ? book.sheets : shown ? [shown] : [];
  const xlsx = o.format === 'xlsx';
  const text = (ds: Dataset) => (o.bom ? '\uFEFF' : '') + tableText(ds, o);
  const save = async () => {
    if (!sheets.length) return;
    const ext = extensionOf(o);
    if (xlsx) return download(new Blob([(await xlsxBytes(sheets, o)) as BlobPart], { type: XLSX_MIME }), `${safeName(name)}.xlsx`);
    if (sheets.length === 1) return download(text(sheets[0]), `${safeName(many && sheets[0].name ? `${name} - ${sheets[0].name}` : name)}.${ext}`, `${TEXT_MIME[ext] ?? 'text/plain'};charset=utf-8`);
    // a file for every sheet, in one .zip
    const files: Record<string, Uint8Array> = {};
    sheets.forEach((ds, j) => {
      let f = `${safeName(ds.name || `Sheet${j + 1}`)}.${ext}`;
      for (let k = 2; files[f]; k++) f = `${safeName(ds.name || `Sheet${j + 1}`)} (${k}).${ext}`;
      files[f] = strToU8(text(ds));
    });
    download(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), `${safeName(name)}.zip`);
  };
  return (
    <Fold title="Export" closed>
      <div className="grid2">
        <Field label="Format" title="A text file (CSV, tab-separated, ASCII: the delimiter, decimal and extension below) or an Excel book (.xlsx, a sheet each)">
          <Select<TableFormat>
            value={o.format}
            options={[
              ['text', 'text (CSV, ASCII …)'],
              ['xlsx', 'Excel (.xlsx)'],
            ]}
            onChange={(format) => set({ format })}
          />
        </Field>
        {!xlsx && (
          <>
            <Field label="Delimiter" title="Between the values, as in Import: comma, semicolon, tab, spaces, bar, or other; one or more characters of your own (\t: a tab)">
              <Select<ExportDelimiter> value={o.delimiter} options={DELIMS} onChange={(delimiter) => set({ delimiter })} />
              {o.delimiter === 'custom' && <TextInput className="delim-chars mono" value={o.custom ?? ''} placeholder="e.g. ::" title="The delimiter: one or more characters (\t: a tab)" onChange={(custom) => set({ custom })} />}
            </Field>
            <Field label="Decimal" title={o.decimal === ',' && delimiterOf(o).includes(',') ? 'A decimal comma with a comma between the values: the numbers are written in quotes (“2,5”): a semicolon is the usual delimiter then' : 'The decimal separator: 2.5 or 2,5'}>
              <Select<'.' | ','>
                value={o.decimal}
                options={[
                  ['.', 'point .'],
                  [',', 'comma ,'],
                ]}
                onChange={(decimal) => set({ decimal })}
              />
            </Field>
            <Field label="Extension" title="The file's extension (automatic: .csv for a comma or a semicolon, .tsv for a tab, else .txt)">
              <Select<TableExport['ext']>
                value={o.ext}
                options={[
                  ['auto', `automatic (.${extensionOf({ ...o, ext: 'auto' })})`],
                  ['csv', '.csv'],
                  ['txt', '.txt'],
                  ['tsv', '.tsv'],
                  ['dat', '.dat'],
                ]}
                onChange={(ext) => set({ ext })}
              />
            </Field>
          </>
        )}
        <Field label="Header" title="The first line: the column names (with their units), or none; and a line with the designations (X, Y, ±Y …) under it">
          <span className="row wrap">
            <Select<'names' | 'none'>
              value={o.header}
              options={[
                ['names', 'the names'],
                ['none', 'none'],
              ]}
              onChange={(header) => set({ header })}
            />
            <Check label="designations" value={o.roles} onChange={(roles) => set({ roles })} />
          </span>
        </Field>
        {!xlsx && (
          <Field label="Missing values" title="What an empty number is written as">
            <Select<TableExport['missing']>
              value={o.missing}
              options={[
                ['', 'empty'],
                ['NaN', 'NaN'],
                ['--', '--'],
              ]}
              onChange={(missing) => set({ missing })}
            />
          </Field>
        )}
        <Field label="Masked values" title="The values masked (Data manipulation, Clean): written as they are, left empty, or their rows left out">
          <Select<TableExport['masked']>
            value={o.masked}
            options={[
              ['keep', 'written'],
              ['empty', 'left empty'],
              ['drop', 'rows left out'],
            ]}
            onChange={(masked) => set({ masked })}
          />
        </Field>
        <Field label="Digits" title="Significant digits of the numbers (0: every digit, the shortest exact form)">
          <NumInput className="tiny" min={0} max={17} step={1} value={o.digits} onChange={(v) => set({ digits: Math.max(0, Math.min(17, Math.round(v) || 0)) })} />
        </Field>
        {!xlsx && (
          <Field label="Line ends" title="Windows (CR LF) or Unix / macOS (LF); a byte-order mark (BOM) makes Excel read the file as UTF-8 (°, µ, Å in the names)">
            <span className="row wrap">
              <Select<'crlf' | 'lf'>
                value={o.lineEnd}
                options={[
                  ['crlf', 'Windows'],
                  ['lf', 'Unix'],
                ]}
                onChange={(lineEnd) => set({ lineEnd })}
              />
              <Check label="BOM" value={o.bom} onChange={(bom) => set({ bom })} />
            </span>
          </Field>
        )}
        {many && (
          <Field label="Sheets" title={xlsx ? 'The sheet shown, or every sheet (one book, a sheet each)' : 'The sheet shown, or every sheet (a file each, in one .zip)'}>
            <Select<'shown' | 'all'>
              value={o.sheets}
              options={[
                ['shown', 'the one shown'],
                ['all', `all ${book?.sheets.length}${xlsx ? '' : ' (.zip)'}`],
              ]}
              onChange={(v) => set({ sheets: v })}
            />
          </Field>
        )}
      </div>
      <div className="row">
        <button className="nodrag" disabled={!sheets.length} title="Save the file" onClick={() => void save()}>
          <Download {...IC} /> Export
        </button>
        {!xlsx && (
          <button className="nodrag" disabled={!shown} title="The sheet shown as text, in these settings, to the clipboard" onClick={() => shown && void navigator.clipboard.writeText(tableText(shown, o))}>
            <Copy {...IC} /> Copy as text
          </button>
        )}
      </div>
    </Fold>
  );
}
