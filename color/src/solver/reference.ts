/**
 * Reference selection: from a SystemDNA and a target peak hue, produce the
 * per-step reference curves to transfer. Uses the two nearest hue families
 * blended by inverse angular distance (decision #8), the aggregate when the
 * nearest family is more than 2σ away, or a forced family.
 */
import type { SystemDNA, FamilyDNA } from '../dna/schema.ts';
import { familyCurves } from '../dna/system.ts';
import { linear, pchip, catmullRom, type Curve } from '../dna/curves.ts';
import { hueDelta, wrap360 } from '../color/oklch.ts';
import { shell, type Gamut, type GamutShell } from '../gamut/shell.ts';
import { deltaEOK, type Oklch } from '../color/oklch.ts';

export interface ReferenceCurves {
  keys: string[];
  n: number[];
  /** Spine-fitted L per step (detached steps carry their own authored L). */
  L: number[];
  spine: number[];
  detached: { index: number; role?: string }[];
  C: number[];
  relC: number[];
  /** Reference hue per step (absolute) and drift from the peak step. */
  h: number[];
  dh: number[];
  peakIndex: number;
  keyIndex: number;
  /** Reference contrast of each step against the reference's canonical surface: white for light scales, its own step 0 for dark scales. */
  apcaRef: number[];
  wcagRef: number[];
  contrastSurface: 'white' | 'step0';
  /** Blend weight per step. */
  w: number[];
  /** Continuous versions of the curves over n (spine PCHIP for L; Catmull-Rom for C, relC, dh; linear for w and contrast). */
  curves: { L: Curve; C: Curve; relC: Curve; dh: Curve; w: Curve; apcaRef: Curve; wcagRef: Curve; domain: [number, number] };
  selection: { families: { family: string; weight: number; deltaDeg: number }[]; rule: 'forced' | 'nearest-two' | 'aggregate' };
}

function evalFamilyAt(f: FamilyDNA, ns: readonly number[], gamut: Gamut, surface: 'white' | 'step0') {
  const c = familyCurves(f);
  const k = f.knots;
  const lin = (ys: number[]) => linear(k.n, ys);
  const relC = c.relC(gamut);
  return {
    n: [...ns],
    L: ns.map((x) => c.L(x)),
    C: ns.map((x) => Math.max(0, c.C(x))),
    relC: ns.map((x) => Math.max(0, relC(x))),
    h: ns.map((x) => wrap360(c.h(x))),
    dh: ns.map((x) => c.dh(x)),
    apcaRef: ns.map(lin(surface === 'white' ? k.contrast.apcaOnWhite : k.contrast.apcaOnFirst)),
    wcagRef: ns.map(lin(surface === 'white' ? k.contrast.wcagVsWhite : k.contrast.wcagVsFirst)),
  };
}

function wAt(dna: SystemDNA, ns: readonly number[]): number[] {
  const w = dna.chroma.w;
  const xs = dna.chroma.basis === 'grid' ? dna.grid : Array.from({ length: w.length }, (_, i) => (w.length > 1 ? i / (w.length - 1) : 0));
  const f = linear(xs, w);
  return ns.map((x) => Math.min(1, Math.max(0, f(x))));
}

export interface SelectOptions {
  family?: string;
  gamut: Gamut;
  /** Override the step grid (renumbering). Detached steps cannot be renumbered and are dropped. */
  n?: number[];
  keys?: string[];
  sigmaFallback?: number;
}

export function selectReference(dna: SystemDNA, targetHue: number, opts: SelectOptions): ReferenceCurves {
  const fams = Object.values(dna.families);
  if (fams.length === 0) throw new Error('selectReference: DNA has no families');
  const ranked = fams
    .map((f) => ({ f, d: Math.abs(hueDelta(targetHue, f.hueAtPeak)) }))
    .sort((a, b) => a.d - b.d);

  let chosen: { f: FamilyDNA; weight: number; d: number }[];
  let rule: ReferenceCurves['selection']['rule'];
  if (opts.family) {
    const f = dna.families[opts.family];
    if (!f) throw new Error(`selectReference: family "${opts.family}" not in ${dna.id}`);
    chosen = [{ f, weight: 1, d: Math.abs(hueDelta(targetHue, f.hueAtPeak)) }];
    rule = 'forced';
  } else {
    const a = ranked[0]!;
    const b = ranked[1];
    // The target is covered when the two nearest families bracket it. Otherwise it lies
    // beyond the system's hue coverage and falls back to the aggregate once it is more
    // than 2σ past the nearest family — with σ floored at 10°, because a sparse
    // published family (Radix violet: σ 2.1°) would otherwise trigger the fallback on
    // any seed a few degrees off its peak.
    const da = hueDelta(targetHue, a.f.hueAtPeak);
    const db = b ? hueDelta(targetHue, b.f.hueAtPeak) : NaN;
    const bracketed = Number.isFinite(da) && Number.isFinite(db) && Math.sign(da) !== Math.sign(db);
    const sigma = Math.max(a.f.classification?.sigma ?? opts.sigmaFallback ?? 15, 10);
    if (!b || (!bracketed && a.d > 2 * sigma)) {
      chosen = fams.map((f) => ({ f, weight: 1 / fams.length, d: Math.abs(hueDelta(targetHue, f.hueAtPeak)) }));
      rule = 'aggregate';
    } else {
      const total = a.d + b.d;
      const wa = !Number.isFinite(total) || total === 0 ? 1 : b.d / total;
      chosen = [{ f: a.f, weight: wa, d: a.d }, { f: b.f, weight: 1 - wa, d: b.d }].filter((x) => x.weight > 1e-9);
      rule = 'nearest-two';
    }
  }
  // never leave the caller with nothing to blend
  if (chosen.length === 0) chosen = [{ f: ranked[0]!.f, weight: 1, d: ranked[0]!.d }];

  // step grid: the nearest (highest-weight) family's own steps unless renumbering
  const base = chosen.reduce((p, q) => (q.weight > p.weight ? q : p)).f;
  const renumber = !!opts.n;
  const ns = opts.n ?? base.knots.n;
  const keys = opts.keys ?? (renumber ? ns.map((_, i) => String(i)) : base.knots.key);

  const surface: 'white' | 'step0' = dna.mode === 'light' ? 'white' : 'step0';
  const parts = chosen.map((c) => ({ w: c.weight, v: evalFamilyAt(c.f, ns, opts.gamut, surface) }));
  const mix = (pick: (v: ReturnType<typeof evalFamilyAt>) => number[]) => ns.map((_, i) => parts.reduce((s, p) => s + p.w * pick(p.v)[i]!, 0));
  // hue: the transferable quantity is drift from the peak step, so mix dh directly
  // (mixing absolute hues would smear unrelated families' hues into the target).
  const dhMix = mix((v) => v.dh);

  // spine/detached from the base family; when blending, a detached step keeps its authored L per family
  const spine = renumber ? ns.map((_, i) => i) : [...base.spine.indices];
  const detached = renumber ? [] : base.spine.detached.map((d) => ({ index: d.index, ...(d.role ? { role: d.role } : {}) }));
  const L = mix((v) => v.L);
  if (!renumber) {
    for (const d of base.spine.detached) {
      // use authored L for detached steps (weighted across chosen families that also detach it; else base)
      L[d.index] = parts.reduce((s, p, k) => s + p.w * (chosen[k]!.f.knots.L[d.index] ?? base.knots.L[d.index]!), 0);
    }
  }
  const Cmix = mix((v) => v.C);
  const peakIndex = renumber ? Cmix.reduce((bi, _, i) => (Cmix[i]! > Cmix[bi]! ? i : bi), 0) : base.peakIndex;
  const dh = dhMix.map((d) => d - dhMix[peakIndex]!);
  const hMix = dh.map((d) => wrap360(base.hueAtPeak + d));

  const relCmix = mix((v) => v.relC);
  const apcaMix = mix((v) => v.apcaRef);
  const wcagMix = mix((v) => v.wcagRef);
  const wArr = wAt(dna, ns);
  const spineN = spine.map((i) => ns[i]!);
  const curves = {
    L: pchip(spineN, spine.map((i) => L[i]!)),
    C: catmullRom(ns, Cmix),
    relC: catmullRom(ns, relCmix),
    dh: catmullRom(ns, dh),
    w: linear(ns, wArr),
    apcaRef: linear(ns, apcaMix),
    wcagRef: linear(ns, wcagMix),
    domain: [spineN[0]!, spineN[spineN.length - 1]!] as [number, number],
  };

  return {
    keys,
    n: [...ns],
    L,
    spine,
    detached,
    C: Cmix,
    relC: relCmix,
    h: hMix,
    dh,
    peakIndex,
    keyIndex: renumber ? peakIndex : base.keyIndex,
    apcaRef: apcaMix,
    wcagRef: wcagMix,
    contrastSurface: surface,
    w: wArr,
    curves,
    selection: { families: chosen.map((c) => ({ family: c.f.family, weight: c.weight, deltaDeg: c.d })), rule },
  };
}


/** Color on the target path at parameter n, before the seed's chroma gain. */
function pathColor(ref: ReferenceCurves, n: number, targetHue: number, sh: GamutShell, lAt: (x: number) => number, gain = 1) {
  const L = lAt(n);
  const h = wrap360(targetHue + ref.curves.dh(n));
  const w = Math.min(1, Math.max(0, ref.curves.w(n)));
  const C = Math.max(0, gain * (w * ref.curves.relC(n) * sh.cuspChroma(L, h) + (1 - w) * ref.curves.C(n)));
  return { l: L, c: C, h };
}

export interface RespaceOptions {
  targetHue: number;
  gamut: Gamut;
  /** Pin this lightness to the spine position `seedSpinePos` (index within the spine). */
  seedL?: number;
  seedSpinePos?: number;
  /** The seed's chroma gain, so the arc length reflects the colors actually emitted. */
  chromaGain?: number;
  samples?: number;
  /**
   * The ruler the arc length is measured with. Defaults to ΔEOK.
   *
   * Worth exposing because the choice is load-bearing and ΔEOK has a blind spot:
   * it has no Helmholtz–Kohlrausch term, so it does not know that a saturated
   * step looks brighter than its lightness. A ramp sweeps chroma from near zero
   * at its ends to a peak in the middle, which is exactly the axis being
   * equalised — measured across the corpus (`spike/phase6-spacing.ts`), ramps
   * that are even by ΔEOK (mean CV 0.035) come out at CV 0.263 when remeasured
   * in apparent lightness, and the worst are the magentas, pinks and purples the
   * effect predicts. Passing `deltaEHK` equalises what the eye sees instead, at
   * the cost of making the *measured* steps uneven.
   */
  metric?: (a: Oklch, b: Oklch) => number;
}

/**
 * Re-place the spine steps at equal perceptual distance (ΔEOK) along the
 * reference's own curve. The DNA — chroma policy w(n), relative-chroma shape,
 * hue drift, and the endpoints — is unchanged; only where the steps sit on it
 * moves. Needed because several references number by role, not by even
 * spacing: Radix spends 8 of 12 steps above L 0.7 and then drops 0.17 into the
 * solid (CV of step ΔEOK 0.90), Polaris packs 10 tints into L 0.99–0.80
 * (CV 0.61), while Carbon and Spectrum are already even (0.14, 0.15).
 *
 * With a seed, the step that holds it keeps its exact lightness and each side
 * of it is evenly spaced, so the two halves can differ slightly; the solved
 * ramp reports both. Detached steps (Radix's bright solids) are not on the
 * spine and keep their authored offset from the preceding spine step.
 */
export function respaceEven(ref: ReferenceCurves, opts: RespaceOptions): ReferenceCurves {
  const sh = shell(opts.gamut);
  const M = ref.spine.length;
  if (M < 3) return ref;
  const [n0, n1] = ref.curves.domain;

  // A seed outside the curve's own lightness range stretches the lightness axis so the
  // ramp reaches it, holding the far endpoint fixed. Without this the pinned end step
  // would sit a long way past its neighbour and the "even" ramp would end in a cliff.
  let lAt = (x: number) => ref.curves.L(x);
  if (opts.seedL !== undefined && opts.seedSpinePos !== undefined) {
    const La = ref.curves.L(n0), Lb = ref.curves.L(n1);
    const lo = Math.min(La, Lb), hi = Math.max(La, Lb);
    if (opts.seedL < lo - 1e-9 || opts.seedL > hi + 1e-9) {
      const nearAtStart = opts.seedSpinePos === 0;
      const Lfar = nearAtStart ? Lb : La;
      const b = (opts.seedL - Lfar) / ((nearAtStart ? La : Lb) - Lfar);
      if (b > 0.1 && b < 5) lAt = (x: number) => Lfar + b * (ref.curves.L(x) - Lfar);
    }
  }

  const J = opts.samples ?? 400;
  const metric = opts.metric ?? deltaEOK;
  const ns: number[] = [];
  const cum: number[] = [0];
  for (let j = 0; j <= J; j++) ns.push(n0 + ((n1 - n0) * j) / J);
  for (let j = 1; j <= J; j++) {
    cum.push(cum[j - 1]! + metric(pathColor(ref, ns[j - 1]!, opts.targetHue, sh, lAt, opts.chromaGain ?? 1), pathColor(ref, ns[j]!, opts.targetHue, sh, lAt, opts.chromaGain ?? 1)));
  }
  const S = cum[J]!;
  if (!(S > 0)) return ref;
  const sToN = (s: number): number => {
    if (s <= 0) return n0;
    if (s >= S) return n1;
    let lo = 0, hi = J;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid]! <= s) lo = mid; else hi = mid; }
    const t = (s - cum[lo]!) / (cum[lo + 1]! - cum[lo]! || 1);
    return ns[lo]! + t * (ns[lo + 1]! - ns[lo]!);
  };

  // target arc positions for the spine steps
  let targets: number[];
  const k = opts.seedSpinePos;
  if (opts.seedL !== undefined && k !== undefined && k >= 0 && k < M) {
    const nStar = invertPathL(lAt, opts.seedL, n0, n1);
    let sStar = 0;
    { // arc position of nStar
      let lo = 0; while (lo < J && ns[lo + 1]! < nStar) lo++;
      const t = (nStar - ns[lo]!) / (ns[Math.min(lo + 1, J)]! - ns[lo]! || 1);
      sStar = cum[lo]! + t * ((cum[Math.min(lo + 1, J)]! ?? cum[lo]!) - cum[lo]!);
    }
    targets = Array.from({ length: M }, (_, i) => {
      if (i === k) return sStar;
      if (i < k) return k === 0 ? sStar : (sStar * i) / k;
      return k === M - 1 ? sStar : sStar + ((S - sStar) * (i - k)) / (M - 1 - k);
    });
  } else {
    targets = Array.from({ length: M }, (_, i) => (S * i) / (M - 1));
  }

  const n = [...ref.n];
  for (let i = 0; i < M; i++) n[ref.spine[i]!] = sToN(targets[i]!);
  if (opts.seedL !== undefined && k !== undefined && k >= 0 && k < M) n[ref.spine[k]!] = invertPathL(lAt, opts.seedL, n0, n1);

  // re-evaluate at the new parameters
  const L = [...ref.L], C = [...ref.C], relC = [...ref.relC], dh = [...ref.dh], h = [...ref.h];
  const w = [...ref.w], apcaRef = [...ref.apcaRef], wcagRef = [...ref.wcagRef];
  for (const i of ref.spine) {
    const x = n[i]!;
    L[i] = lAt(x);
    C[i] = Math.max(0, ref.curves.C(x));
    relC[i] = Math.max(0, ref.curves.relC(x));
    dh[i] = ref.curves.dh(x);
    h[i] = wrap360(opts.targetHue + dh[i]!);
    w[i] = Math.min(1, Math.max(0, ref.curves.w(x)));
    apcaRef[i] = ref.curves.apcaRef(x);
    wcagRef[i] = ref.curves.wcagRef(x);
  }
  if (opts.seedL !== undefined && k !== undefined && k >= 0 && k < M) L[ref.spine[k]!] = opts.seedL;
  /**
   * Detached steps keep their offset from the spine step they hang off — but the
   * anchor has just moved, and moving a detached step by the same amount can push
   * it off the end of the lightness axis. Radix's dark sky detaches its bright
   * solids at steps 9 and 10; respacing lifts their anchor by 0.22, which would
   * put both of them past L 1.0, where they clamp to the same white and the ramp
   * silently loses a step. So the shift is scaled by the most any of the steps
   * sharing an anchor can take, which keeps them in range and in order.
   */
  const byAnchor = new Map<number, number[]>();
  for (const d of ref.detached) {
    let p = d.index - 1; while (p >= 0 && !ref.spine.includes(p)) p--;
    if (p < 0) { p = d.index + 1; while (p < ref.n.length && !ref.spine.includes(p)) p++; }
    if (p >= 0 && p < ref.n.length) byAnchor.set(p, [...(byAnchor.get(p) ?? []), d.index]);
  }
  const LO = 0.002, HI = 0.998;
  for (const [p, group] of byAnchor) {
    const shift = L[p]! - ref.L[p]!;
    let scale = 1;
    if (shift !== 0) {
      for (const i of group) {
        const room = shift > 0 ? HI - ref.L[i]! : ref.L[i]! - LO;
        scale = Math.min(scale, Math.max(0, room / Math.abs(shift)));
      }
    }
    for (const i of group) L[i] = Math.min(HI, Math.max(LO, ref.L[i]! + shift * scale));
  }
  return { ...ref, n, L, C, relC, dh, h, w, apcaRef, wcagRef };
}

function invertPathL(f: (x: number) => number, targetL: number, n0: number, n1: number): number {
  const a = f(n0), b = f(n1);
  const inc = b > a;
  if ((inc && targetL <= a) || (!inc && targetL >= a)) return n0;
  if ((inc && targetL >= b) || (!inc && targetL <= b)) return n1;
  let lo = n0, hi = n1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if ((f(mid) < targetL) === inc) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
