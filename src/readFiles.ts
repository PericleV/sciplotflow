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
