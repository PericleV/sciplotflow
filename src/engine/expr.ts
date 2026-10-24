// Small expression compiler (no eval): numbers, variables, + − * / ^, parentheses, unary minus, comparisons
// (< > <= >= == !=), logic (and or not, && || !), and the functions below. True is 1, false 0.
// Functions of one's own, written before the formula and separated by ; (or new lines): f(t) = exp(-t/3); A*f(B) — each
// put in place where it is called (its other names are those of the formula: parameters, inputs), the later ones may
// call the earlier. compileComplex: the same in complex numbers (j the imaginary unit).

export type Compiled = { fn: (vars: Record<string, number>) => number; names: string[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  hypot: Math.hypot,
  // trigonometric (radians), hyperbolic, and the conversions between degrees and radians
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (x) => 1 / Math.tan(x),
  ctan: (x) => 1 / Math.tan(x),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  deg: (x) => (x * 180) / Math.PI,
  rad: (x) => (x * Math.PI) / 180,
  // rounding: round(x) or round(x, digits after the point)
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  mod: (a, b) => ((a % b) + b) % b,
  // Heaviside step: 1 for x ≥ 0, else 0
  step: (x) => (x >= 0 ? 1 : Number.isNaN(x) ? NaN : 0),
  // if(condition, value when true, value when false); a missing condition (NaN) gives NaN
  if: (c, a, b) => (Number.isNaN(c) ? NaN : c ? a : b),
  // isnan(x): 1 for a missing value
  isnan: (x) => (Number.isNaN(x) ? 1 : 0),
};
export const FUNCTION_NAMES = Object.keys(FUNCS);

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };
const OPS2 = ['<=', '>=', '==', '!=', '&&', '||'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (/\s/.test(c)) i++;
    else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at ${i + 1}`);
      out.push({ k: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0] });
      i += m[0].length;
    } else if (OPS2.includes(two)) {
      out.push({ k: 'op', v: two });
      i += 2;
    } else if ('≤≥≠'.includes(c)) {
      out.push({ k: 'op', v: c === '≤' ? '<=' : c === '≥' ? '>=' : '!=' });
      i++;
    } else if ('+-*/%^(),·×−<>=!'.includes(c)) {
      out.push({ k: 'op', v: c === '·' || c === '×' ? '*' : c === '−' ? '-' : c === '=' ? '==' : c });
      i++;
    } else throw new Error(`Unexpected “${c}” at ${i + 1}`);
  }
  return out;
}

type BinOp = '+' | '-' | '*' | '/' | '%' | '^' | '<' | '>' | '<=' | '>=' | '==' | '!=' | 'and' | 'or';
type Ast = { k: 'num'; v: number } | { k: 'var'; v: string } | { k: 'pi' } | { k: 'neg'; a: Ast } | { k: 'not'; a: Ast } | { k: 'bin'; op: BinOp; a: Ast; b: Ast } | { k: 'call'; f: string; args: Ast[] };

// or := and (or and)* ; and := not (and not)* ; not := not not | cmp ; cmp := sum (cmpop sum)? ;
// sum := term ((+|−) term)* ; term := unary ((*|/) unary)* ; unary := − unary | power ; power := atom (^ unary)?
function parse(src: string, extra?: Record<string, unknown>, own?: Set<string>): { ast: Ast; names: string[] } | string {
  let toks: Tok[];
  try {
    toks = tokenize(src);
  } catch (e) {
    return (e as Error).message;
  }
  if (!toks.length) return 'Enter an expression, e.g. 0.5*A + 0.25*B';
  let p = 0;
  const names = new Set<string>();
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.k === 'op' && peek().v === v;
  const isWord = (v: string) => peek()?.k === 'id' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected “${v}”`);
    p++;
  };
  const or = (): Ast => {
    let f = and();
    while (isOp('||') || isWord('or')) {
      p++;
      f = { k: 'bin', op: 'or', a: f, b: and() };
    }
    return f;
  };
  const and = (): Ast => {
    let f = not();
    while (isOp('&&') || isWord('and')) {
      p++;
      f = { k: 'bin', op: 'and', a: f, b: not() };
    }
    return f;
  };
  const not = (): Ast => {
    if (isOp('!') || isWord('not')) {
      p++;
      return { k: 'not', a: not() };
    }
    return cmp();
  };
  const cmp = (): Ast => {
    const a = sum();
    const t = peek();
    if (t?.k === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t.v)) {
      p++;
      return { k: 'bin', op: t.v as BinOp, a, b: sum() };
    }
    return a;
  };
  const sum = (): Ast => {
    let f = term();
    while (isOp('+') || isOp('-')) f = { k: 'bin', op: toks[p++].v as '+' | '-', a: f, b: term() };
    return f;
  };
  const term = (): Ast => {
    let f = unary();
    while (isOp('*') || isOp('/') || isOp('%')) f = { k: 'bin', op: toks[p++].v as '*' | '/' | '%', a: f, b: unary() };
    return f;
  };
  const unary = (): Ast => {
    if (isOp('-')) {
      p++;
      return { k: 'neg', a: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return power();
  };
  const power = (): Ast => {
    const a = atom();
    if (isOp('^')) {
      p++;
      return { k: 'bin', op: '^', a, b: unary() };
    }
    return a;
  };
  const atom = (): Ast => {
    const t = toks[p++];
    if (!t) throw new Error('Unexpected end of the expression');
    if (t.k === 'num') return { k: 'num', v: t.v };
    if (t.k === 'op' && t.v === '(') {
      const f = or();
      expect(')');
      return f;
    }
    if (t.k === 'id') {
      if (isOp('(')) {
        if (!(t.v in FUNCS) && !(extra && t.v in extra) && !own?.has(t.v)) throw new Error(`Unknown function “${t.v}”`);
        p++;
        const args: Ast[] = [];
        if (!isOp(')')) {
          args.push(or());
          while (isOp(',')) {
            p++;
            args.push(or());
          }
        }
        expect(')');
        if (t.v === 'if' && args.length !== 3) throw new Error('if needs three parts: if(condition, value when true, value when false)');
        return { k: 'call', f: t.v, args };
      }
      if (t.v === 'pi') return { k: 'pi' };
      if (t.v === 'NaN' || t.v === 'nan') return { k: 'num', v: NaN };
      if (t.v === 'inf' || t.v === 'Inf') return { k: 'num', v: Infinity };
      if (['and', 'or', 'not'].includes(t.v)) throw new Error(`“${t.v}” needs a value on both sides`);
      names.add(t.v);
      return { k: 'var', v: t.v };
    }
    throw new Error(`Unexpected “${t.v}”`);
  };
  try {
    const ast = or();
    if (p < toks.length) throw new Error(`Unexpected “${toks[p].v}”`);
    return { ast, names: [...names] };
  } catch (e) {
    return (e as Error).message;
  }
}

// ---- functions of one's own ----
type Def = { args: string[]; ast: Ast };
const DEF_RE = /^\s*([A-Za-z_]\w*)\s*\(\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)?\s*\)\s*=(?!=)\s*([\s\S]+)$/;
// the parts before the formula that define a function (a name that is not a function already)
function definitions(src: string, extra?: Record<string, unknown>): { defs: Map<string, Def>; body: string } | string | null {
  if (!/[;\n]/.test(src) && !DEF_RE.test(src)) return null;
  const parts = src.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  const defs = new Map<string, Def>();
  const rest: string[] = [];
  for (const part of parts) {
    const m = DEF_RE.exec(part);
    if (m && !(m[1] in FUNCS) && !(extra && m[1] in extra)) {
      const args = (m[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (new Set(args).size !== args.length) return `${m[1]}: an argument named twice.`;
      const r = parse(m[3], extra, new Set(defs.keys()));
      if (typeof r === 'string') return `${m[1]}(${args.join(', ')}): ${r}`;
      defs.set(m[1], { args, ast: r.ast });
    } else rest.push(part);
  }
  if (!defs.size) return parts.length > 1 ? 'One formula (or define functions before it: f(t) = …; then the formula).' : null;
  if (rest.length !== 1) return rest.length ? 'One formula after the functions defined (f(t) = …; then the formula).' : 'The formula after the functions defined (f(t) = …; then the formula).';
  return { defs, body: rest[0] };
}
// every call of a function of one's own replaced by its body, its arguments put in
function expand(n: Ast, defs: Map<string, Def>, bound: Map<string, Ast> = new Map(), depth = 0): Ast {
  if (depth > 50) throw new Error('Functions calling each other too deep.');
  switch (n.k) {
    case 'var':
      return bound.get(n.v) ?? n;
    case 'neg':
    case 'not':
      return { ...n, a: expand(n.a, defs, bound, depth) };
    case 'bin':
      return { ...n, a: expand(n.a, defs, bound, depth), b: expand(n.b, defs, bound, depth) };
    case 'call': {
      const args = n.args.map((a) => expand(a, defs, bound, depth));
      const d = defs.get(n.f);
      if (!d) return { ...n, args };
      if (args.length !== d.args.length) throw new Error(`${n.f} takes ${d.args.length} argument${d.args.length === 1 ? '' : 's'} (${d.args.join(', ')}).`);
      // the body with its arguments; its other names are the formula's (not the caller's arguments)
      return expand(d.ast, defs, new Map(d.args.map((a, k) => [a, args[k]])), depth + 1);
    }
    default:
      return n;
  }
}
function varNames(n: Ast, out: Set<string>) {
  if (n.k === 'var') out.add(n.v);
  else if (n.k === 'neg' || n.k === 'not') varNames(n.a, out);
  else if (n.k === 'bin') {
    varNames(n.a, out);
    varNames(n.b, out);
  } else if (n.k === 'call') for (const a of n.args) varNames(a, out);
  return out;
}
// the formula parsed, with its functions of one's own put in place
function parseAll(src: string, extra?: Record<string, unknown>): { ast: Ast; names: string[] } | string {
  const d = definitions(src, extra);
  if (d === null) return parse(src, extra);
  if (typeof d === 'string') return d;
  const r = parse(d.body, extra, new Set(d.defs.keys()));
  if (typeof r === 'string') return r;
  try {
    const ast = expand(r.ast, d.defs);
    return { ast, names: [...varNames(ast, new Set())] };
  } catch (e) {
    return (e as Error).message;
  }
}

type F = (v: Record<string, number>) => number;
const truth = (x: number) => (Number.isNaN(x) ? NaN : x ? 1 : 0);

// extra: more functions (Curve math: those of the curves, xmin(A) …), over the built-in ones of the same name
export function compile(src: string, extra?: Record<string, (...a: number[]) => number>): Compiled | string {
  const r = parseAll(src, extra);
  if (typeof r === 'string') return r;
  const build = (n: Ast): F => {
    switch (n.k) {
      case 'num':
        return () => n.v;
      case 'pi':
        return () => Math.PI;
      case 'var': {
        const name = n.v;
        return (v) => {
          const x = v[name];
          return x === undefined ? NaN : x;
        };
      }
      case 'neg': {
        const a = build(n.a);
        return (v) => -a(v);
      }
      case 'not': {
        const a = build(n.a);
        return (v) => {
          const x = a(v);
          return Number.isNaN(x) ? NaN : x ? 0 : 1;
        };
      }
      case 'bin': {
        const [a, b] = [build(n.a), build(n.b)];
        switch (n.op) {
          case '+':
            return (v) => a(v) + b(v);
          case '-':
            return (v) => a(v) - b(v);
          case '*':
            return (v) => a(v) * b(v);
          case '/':
            return (v) => a(v) / b(v);
          case '%':
            // (the remainder, with the sign of the divisor: -1 % 2 is 1, as mod)
            return (v) => {
              const [x, y] = [a(v), b(v)];
              return ((x % y) + y) % y;
            };
          case '^':
            return (v) => a(v) ** b(v);
          case '<':
            return (v) => truth(cmp(a(v), b(v), (x, y) => x < y));
          case '>':
            return (v) => truth(cmp(a(v), b(v), (x, y) => x > y));
          case '<=':
            return (v) => truth(cmp(a(v), b(v), (x, y) => x <= y));
          case '>=':
            return (v) => truth(cmp(a(v), b(v), (x, y) => x >= y));
          case '==':
            return (v) => truth(cmp(a(v), b(v), (x, y) => x === y));
          case '!=':
            return (v) => truth(cmp(a(v), b(v), (x, y) => x !== y));
          case 'and':
            return (v) => {
              const x = a(v);
              const y = b(v);
              return Number.isNaN(x) || Number.isNaN(y) ? NaN : x && y ? 1 : 0;
            };
          case 'or':
            return (v) => {
              const x = a(v);
              const y = b(v);
              return (x && !Number.isNaN(x)) || (y && !Number.isNaN(y)) ? 1 : Number.isNaN(x) || Number.isNaN(y) ? NaN : 0;
            };
        }
        break;
      }
      case 'call': {
        // one, two or three arguments called directly (no array a row: a million rows several times faster)
        const fn = extra?.[n.f] ?? FUNCS[n.f];
        const args = n.args.map(build);
        if (args.length === 1) {
          const [a] = args;
          return (v) => fn(a(v));
        }
        if (args.length === 2) {
          const [a, b] = args;
          return (v) => fn(a(v), b(v));
        }
        if (args.length === 3) {
          const [a, b, c] = args;
          return (v) => fn(a(v), b(v), c(v));
        }
        return (v) => fn(...args.map((a) => a(v)));
      }
    }
    return () => NaN;
  };
  return { fn: build(r.ast), names: r.names };
}
// ---- complex numbers ----
export type Cx = [number, number];
export type CompiledCx = { fn: (v: Record<string, number | Cx>) => Cx; names: string[] };
const cx = {
  add: (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]],
  sub: (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]],
  mul: (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a: Cx, b: Cx): Cx => {
    // Smith's division (no overflow for large parts)
    if (Math.abs(b[0]) >= Math.abs(b[1])) {
      const r = b[1] / b[0];
      const d = b[0] + b[1] * r;
      return [(a[0] + a[1] * r) / d, (a[1] - a[0] * r) / d];
    }
    const r = b[0] / b[1];
    const d = b[0] * r + b[1];
    return [(a[0] * r + a[1]) / d, (a[1] * r - a[0]) / d];
  },
  exp: (a: Cx): Cx => {
    const e = Math.exp(a[0]);
    return a[1] === 0 ? [e, 0] : [e * Math.cos(a[1]), e * Math.sin(a[1])];
  },
  log: (a: Cx): Cx => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])],
};
const cpow = (a: Cx, b: Cx): Cx => {
  if (b[1] === 0 && a[1] === 0 && (a[0] >= 0 || Number.isInteger(b[0]))) return [a[0] ** b[0], 0];
  if (a[0] === 0 && a[1] === 0) return b[0] > 0 ? [0, 0] : [NaN, NaN];
  return cx.exp(cx.mul(b, cx.log(a)));
};
const csqrtE = (a: Cx): Cx => {
  if (a[1] === 0 && a[0] >= 0) return [Math.sqrt(a[0]), 0];
  const r = Math.hypot(a[0], a[1]);
  const re = Math.sqrt((r + a[0]) / 2);
  const im = Math.sqrt((r - a[0]) / 2) * (a[1] < 0 ? -1 : 1);
  return [re, im];
};
const I: Cx = [0, 1];
// the complex functions; the others of FUNCS on real arguments only (else NaN)
const CFUNCS: Record<string, (...a: Cx[]) => Cx> = {
  re: (a) => [a[0], 0],
  im: (a) => [a[1], 0],
  real: (a) => [a[0], 0],
  imag: (a) => [a[1], 0],
  abs: (a) => [Math.hypot(a[0], a[1]), 0],
  arg: (a) => [Math.atan2(a[1], a[0]), 0],
  conj: (a) => [a[0], -a[1]],
  exp: cx.exp,
  ln: cx.log,
  log: cx.log,
  log10: (a) => cx.div(cx.log(a), [Math.LN10, 0]),
  sqrt: csqrtE,
  pow: cpow,
  sin: (a) => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])],
  cos: (a) => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])],
  tan: (a) => cx.div(CFUNCS.sin(a), CFUNCS.cos(a)),
  sinh: (a) => [Math.sinh(a[0]) * Math.cos(a[1]), Math.cosh(a[0]) * Math.sin(a[1])],
  cosh: (a) => [Math.cosh(a[0]) * Math.cos(a[1]), Math.sinh(a[0]) * Math.sin(a[1])],
  tanh: (a) => cx.div(CFUNCS.sinh(a), CFUNCS.cosh(a)),
  // the polar form: polar(r, θ) = r·e^(jθ)
  polar: (r, t) => [r[0] * Math.cos(t[0]), r[0] * Math.sin(t[0])],
};
export const COMPLEX_FUNCTION_NAMES = Object.keys(CFUNCS);
// in complex numbers: j the imaginary unit (unless an input is named j); comparisons and logic on real values only
export function compileComplex(src: string): CompiledCx | string {
  const r = parseAll(src, CFUNCS);
  if (typeof r === 'string') return r;
  const nan: Cx = [NaN, NaN];
  const toCx = (x: number | Cx | undefined): Cx => (x === undefined ? nan : typeof x === 'number' ? [x, 0] : x);
  type G = (v: Record<string, number | Cx>) => Cx;
  const build = (n: Ast): G => {
    switch (n.k) {
      case 'num':
        return () => [n.v, 0];
      case 'pi':
        return () => [Math.PI, 0];
      case 'var': {
        const name = n.v;
        return (v) => (name === 'j' && !(name in v) ? I : toCx(v[name]));
      }
      case 'neg': {
        const a = build(n.a);
        return (v) => {
          const x = a(v);
          return [-x[0], -x[1]];
        };
      }
      case 'not': {
        const a = build(n.a);
        return (v) => {
          const x = a(v);
          return x[1] !== 0 || Number.isNaN(x[0]) ? nan : [x[0] ? 0 : 1, 0];
        };
      }
      case 'bin': {
        const [a, b] = [build(n.a), build(n.b)];
        const op = n.op;
        if (op === '+') return (v) => cx.add(a(v), b(v));
        if (op === '-') return (v) => cx.sub(a(v), b(v));
        if (op === '*') return (v) => cx.mul(a(v), b(v));
        if (op === '/') return (v) => cx.div(a(v), b(v));
        if (op === '^') return (v) => cpow(a(v), b(v));
        if (op === '%') {
          const [ra, rb] = [a, b];
          return (v) => {
            const [x, y] = [ra(v), rb(v)];
            return x[1] !== 0 || y[1] !== 0 ? nan : [((x[0] % y[0]) + y[0]) % y[0], 0];
          };
        }
        // comparisons and logic: of real values
        const real = (f: (x: number, y: number) => number): G => (v) => {
          const [x, y] = [a(v), b(v)];
          return x[1] !== 0 || y[1] !== 0 ? nan : [f(x[0], y[0]), 0];
        };
        if (op === 'and') return real((x, y) => (Number.isNaN(x) || Number.isNaN(y) ? NaN : x && y ? 1 : 0));
        if (op === 'or') return real((x, y) => ((x && !Number.isNaN(x)) || (y && !Number.isNaN(y)) ? 1 : Number.isNaN(x) || Number.isNaN(y) ? NaN : 0));
        const t = { '<': (x: number, y: number) => x < y, '>': (x: number, y: number) => x > y, '<=': (x: number, y: number) => x <= y, '>=': (x: number, y: number) => x >= y, '==': (x: number, y: number) => x === y, '!=': (x: number, y: number) => x !== y }[op];
        return real((x, y) => cmp(x, y, t));
      }
      case 'call': {
        const args = n.args.map(build);
        const cf = CFUNCS[n.f];
        if (cf) return (v) => cf(...args.map((a) => a(v)));
        const rf = FUNCS[n.f];
        return (v) => {
          const xs = args.map((a) => a(v));
          return xs.some((x) => x[1] !== 0) ? nan : [rf(...xs.map((x) => x[0])), 0];
        };
      }
    }
    return () => nan;
  };
  return { fn: build(r.ast), names: r.names.filter((x) => x !== 'j') };
}

// a comparison with a missing value is missing (NaN), not false
const cmp = (x: number, y: number, f: (x: number, y: number) => boolean) => (Number.isNaN(x) || Number.isNaN(y) ? NaN : f(x, y) ? 1 : 0);
