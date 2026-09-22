/**
 * Curve fitters for DNA. Both are interpolating (pass through every knot) and
 * are reconstructed from knots alone, so a serialized DNA needs only the knots
 * and the method name. Knots are (x, y) with x strictly increasing in [0, 1].
 *
 *  - pchip: Fritsch–Carlson monotone cubic Hermite. If the knots are monotone,
 *    the curve is monotone between them (no overshoot). Used for L.
 *  - catmullRom: uniform Catmull-Rom with reflected phantom endpoints. Smooth,
 *    interpolating, allows the non-monotone paths chroma and hue drift take.
 */

export interface Curve {
  (x: number): number;
  readonly method: 'pchip' | 'catmull-rom' | 'linear';
  readonly xs: readonly number[];
  readonly ys: readonly number[];
}

function checkKnots(xs: readonly number[], ys: readonly number[]): void {
  if (xs.length !== ys.length) throw new Error('curves: xs and ys length mismatch');
  if (xs.length < 2) throw new Error('curves: need at least 2 knots');
  for (let i = 1; i < xs.length; i++) if (!(xs[i]! > xs[i - 1]!)) throw new Error('curves: xs must be strictly increasing');
  for (const v of ys) if (!Number.isFinite(v)) throw new Error('curves: non-finite y');
}

/** Largest i with xs[i] <= x, clamped to [0, n-2]. */
function segment(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Fritsch–Carlson tangents. */
function pchipSlopes(xs: readonly number[], ys: readonly number[]): number[] {
  const n = xs.length;
  const h = Array.from({ length: n - 1 }, (_, i) => xs[i + 1]! - xs[i]!);
  const d = Array.from({ length: n - 1 }, (_, i) => (ys[i + 1]! - ys[i]!) / h[i]!);
  const m = new Array<number>(n).fill(0);
  if (n === 2) return [d[0]!, d[0]!];
  for (let i = 1; i < n - 1; i++) {
    const d0 = d[i - 1]!;
    const d1 = d[i]!;
    if (d0 === 0 || d1 === 0 || Math.sign(d0) !== Math.sign(d1)) {
      m[i] = 0; // local extremum or flat: zero tangent preserves monotonicity
    } else {
      // weighted harmonic mean (Fritsch–Butland), preserves monotonicity
      const w1 = 2 * h[i]! + h[i - 1]!;
      const w2 = h[i]! + 2 * h[i - 1]!;
      m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
    }
  }
  // endpoints: one-sided three-point formula, shape-preserving (SciPy's approach)
  const end = (h0: number, h1: number, d0: number, d1: number): number => {
    let t = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(t) !== Math.sign(d0)) t = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(t) > Math.abs(3 * d0)) t = 3 * d0;
    return t;
  };
  m[0] = end(h[0]!, h[1]!, d[0]!, d[1]!);
  m[n - 1] = end(h[n - 2]!, h[n - 3]!, d[n - 2]!, d[n - 3]!);
  return m;
}

function hermite(x0: number, x1: number, y0: number, y1: number, m0: number, m1: number, x: number): number {
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1;
}

export function pchip(xs: readonly number[], ys: readonly number[]): Curve {
  checkKnots(xs, ys);
  const m = pchipSlopes(xs, ys);
  const f = ((x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[xs.length - 1]!) return ys[ys.length - 1]!;
    const i = segment(xs, x);
    return hermite(xs[i]!, xs[i + 1]!, ys[i]!, ys[i + 1]!, m[i]!, m[i + 1]!, x);
  }) as Curve;
  Object.defineProperties(f, { method: { value: 'pchip' }, xs: { value: xs }, ys: { value: ys } });
  return f;
}

/**
 * Catmull-Rom on non-uniform knots, expressed as a cubic Hermite with
 * tangents m_i = (y_{i+1} − y_{i−1}) / (x_{i+1} − x_{i−1}); endpoints use the
 * one-sided secant. Interpolating and C1.
 */
export function catmullRom(xs: readonly number[], ys: readonly number[]): Curve {
  checkKnots(xs, ys);
  const n = xs.length;
  const m = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    m[i] = (ys[b]! - ys[a]!) / (xs[b]! - xs[a]!);
  }
  const f = ((x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    const i = segment(xs, x);
    return hermite(xs[i]!, xs[i + 1]!, ys[i]!, ys[i + 1]!, m[i]!, m[i + 1]!, x);
  }) as Curve;
  Object.defineProperties(f, { method: { value: 'catmull-rom' }, xs: { value: xs }, ys: { value: ys } });
  return f;
}

export function linear(xs: readonly number[], ys: readonly number[]): Curve {
  checkKnots(xs, ys);
  const n = xs.length;
  const f = ((x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    const i = segment(xs, x);
    const t = (x - xs[i]!) / (xs[i + 1]! - xs[i]!);
    return ys[i]! + t * (ys[i + 1]! - ys[i]!);
  }) as Curve;
  Object.defineProperties(f, { method: { value: 'linear' }, xs: { value: xs }, ys: { value: ys } });
  return f;
}

export type FitMethod = Curve['method'];

export function fit(method: FitMethod, xs: readonly number[], ys: readonly number[]): Curve {
  switch (method) {
    case 'pchip': return pchip(xs, ys);
    case 'catmull-rom': return catmullRom(xs, ys);
    case 'linear': return linear(xs, ys);
  }
}

export function sample(curve: Curve, grid: readonly number[]): number[] {
  return grid.map((x) => curve(x));
}

/** Uniform grid on [0, 1] with `count` points. */
export function grid(count = 21): number[] {
  return Array.from({ length: count }, (_, i) => i / (count - 1));
}

/**
 * Invert a monotone curve: find x in [xs[0], xs[last]] with curve(x) = y.
 * Bisection; requires the curve to be monotone (pchip on monotone knots).
 * Returns null if y is outside the curve's range.
 *
 * The range check carries a relative slack, and it is not cosmetic. The
 * endpoints `y0` and `y1` are themselves *evaluated*, not read off the knots, so
 * they carry the rounding error of the Hermite form; on a segment whose true
 * variation is near the ulp level the evaluation can land an ulp or two past its
 * own endpoint. A strict comparison then rejects a `y` the caller got from this
 * very curve — `invertMonotone(f, f(x))` returning null. Anything genuinely out
 * of range is out by far more than this, and a `y` a rounding error outside
 * bisects to the endpoint, which is the answer the caller wants.
 */
export function invertMonotone(curve: Curve, y: number, tol = 1e-9): number | null {
  const x0 = curve.xs[0]!;
  const x1 = curve.xs[curve.xs.length - 1]!;
  const y0 = curve(x0);
  const y1 = curve(x1);
  const inc = y1 > y0;
  const slack = 1e-12 * Math.max(1, Math.abs(y0), Math.abs(y1));
  if (inc ? (y < y0 - slack || y > y1 + slack) : (y > y0 + slack || y < y1 - slack)) return null;
  let lo = x0;
  let hi = x1;
  for (let k = 0; k < 200 && hi - lo > tol; k++) {
    const mid = (lo + hi) / 2;
    if ((curve(mid) < y) === inc) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
