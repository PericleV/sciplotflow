// Files opened in an Import node: text tables as they are, spreadsheet workbooks (.xlsx, .xls, .ods) read by a library (loaded only
// when such a file is opened) into one tab-separated text per sheet, cells as numbers with a decimal point.
import type { ImportSheet } from './types.ts';

// The encodings offered for text files (auto: found from the bytes).
export const ENCODINGS: [string, string][] = [
  ['auto', 'automatic'],
  ['utf-8', 'UTF-8'],
  ['utf-16le', 'UTF-16 LE'],
  ['utf-16be', 'UTF-16 BE'],
  ['windows-1252', 'Western (Windows-1252)'],
  ['iso-8859-2', 'Central European (ISO-8859-2)'],
  ['windows-1250', 'Central European (Windows-1250)'],
  ['windows-1251', 'Cyrillic (Windows-1251)'],
  ['shift_jis', 'Japanese (Shift JIS)'],
  ['gbk', 'Chinese (GBK)'],
];

// Text of a file: in the encoding given, else UTF-8, UTF-16 (with its byte-order mark), or Windows-1252 (older
// instrument software) when the bytes are not valid UTF-8.
export async function readText(f: Blob, encoding = 'auto'): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  if (encoding !== 'auto') return new TextDecoder(encoding).decode(buf);
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export const isWorkbook = (name: string) => /\.(xlsx|xlsm|xlsb|xls|ods|fods)$/i.test(name);
export const ACCEPT = '.csv,.txt,.tsv,.dat,.asc,.prn,.s1p,.s2p,.s3p,.s4p,.s6p,.s8p,.snp,.xlsx,.xlsm,.xlsb,.xls,.ods,text/*';

// The kinds of data files, named, for the browser's file dialog (Chrome, Edge): the first one shown, “All files” too
const TEXT_EXTS = ['.csv', '.txt', '.tsv', '.dat', '.asc', '.prn'];
const SHEET_EXTS = ['.xlsx', '.xlsm', '.xlsb', '.xls', '.ods'];
const TOUCHSTONE_EXTS = ['.s1p', '.s2p', '.s3p', '.s4p', '.s6p', '.s8p', '.snp'];
const FILE_TYPES = [
  { description: 'Data files', accept: { 'text/plain': [...TEXT_EXTS, ...TOUCHSTONE_EXTS], 'application/octet-stream': SHEET_EXTS } },
  { description: 'Text tables', accept: { 'text/plain': TEXT_EXTS } },
  { description: 'Spreadsheets', accept: { 'application/octet-stream': SHEET_EXTS } },
  { description: 'Touchstone (S-parameters)', accept: { 'text/plain': TOUCHSTONE_EXTS } },
];
type OpenFilePicker = (o: { multiple?: boolean; types?: typeof FILE_TYPES; excludeAcceptAllOption?: boolean; id?: string }) => Promise<{ getFile: () => Promise<File> }[]>;
// Data files chosen in the browser's dialog, its kinds named (Data files, Text tables, Spreadsheets …); null: the
// dialog closed. Where the browser has no such dialog (Firefox, Safari) or may not open it here: `fallback` (a file
// input) is clicked instead and undefined returned.
export async function pickDataFiles(fallback: () => void, multiple = true): Promise<File[] | null | undefined> {
  const picker = (window as unknown as { showOpenFilePicker?: OpenFilePicker }).showOpenFilePicker;
  if (!picker) {
    fallback();
    return undefined;
  }
  try {
    const handles = await picker({ multiple, types: FILE_TYPES, excludeAcceptAllOption: false, id: 'data-files' });
    return await Promise.all(handles.map((h) => h.getFile()));
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null;
    fallback();
    return undefined;
  }
}

// The sheets of a workbook file (empty sheets left out).
async function readWorkbook(f: File): Promise<ImportSheet[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', dense: true });
  return wb.SheetNames.flatMap((name) => {
    const text = XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: '\t', RS: '\n', blankrows: false, rawNumbers: true, strip: true });
    return text.trim() ? [{ name, text, excel: true }] : [];
  });
}

// One file or several: a single text table stays a text (the node as before); a workbook, or several files, become
// sheets — named by the sheet, by the file, or “file: sheet” when several workbooks are opened together.
export async function readFiles(files: File[], encoding = 'auto'): Promise<{ text: string } | { sheets: ImportSheet[] }> {
  if (files.length === 1 && !isWorkbook(files[0].name)) return { text: await readText(files[0], encoding) };
  const books = files.filter((f) => isWorkbook(f.name)).length;
  const sheets: ImportSheet[] = [];
  for (const f of files) {
    if (isWorkbook(f.name)) {
      const ss = await readWorkbook(f);
      sheets.push(...ss.map((s) => (books > 1 || files.length > 1 ? { ...s, name: `${f.name.replace(/\.[^.]+$/, '')}: ${s.name}` } : s)));
    } else sheets.push({ name: f.name.replace(/\.[^.]+$/, ''), text: await readText(f, encoding) });
  }
  if (!sheets.length) throw new Error('The file has no sheet with data.');
  // names must differ: they name the sheets in Extract column and Auto-extract
  const seen = new Map<string, number>();
  for (const s of sheets) {
    const k = seen.get(s.name) ?? 0;
    seen.set(s.name, k + 1);
    if (k) s.name = `${s.name} (${k + 1})`;
  }
  return { sheets };
}
