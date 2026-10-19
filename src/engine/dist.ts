// Probability distributions for the statistical tests: normal, Student's t, F, χ², the studentized range (Tukey), the
// binomial. Accurate to ~1e-12 in the body and in the tails (the upper tails computed directly, not as 1 − cdf).

// ---- gamma and beta functions ----
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// A continued fraction b0 + a1 / (b1 + a2 / (b2 + …)), evaluated forward by the modified Lentz method (W. J. Lentz,
// Appl. Opt. 15, 668 (1976); I. J. Thompson & A. R. Barnett, J. Comput. Phys. 64, 490 (1986)): the value as the product
// of the ratios C_j·D_j of successive convergents, a zero denominator replaced by a tiny number.
export function continuedFraction(b0: number, a: (j: number) => number, b: (j: number) => number, eps = 1e-16, maxTerms = 5000): number {
  const TINY = 1e-300;
  const nz = (v: number) => (Math.abs(v) < TINY ? TINY : v);
  let f = nz(b0);
  let C = f;
  let D = 0;
  for (let j = 1; j <= maxTerms; j++) {
    const [aj, bj] = [a(j), b(j)];
    D = 1 / nz(bj + aj * D);
    C = nz(bj + aj / C);
    const ratio = C * D;
    f *= ratio;
    if (Math.abs(ratio - 1) < eps) break;
  }
  return f;
}
// the regularized incomplete beta I_x(a, b), and its complement 1 − I_x(a, b) computed directly: the continued fraction
// of DLMF 8.17.22, I_x(a, b) = x^a (1 − x)^b / (a B(a, b)) · 1 / (1 + d1 / (1 + d2 / (1 + …))) with
// d_2m = m (b − m) x / ((a + 2m − 1)(a + 2m)) and d_2m+1 = −(a + m)(a + b + m) x / ((a + 2m)(a + 2m + 1)); it converges
// fast for x < (a + 1) / (a + b + 2) — beyond, through I_x(a, b) = 1 − I_1−x(b, a) (DLMF 8.17.4).
function ibetaFraction(a: number, b: number, x: number): number {
  const d = (k: number) => {
    const m = Math.floor(k / 2);
    return k % 2 === 0 ? (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m)) : (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
  };
  // 1 / (1 + d1 / (1 + d2 / …)) = 0 + 1 / (1 + d1 / (1 + …))
  return continuedFraction(0, (j) => (j === 1 ? 1 : d(j - 1)), () => 1);
}
export function ibeta(a: number, b: number, x: number, upper = false): number {
  if (x <= 0) return upper ? 1 : 0;
  if (x >= 1) return upper ? 0 : 1;
  const front = Math.exp(a * Math.log(x) + b * Math.log1p(-x) - (lgamma(a) + lgamma(b) - lgamma(a + b)));
  if (x < (a + 1) / (a + b + 2)) {
    const v = (front * ibetaFraction(a, b, x)) / a;
    return upper ? 1 - v : v;
  }
  const w = (front * ibetaFraction(b, a, 1 - x)) / b;
  return upper ? w : 1 - w;
}
// the regularized incomplete gamma P(a, x), and Q = 1 − P computed directly. For x < a + 1 the series of DLMF 8.7.1,
// P(a, x) = x^a e^−x / Γ(a + 1) · Σ_k x^k / ((a + 1)(a + 2) … (a + k)); beyond, Legendre's continued fraction (DLMF 8.9.2),
// Γ(a, x) = x^a e^−x / (x + 1 − a − 1·(1 − a) / (x + 3 − a − 2·(2 − a) / (x + 5 − a − …))).
export function igamma(a: number, x: number, upper = false): number {
  if (x <= 0) return upper ? 1 : 0;
  if (x < a + 1) {
    let term = 1;
    let sum = 1;
    for (let k = 1; k < 5000; k++) {
      term *= x / (a + k);
      sum += term;
      if (term < sum * 1e-17) break;
    }
    const p = Math.exp(a * Math.log(x) - x - lgamma(a + 1)) * sum;
    return upper ? 1 - p : p;
  }
  const frac = continuedFraction(
    0,
    (j) => (j === 1 ? 1 : -(j - 1) * (j - 1 - a)),
    (j) => x + 2 * j - 1 - a,
  );
  const q = Math.exp(a * Math.log(x) - x - lgamma(a)) * frac;
  return upper ? q : 1 - q;
}

// ---- normal ----
// erfc(x) = Q(1/2, x²) for x ≥ 0 (the incomplete gamma: accurate far into the tails)
export function erfc(x: number): number {
  if (x === 0) return 1;
  const q = igamma(0.5, x * x, true);
  return x > 0 ? q : 2 - q;
}
export const normCdf = (z: number) => 0.5 * erfc(-z / Math.SQRT2);
export const normSf = (z: number) => 0.5 * erfc(z / Math.SQRT2);
// the quantile (Acklam's approximation, refined by one Halley step)
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x: number;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > 1 - 0.02425) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// ---- Student's t, F, χ² ----
export function tCdf(t: number, nu: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const p = 0.5 * ibeta(nu / 2, 0.5, nu / (nu + t * t));
  return t >= 0 ? 1 - p : p;
}
export const tSf = (t: number, nu: number) => tCdf(-t, nu);
// the two-sided p of a t statistic
export const tP2 = (t: number, nu: number) => Math.min(1, 2 * tCdf(-Math.abs(t), nu));
export function tInv(p: number, nu: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // a start from the normal, then bisection on a bracket and Newton
  let [lo, hi] = [-1, 1];
  while (tCdf(lo, nu) > p) lo *= 2;
  while (tCdf(hi, nu) < p) hi *= 2;
  for (let k = 0; k < 200 && hi - lo > 1e-14 * Math.max(1, Math.abs(lo)); k++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, nu) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
// ---- integrals over the scale of a t-like statistic ----
// The nodes and weights of n-point Gauss–Legendre quadrature on [−1, 1]: the roots of the Legendre polynomial P_n by
// Newton's method from cos(π (i − 1/4) / (n + 1/2)), the weights 2 / ((1 − x²) P_n′(x)²).
function gaussLegendre(n: number): { x: number[]; w: number[] } {
  const x: number[] = [];
  const w: number[] = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let dp = 1;
    for (let it = 0; it < 100; it++) {
      // P_n(z) and P_n−1(z) by the three-term recurrence
      let [p0, p1] = [1, z];
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
const GL10 = gaussLegendre(10);
// ∫ f over [a, b] in `panels` pieces, each by 10-point Gauss–Legendre
function integrate(f: (x: number) => number, a: number, b: number, panels: number): number {
  const h = (b - a) / panels;
  let sum = 0;
  for (let k = 0; k < panels; k++) {
    const mid = a + (k + 0.5) * h;
    for (let i = 0; i < 10; i++) sum += GL10.w[i] * f(mid + (h / 2) * GL10.x[i]);
  }
  return (sum * h) / 2;
}
// E[g(S)] for S = √(χ²_ν / ν), the scale of a t-like statistic: over u = ln S, where its density is
// exp(c + ν u − ν e^{2u} / 2), c = (ν/2) ln ν − ln Γ(ν/2) − (ν/2 − 1) ln 2; the range where that density is above e^−50 of
// its peak (at u = 0).
function overScale(nu: number, g: (s: number) => number): number {
  const c = (nu / 2) * Math.log(nu) - lgamma(nu / 2) - (nu / 2 - 1) * Math.LN2;
  const rel = (u: number) => nu * u - (nu * Math.expm1(2 * u)) / 2; // ln density − its value at the peak
  const width = 1 / Math.sqrt(2 * nu);
  let lo = 0;
  let hi = 0;
  while (rel(lo) > -50) lo -= width;
  while (rel(hi) > -50) hi += width;
  const peak = c - nu / 2;
  // a panel for every two widths of the peak or so (a small ν: a long tail towards S = 0)
  return integrate((u) => Math.exp(peak + rel(u)) * g(Math.exp(u)), lo, hi, Math.max(10, Math.ceil((hi - lo) / (2 * width))));
}

// The noncentral t: P(T ≤ t) for T = (Z + δ) / S with ν degrees of freedom — from its definition, E[Φ(t S − δ)] over the
// scale S (ν above 10⁵: S = 1, the normal limit); its quantile by bisection.
export function nctCdf(t: number, nu: number, delta: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  if (nu > 1e5) return normCdf(t - delta);
  return Math.min(1, Math.max(0, overScale(nu, (s) => normCdf(t * s - delta))));
}
export function nctInv(p: number, nu: number, delta: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let [lo, hi] = [delta - 1, delta + 1];
  for (let k = 1; nctCdf(lo, nu, delta) > p && k < 60; k++) lo = delta - 2 ** k;
  for (let k = 1; nctCdf(hi, nu, delta) < p && k < 60; k++) hi = delta + 2 ** k;
  for (let k = 0; k < 200 && hi - lo > 1e-13 * Math.max(1, Math.abs(lo)); k++) {
    const mid = (lo + hi) / 2;
    if (nctCdf(mid, nu, delta) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export const fSf = (f: number, d1: number, d2: number) => (f <= 0 ? 1 : ibeta(d2 / 2, d1 / 2, d2 / (d2 + d1 * f)));
export const fCdf = (f: number, d1: number, d2: number) => 1 - fSf(f, d1, d2);
export const chi2Sf = (x: number, k: number) => igamma(k / 2, x / 2, true);
export const chi2Cdf = (x: number, k: number) => igamma(k / 2, x / 2);

// ---- the binomial ----
export function binomPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  return Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log1p(-p));
}
// the two-sided exact p (the outcomes no more likely than k)
export function binomTest2(k: number, n: number, p = 0.5): number {
  const d = binomPmf(k, n, p);
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const q = binomPmf(i, n, p);
    if (q <= d * (1 + 1e-7)) s += q;
  }
  return Math.min(1, s);
}

// ---- the studentized range (Tukey's HSD): P(Q ≤ q) for k means and ν degrees of freedom ----
// From its definition: Q = W / S, the range W of k standard normals over the scale S above, so P(Q ≤ q) = E[P(W ≤ q S)]
// over S (ν above 10⁵: S = 1), with P(W ≤ w) = k ∫ φ(z) (Φ(z + w) − Φ(z))^{k−1} dz over z in [−8.5, 8.5] (φ beyond it below
// 10⁻¹⁶), the nodes there and their φ, Φ computed once.
const RANGE_Z = (() => {
  const [a, b, panels] = [-8.5, 8.5, 17];
  const h = (b - a) / panels;
  const z: number[] = [];
  const wt: number[] = [];
  for (let k = 0; k < panels; k++)
    for (let i = 0; i < 10; i++) {
      z.push(a + (k + 0.5) * h + (h / 2) * GL10.x[i]);
      wt.push((GL10.w[i] * h) / 2);
    }
  return { z, wt, phi: z.map((v) => Math.exp(-v * v / 2) / Math.sqrt(2 * Math.PI)), Phi: z.map(normCdf) };
})();
function rangeCdf(w: number, k: number): number {
  if (!(w > 0)) return 0;
  const { z, wt, phi, Phi } = RANGE_Z;
  let sum = 0;
  for (let i = 0; i < z.length; i++) {
    // beyond 8.3 Φ is 1 to within 1e-16
    const zw = z[i] + w;
    const d = (zw > 8.3 ? 1 : normCdf(zw)) - Phi[i];
    if (d > 0) sum += wt[i] * phi[i] * d ** (k - 1);
  }
  return Math.min(1, k * sum);
}
export function ptukey(q: number, k: number, df: number): number {
  if (!(q > 0)) return 0;
  if (df > 1e5) return rangeCdf(q, k);
  return Math.min(1, Math.max(0, overScale(df, (s) => rangeCdf(q * s, k))));
}
