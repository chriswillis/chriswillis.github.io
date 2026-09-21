/**
 * Phase 2 solver. Given a seed color (priority) or a target hue, a reference
 * DNA, an output gamut and a background, produce a ramp in the reference's own
 * numbering:
 *
 *   1. select reference curves (nearest two families by hue, or forced, or aggregate)
 *   2. seed: find the step the seed belongs to (least ΔEOK to the reference
 *      color transferred to the seed's hue, detached steps included), warp the
 *      lightness spine in n so that step lands exactly on the seed's L, offset
 *      hue drift so the seed's hue is exact there, and fit a chroma gain so the
 *      seed's chroma is exact. The seed step is emitted unquantized.
 *   3. lightness per step: curve-faithful (reference L), contrast-faithful
 *      (bisect L so APCA against the actual background matches the reference's
 *      APCA against its canonical surface — white for light scales, its own
 *      step 0 for dark scales; WCAG where APCA is not invertible), or a blend t
 *      between them — chroma re-solved after each lightness change
 *   4. chroma per step: w·relC·cusp(L, h) + (1−w)·C, times the seed gain
 *   5. gamut map (CSS Color 4 method, Color.js), report ΔEOK
 *   6. quantize to 8-bit in the output space
 *   7. verify every contrast promise (WCAG 3, 4.5, 7 against the background
 *      that the pre-quantization color met), nudge L by ≤ 1 JND where one broke
 *
 * Pure. Color.js only for gamut mapping; culori for everything in loops.
 */
import Color from 'colorjs.io';
import { converter } from 'culori';
import type { SystemDNA } from '../dna/schema.ts';
import { pchip, invertMonotone } from '../dna/curves.ts';
import { shell, type Gamut } from '../gamut/shell.ts';
import { parseToOklch, deltaEOK, hueDelta, wrap360, type Oklch } from '../color/oklch.ts';
import { deltaEHK, defaultViewing, type ViewingConditions, type HKOptions } from '../color/hk.ts';
import { wcag21Fast, apcaFast } from '../contrast/fast.ts';
import { selectReference, respaceEven, type ReferenceCurves } from './reference.ts';

export const JND_L = 0.02;
export const WCAG_THRESHOLDS = [3, 4.5, 7] as const;

export interface SolveInput {
  dna: SystemDNA;
  /** Seed color (any CSS color). Takes priority over `hue`. */
  seed?: string | Oklch;
  /** Target peak hue in degrees, used when no seed is given. */
  hue?: number;
  /** Force a reference family instead of nearest-two selection. */
  family?: string;
  /** Output gamut. Default 'p3'. */
  gamut?: Gamut;
  /** Page background the ramp sits on. Default white. */
  background?: string | Oklch;
  /** 0 = curve-faithful, 1 = contrast-faithful, in between = blend. Default 0. */
  mode?: number;
  /** Pin the seed to this step key instead of the step nearest in lightness. */
  seedStep?: string;
  /** Apply relative chroma against the P3 shell (fills P3) instead of the native shell. Default false. */
  extendToP3?: boolean;
  /** Renumber: number of steps or explicit keys. Detached steps are dropped. Default: reference numbering. */
  renumber?: number | string[];
  /** Seed chroma gain clamp. Default [0.5, 1.2]. */
  gainClamp?: [number, number];
  /** Produce the sRGB sibling when gamut is p3. Default true. */
  sibling?: boolean;
  /**
   * `'auto'` (default) re-places the spine steps at equal ΔEOK along the same curve —
   * same DNA, same endpoints, even rhythm — unless the reference's numbering is
   * *contrast-bearing*, in which case it keeps the reference's own placement.
   *
   * Even is the better default by a wide margin: across the thirteen references it
   * takes the mean spacing CV from 0.36 to 0.03, and lifts the worst adjacent step
   * anywhere in the corpus from ΔEOK 0.008 to 0.025. The exception is the one thing
   * respacing can break. Five references number by contrast rather than convention —
   * at each step every hue lands on the same contrast, so `carbon-60` is a promise
   * and not a label — and moving those steps keeps the number while losing the
   * promise. Measured (`npx tsx spike/phase5-spacing.ts`): respacing pushes Polaris
   * from σ 0.035 to 0.121 and Carbon from 0.007 to 0.055, both past the 0.05 that
   * classified them, and degrades Spectrum, Primer and Web Awesome by an order of
   * magnitude while leaving them just inside it.
   *
   * `'reference'` and `'even'` force it either way. Replication needs `'reference'`.
   */
  spacing?: 'auto' | 'reference' | 'even';
  /**
   * Which ruler even spacing uses. `'oklab'` (default) equalises ΔEOK, the
   * measured distance. `'hk'` equalises a distance whose lightness axis carries
   * a Helmholtz–Kohlrausch term, so the steps come out even *in appearance*
   * rather than in measurement.
   *
   * This is opt-in, and the reason is a real trade rather than caution. ΔEOK has
   * no H–K term, and a ramp sweeps chroma from near zero at its ends to a peak
   * in the middle — precisely the axis being equalised. Measured across the
   * corpus (`spike/phase6-spacing.ts`), ramps even by ΔEOK at mean CV 0.035
   * come out at CV 0.263 when remeasured in apparent lightness, 7.5× worse, and
   * the worst offenders are the magentas, pinks and purples the effect predicts.
   * But contrast requirements are stated in measured terms, not apparent ones,
   * so buying apparent evenness spends measured regularity. The audit reports
   * both figures whichever is chosen, so the trade is visible rather than
   * assumed.
   */
  lightness?: 'oklab' | 'hk';
  /**
   * What the eye is adapted to. Only consulted when `lightness` is `'hk'`.
   * Defaults to an average surround for a light background and a dark surround
   * for a dark one — see `color/hk.ts`.
   */
  viewing?: ViewingConditions;
  /** Strength and method for the H–K term. Only consulted when `lightness` is `'hk'`. */
  hk?: HKOptions;
}

export interface SolvedColor {
  /** Final color after gamut mapping and quantization. */
  oklch: Oklch;
  css: string;
  /** Hex when the space is sRGB, color(display-p3 …) otherwise. */
  native: string;
  space: Gamut;
}

export interface SolvedStep {
  key: string;
  n: number;
  isSeed: boolean;
  detached: boolean;
  role?: string;
  /** Intended color before gamut mapping. */
  intended: Oklch;
  /** ΔEOK between intended and the gamut-mapped color (0 when in gamut). */
  mappingDeltaE: number;
  /** ΔEOK between mapped and quantized. */
  quantizationDeltaE: number;
  color: SolvedColor;
  sibling?: SolvedColor & { deltaEFromP3: number };
  contrast: { wcagVsBg: number; apcaOnBg: number; wcagVsStep0: number; apcaOnStep0: number };
  /** WCAG thresholds vs background the pre-quantization color met; `met` after quantization (and nudging). */
  promises: { threshold: number; met: boolean }[];
  nudge: { deltaL: number; jnd: number } | null;
  /** Reference values transferred (before seed adjustments), for inspection. */
  reference: { L: number; C: number; relC: number; w: number; dh: number; apcaRef: number; wcagRef: number };
  lightness: { curve: number; contrast: number | null; used: number; contrastMethod: 'apca' | 'wcag' | 'curve' };
}

export interface SolvedRamp {
  dna: { id: string; name: string; mode: 'light' | 'dark'; kinship: number; numbering: string | null };
  target: { hueAtPeak: number; seed: Oklch | null };
  selection: ReferenceCurves['selection'] | { families: { family: string; weight: number; deltaDeg: number }[]; rule: 'neutral' };
  contrastSurface: 'white' | 'step0';
  /** The system's documented key step (Tailwind 500, Radix 9), when it has one. Null when its key is merely where chroma peaks. */
  keyStep: { key: string; index: number } | null;
  /** Present on neutral ramps (see solver/neutral.ts). */
  neutral?: { family: string; tintHue: number | null; tintStrength: number; referenceTintHue: number | null; referenceTintStrength: number; strengthMultiplier: number; pure: boolean };
  gamut: Gamut;
  background: Oklch;
  mode: number;
  seed: null | { input: Oklch; stepKey: string; stepIndex: number; nShift: number; gainRaw: number; gainApplied: number; gainClamped: boolean; achievedDeltaE: number; outsideSpine: boolean;
    /** The step the reference's own placement would have used. Differs in even mode when the seed's lightness ranks elsewhere. */
    referenceStepKey: string };
  /** Step-to-step ΔEOK of the emitted ramp along the spine, and the reference's own for comparison. */
  spacing: {
    mode: 'reference' | 'even';
    /** Why that mode, when `spacing` was left to `'auto'`. */
    rule: 'asked' | 'even-by-default' | 'contrast-bearing-numbering';
    /** Which ruler was used to equalise. */
    lightness: 'oklab' | 'hk';
    deltaE: number[];
    mean: number; cv: number; min: number; max: number;
    referenceCv: number;
    /**
     * The same ramp measured with the other ruler, always reported. `deltaEHK`
     * is the apparent-lightness distance and `cvHK` its coefficient of
     * variation; a large gap between `cv` and `cvHK` means the ramp is even by
     * one definition and not the other.
     */
    deltaEHK: number[];
    cvHK: number;
    /** In even mode with a seed, the ramp is even within each side of the pinned step. */
    segments: { before: { mean: number; steps: number }; after: { mean: number; steps: number } } | null;
  };
  steps: SolvedStep[];
  warnings: string[];
}

const toCulori = (o: Oklch) => ({ mode: 'oklch' as const, l: o.l, c: o.c, h: Number.isNaN(o.h) ? undefined : o.h });
const toRgbC = converter('rgb');
const toP3C = converter('p3');
const fromRgb = converter('oklch');

/** An achromatic color has no hue; OKLCH reports NaN. Normalize to 0 so hue arithmetic stays finite. */
function asOklch(c: string | Oklch): Oklch {
  const o = typeof c === 'string' ? parseToOklch(c) : c;
  return { l: o.l, c: o.c, h: Number.isNaN(o.h) ? 0 : wrap360(o.h) };
}

/** CSS Color 4 gamut mapping via Color.js; returns the mapped color and ΔEOK. */
export function gamutMap(o: Oklch, gamut: Gamut): { mapped: Oklch; deltaE: number } {
  const c = new Color('oklch', [o.l, o.c, Number.isNaN(o.h) ? 0 : o.h]);
  const space = gamut === 'p3' ? 'p3' : 'srgb';
  if (c.inGamut(space, { epsilon: 0.000075 })) return { mapped: o, deltaE: 0 };
  const m = c.clone().toGamut({ space, method: 'css' }).to('oklch');
  const [l, cc, h] = m.coords as [number, number, number];
  const mapped = { l, c: cc, h: Number.isNaN(h) ? o.h : wrap360(h) };
  return { mapped, deltaE: deltaEOK(o, mapped) };
}

/** Quantize to 8-bit per channel in the output space; return the exact color those channels produce. */
export function quantize(o: Oklch, gamut: Gamut): SolvedColor {
  const c = gamut === 'p3' ? toP3C(toCulori(o)) : toRgbC(toCulori(o));
  const q = (v: number | undefined) => Math.min(255, Math.max(0, Math.round((v ?? 0) * 255)));
  const [r, g, b] = [q(c.r), q(c.g), q(c.b)];
  const back = fromRgb({ mode: gamut === 'p3' ? ('p3' as const) : ('rgb' as const), r: r / 255, g: g / 255, b: b / 255 });
  const oklch: Oklch = { l: back.l, c: back.c, h: back.h === undefined ? o.h : wrap360(back.h) };
  const fmt = (v: number, d: number) => Number(v.toFixed(d)).toString();
  const css = `oklch(${fmt(oklch.l, 4)} ${fmt(oklch.c, 4)} ${fmt(Number.isNaN(oklch.h) ? 0 : oklch.h, 2)})`;
  const native = gamut === 'p3'
    ? `color(display-p3 ${fmt(r / 255, 4)} ${fmt(g / 255, 4)} ${fmt(b / 255, 4)})`
    : `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return { oklch, css, native, space: gamut };
}

/** Format a color exactly (no quantization) in the output space. Used for the seed step. */
export function exact(o: Oklch, gamut: Gamut): SolvedColor {
  const c = gamut === 'p3' ? toP3C(toCulori(o)) : toRgbC(toCulori(o));
  const fmt = (v: number, d: number) => Number(v.toFixed(d)).toString();
  const css = `oklch(${fmt(o.l, 4)} ${fmt(o.c, 4)} ${fmt(Number.isNaN(o.h) ? 0 : o.h, 2)})`;
  const ch = [c.r, c.g, c.b].map((v) => Math.min(1, Math.max(0, v ?? 0)));
  const native = gamut === 'p3'
    ? `color(display-p3 ${ch.map((v) => fmt(v, 5)).join(' ')})`
    : `#${ch.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
  return { oklch: { ...o }, css, native, space: gamut };
}

/** Bisect L in [lo, hi] so that f(L) = target; f must be monotone on the interval. `reached` is false when the target is outside f's range. */
function bisectL(f: (L: number) => number, target: number, lo: number, hi: number, iters = 40): { L: number; reached: boolean } {
  const flo = f(lo);
  const fhi = f(hi);
  const inc = fhi > flo;
  if ((inc && (target <= flo || target >= fhi)) || (!inc && (target >= flo || target <= fhi))) {
    return { L: Math.abs(target - flo) < Math.abs(target - fhi) ? lo : hi, reached: false };
  }
  for (let k = 0; k < iters; k++) {
    const mid = (lo + hi) / 2;
    if ((f(mid) < target) === inc) lo = mid; else hi = mid;
  }
  return { L: (lo + hi) / 2, reached: true };
}

/**
 * Joint (family, step) placement of a seed. Lightness decides which steps are
 * candidates (those within a small band of the nearest L; the end step when the
 * seed is outside the spine's range). Among candidates, the reference color
 * transferred to the seed's hue is compared with the seed (ΔEOK) plus a penalty
 * for how far the implied peak hue (seed hue minus that family's drift at that
 * step) sits from the family's own peak hue, as an OKLab distance at the seed's
 * chroma. Detached steps are candidates, so Radix yellow-9 beats step 5.
 */
export function placeSeed(dna: SystemDNA, seed: Oklch, shellGamut: Gamut, opts: { family?: string; seedStep?: string; lightnessBand?: number } = {}) {
  const sh = shell(shellGamut);
  const band = opts.lightnessBand ?? 0.03;
  const w = dna.chroma.w;
  const wx = dna.chroma.basis === 'grid' ? dna.grid : Array.from({ length: w.length }, (_, i) => (w.length > 1 ? i / (w.length - 1) : 0));
  const wAt = (n: number) => { let i = 0; while (i < wx.length - 2 && wx[i + 1]! <= n) i++; const t = (n - wx[i]!) / (wx[i + 1]! - wx[i]! || 1); return Math.min(1, Math.max(0, w[i]! + t * (w[i + 1]! - w[i]!))); };
  let best: { family: string; stepIndex: number; impliedPeak: number; score: number; dE: number; outsideSpine: boolean } | null = null;
  for (const f of Object.values(dna.families)) {
    if (opts.family && f.family !== opts.family) continue;
    const k = f.knots;
    // lightness decides which steps are candidates: the seed belongs where its L falls.
    // A seed beyond the spine's range can only take the end step without breaking monotonicity.
    const spineL = f.spine.indices.map((i) => k.L[i]!);
    const lo = Math.min(...spineL), hi = Math.max(...spineL);
    let candidates: number[];
    let outside = false;
    if (opts.seedStep) candidates = [k.key.indexOf(opts.seedStep)].filter((i) => i >= 0);
    else if (seed.l < lo - 1e-9 || seed.l > hi + 1e-9) {
      outside = true;
      const endIdx = f.spine.indices[seed.l < lo ? (spineL[0]! < spineL[spineL.length - 1]! ? 0 : spineL.length - 1) : (spineL[0]! < spineL[spineL.length - 1]! ? spineL.length - 1 : 0)]!;
      candidates = [endIdx];
    } else {
      const minDL = Math.min(...k.L.map((L) => Math.abs(L - seed.l)));
      candidates = k.L.map((L, i) => i).filter((i) => Math.abs(k.L[i]! - seed.l) <= minDL + band);
    }
    for (const i of candidates) {
      const wi = wAt(k.n[i]!);
      const C = Math.max(0, wi * k.relC[shellGamut][i]! * sh.cuspChroma(k.L[i]!, seed.h) + (1 - wi) * k.C[i]!);
      const dE = deltaEOK(seed, { l: k.L[i]!, c: C, h: seed.h });
      const impliedPeak = wrap360(seed.h - k.dh[i]!);
      const huePenalty = seed.c * Math.abs(hueDelta(impliedPeak, f.hueAtPeak)) * (Math.PI / 180);
      const score = dE + huePenalty;
      if (!best || score < best.score) best = { family: f.family, stepIndex: i, impliedPeak, score, dE, outsideSpine: outside };
    }
  }
  if (!best) throw new Error('placeSeed: no candidate step');
  return best;
}

/**
 * Resolve `spacing: 'auto'`. Even unless the reference numbers by contrast, which
 * respacing would break — see the note on `SolveInput.spacing`.
 */
export function chooseSpacing(dna: SystemDNA, asked?: 'auto' | 'reference' | 'even'): { mode: 'reference' | 'even'; rule: 'asked' | 'even-by-default' | 'contrast-bearing-numbering' } {
  if (asked === 'reference' || asked === 'even') return { mode: asked, rule: 'asked' };
  if (dna.steps.numbering?.class === 'contrast-bearing') return { mode: 'reference', rule: 'contrast-bearing-numbering' };
  return { mode: 'even', rule: 'even-by-default' };
}

export function solveRamp(input: SolveInput): SolvedRamp {
  const { dna } = input;
  const gamut: Gamut = input.gamut ?? 'p3';
  const bg = asOklch(input.background ?? { l: 1, c: 0, h: 0 });
  const t = Math.min(1, Math.max(0, input.mode ?? 0));
  const [gLo, gHi] = input.gainClamp ?? [0.5, 1.2];
  const warnings: string[] = [];
  const seed = input.seed !== undefined ? asOklch(input.seed) : null;
  if (!seed && input.hue === undefined) throw new Error('solveRamp: provide a seed or a hue');
  if (seed && seed.c < 0.004) warnings.push(`seed is achromatic (chroma ${seed.c.toFixed(4)}) and carries no hue to transfer; the ramp follows ${dna.name}'s drift around hue 0 — for a neutral ramp use a reference neutral instead`);
  const shellGamut: Gamut = input.extendToP3 ? 'p3' : dna.nativeShell.gamut;
  const sh = shell(shellGamut);

  // renumber grid
  let renumberN: number[] | undefined;
  let renumberKeys: string[] | undefined;
  if (input.renumber !== undefined) {
    const keys = Array.isArray(input.renumber) ? input.renumber : Array.from({ length: input.renumber }, (_, i) => String(i));
    renumberN = keys.map((_, i) => (keys.length > 1 ? i / (keys.length - 1) : 0));
    renumberKeys = keys;
    if (Object.values(dna.families).some((f) => f.spine.detached.length)) warnings.push('renumbering drops detached steps (e.g. Radix bright solids); the reference numbering keeps them');
  }

  // ── 1. reference selection. With a seed, place it first (joint family × step search),
  //      then select the reference by the implied peak hue so the seed's own family wins outright.
  const spacingChoice = chooseSpacing(dna, input.spacing);
  const spacingMode: 'reference' | 'even' = spacingChoice.mode;
  // The viewing condition follows the background unless it is given: a ramp solved
  // on a dark page is one the eye meets in a dark surround.
  const viewing = input.viewing ?? defaultViewing(bg.l < 0.5 ? 'dark' : 'light');
  const lightnessRuler = input.lightness ?? 'oklab';
  const hkMetric = (a: Oklch, b: Oklch) => deltaEHK(a, b, viewing, input.hk ?? {});
  const arcMetric = lightnessRuler === 'hk' ? hkMetric : undefined;
  let targetHue = seed ? seed.h : input.hue!;
  let placement: ReturnType<typeof placeSeed> | null = null;
  if (seed) {
    placement = placeSeed(dna, seed, shellGamut, { family: input.family, seedStep: input.seedStep });
    targetHue = placement.impliedPeak;
  }
  const refBase = selectReference(dna, targetHue, { family: input.family, gamut: shellGamut, n: renumberN, keys: renumberKeys });
  let ref = refBase;
  const N = ref.n.length;

  // ── 2. seed: step placement, spine warp (or even respacing), hue offset, chroma gain
  let seedInfo: SolvedRamp['seed'] = null;
  let L = [...ref.L];
  let hueOffset = 0; // added to (targetHue + dh_i)
  let gain = 1;
  let seedIndex = -1;
  let seedOnSpine = false;

  let refPlacedKey: string | null = null;
  if (seed && placement) {
    const placedKey = dna.families[placement.family]!.knots.key[placement.stepIndex]!;
    refPlacedKey = renumberN ? null : placedKey;
    seedIndex = renumberN ? -1 : ref.keys.indexOf(placedKey);
    if (seedIndex < 0) seedIndex = ref.spine.reduce((bi, i) => (Math.abs(ref.L[i]! - seed.l) < Math.abs(ref.L[bi]! - seed.l) ? i : bi), ref.spine[0]!);
    seedOnSpine = ref.spine.includes(seedIndex);
    // placeSeed searches every family, but the reference curves come from the hue-nearest
    // family (or blend). A step that suited the matched family can sit inside another
    // family's range and outside this one's, which would break monotonicity — so a seed
    // outside the reference spine's own lightness range is moved to the reference's end step.
    const spL = ref.spine.map((i) => ref.L[i]!);
    const loL = Math.min(...spL), hiL = Math.max(...spL);
    if (seed.l < loL - 1e-9 || seed.l > hiL + 1e-9) {
      const wantDarkest = seed.l < loL;
      let endIdx = ref.spine[0]!;
      for (const i of ref.spine) if (wantDarkest ? ref.L[i]! < ref.L[endIdx]! : ref.L[i]! > ref.L[endIdx]!) endIdx = i;
      if (endIdx !== seedIndex) seedIndex = endIdx;
      seedOnSpine = true;
    }
  }

  if (spacingMode === 'even') {
    // Even spacing decides which step holds the seed by lightness rank on the respaced
    // spine, because the reference's own step placement is exactly what is being replaced.
    if (seed && seedOnSpine && !input.seedStep) {
      const probe = respaceEven(refBase, { targetHue, gamut: shellGamut, metric: arcMetric });
      seedIndex = probe.spine.reduce((bi, i) => (Math.abs(probe.L[i]! - seed.l) < Math.abs(probe.L[bi]! - seed.l) ? i : bi), probe.spine[0]!);
    }
    const pin = seed && seedOnSpine ? { seedL: seed.l, seedSpinePos: refBase.spine.indexOf(seedIndex) } : {};
    ref = respaceEven(refBase, { targetHue, gamut: shellGamut, ...pin, metric: arcMetric });
    L = [...ref.L];
    if (seed && seedIndex >= 0) L[seedIndex] = seed.l;
    if (seed && !seedOnSpine) {
      const role = ref.detached.find((d) => d.index === seedIndex)?.role;
      warnings.push(`seed sits on detached step ${ref.keys[seedIndex]}${role ? ` (${role})` : ''}, which is off the spine and so outside the even spacing`);
    }
    if (seed && seedIndex >= 0) seedInfo = { input: seed, stepKey: ref.keys[seedIndex]!, stepIndex: seedIndex, nShift: ref.n[seedIndex]! - refBase.n[seedIndex]!, gainRaw: 1, gainApplied: 1, gainClamped: false, achievedDeltaE: 0, outsideSpine: false, referenceStepKey: refPlacedKey ?? ref.keys[seedIndex]! };
    if (seed && refPlacedKey && refPlacedKey !== ref.keys[seedIndex]) warnings.push(`even spacing moved the seed from step ${refPlacedKey} (where the reference's own placement puts it) to ${ref.keys[seedIndex]}, which is where its lightness ranks; pass seedStep: '${refPlacedKey}' to keep the reference's step at the cost of uneven halves`);
  } else if (seed && placement) {
    let outsideSpine = false;
    let shift = 0;
    if (seedOnSpine) {
      const sN = ref.spine.map((i) => ref.n[i]!);
      const sL = ref.spine.map((i) => ref.L[i]!);
      const curve = pchip(sN, sL);
      let nStar = invertMonotone(curve, seed.l);
      if (nStar === null) {
        outsideSpine = true;
        nStar = ref.n[seedIndex]!;
        warnings.push(`seed lightness ${seed.l.toFixed(3)} is outside the reference spine [${Math.min(...sL).toFixed(3)}, ${Math.max(...sL).toFixed(3)}]; step ${ref.keys[seedIndex]} takes the seed and the spine is not warped`);
      }
      // warp in n: move the seed knot to n*, tent-shaped shift toward the ends (monotone by construction)
      const nk = ref.n[seedIndex]!;
      shift = nStar - nk;
      const kPos = ref.spine.indexOf(seedIndex);
      const first = sN[0]!, last = sN[sN.length - 1]!;
      const warped = sN.map((x, p) => {
        if (p === kPos) return nStar!;
        const tent = x <= nk ? (nk - first === 0 ? 0 : (x - first) / (nk - first)) : (last - nk === 0 ? 0 : (last - x) / (last - nk));
        return x + shift * tent;
      });
      for (let p = 0; p < sN.length; p++) L[ref.spine[p]!] = curve(warped[p]!);
      for (const d of ref.detached) {
        let p = d.index - 1; while (p >= 0 && !ref.spine.includes(p)) p--;
        if (p >= 0) L[d.index] = ref.L[d.index]! + (L[p]! - ref.L[p]!);
      }
    } else {
      const role = ref.detached.find((d) => d.index === seedIndex)?.role;
      warnings.push(`seed pinned to detached step ${ref.keys[seedIndex]}${role ? ` (${role})` : ''}; the spine is not warped`);
    }
    L[seedIndex] = seed.l; // exact
    seedInfo = { input: seed, stepKey: ref.keys[seedIndex]!, stepIndex: seedIndex, nShift: shift, gainRaw: 1, gainApplied: 1, gainClamped: false, achievedDeltaE: 0, outsideSpine, referenceStepKey: ref.keys[seedIndex]! };
  }
  if (seed && seedIndex >= 0) hueOffset = hueDelta(seed.h, wrap360(targetHue + ref.dh[seedIndex]!));

  const hueAt = (i: number) => wrap360(targetHue + ref.dh[i]! + hueOffset);
  const baseChromaAt = (i: number, Li: number) => Math.max(0, ref.w[i]! * ref.relC[i]! * sh.cuspChroma(Li, hueAt(i)) + (1 - ref.w[i]!) * ref.C[i]!);
  const chromaAt = (i: number, Li: number) => gain * baseChromaAt(i, Li);

  // seed chroma gain (from the un-gained prediction at the seed step)
  if (seed && seedIndex >= 0) {
    const fitGain = () => {
      const pred = baseChromaAt(seedIndex, seed.l);
      const raw = pred > 1e-6 ? seed.c / pred : 1;
      return { raw, applied: Math.min(gHi, Math.max(gLo, raw)) };
    };
    let { raw, applied } = fitGain();
    // Even spacing equalises arc length along the path it is given, so a gained ramp must be
    // re-spaced with the gain applied or the steps drift apart in chroma. One extra pass
    // converges: the gain depends only on the seed step, whose lightness is pinned.
    if (spacingMode === 'even' && seedOnSpine && Math.abs(applied - 1) > 1e-6) {
      ref = respaceEven(refBase, { targetHue, gamut: shellGamut, seedL: seed.l, seedSpinePos: refBase.spine.indexOf(seedIndex), chromaGain: applied, metric: arcMetric });
      L = [...ref.L];
      L[seedIndex] = seed.l;
      hueOffset = hueDelta(seed.h, wrap360(targetHue + ref.dh[seedIndex]!));
      ({ raw, applied } = fitGain());
    }
    gain = applied;
    seedInfo = { ...seedInfo!, gainRaw: raw, gainApplied: applied, gainClamped: applied !== raw };
    if (applied !== raw) warnings.push(`seed chroma gain ${raw.toFixed(2)} clamped to ${applied.toFixed(2)} — the seed is ${raw > applied ? 'more' : 'less'} chromatic than ${dna.name}'s own curve allows; the seed step is exact, its neighbours follow the clamped curve, and the step next to the seed will read as a larger jump than the rest`);
  }

  // ── 3. lightness: curve / contrast / blend
  const lightness: SolvedStep['lightness'][] = [];
  const Lfinal: number[] = [];
  for (let i = 0; i < N; i++) {
    const Lc = L[i]!;
    let Lk: number | null = null;
    let method: SolvedStep['lightness']['contrastMethod'] = 'curve';
    if (t > 0 && i !== seedIndex) {
      const targetApca = Math.abs(ref.apcaRef[i]!);
      const targetWcag = ref.wcagRef[i]!;
      const darkBg = bg.l < 0.5;
      const lo = darkBg ? bg.l : 0.0;
      const hi = darkBg ? 1.0 : bg.l;
      let Lx = Lc;
      let reached = true;
      // iterate: chroma perturbs luminance, so re-solve after setting chroma (at least twice)
      for (let it = 0; it < 3; it++) {
        const Cx = chromaAt(i, Lx);
        const h = hueAt(i);
        let res: { L: number; reached: boolean };
        if (targetApca >= 8) {
          method = 'apca';
          res = bisectL((Lv) => Math.abs(apcaFast({ l: Lv, c: Cx, h }, bg)), targetApca, lo, hi);
        } else {
          method = 'wcag';
          res = bisectL((Lv) => wcag21Fast({ l: Lv, c: Cx, h }, bg), targetWcag, lo, hi);
        }
        Lx = res.L; reached = res.reached;
      }
      if (!reached) warnings.push(`step ${ref.keys[i]}: reference contrast (${method === 'apca' ? `|Lc| ${targetApca.toFixed(0)}` : `${targetWcag.toFixed(2)}:1`}) is unreachable on this background; lightness clamped to ${Lx.toFixed(3)}`);
      Lk = Lx;
    }
    const used = Lk === null ? Lc : (1 - t) * Lc + t * Lk;
    Lfinal.push(used);
    lightness.push({ curve: Lc, contrast: Lk, used, contrastMethod: Lk === null ? 'curve' : method });
  }

  // spine monotonicity after lightness solving (contrast mode can cross a pinned seed)
  {
    const dir = dna.mode === 'light' ? -1 : 1;
    for (let p = 1; p < ref.spine.length; p++) {
      const a = ref.spine[p - 1]!, b = ref.spine[p]!;
      if ((Lfinal[b]! - Lfinal[a]!) * dir <= 0) warnings.push(`lightness is not monotone between steps ${ref.keys[a]} and ${ref.keys[b]} (${Lfinal[a]!.toFixed(3)} → ${Lfinal[b]!.toFixed(3)})${seed ? ' — contrast-faithful lightness crossed the pinned seed' : ''}`);
    }
  }

  // ── 4–7. chroma, map, quantize, verify, nudge
  const steps: SolvedStep[] = [];
  const finalize = (i: number, Li: number): { intended: Oklch; mapped: Oklch; mapDE: number; color: SolvedColor; quantDE: number } => {
    const intended: Oklch = i === seedIndex && seed ? { ...seed } : { l: Li, c: chromaAt(i, Li), h: hueAt(i) };
    const { mapped, deltaE } = gamutMap(intended, gamut);
    // the seed is displayable by definition: emit it exactly rather than through 8-bit quantization
    const color = i === seedIndex && seed && deltaE === 0 ? exact(mapped, gamut) : quantize(mapped, gamut);
    return { intended, mapped, mapDE: deltaE, color, quantDE: deltaEOK(mapped, color.oklch) };
  };

  for (let i = 0; i < N; i++) {
    let Li = Lfinal[i]!;
    let f = finalize(i, Li);
    // promises: WCAG thresholds vs bg met by the mapped (pre-quantization) color
    const promised = WCAG_THRESHOLDS.filter((th) => wcag21Fast(f.mapped, bg) >= th);
    let nudge: SolvedStep['nudge'] = null;
    const broken = () => promised.some((th) => wcag21Fast(f.color.oklch, bg) < th);
    if (i !== seedIndex && broken()) {
      const away = bg.l >= 0.5 ? -1 : 1; // move L away from the background
      for (const frac of [0.25, 0.5, 0.75, 1]) {
        const trial = finalize(i, Li + away * frac * JND_L);
        if (!promised.some((th) => wcag21Fast(trial.color.oklch, bg) < th)) {
          f = trial; nudge = { deltaL: away * frac * JND_L, jnd: frac }; Li = Li + away * frac * JND_L; break;
        }
      }
      if (broken()) warnings.push(`step ${ref.keys[i]}: a WCAG promise (${promised.join('/')}) could not be restored within one JND after quantization`);
    }
    const det = ref.detached.find((d) => d.index === i);
    steps.push({
      key: ref.keys[i]!,
      n: ref.n[i]!,
      isSeed: i === seedIndex,
      detached: !!det,
      ...(det?.role ? { role: det.role } : {}),
      intended: f.intended,
      mappingDeltaE: f.mapDE,
      quantizationDeltaE: f.quantDE,
      color: f.color,
      contrast: { wcagVsBg: wcag21Fast(f.color.oklch, bg), apcaOnBg: apcaFast(f.color.oklch, bg), wcagVsStep0: NaN, apcaOnStep0: NaN },
      promises: promised.map((th) => ({ threshold: th, met: wcag21Fast(f.color.oklch, bg) >= th })),
      nudge,
      reference: { L: ref.L[i]!, C: ref.C[i]!, relC: ref.relC[i]!, w: ref.w[i]!, dh: ref.dh[i]!, apcaRef: ref.apcaRef[i]!, wcagRef: ref.wcagRef[i]! },
      lightness: lightness[i]!,
    });
  }
  // contrast against the ramp's own step 0
  const step0 = steps[0]!.color.oklch;
  for (const s of steps) { s.contrast.wcagVsStep0 = wcag21Fast(s.color.oklch, step0); s.contrast.apcaOnStep0 = apcaFast(s.color.oklch, step0); }

  // sRGB sibling: same color where it fits, css-mapped where it does not (decision #6 default)
  if (gamut === 'p3' && (input.sibling ?? true)) {
    for (const s of steps) {
      const { mapped } = gamutMap(s.color.oklch, 'srgb');
      const q = quantize(mapped, 'srgb');
      s.sibling = { ...q, deltaEFromP3: deltaEOK(q.oklch, s.color.oklch) };
    }
  }

  // achieved step spacing along the spine, and the reference's own for comparison
  const spineSolved = ref.spine.map((i) => steps[i]!.color.oklch);
  const dEs: number[] = [];
  for (let i = 1; i < spineSolved.length; i++) dEs.push(deltaEOK(spineSolved[i - 1]!, spineSolved[i]!));
  const dMean = dEs.reduce((a, b) => a + b, 0) / Math.max(1, dEs.length);
  const dCv = dMean > 0 ? Math.sqrt(dEs.reduce((a, b) => a + (b - dMean) ** 2, 0) / dEs.length) / dMean : 0;
  const seedSpinePos = seedIndex >= 0 ? ref.spine.indexOf(seedIndex) : -1;
  const mn = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
  const segments = spacingMode === 'even' && seedSpinePos > 0 && seedSpinePos < ref.spine.length - 1
    ? { before: { mean: mn(dEs.slice(0, seedSpinePos)), steps: seedSpinePos }, after: { mean: mn(dEs.slice(seedSpinePos)), steps: dEs.length - seedSpinePos } }
    : null;
  // the same ramp under the other ruler, reported whichever was used to build it
  const dHK: number[] = [];
  for (let i = 1; i < spineSolved.length; i++) dHK.push(hkMetric(spineSolved[i - 1]!, spineSolved[i]!));
  const hkMean = mn(dHK);
  const cvHK = hkMean > 0 ? Math.sqrt(mn(dHK.map((v) => (v - hkMean) ** 2))) / hkMean : 0;
  // The solver does not promise a minimum step, but a ramp whose steps collapse
  // onto each other is unusable and the caller should not have to discover that
  // from the linter. Found by the fuzz harness: a near-achromatic seed at an
  // extreme of lightness ranks at one end of the light ramp, and pinning that
  // same step key in the other mode puts it where the opposite end belongs, so
  // the whole ramp has to fit into whatever lightness is left.
  if (dEs.length > 0 && Math.min(...dEs) < JND_L) {
    const worst = dEs.indexOf(Math.min(...dEs));
    const a = ref.keys[ref.spine[worst]!] ?? String(worst);
    const b = ref.keys[ref.spine[worst + 1]!] ?? String(worst + 1);
    const span = Math.max(...spineSolved.map((c) => c.l)) - Math.min(...spineSolved.map((c) => c.l));
    warnings.push(
      `steps ${a} and ${b} are only ΔEOK ${Math.min(...dEs).toFixed(4)} apart, under the ${JND_L} just-noticeable difference` +
      `${span < 0.1 ? ` — the whole ramp spans just ${span.toFixed(3)} in lightness, so the seed's step leaves nowhere for the others to go` : ''}` +
      `. They will read as one colour.`,
    );
  }
  const spacing = {
    mode: spacingMode, rule: spacingChoice.rule, lightness: lightnessRuler,
    deltaE: dEs, mean: dMean, cv: dCv, min: Math.min(...dEs), max: Math.max(...dEs),
    referenceCv: dna.steps.spacing.cvDeltaE, deltaEHK: dHK, cvHK, segments,
  };
  if (segments && Math.max(segments.before.mean, segments.after.mean) / Math.min(segments.before.mean, segments.after.mean) > 1.4) {
    warnings.push(`the pinned seed splits the ramp unevenly: steps above it average ΔEOK ${segments.before.mean.toFixed(3)}, below it ${segments.after.mean.toFixed(3)} — the seed's lightness does not sit where step ${seedInfo?.stepKey} falls on an even ramp`);
  }

  if (seedInfo) seedInfo.achievedDeltaE = deltaEOK(steps[seedIndex]!.color.oklch, seed!);
  if (seedInfo && steps[seedIndex]!.mappingDeltaE > 0) warnings.push(`seed is outside the ${gamut} gamut and was mapped (ΔEOK ${steps[seedIndex]!.mappingDeltaE.toFixed(4)})`);

  return {
    dna: { id: dna.id, name: dna.name, mode: dna.mode, kinship: dna.kinship.hybridWithinJnd, numbering: dna.steps.numbering?.class ?? null },
    target: { hueAtPeak: wrap360(targetHue + hueOffset), seed },
    selection: ref.selection,
    contrastSurface: ref.contrastSurface,
    keyStep: dna.steps.keyStep.rule === 'documented' && ref.keys[ref.keyIndex] !== undefined ? { key: ref.keys[ref.keyIndex]!, index: ref.keyIndex } : null,
    gamut,
    background: bg,
    mode: t,
    seed: seedInfo,
    spacing,
    steps,
    warnings,
  };
}
