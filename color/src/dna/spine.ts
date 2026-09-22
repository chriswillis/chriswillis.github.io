/**
 * Lightness spine: the monotone subsequence of steps that PCHIP is fit through,
 * plus the steps that sit off it (Radix's "bright" solids 9–10, which are
 * lighter than step 8 by design in light mode and jump ahead of the text steps
 * in dark mode).
 *
 * Algorithm: flatten tiny inversions (≤ flattenTol, e.g. Radix iris 10→11 at
 * 0.002). A ramp that is then monotone is its own spine — legitimate sharp
 * bends (Radix 11→12, Tailwind 900→950, Polaris' dense tints) are never
 * touched. Only a ramp with a real inversion loses steps: among the removal
 * sets that restore monotonicity (minimal size up to +2), choose the one whose
 * removed steps are all far from the spine bridged across them (maximize the
 * minimum residual), discounting extra removals. Radix's bright scales contain
 * an inversion in both modes (8→9 light, 10→11 dark); in dark mode step 11
 * sits 0.05 from the 10→12 bridge while 9 and 10 sit 0.2–0.3 from the 8→11
 * bridge, so 9–10 are detached in both modes — found without role knowledge.
 */
export type Direction = 'light-to-dark' | 'dark-to-light';

export interface SpineResult {
  direction: Direction;
  spine: number[];
  /** True when more than maxDetached steps had to go and a longest-monotone-subsequence fallback was used. */
  fallback?: boolean;
  detached: { index: number; delta: number }[];
  flattened: { index: number; from: number; to: number }[];
  /** L values to use for the spine fit (after flattening). */
  L: number[];
}

export function detectDirection(L: readonly number[]): Direction {
  const n = L.length;
  const k = Math.max(1, Math.floor(n / 3));
  const head = L.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const tail = L.slice(n - k).reduce((a, b) => a + b, 0) / k;
  return head >= tail ? 'light-to-dark' : 'dark-to-light';
}

function isMonotone(idx: readonly number[], v: readonly number[]): boolean {
  for (let k = 1; k < idx.length; k++) if (!(v[idx[k]!]! > v[idx[k - 1]!]!)) return false;
  return true;
}

/**
 * Outlier-ness of a removal set: bridge each gap linearly between the nearest
 * kept neighbours and take the smallest distance of any removed point from
 * its bridge. Every removed step must be off the spine, not just one of them.
 */
function minResidual(removed: readonly number[], keptSet: Set<number>, L: readonly number[]): number {
  let m = Infinity;
  const N = L.length;
  for (const i of removed) {
    let a = i - 1; while (a >= 0 && !keptSet.has(a)) a--;
    let b = i + 1; while (b < N && !keptSet.has(b)) b++;
    let bridge: number;
    if (a >= 0 && b < N) bridge = L[a]! + ((L[b]! - L[a]!) * (i - a)) / (b - a);
    else bridge = a >= 0 ? L[a]! : L[b]!;
    m = Math.min(m, Math.abs(L[i]! - bridge));
  }
  return m;
}

/** Enumerate index subsets of {0..N-1} of size k (combinations). */
function* combinations(N: number, k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i <= N - (k - acc.length); i++) yield* combinations(N, k, i + 1, [...acc, i]);
}

export interface SpineOptions {
  /** Inversions no larger than this are flattened onto the spine rather than detached. */
  flattenTol?: number;
  /** Multiplier (< 1) applied to a candidate's score per extra detached step beyond the minimum. */
  mu?: number;
  /** Multiplier (< 1) applied when a candidate detaches an endpoint (background or text end). */
  endpointPenalty?: number;
  maxDetached?: number;
}

export function findSpine(Lin: readonly number[], opts: SpineOptions = {}): SpineResult {
  const { flattenTol = 0.01, mu = 0.9, endpointPenalty = 0.3, maxDetached = 4 } = opts;
  const N = Lin.length;
  const direction = detectDirection(Lin);
  const sign = direction === 'light-to-dark' ? -1 : 1;
  const L = [...Lin];
  const flattened: SpineResult['flattened'] = [];
  for (let i = 1; i < N; i++) {
    const d = (L[i]! - L[i - 1]!) * sign;
    if (d <= 0 && -d <= flattenTol) {
      const to = L[i - 1]! + sign * 1e-4;
      flattened.push({ index: i, from: L[i]!, to });
      L[i] = to;
    }
  }
  const v = L.map((x) => x * sign); // increasing in the scale's direction
  const all = Array.from({ length: N }, (_, i) => i);
  if (isMonotone(all, v)) return { direction, spine: all, detached: [], flattened, L };

  // The sequence has a real inversion. Consider removal sets from the minimal
  // size up to two more, keep those that restore monotonicity, and pick the one
  // whose removed steps are all farthest from the bridged spine.
  let best: { spine: number[]; score: number } | null = null;
  let kMin = -1;
  const K = Math.min(maxDetached, Math.max(0, N - 3));
  for (let k = 1; k <= K; k++) {
    if (kMin >= 0 && k > kMin + 2) break;
    for (const removed of combinations(N, k)) {
      const rm = new Set(removed);
      const spine = all.filter((i) => !rm.has(i));
      if (!isMonotone(spine, v)) continue;
      if (kMin < 0) kMin = k;
      let score = minResidual(removed, new Set(spine), L) * Math.pow(mu, k - kMin);
      if (rm.has(0) || rm.has(N - 1)) score *= endpointPenalty;
      if (!best || score > best.score) best = { spine, score };
    }
  }
  let fallback = false;
  if (!best) {
    // Too many inversions for the bounded search: longest monotone subsequence
    // that keeps the first step, as a last resort. The ramp is flagged.
    fallback = true;
    const len = new Array<number>(N).fill(1);
    const prev = new Array<number>(N).fill(-1);
    for (let i = 0; i < N; i++) for (let j = 0; j < i; j++) if (v[j]! < v[i]! && len[j]! + 1 > len[i]!) { len[i] = len[j]! + 1; prev[i] = j; }
    let end = 0;
    for (let i = 0; i < N; i++) if (len[i]! > len[end]!) end = i;
    const spine: number[] = [];
    for (let i = end; i >= 0; i = prev[i]!) spine.unshift(i);
    best = { spine, score: 0 };
  }
  const inSpine = new Set(best.spine);
  const detached: SpineResult['detached'] = [];
  for (let i = 0; i < N; i++) {
    if (inSpine.has(i)) continue;
    let p = i - 1;
    while (p >= 0 && !inSpine.has(p)) p--;
    detached.push({ index: i, delta: p >= 0 ? L[i]! - L[p]! : 0 });
  }
  return { direction, spine: best.spine, detached, flattened, L, ...(fallback ? { fallback: true } : {}) };
}
