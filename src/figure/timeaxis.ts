// Dates, times and durations on an axis: read from text (2024-01-05, 2024-01-05 13:20, 05.01.2024, 5/1/2024, 13:20:05),
// as seconds (dates: since 1970-01-01, in UTC — no summer time; durations: from 0); the ticks in calendar steps (seconds,
// minutes, hours, days, weeks, months, years) and their labels, automatic or written with yyyy, MMM, dd, HH, mm, ss … .
// Pure: the evaluation and the drawing use it.

export type TimeKind = 'date' | 'duration';
const DAY = 86400;
const two = (y: number) => (y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y);
const secs = (h: string | undefined, m: string | undefined, s: string | undefined) => (h ? Number(h) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0) : 0);
const date = (y: number, mo: number, d: number) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? Date.UTC(two(y), mo - 1, d) / 1000 : NaN);
const TIME = String.raw`(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?\s*(?:Z|UTC)?`;
const ISO = new RegExp(String.raw`^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?${TIME}$`);
const DOTS = new RegExp(String.raw`^(\d{1,2})\.(\d{1,2})\.(\d{2,4})${TIME}$`);
const SLASH = new RegExp(String.raw`^(\d{1,2})/(\d{1,2})/(\d{2,4})${TIME}$`);
const CLOCK = /^(-)?(\d{1,4}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/;

// A date or a time of day / a duration written as text, or null. order: how 5/1/2024 is read when both could be (a
// number over 12 decides by itself).
export function parseTime(text: string, order: 'dmy' | 'mdy' = 'dmy'): { v: number; kind: TimeKind } | null {
  const t = text.trim();
  if (!t) return null;
  let m = ISO.exec(t);
  if (m) {
    const v = date(Number(m[1]), Number(m[2]), Number(m[3] ?? 1)) + secs(m[4], m[5], m[6]);
    return Number.isFinite(v) ? { v, kind: 'date' } : null;
  }
  m = DOTS.exec(t);
  if (m) {
    const v = date(Number(m[3]), Number(m[2]), Number(m[1])) + secs(m[4], m[5], m[6]);
    return Number.isFinite(v) ? { v, kind: 'date' } : null;
  }
  m = SLASH.exec(t);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const mdy = a > 12 ? false : b > 12 ? true : order === 'mdy';
    const v = date(Number(m[3]), mdy ? a : b, mdy ? b : a) + secs(m[4], m[5], m[6]);
    return Number.isFinite(v) ? { v, kind: 'date' } : null;
  }
  m = CLOCK.exec(t);
  if (m) {
    const v = secs(m[2], m[3], m[4]);
    return { v: m[1] ? -v : v, kind: 'duration' };
  }
  return null;
}

// ---- ticks ----
type Unit = 's' | 'min' | 'h' | 'd' | 'mo' | 'y';
type Step = { unit: Unit; n: number; sec: number };
const SIZE: Record<Unit, number> = { s: 1, min: 60, h: 3600, d: DAY, mo: 30.44 * DAY, y: 365.25 * DAY };
const STEPS: Step[] = (
  [
    ['s', [1, 2, 5, 10, 15, 30]],
    ['min', [1, 2, 5, 10, 15, 30]],
    ['h', [1, 2, 3, 6, 12]],
    ['d', [1, 2, 7, 14]],
    ['mo', [1, 2, 3, 6]],
    ['y', [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]],
  ] as [Unit, number[]][]
).flatMap(([unit, ns]) => ns.map((n) => ({ unit, n, sec: n * SIZE[unit] })));

// the step for about `count` ticks over [lo, hi] (durations: no months or years)
function stepFor(lo: number, hi: number, count: number, kind: TimeKind): Step {
  const list = kind === 'duration' ? STEPS.filter((s) => s.unit !== 'mo' && s.unit !== 'y') : STEPS;
  const want = (hi - lo) / Math.max(1, count);
  return list.find((s) => s.sec >= want) ?? (kind === 'duration' ? { unit: 'd', n: Math.max(1, Math.ceil(want / DAY)), sec: Math.ceil(want / DAY) * DAY } : list[list.length - 1]);
}
const monthIndex = (v: number) => {
  const d = new Date(v * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const fromMonth = (k: number) => Date.UTC(Math.floor(k / 12), k % 12, 1) / 1000;

// The ticks at the step's boundaries in [lo, hi] (and the one just before / after: the nice ends of the axis).
function stepTicks(lo: number, hi: number, st: Step, outer: boolean): number[] {
  const out: number[] = [];
  if (st.unit === 'mo' || st.unit === 'y') {
    const per = st.unit === 'y' ? 12 * st.n : st.n;
    let k = Math.floor(monthIndex(lo) / per) * per;
    if (!outer && fromMonth(k) < lo) k += per;
    for (let guard = 0; guard < 2000; guard++, k += per) {
      const v = fromMonth(k);
      if (v > hi) {
        if (outer) out.push(v);
        break;
      }
      out.push(v);
    }
    return out;
  }
  const first = (outer ? Math.floor(lo / st.sec) : Math.ceil(lo / st.sec - 1e-9)) * st.sec;
  for (let v = first, guard = 0; guard < 5000; v += st.sec, guard++) {
    if (v > hi + 1e-9 * st.sec) {
      if (outer) out.push(v);
      break;
    }
    out.push(v);
  }
  return out;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = (n: number) => String(n).padStart(2, '0');

// A time as text: yyyy yy MMMM MMM MM M dd d HH H mm ss (a duration: H the hours in all, mm and ss of the rest);
// text in quotes ('h') is written as it is.
export function formatTime(v: number, fmt: string, kind: TimeKind): string {
  if (!Number.isFinite(v)) return '';
  if (kind === 'duration') {
    const neg = v < 0;
    const a = Math.abs(v);
    const H = Math.floor(a / 3600);
    const M = Math.floor((a % 3600) / 60);
    const S = a % 60;
    const s = fmt.replace(/'([^']*)'|HH|H|hh|h|mm|m|ss|s/g, (t, lit) => (lit !== undefined ? lit : t === 'HH' || t === 'hh' ? p2(H) : t === 'H' || t === 'h' ? String(H) : t === 'mm' ? p2(M) : t === 'm' ? String(Math.floor(a / 60)) : t === 'ss' ? p2(Math.round(S)) : String(Math.round(a))));
    return neg ? `−${s}` : s;
  }
  const d = new Date(Math.round(v * 1000));
  const [y, mo, day, h, mi, se] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
  return fmt.replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|mm|ss/g, (t, lit) => {
    if (lit !== undefined) return lit;
    switch (t) {
      case 'yyyy':
        return String(y);
      case 'yy':
        return p2(y % 100);
      case 'MMMM':
        return MONTH[mo];
      case 'MMM':
        return MON[mo];
      case 'MM':
        return p2(mo + 1);
      case 'M':
        return String(mo + 1);
      case 'dd':
        return p2(day);
      case 'd':
        return String(day);
      case 'HH':
        return p2(h);
      case 'H':
        return String(h);
      case 'mm':
        return p2(mi);
      default:
        return p2(se);
    }
  });
}

// the automatic format of the labels for a step (and the whole range shown)
function autoFormat(st: Step, lo: number, hi: number, kind: TimeKind): string {
  if (kind === 'duration') return st.sec < 60 ? (hi >= 3600 ? 'H:mm:ss' : 'm:ss') : 'H:mm';
  switch (st.unit) {
    case 'y':
      return 'yyyy';
    case 'mo':
      return 'MMM yyyy';
    case 'd':
      return new Date(lo * 1000).getUTCFullYear() === new Date(hi * 1000).getUTCFullYear() ? 'd MMM' : 'd MMM yyyy';
    case 'h':
    case 'min':
      return hi - lo > DAY ? "d MMM HH:mm" : 'HH:mm';
    default:
      return 'HH:mm:ss';
  }
}

// The ticks of a time axis over [lo, hi] (s) with their labels.
export function timeTicks(lo: number, hi: number, count: number, kind: TimeKind, fmt = ''): { major: number[]; labels: string[] } {
  if (!(hi > lo)) return { major: [lo], labels: [formatTime(lo, fmt || (kind === 'duration' ? 'H:mm:ss' : 'yyyy-MM-dd HH:mm'), kind)] };
  const st = stepFor(lo, hi, count, kind);
  const major = stepTicks(lo, hi, st, false);
  const f = fmt.trim() || autoFormat(st, lo, hi, kind);
  return { major, labels: major.map((v) => formatTime(v, f, kind)) };
}
// The ends of a time axis rounded out to its ticks.
export function timeBounds(lo: number, hi: number, count: number, kind: TimeKind): [number, number] {
  if (!(hi > lo)) return [lo - SIZE.h, hi + SIZE.h];
  const st = stepFor(lo, hi, count, kind);
  const t = stepTicks(lo, hi, st, true);
  return [Math.min(lo, t[0]), Math.max(hi, t[t.length - 1])];
}
