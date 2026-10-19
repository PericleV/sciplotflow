// Touchstone files (.s1p, .s2p … .sNp; versions 1 and 2): the network parameters (S, Y, Z, H, G) of N ports at every
// frequency, as real / imaginary parts (RI), magnitude / angle (MA) or dB / angle (DB). Comments start with “!”; the
// option line “# GHz S RI R 50” gives the frequency unit, the parameter, the format and the reference impedance; a
// frequency's values may go on over several lines (N > 2). Two ports: S11 S21 S12 S22 (version 1; version 2 as its
// [Two-Port Data Order] says), else row by row (S11 S12 … S1N S21 …). The noise parameters after the data (two ports,
// a frequency again from low) are left out. Pure.
import { column, type Column, type Dataset } from './table.ts';

export type TouchstoneInfo = { ports: number; unit: string; param: string; format: 'RI' | 'MA' | 'DB'; z0: number; version: number; noise: number };
export type TouchstoneResult = { dataset: Dataset; info: TouchstoneInfo; header: string[]; warnings: string[] };

const OPTION = /^\s*#(.*)$/;
// A Touchstone file: by its name (.sNp) or its option line before the first data
export function isTouchstone(text: string, fileName = ''): boolean {
  if (/\.s\d+p$/i.test(fileName.trim())) return true;
  for (const raw of text.split(/\r?\n/, 400)) {
    const l = raw.trim();
    if (!l || l.startsWith('!')) continue;
    if (/^\[version\]/i.test(l)) return true;
    const m = OPTION.exec(l);
    // “# GHz S RI R 50”: only the Touchstone words after the #
    if (m) return m[1].trim().split(/\s+/).every((w) => /^(hz|khz|mhz|ghz|s|y|z|h|g|ri|ma|db|r|[-+]?\d*\.?\d+(e[-+]?\d+)?)$/i.test(w)) && m[1].trim() !== '';
    return false;
  }
  return false;
}

const UNITS: Record<string, string> = { hz: 'Hz', khz: 'kHz', mhz: 'MHz', ghz: 'GHz' };

// rad of a degree; the dB and the angle of a complex value
const DEG = Math.PI / 180;

export function parseTouchstone(text: string, fileName = '', name = 'data', extra = false): TouchstoneResult {
  const warnings: string[] = [];
  const header: string[] = [];
  let unit = 'GHz';
  let param = 'S';
  let format: TouchstoneInfo['format'] = 'MA';
  let z0 = 50;
  let version = 1;
  let ports = Number(/\.s(\d+)p$/i.exec(fileName.trim())?.[1] ?? NaN);
  let order21 = true; // two ports, version 1: S11 S21 S12 S22
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const rows: number[][] = [];
  let seenData = false;
  for (const raw of lines) {
    const cut = raw.indexOf('!');
    const l = (cut >= 0 ? raw.slice(0, cut) : raw).trim();
    if (!seenData && (cut >= 0 || !l)) header.push(raw);
    if (!l) continue;
    const opt = OPTION.exec(l);
    if (opt) {
      if (!seenData && cut < 0) header.push(raw);
      const w = opt[1].trim().split(/\s+/);
      for (let k = 0; k < w.length; k++) {
        const t = w[k].toLowerCase();
        if (UNITS[t]) unit = UNITS[t];
        else if (/^[syzhg]$/.test(t)) param = t.toUpperCase();
        else if (t === 'ri' || t === 'ma' || t === 'db') format = t.toUpperCase() as TouchstoneInfo['format'];
        else if (t === 'r' && Number.isFinite(Number(w[k + 1]))) z0 = Number(w[++k]);
      }
      continue;
    }
    // version 2 keywords
    const kw = /^\[([^\]]+)\]\s*(.*)$/.exec(l);
    if (kw) {
      if (!seenData && cut < 0) header.push(raw);
      const key = kw[1].trim().toLowerCase();
      if (key === 'version') version = Math.floor(Number(kw[2])) || 2;
      else if (key === 'number of ports') ports = Math.floor(Number(kw[2])) || ports;
      else if (key === 'two-port data order') order21 = kw[2].trim() === '21_12';
      else if (key === 'noise data') break;
      continue;
    }
    const nums = l.split(/[\s,]+/).map(Number);
    if (nums.some((v) => !Number.isFinite(v))) {
      warnings.push(`A line that is not numbers left out: “${l.slice(0, 40)}”.`);
      continue;
    }
    seenData = true;
    rows.push(nums);
  }
  // the ports: from the name or version 2; else from the numbers of the first record (1 port: 3, 2 ports: 9)
  if (!(ports >= 1)) {
    const first = rows[0]?.length ?? 0;
    ports = first === 3 ? 1 : first === 9 ? 2 : Math.round(Math.sqrt(Math.max(0, first - 1) / 2)) || 1;
    if (first !== 3 && first !== 9) warnings.push(`The number of ports read from the data: ${ports} (name the file .s${ports}p to be sure).`);
  }
  // version 2 writes two ports as 12_21 unless told: version 1 as 21_12
  if (version >= 2 && ports === 2 && !text.match(/\[two-port data order\]/i)) order21 = false;
  const per = 1 + 2 * ports * ports;
  // the records: a frequency and its values, over one line or more
  const recs: number[][] = [];
  let cur: number[] = [];
  let lastF = -Infinity;
  let noise = 0;
  for (const r of rows) {
    // two ports: a line of 5 numbers whose frequency is not above the last one — the noise parameters begin
    if (ports === 2 && !cur.length && r.length === 5 && r[0] <= lastF) {
      noise = rows.length - rows.indexOf(r);
      break;
    }
    cur.push(...r);
    while (cur.length >= per) {
      recs.push(cur.slice(0, per));
      lastF = cur[0];
      cur = cur.slice(per);
    }
  }
  if (cur.length) warnings.push(`The last ${cur.length} numbers do not make a whole record (${per} a frequency): left out.`);
  if (noise) warnings.push(`${noise} lines of noise parameters after the data: left out.`);
  // the names of the parameters in the order written
  const pairNames: string[] = [];
  if (ports === 2) pairNames.push(...(order21 ? ['11', '21', '12', '22'] : ['11', '12', '21', '22']));
  else for (let i = 1; i <= ports; i++) for (let j = 1; j <= ports; j++) pairNames.push(ports < 10 ? `${i}${j}` : `${i},${j}`);
  const n = recs.length;
  const col = (k: number) => Float64Array.from(recs, (r) => r[k]);
  const columns: Column[] = [{ ...column(`Frequency (${unit})`, col(0)), role: 'x' }];
  pairNames.forEach((pn, p) => {
    const a = col(1 + 2 * p);
    const b = col(2 + 2 * p);
    const P = `${param}${pn}`;
    if (format === 'RI') columns.push({ ...column(`Re ${P}`, a), role: 'y' }, { ...column(`Im ${P}`, b), role: 'y' });
    else if (format === 'MA') columns.push({ ...column(`|${P}|`, a), role: 'y' }, { ...column(`∠${P} (°)`, b), role: 'y' });
    else columns.push({ ...column(`${P} (dB)`, a), role: 'y' }, { ...column(`∠${P} (°)`, b), role: 'y' });
    if (!extra) return;
    // the dB and the phase when the file writes the parts, the parts when it writes the dB or the magnitude
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const mag = format === 'RI' ? Math.hypot(a[i], b[i]) : format === 'MA' ? a[i] : 10 ** (a[i] / 20);
      const ang = format === 'RI' ? Math.atan2(b[i], a[i]) : b[i] * DEG;
      re[i] = format === 'RI' ? a[i] : mag * Math.cos(ang);
      im[i] = format === 'RI' ? b[i] : mag * Math.sin(ang);
    }
    if (format === 'RI') {
      columns.push({ ...column(`${P} (dB)`, Float64Array.from(re, (r, i) => 20 * Math.log10(Math.hypot(r, im[i])))), role: 'y' }, { ...column(`∠${P} (°)`, Float64Array.from(re, (r, i) => Math.atan2(im[i], r) / DEG)), role: 'y' });
    } else {
      if (format === 'MA') columns.push({ ...column(`${P} (dB)`, Float64Array.from(a, (m) => 20 * Math.log10(m))), role: 'y' });
      columns.push({ ...column(`Re ${P}`, re), role: 'y' }, { ...column(`Im ${P}`, im), role: 'y' });
    }
  });
  if (!n) warnings.push('No data read: is it a Touchstone file?');
  return { dataset: { name, columns }, info: { ports, unit, param, format, z0, version, noise }, header: header.slice(0, 80), warnings };
}
