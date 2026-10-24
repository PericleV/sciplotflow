// Height maps (AFM, profilometers) read as images of float values: a Gwyddion file (.gwy: its first channel of heights,
// its size and units), or a text one (Gwyddion's export: a matrix of values under # lines that give its size and the
// unit of the values; a matrix of numbers; X Y Z on every line, on a regular grid). The heights in nm or µm as suits
// them, the size of a pixel in nm or µm. Pure.

export type Heights = { w: number; h: number; z: Float64Array; px?: { size: number; unit: string }; zUnit?: string; title?: string };

// the files read as heights (by their names)
export const HEIGHT_FILES = /\.(gwy|xyz|asc|txt|csv|dat)$/i;

// a length in metres in nm or µm (a pixel of 1 nm–1 µm: nm)
const lateral = (metres: number) => (metres < 1e-6 ? { size: +(metres * 1e9).toPrecision(7), unit: 'nm' } : { size: +(metres * 1e6).toPrecision(7), unit: 'µm' });
// heights in metres in nm (their range under 1 µm) or µm
function inLength(z: Float64Array): string {
  let [lo, hi] = [Infinity, -Infinity];
  for (const v of z) if (Number.isFinite(v)) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  const f = hi - lo < 1e-6 ? 1e9 : 1e6;
  for (let i = 0; i < z.length; i++) z[i] *= f;
  return f === 1e9 ? 'nm' : 'µm';
}

// ---- Gwyddion's own files (GWYP: objects of components, each a name, a type and its data) ----
type GwyValue = number | boolean | string | GwyObject | number[] | string[] | GwyObject[] | Float64Array;
type GwyObject = { $type: string; [k: string]: GwyValue };
export function readGwy(buf: ArrayBuffer): Heights {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  if (String.fromCharCode(...u8.subarray(0, 4)) !== 'GWYP') throw new Error('not a Gwyddion file (GWYP)');
  let at = 4;
  const str = () => {
    const end = u8.indexOf(0, at);
    if (end < 0) throw new Error('a damaged Gwyddion file');
    const s = new TextDecoder().decode(u8.subarray(at, end));
    at = end + 1;
    return s;
  };
  const obj = (): GwyObject => {
    const $type = str();
    const size = dv.getUint32(at, true);
    at += 4;
    const end = at + size;
    const o: GwyObject = { $type };
    while (at < end) {
      const name = str();
      const t = String.fromCharCode(u8[at++]);
      o[name] = value(t);
    }
    at = end;
    return o;
  };
  const count = () => {
    const n = dv.getUint32(at, true);
    at += 4;
    return n;
  };
  const i32 = () => {
    at += 4;
    return dv.getInt32(at - 4, true);
  };
  const i64 = () => {
    at += 8;
    return Number(dv.getBigInt64(at - 8, true));
  };
  const f64 = () => {
    at += 8;
    return dv.getFloat64(at - 8, true);
  };
  const value = (t: string): GwyValue => {
    switch (t) {
      case 'b':
        return u8[at++] !== 0;
      case 'c':
        return u8[at++];
      case 'i':
        return i32();
      case 'q':
        return i64();
      case 'd':
        return f64();
      case 's':
        return str();
      case 'o':
        return obj();
      case 'C': {
        const n = count();
        at += n;
        return Array.from(u8.subarray(at - n, at));
      }
      case 'I':
        return Array.from({ length: count() }, i32);
      case 'Q':
        return Array.from({ length: count() }, i64);
      case 'D': {
        const n = count();
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = f64();
        return out;
      }
      case 'S':
        return Array.from({ length: count() }, str);
      case 'O':
        return Array.from({ length: count() }, obj);
      default:
        throw new Error(`a Gwyddion component of an unknown type (${t})`);
    }
  };
  const root = obj();
  // (the channels: /N/data; the first one of heights by its title, else the first)
  const chans = Object.keys(root)
    .map((k) => /^\/(\d+)\/data$/.exec(k))
    .filter((m): m is RegExpExecArray => !!m && (root[m[0]] as GwyObject)?.$type === 'GwyDataField')
    .map((m) => ({ n: Number(m[1]), key: m[0], title: String(root[`${m[0]}/title`] ?? '') }))
    .sort((a, b) => a.n - b.n);
  if (!chans.length) throw new Error('no channel of data in the Gwyddion file');
  const ch = chans.find((c) => /height|topo|z\b/i.test(c.title)) ?? chans[0];
  const f = root[ch.key] as GwyObject;
  const w = Number(f.xres);
  const h = Number(f.yres);
  const data = f.data as Float64Array;
  if (!(w > 0 && h > 0) || !(data instanceof Float64Array) || data.length < w * h) throw new Error('the Gwyddion channel has no data');
  const z = Float64Array.from(data.subarray(0, w * h));
  const unit = (u: GwyValue | undefined) => String((u as GwyObject | undefined)?.unitstr ?? '');
  const xy = unit(f.si_unit_xy);
  const zu = unit(f.si_unit_z);
  const xreal = Number(f.xreal);
  const px = xy === 'm' && xreal > 0 ? lateral(xreal / w) : xreal > 0 && xy ? { size: xreal / w, unit: xy } : undefined;
  const zUnit = zu === 'm' ? inLength(z) : zu || undefined;
  return { w, h, z, px, zUnit, title: ch.title || undefined };
}

// ---- text ----
const LEN_M: Record<string, number> = { m: 1, mm: 1e-3, um: 1e-6, µm: 1e-6, nm: 1e-9, pm: 1e-12, Å: 1e-10, A: 1e-10 };
// A text of heights: Gwyddion's export (# Width: 5.000 µm, # Value units: m), a matrix of numbers, or X Y Z lines on a
// regular grid (their X and Y in the unit of the # lines if they give one)
export function readHeightText(text: string): Heights {
  const lines = text.split(/\r?\n/);
  const head: Record<string, string> = {};
  const rows: number[][] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const m = /^#\s*([^:=]+?)\s*[:=]\s*(.+)$/.exec(line);
      if (m) head[m[1].toLowerCase()] = m[2].trim();
      continue;
    }
    const cells = line.split(/[\s,;]+/).filter(Boolean);
    const nums = cells.map((c) => (/^(nan|-?inf)/i.test(c) ? NaN : Number(c)));
    if (nums.some((v, i) => Number.isNaN(v) && !/^nan/i.test(cells[i]))) {
      // (a line of names before the numbers)
      if (!rows.length) continue;
      throw new Error(`a line that is not numbers: “${line.slice(0, 40)}”`);
    }
    rows.push(nums);
  }
  if (!rows.length) throw new Error('no numbers in the file');
  const zFactor = (() => {
    const u = head['value units'] ?? head['z unit'] ?? head['zunit'];
    return u && u in LEN_M ? u : undefined;
  })();
  // (X Y Z: three numbers on every line, many lines, on a grid of the X and Y found)
  if (rows.every((r) => r.length === 3) && rows.length > 9) {
    const xs = [...new Set(rows.map((r) => r[0]))].sort((a, b) => a - b);
    const ys = [...new Set(rows.map((r) => r[1]))].sort((a, b) => a - b);
    if (xs.length * ys.length === rows.length && xs.length > 1 && ys.length > 1) {
      const [w, h] = [xs.length, ys.length];
      const ix = new Map(xs.map((x, i) => [x, i]));
      const iy = new Map(ys.map((y, i) => [y, i]));
      const z = new Float64Array(w * h).fill(NaN);
      for (const [x, y, v] of rows) z[iy.get(y)! * w + ix.get(x)!] = v;
      const dx = (xs[w - 1] - xs[0]) / (w - 1);
      const xu = head['x unit'] ?? head['xy unit'] ?? head['lateral unit'];
      const px = xu && xu in LEN_M ? lateral(dx * LEN_M[xu]) : undefined;
      return { w, h, z, px, ...heightUnit(z, zFactor) };
    }
  }
  const w = rows[0].length;
  if (w < 2 || rows.some((r) => r.length !== w)) throw new Error('the rows are not all as long (not a matrix of heights)');
  const h = rows.length;
  const z = new Float64Array(w * h);
  rows.forEach((r, i) => z.set(r, i * w));
  // (Gwyddion: # Width: 5.000 µm)
  const width = /^([\d.eE+-]+)\s*(\S+)$/.exec(head['width'] ?? '');
  const px = width && width[2].replace('um', 'µm') in LEN_M ? lateral((Number(width[1]) * LEN_M[width[2].replace('um', 'µm')]) / w) : undefined;
  return { w, h, z, px, ...heightUnit(z, zFactor) };
}
// the heights in a unit of length (metres → nm or µm) when the # lines give one
function heightUnit(z: Float64Array, u: string | undefined): { zUnit?: string } {
  if (!u) return {};
  const f = LEN_M[u];
  for (let i = 0; i < z.length; i++) z[i] *= f;
  return { zUnit: inLength(z) };
}
