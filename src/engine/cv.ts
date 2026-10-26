// C–V: the capacitance of a structure against its voltage, for the Signal generator. Pure.
//  MOS capacitor (Sze & Ng, Physics of Semiconductor Devices, ch. 4; Nicollian & Brews, MOS Physics and Technology):
//   the semiconductor's charge from Poisson's equation (the majority carriers, and the minority ones but in deep
//   depletion), V_G = V_FB + ψs − (Qs + Qit) / C_ox solved for ψs at every voltage; C_ox in series with C_s. Low
//   frequency: the minority carriers and the interface traps follow. High frequency: neither; C_s in strong inversion
//   held at its value at 2φ_B (Sze), at 2.10|u_B| + 1.33 kT/q (CV_ideal.m), or exact (Lindner 1962, Brews 1974: the
//   majority carriers only respond, on the equilibrium profile). Interface traps (constant or U-shaped over the gap,
//   donors below mid-gap, acceptors above): their charge stretches the curve, their capacitance q·D_it·… adds to C_s at
//   low frequency.
//  p–n junction (Sze & Ng, ch. 2): abrupt, W = √(2ε(V_bi − V − 2kT/q)/(qN_eff)); linearly graded,
//   W = (12ε(V_bi − V)/(qa))^⅓ with V_bi = (2kT/q)·ln(aW/2nᵢ). V_bi = (kT/q)·ln(N_A·N_D/nᵢ²).
//  Schottky diode (Sze & Ng, ch. 3): W = √(2ε(V_bi − V − kT/q)/(qN)), V_bi = φ_B − (kT/q)·ln(N_c/N).
//  Varactor: the SPICE junction capacitance C_J0·(1 − V/V_J)^−M, linear beyond F_C·V_J (Nagel 1975, SPICE2).
//  MIM capacitor: C₀·(1 + α₁V + α₂V²), its voltage coefficients in ppm.
//  Ferroelectric capacitor (Miller, Nasby, Schwank, Rodgers & Dressendorfer, J. Appl. Phys. 68, 6463, 1990):
//   P = P_s·tanh((E ∓ E_c)/2δ), δ = E_c / ln((1 + P_r/P_s)/(1 − P_r/P_s)); C = A(ε₀ε_b + dP/dE)/d, up and down.
//  Semiconductor electrode (Mott–Schottky; Gelderman, Lee & Donne, J. Chem. Educ. 84, 685, 2007): the MOS algorithm
//   with the Helmholtz layer as its oxide, E_fb its flat band; in depletion 1/C² = 2(E − E_fb − kT/q)/(qεN A²).
//  Electrical double layer (Gouy–Chapman–Stern; Bard & Faulkner, Electrochemical Methods, §13.3): the diffuse layer's
//   C_d = √(2z²q²εn⁰/kT)·cosh(zqφ_d/2kT) in series with the Stern layer's C_H; E − E_pzc = φ_d + σ/C_H.
import { fmtNum } from './table.ts';

export type CvStruct = 'mos' | 'pn' | 'schottky' | 'varactor' | 'mim' | 'ferro' | 'ms' | 'gcs';
// the doping type and its concentration (cm⁻³), the oxide (thickness nm, permittivity), the semiconductor (permittivity,
// gap eV, effective masses of the band edges in mₑ, or nᵢ typed in cm⁻³), the area (mm²), the temperatures (K, a curve
// each), the flat-band voltage typed or from the work functions (φm, χ in eV) and a fixed oxide charge (cm⁻²), the
// sweep, the unit, ψs written too; then each structure's own numbers (absent: CV_MORE)
export type CvSpec = {
  type: 'n' | 'p';
  mode: 'deep' | 'lf' | 'hf' | 'lfhf';
  temps: string;
  dop: number;
  tox: number;
  epsOx: number;
  epsS: number;
  eg: number;
  mc: number;
  mv: number;
  area: number;
  vfbFrom: 'typed' | 'work';
  vfb: number;
  phiM: number;
  chi: number;
  nox: number;
  vFrom: number;
  vTo: number;
  points: number;
  unit: 'pF' | 'nF' | 'F' | 'nF/cm2' | 'uF/cm2' | 'norm';
  psi?: boolean;
  struct?: CvStruct;
  niFrom?: 'masses' | 'typed';
  ni?: number; // cm⁻³
  hfMin?: 'sze' | 'fit' | 'exact';
  ditShape?: 'none' | 'const' | 'u';
  dit?: number; // cm⁻² eV⁻¹, at mid-gap
  ditEdge?: number; // cm⁻² eV⁻¹, more at the band edges (U)
  ditW?: number; // eV, how fast it rises to them
  rs?: number; // Ω in series
  gl?: number; // S, a leak in parallel
  freq?: number; // Hz, measured at
  na?: number; // cm⁻³
  nd?: number;
  profile?: 'abrupt' | 'graded';
  grad?: number; // cm⁻⁴
  vbiFrom?: 'computed' | 'typed';
  vbi?: number;
  barrierFrom?: 'typed' | 'work';
  phiB?: number; // eV
  cj0?: number; // pF
  vj?: number;
  mj?: number;
  fc?: number;
  epsI?: number;
  tins?: number; // nm
  vcc1?: number; // ppm/V
  vcc2?: number; // ppm/V²
  ps?: number; // µC/cm²
  pr?: number;
  ec?: number; // kV/cm
  tf?: number; // nm
  epsB?: number;
  efb?: number; // V
  ch?: number; // µF/cm², the Helmholtz (Stern) layer; 0: none
  conc?: number; // mol/L
  z?: number;
  epsW?: number;
  epzc?: number; // V
  inv2?: boolean; // 1/C² too
  width?: boolean; // the depletion width too
};
// the numbers of a structure not typed yet
export const CV_MORE = {
  niFrom: 'masses',
  ni: 1e10,
  hfMin: 'sze',
  ditShape: 'none',
  dit: 1e11,
  ditEdge: 1e13,
  ditW: 0.1,
  rs: 0,
  gl: 0,
  freq: 1e5,
  na: 1e18,
  nd: 1e16,
  profile: 'abrupt',
  grad: 1e20,
  vbiFrom: 'computed',
  vbi: 2.9,
  barrierFrom: 'typed',
  phiB: 1.2,
  cj0: 10,
  vj: 0.7,
  mj: 0.5,
  fc: 0.5,
  epsI: 7,
  tins: 50,
  vcc1: 20,
  vcc2: 50,
  ps: 30,
  pr: 25,
  ec: 50,
  tf: 200,
  epsB: 100,
  efb: -0.5,
  ch: 20,
  conc: 0.01,
  z: 1,
  epsW: 78.49,
  epzc: 0,
} as const satisfies Partial<CvSpec>;
const more = <K extends keyof typeof CV_MORE>(c: CvSpec, k: K): NonNullable<CvSpec[K]> => (c[k] ?? CV_MORE[k]) as NonNullable<CvSpec[K]>;

export const KB = 1.380649e-23;
export const QE = 1.602176634e-19;
export const EPS0 = 8.8541878128e-12;
const ME = 9.1093837015e-31;
const HP = 6.62607015e-34;
const NAV = 6.02214076e23;

// the effective densities of states of the band edges (m⁻³), ln nᵢ (from them and the gap, or typed)
function bands(c: CvSpec, T: number) {
  const nc = 2 * ((2 * Math.PI * c.mc * ME * KB * T) / (HP * HP)) ** 1.5;
  const nv = 2 * ((2 * Math.PI * c.mv * ME * KB * T) / (HP * HP)) ** 1.5;
  const lnNi = more(c, 'niFrom') === 'typed' ? Math.log(more(c, 'ni') * 1e6) : 0.5 * Math.log(nc * nv) - (QE * c.eg) / (2 * KB * T);
  return { nc, nv, lnNi };
}

// e^v − 1 − v without the loss of digits near 0
const em1v = (v: number) => (Math.abs(v) < 1e-3 ? (v * v) / 2 + (v * v * v) / 6 + v ** 4 / 24 + v ** 5 / 120 : Math.expm1(v) - v);

// Gauss–Legendre nodes and weights on [−1, 1]
function gaussLegendre(n: number): { x: number[]; w: number[] } {
  const x: number[] = [];
  const w: number[] = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = z;
      for (let k = 2; k <= n; k++) [p0, p1] = [p1, ((2 * k - 1) * z * p1 - (k - 1) * p0) / k];
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-16) break;
    }
    x.push(z);
    w.push(2 / ((1 - z * z) * dp * dp));
  }
  return { x, w };
}
const GL = gaussLegendre(16);
const glInt = (f: (x: number) => number, a: number, b: number) => {
  if (!(b > a)) return 0;
  const [m, h] = [(a + b) / 2, (b - a) / 2];
  let s = 0;
  for (let i = 0; i < GL.x.length; i++) s += GL.w[i] * f(m + h * GL.x[i]);
  return s * h;
};
// ∫ over [a, b] cut at the breaks (where the Fermi functions change their pace)
const BREAKS = [-36, -14, -6, -2, 0, 2, 6, 14, 36];
const piecewise = (f: (x: number) => number, a: number, b: number) => {
  let s = 0;
  const pts = [a, ...BREAKS.filter((q) => q > a && q < b), b];
  for (let i = 1; i < pts.length; i++) s += glInt(f, pts[i - 1], pts[i]);
  return s;
};

// Interface traps over the gap (energy e from the intrinsic level, taken at mid-gap: −Eg/2 … Eg/2): their density
// (cm⁻² eV⁻¹), its integral from 0, their charge (C/m², donors below mid-gap, acceptors above) and capacitance (F/m²)
// with the Fermi level at s (eV above the intrinsic level at the surface), at the thermal voltage φt
export function trapsOf(c: CvSpec) {
  const shape = more(c, 'ditShape');
  if (shape === 'none') return null;
  const g = c.eg / 2;
  const [dm, de, w] = [more(c, 'dit'), shape === 'u' ? more(c, 'ditEdge') : 0, Math.max(1e-4, more(c, 'ditW'))];
  const D = (e: number) => dm + (de ? de * (Math.exp((e - g) / w) + Math.exp((-g - e) / w)) : 0);
  const I = (t: number) => dm * t + (de ? de * w * (Math.exp((t - g) / w) - Math.exp(-(g + t) / w)) : 0);
  return {
    D,
    charge: (s: number, phiT: number) => {
      // the occupation at 0 K (filled below s), and the Fermi function's correction near s
      const xa = Math.max(-36, (-g - s) / phiT);
      const xb = Math.min(36, (g - s) / phiT);
      const corr = piecewise((x) => D(s + phiT * x) / (1 + Math.exp(-x)), xa, Math.min(0, xb)) - piecewise((x) => D(s + phiT * x) / (1 + Math.exp(x)), Math.max(0, xa), xb);
      return QE * 1e4 * (-I(Math.max(-g, Math.min(g, s))) + phiT * corr);
    },
    cap: (s: number, phiT: number) => {
      const xa = Math.max(-36, (-g - s) / phiT);
      const xb = Math.min(36, (g - s) / phiT);
      return QE * 1e4 * piecewise((x) => D(s + phiT * x) / (4 * Math.cosh(x / 2) ** 2), xa, xb);
    },
  };
}

// The exact high-frequency capacitance of the semiconductor (Lindner 1962; Brews 1974): the majority carriers respond,
// the minority ones (and the profile) stay. Y = L_D·δv′/δv along the equilibrium profile obeys the Riccati equation
// dY/dv = ±(e^v − Y²) / (√2·√G(v)) (+ where v < 0), Y → −1 in the bulk; C_s = −(ε/L_D)·Y at the surface's v. Solved
// once, outwards from v = 0 (its solutions all meet the bulk's one there), by RK4; read by Hermite cubics.
export function hfExactTable(lnR: number, vMin: number, vMax: number): (v: number) => number {
  const r = Math.exp(lnR);
  const G = (v: number) => em1v(v) + (v > -1 ? r * em1v(-v) : Math.exp(lnR - v) - r * (1 - v));
  const sides = [-1, 1].map((sg) => {
    const end = sg < 0 ? vMin : vMax;
    const f = (v: number, Y: number) => (sg < 0 ? 1 : -1) * ((Math.exp(v) - Y * Y) / (Math.SQRT2 * Math.sqrt(G(v))));
    const a = -1 / (2 + Math.sqrt(1 + r));
    let v = sg * 1e-4;
    let Y = -1 + a * v;
    const vs = [0, v];
    const ys = [-1, Y];
    const ds = [a, f(v, Y)];
    while (sg < 0 ? v > end : v < end) {
      const h = sg * Math.min(0.02, 0.25 * Math.abs(v), Math.abs(end - v));
      const k1 = f(v, Y);
      const k2 = f(v + h / 2, Y + (h / 2) * k1);
      const k3 = f(v + h / 2, Y + (h / 2) * k2);
      const k4 = f(v + h, Y + h * k3);
      Y += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      v += h;
      vs.push(v);
      ys.push(Y);
      ds.push(f(v, Y));
    }
    return { vs, ys, ds };
  });
  return (v: number) => {
    const { vs, ys, ds } = sides[v < 0 ? 0 : 1];
    const q = Math.abs(v);
    let lo = 0;
    let hi = vs.length - 1;
    if (q >= Math.abs(vs[hi])) return ys[hi];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (Math.abs(vs[m]) <= q) lo = m;
      else hi = m;
    }
    const h = vs[hi] - vs[lo];
    const t = (v - vs[lo]) / h;
    const [h00, h10, h01, h11] = [2 * t ** 3 - 3 * t * t + 1, t ** 3 - 2 * t * t + t, -2 * t ** 3 + 3 * t * t, t ** 3 - t * t];
    return h00 * ys[lo] + h10 * h * ds[lo] + h01 * ys[hi] + h11 * h * ds[hi];
  };
}

export type CvCurve = { T: number; v: number[]; c: number[]; psi: number[]; w: number[]; cox: number; vfb: number };
// The MOS curve at one temperature and mode, at the voltages of the sweep (empty beyond the surface potentials
// reached). Written for an n-type semiconductor (v = ψ/φt > 0: accumulation); a p-type one is its mirror (ψ → −ψ,
// Q → −Q). coxA: the oxide's capacitance per m² given (the Helmholtz layer of an electrode; Infinity: none).
export function mosCurve(d: CvSpec, T: number, sweep: number[], modeOf?: 'deep' | 'lf' | 'hf', coxA0?: number): CvCurve | string {
  if (!(T > 0)) return `C–V: the temperature ${T} K must be above 0.`;
  const mode = modeOf ?? (d.mode === 'lfhf' ? 'lf' : d.mode);
  const phiT = (KB * T) / QE;
  const N = d.dop * 1e6;
  if (!(N > 0)) return 'C–V: the doping must be above 0.';
  const A = d.area * 1e-6;
  const coxA = coxA0 ?? (EPS0 * d.epsOx) / (d.tox * 1e-9);
  const cox = coxA * A;
  const es = EPS0 * d.epsS;
  const { nc, nv, lnNi } = bands(d, T);
  const uB = Math.log(N) - lnNi;
  if (!Number.isFinite(uB)) return 'C–V: nᵢ cannot be had (the gap, the masses or nᵢ typed).';
  const lnR = -2 * uB;
  const r = Math.exp(lnR);
  const minOn = mode !== 'deep';
  let vfb = d.vfb;
  if (d.vfbFrom === 'work' && coxA0 === undefined) {
    // φms = φm − φs: the semiconductor's work function χ + (Ec − EF) for n, χ + Eg − (EF − Ev) for p; a fixed oxide
    // charge moves the flat band by −Q_ox / C_ox
    const phiS = d.type === 'n' ? d.chi + phiT * Math.log(nc / N) : d.chi + d.eg - phiT * Math.log(nv / N);
    vfb = d.phiM - phiS - (QE * d.nox * 1e4) / coxA;
  }
  const K = Math.sqrt(2 * QE * es * N * phiT);
  const CD = Math.sqrt((es * QE * N) / phiT); // ε / L_D
  const G = (v: number, m: boolean) => em1v(v) + (m ? (v > -1 ? r * em1v(-v) : Math.exp(lnR - v) - r * (1 - v)) : 0);
  const Gp = (v: number, m: boolean) => Math.expm1(v) + (m ? (v > -1 ? -r * Math.expm1(-v) : r - Math.exp(lnR - v)) : 0);
  const cs = (v: number, m: boolean) => (v === 0 ? CD * Math.sqrt(m ? 1 + r : 1) : (CD * Math.abs(Gp(v, m))) / (Math.SQRT2 * Math.sqrt(G(v, m))));
  const traps = coxA0 === undefined ? trapsOf(d) : null;
  const vn = (psi: number) => {
    const v = psi / phiT;
    const qs = -Math.sign(v) * K * Math.sqrt(G(v, minOn));
    const qit = traps ? traps.charge(phiT * uB + psi, phiT) : 0;
    return Number.isFinite(coxA) ? psi - (qs + qit) / coxA : psi;
  };
  const hi = Math.min(2, 700 * phiT);
  const lo = minOn ? Math.max(-15, phiT * (lnR - 700)) : -15;
  // the high frequency: C_s held below the band bending of strong inversion (2φ_B, or as CV_ideal.m), or exact
  const hfMin = more(d, 'hfMin');
  const vInv = hfMin === 'fit' ? -(2.1 * uB + 1.33) : -2 * uB;
  const Y = mode === 'hf' && hfMin === 'exact' ? hfExactTable(lnR, lo / phiT - 1, hi / phiT + 1) : null;
  const csAt = (psi: number) => {
    const v = psi / phiT;
    if (mode !== 'hf') return cs(v, minOn);
    if (Y) return -CD * Y(v);
    return cs(Math.max(v, vInv), false);
  };
  const [vLo, vHi] = [vn(lo), vn(hi)];
  const out = sweep.map((V) => {
    const t = d.type === 'n' ? V - vfb : vfb - V;
    if (!(t >= vLo && t <= vHi)) return { c: NaN, psi: NaN, w: NaN };
    let [a, b] = [lo, hi];
    for (let it = 0; it < 200 && b - a > 1e-15 * Math.max(1, Math.abs(a)); it++) {
      const m = (a + b) / 2;
      if (vn(m) < t) a = m;
      else b = m;
    }
    const psi = (a + b) / 2;
    const s = csAt(psi);
    const sit = traps && mode === 'lf' ? traps.cap(phiT * uB + psi, phiT) : 0;
    return { c: 1 / (1 / cox + 1 / ((s + sit) * A)), psi: d.type === 'n' ? psi : -psi, w: es / s };
  });
  return { T, v: sweep, c: out.map((q) => q.c), psi: out.map((q) => q.psi), w: out.map((q) => q.w), cox, vfb };
}

// ---- every structure: the sets of curves made (C in F; their names, the depletion width in m, more columns) ----
export type CvSet = { label: string; c: number[]; w?: number[]; extra?: { name: string; v: number[] }[] };
export type CvMade = { xName: string; v: number[]; sets: CvSet[]; cox?: number; warnings: string[] };

const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, k) => (n === 1 ? a : a + ((b - a) * k) / (n - 1)));
// the voltage a function rises to t at, between a and b (increasing)
const solveUp = (f: (x: number) => number, t: number, a0: number, b0: number) => {
  let [a, b] = [a0, b0];
  for (let it = 0; it < 200 && b - a > 1e-15 * Math.max(1, Math.abs(a)); it++) {
    const m = (a + b) / 2;
    if (f(m) < t) a = m;
    else b = m;
  }
  return (a + b) / 2;
};

// the built-in voltage of a linearly graded junction: V_bi = (2kT/q)·ln(aW/2nᵢ), W = (12εV_bi/qa)^⅓ (self-consistent)
export function gradedVbi(a: number, es: number, phiT: number, lnNi: number): number {
  const h = (vb: number) => vb - 2 * phiT * (Math.log((a * Math.cbrt((12 * es * vb) / (QE * a))) / 2) - lnNi);
  const lo = phiT;
  if (h(lo) > 0) return NaN;
  return solveUp(h, 0, lo, 100);
}

export function cvMake(c: CvSpec): CvMade | string {
  const st = c.struct ?? 'mos';
  const warnings: string[] = [];
  const n = Math.max(2, Math.min(100000, Math.round(c.points) || 500));
  const v = linspace(c.vFrom, c.vTo, n);
  const A = c.area * 1e-6;
  if (!(c.area > 0)) return 'C–V: the area must be above 0.';
  const temps = c.temps.split(/[,;\s]+/).filter(Boolean).map(Number);
  const usesT = st !== 'varactor' && st !== 'mim' && st !== 'ferro';
  if (usesT && (!temps.length || temps.some((t) => !(t > 0)))) return 'C–V: the temperatures (K), comma-separated (e.g. 14, 300).';
  const tag = (T: number) => (temps.length > 1 ? `T = ${fmtNum(T)} K` : '');
  const join = (...p: string[]) => p.filter(Boolean).join(', ');
  const es = EPS0 * c.epsS;
  const sets: CvSet[] = [];
  const empty = (label: string, cs: number[], why: string) => {
    const k = cs.filter((q) => !Number.isFinite(q)).length;
    if (k) warnings.push(`${label ? `${label}: ` : ''}${k} voltages ${why} (empty).`);
  };
  if (st === 'mos' || st === 'ms') {
    if (st === 'mos' && (!(c.tox > 0) || !(c.epsOx > 0))) return 'C–V: the oxide thickness and its permittivity must be above 0.';
    if (!(c.epsS > 0)) return 'C–V: the permittivity must be above 0.';
    const ch = more(c, 'ch');
    // (an electrode: its potential is the semiconductor's against the electrolyte, the gate's of a MOS turned round)
    const spec: CvSpec = st === 'ms' ? { ...c, mode: 'deep', vfbFrom: 'typed', vfb: -more(c, 'efb'), ditShape: 'none' } : c;
    const at = st === 'ms' ? v.map((q) => -q) : v;
    const coxA = st === 'ms' ? (ch > 0 ? ch * 1e-2 : Infinity) : undefined;
    const modes: ('deep' | 'lf' | 'hf')[] = st === 'ms' ? ['deep'] : c.mode === 'lfhf' ? ['lf', 'hf'] : [c.mode];
    let cox = 0;
    for (const T of temps)
      for (const m of modes) {
        const cur = mosCurve(spec, T, at, m, coxA);
        if (typeof cur === 'string') return cur;
        cox = cur.cox;
        const label = join(modes.length > 1 ? m.toUpperCase() : '', tag(T));
        empty(join(label || `${fmtNum(T)} K`), cur.c, `beyond the surface potentials reached${m !== 'deep' && T < 60 ? '; at low temperature the minority carriers limit the range' : ''}`);
        sets.push({ label, c: cur.c, w: cur.w, extra: c.psi ? [{ name: 'ψs (V)', v: cur.psi }] : [] });
      }
    return { xName: st === 'ms' ? 'E (V)' : 'V_G (V)', v, sets, cox: Number.isFinite(cox) ? cox : undefined, warnings };
  }
  if (st === 'pn' || st === 'schottky') {
    for (const T of temps) {
      const phiT = (KB * T) / QE;
      const { nc, nv, lnNi } = bands(c, T);
      let w: number[];
      if (st === 'pn') {
        const [NA, ND] = [more(c, 'na') * 1e6, more(c, 'nd') * 1e6];
        if (!(NA > 0) || !(ND > 0)) return 'C–V: N_A and N_D must be above 0.';
        if (more(c, 'profile') === 'graded') {
          const a = more(c, 'grad') * 1e8;
          if (!(a > 0)) return 'C–V: the gradient must be above 0.';
          const vbi = more(c, 'vbiFrom') === 'typed' ? more(c, 'vbi') : gradedVbi(a, es, phiT, lnNi);
          if (!(vbi > 0)) return 'C–V: no built-in voltage (the gradient too small for nᵢ).';
          w = v.map((V) => (V < vbi ? Math.cbrt((12 * es * (vbi - V)) / (QE * a)) : NaN));
        } else {
          const vbi = more(c, 'vbiFrom') === 'typed' ? more(c, 'vbi') : phiT * (Math.log(NA) + Math.log(ND) - 2 * lnNi);
          const neff = (NA * ND) / (NA + ND);
          w = v.map((V) => (V < vbi - 2 * phiT ? Math.sqrt((2 * es * (vbi - V - 2 * phiT)) / (QE * neff)) : NaN));
        }
      } else {
        const N = c.dop * 1e6;
        if (!(N > 0)) return 'C–V: the doping must be above 0.';
        const phiB = more(c, 'barrierFrom') === 'work' ? (c.type === 'n' ? c.phiM - c.chi : c.eg - (c.phiM - c.chi)) : more(c, 'phiB');
        const vbi = phiB - phiT * Math.log((c.type === 'n' ? nc : nv) / N);
        if (!(vbi > phiT)) return `C–V: the barrier (${fmtNum(phiB, 4)} eV) is too low for this doping: no depletion (ohmic).`;
        const sg = c.type === 'n' ? 1 : -1;
        w = v.map((V) => (sg * V < vbi - phiT ? Math.sqrt((2 * es * (vbi - sg * V - phiT)) / (QE * N)) : NaN));
      }
      const cs = w.map((q) => (es * A) / q);
      empty(tag(T), cs, 'in forward bias beyond where the depletion approximation holds');
      sets.push({ label: tag(T), c: cs, w });
    }
    return { xName: 'V (V)', v, sets, warnings };
  }
  if (st === 'gcs') {
    const [z, conc, ch] = [more(c, 'z'), more(c, 'conc'), more(c, 'ch')];
    if (!(z > 0) || !(conc > 0)) return 'C–V: the concentration and the charge number must be above 0.';
    const ew = EPS0 * more(c, 'epsW');
    const CH = ch > 0 ? ch * 1e-2 : Infinity;
    const n0 = conc * 1e3 * NAV;
    for (const T of temps) {
      const phiT = (KB * T) / QE;
      const cd0 = Math.sqrt((2 * z * z * QE * QE * ew * n0) / (KB * T));
      const s0 = Math.sqrt(8 * ew * KB * T * n0);
      const sigma = (p: number) => s0 * Math.sinh((z * p) / (2 * phiT));
      const out = v.map((E) => {
        const dE = E - more(c, 'epzc');
        const p = Number.isFinite(CH) ? solveUp((q) => q + sigma(q) / CH, dE, Math.min(0, dE), Math.max(0, dE)) : dE;
        const cd = cd0 * Math.cosh((z * p) / (2 * phiT));
        return { c: A / (1 / CH + 1 / cd), p, s: sigma(p) };
      });
      sets.push({ label: tag(T), c: out.map((q) => q.c), extra: c.psi ? [{ name: 'φ_d (V)', v: out.map((q) => q.p) }, { name: 'σ (µC/cm²)', v: out.map((q) => q.s * 100) }] : [] });
    }
    return { xName: 'E (V)', v, sets, warnings };
  }
  if (st === 'varactor') {
    const [cj0, vj, mj, fc] = [more(c, 'cj0') * 1e-12, more(c, 'vj'), more(c, 'mj'), more(c, 'fc')];
    if (!(cj0 > 0) || !(vj > 0) || !(mj > 0) || !(fc >= 0 && fc < 1)) return 'C–V: C_J0, V_J and M above 0, F_C from 0 to below 1.';
    const f1 = (1 - fc) ** -(1 + mj);
    sets.push({ label: '', c: v.map((V) => (V < fc * vj ? cj0 * (1 - V / vj) ** -mj : cj0 * f1 * (1 - fc * (1 + mj) + (mj * V) / vj))) });
    return { xName: 'V (V)', v, sets, warnings };
  }
  if (st === 'mim') {
    const t = more(c, 'tins') * 1e-9;
    if (!(t > 0) || !(more(c, 'epsI') > 0)) return 'C–V: the insulator thickness and permittivity must be above 0.';
    const c0 = (EPS0 * more(c, 'epsI') * A) / t;
    const [a1, a2] = [more(c, 'vcc1') * 1e-6, more(c, 'vcc2') * 1e-6];
    sets.push({ label: '', c: v.map((V) => c0 * (1 + a1 * V + a2 * V * V)) });
    return { xName: 'V (V)', v, sets, warnings };
  }
  // the ferroelectric capacitor
  const [ps, pr, ec, d] = [more(c, 'ps') * 1e-2, more(c, 'pr') * 1e-2, more(c, 'ec') * 1e5, more(c, 'tf') * 1e-9];
  if (!(ps > 0) || !(pr > 0 && pr < ps) || !(ec > 0) || !(d > 0)) return 'C–V: P_s above P_r above 0, E_c and the thickness above 0.';
  const delta = ec / Math.log((1 + pr / ps) / (1 - pr / ps));
  const eb = EPS0 * more(c, 'epsB');
  for (const [label, sg] of [['up', -1], ['down', 1]] as const) {
    const u = v.map((V) => (V / d + sg * ec) / (2 * delta));
    sets.push({ label, c: u.map((q) => (A * (eb + ps / (2 * delta) / Math.cosh(q) ** 2)) / d), extra: [{ name: 'P (µC/cm²)', v: u.map((q) => ps * Math.tanh(q) * 100) }] });
  }
  return { xName: 'V (V)', v, sets, warnings };
}

// the capacitance as measured at f in parallel mode, through a series resistance and with a leak across: C_m, G_m
export function measured(C: number, rs: number, gl: number, f: number): { c: number; g: number } {
  const w = 2 * Math.PI * f;
  const [yr, yi] = [gl, w * C];
  const den = yr * yr + yi * yi;
  const [zr, zi] = [rs + yr / den, -yi / den];
  const m = zr * zr + zi * zi;
  return { c: -zi / m / w, g: zr / m };
}
