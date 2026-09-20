/**
 * Neutral solver. Transfers a reference gray ramp — its lightness spine, its
 * small absolute chroma envelope and its tint character — onto a target tint
 * hue. This is the "tint the grays toward the brand" move: Tailwind's slate is
 * its gray tinted to 259°, and seeding with a brand hue reproduces that
 * relationship for any hue.
 *
 * Chroma here is absolute, never relative: at L 0.985 the sRGB cusp is about
 * 0.004, so a shell fraction would amplify a JND of noise into a doubled tint.
 */
import type { SystemDNA } from '../dna/schema.ts';
import { nearestNeutral, type NeutralDNA } from '../dna/neutrals.ts';
import { pchip, catmullRom, linear } from '../dna/curves.ts';
import { parseToOklch, deltaEOK, hueDelta, wrap360, type Oklch } from '../color/oklch.ts';
import { wcag21Fast, apcaFast } from '../contrast/fast.ts';
import type { Gamut } from '../gamut/shell.ts';
import { gamutMap, quantize, chooseSpacing, JND_L, WCAG_THRESHOLDS, type SolvedRamp, type SolvedStep } from './index.ts';

export interface SolveNeutralInput {
  dna: SystemDNA;
  /** Target tint hue in degrees. Omit for the reference's own tint. */
  tintHue?: number;
  /** Take the tint hue from a brand color — the usual way to tie grays to a palette. */
  tintFrom?: string | Oklch;
  /** Reference neutral family. Default: the one whose tint is nearest the target. */
  family?: string;
  /** Multiplier on the reference's chroma envelope. 0 gives a pure gray. Default 1. */
  tintStrength?: number;
  gamut?: Gamut;
  background?: string | Oklch;
  spacing?: 'auto' | 'reference' | 'even';
  sibling?: boolean;
}

const asOklch = (c: string | Oklch): Oklch => {
  const o = typeof c === 'string' ? parseToOklch(c) : c;
  return { l: o.l, c: o.c, h: Number.isNaN(o.h) ? 0 : wrap360(o.h) };
};

/** Equal-ΔEOK placement of the spine steps along the neutral's own path. */
function evenPositions(n: number[], L: (x: number) => number, C: (x: number) => number, h: (x: number) => number, spineN: number[]): number[] {
  const J = 400;
  const [n0, n1] = [spineN[0]!, spineN[spineN.length - 1]!];
  const xs: number[] = [];
  const cum = [0];
  for (let j = 0; j <= J; j++) xs.push(n0 + ((n1 - n0) * j) / J);
  const at = (x: number): Oklch => ({ l: L(x), c: Math.max(0, C(x)), h: h(x) });
  for (let j = 1; j <= J; j++) cum.push(cum[j - 1]! + deltaEOK(at(xs[j - 1]!), at(xs[j]!)));
  const S = cum[J]!;
  if (!(S > 0)) return spineN;
  const sToN = (s: number) => {
    if (s <= 0) return n0;
    if (s >= S) return n1;
    let lo = 0, hi = J;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid]! <= s) lo = mid; else hi = mid; }
    const t = (s - cum[lo]!) / (cum[lo + 1]! - cum[lo]! || 1);
    return xs[lo]! + t * (xs[lo + 1]! - xs[lo]!);
  };
  return spineN.map((_, i) => sToN((S * i) / (spineN.length - 1)));
}

export function solveNeutralRamp(input: SolveNeutralInput): SolvedRamp {
  const { dna } = input;
  const pool = Object.values(dna.neutrals);
  if (pool.length === 0) throw new Error(`solveNeutralRamp: ${dna.id} has no neutral ramps`);
  const gamut: Gamut = input.gamut ?? 'p3';
  const bg = asOklch(input.background ?? { l: 1, c: 0, h: 0 });
  const warnings: string[] = [];
  const spacingChoice = chooseSpacing(dna, input.spacing);
  const spacingMode = spacingChoice.mode;

  const tintSource = input.tintFrom !== undefined ? asOklch(input.tintFrom) : null;
  if (tintSource && tintSource.c < 0.004) warnings.push(`tintFrom color is achromatic and carries no hue; falling back to the reference neutral's own tint`);
  let tintHue: number | null = input.tintHue ?? (tintSource && tintSource.c >= 0.004 ? tintSource.h : null);

  const ref: NeutralDNA = input.family
    ? (dna.neutrals[input.family] ?? (() => { throw new Error(`solveNeutralRamp: neutral "${input.family}" not in ${dna.id}; have ${pool.map((n) => n.family).join(', ')}`); })())
    : nearestNeutral(pool, tintHue);
  if (tintHue === null) tintHue = ref.tintHue;

  const strengthMul = input.tintStrength ?? 1;
  if (ref.pure && tintHue !== null && strengthMul > 0) {
    warnings.push(`${ref.family} is a pure gray (no chroma to scale), so the requested tint hue has no effect; pick a tinted neutral (${pool.filter((n) => !n.pure).map((n) => n.family).join(', ') || 'none in this system'}) to carry a tint`);
  }

  const k = ref.knots;
  const N = k.n.length;
  const spineIdx = ref.spine.indices;
  const Lc = pchip(spineIdx.map((i) => k.n[i]!), spineIdx.map((i) => ref.spine.L[i]!));
  const Cc = catmullRom(k.n, k.C);
  // transfer the reference's own slight hue drift around its tint, rotated onto the target
  const refTint = ref.tintHue;
  const dhc = linear(k.n, k.h.map((h) => (refTint === null || !Number.isFinite(h) ? 0 : hueDelta(h, refTint))));
  const hueAt = (x: number) => wrap360((tintHue ?? 0) + (tintHue === null ? 0 : dhc(x)));

  let ns = [...k.n];
  if (spacingMode === 'even' && spineIdx.length > 2) {
    const placed = evenPositions(k.n, Lc, (x) => Cc(x) * strengthMul, hueAt, spineIdx.map((i) => k.n[i]!));
    spineIdx.forEach((idx, p) => { ns[idx] = placed[p]!; });
  }

  const steps: SolvedStep[] = [];
  for (let i = 0; i < N; i++) {
    const x = ns[i]!;
    const onSpine = spineIdx.includes(i);
    const Lbase = onSpine ? Lc(x) : k.L[i]!;
    const emit = (Li: number) => {
      const intended: Oklch = { l: Li, c: Math.max(0, Cc(x) * strengthMul), h: hueAt(x) };
      const { mapped, deltaE } = gamutMap(intended, gamut);
      const color = quantize(mapped, gamut);
      return { intended, mapped, mapDE: deltaE, color, quantDE: deltaEOK(mapped, color.oklch) };
    };
    let Li = Lbase;
    let f = emit(Li);
    const promised = WCAG_THRESHOLDS.filter((th) => wcag21Fast(f.mapped, bg) >= th);
    let nudge: SolvedStep['nudge'] = null;
    const broken = () => promised.some((th) => wcag21Fast(f.color.oklch, bg) < th);
    if (broken()) {
      const away = bg.l >= 0.5 ? -1 : 1;
      for (const frac of [0.25, 0.5, 0.75, 1]) {
        const trial = emit(Li + away * frac * JND_L);
        if (!promised.some((th) => wcag21Fast(trial.color.oklch, bg) < th)) { f = trial; Li += away * frac * JND_L; nudge = { deltaL: away * frac * JND_L, jnd: frac }; break; }
      }
      if (broken()) warnings.push(`step ${k.key[i]}: a WCAG promise (${promised.join('/')}) could not be restored within one JND after quantization`);
    }
    steps.push({
      key: k.key[i]!, n: x, isSeed: false, detached: !onSpine,
      intended: f.intended, mappingDeltaE: f.mapDE, quantizationDeltaE: f.quantDE, color: f.color,
      contrast: { wcagVsBg: wcag21Fast(f.color.oklch, bg), apcaOnBg: apcaFast(f.color.oklch, bg), wcagVsStep0: NaN, apcaOnStep0: NaN },
      promises: promised.map((th) => ({ threshold: th, met: wcag21Fast(f.color.oklch, bg) >= th })),
      nudge,
      reference: { L: k.L[i]!, C: k.C[i]!, relC: NaN, w: 0, dh: refTint === null ? 0 : hueDelta(k.h[i]!, refTint), apcaRef: k.contrast.apcaOnWhite[i]!, wcagRef: k.contrast.wcagVsWhite[i]! },
      lightness: { curve: Lbase, contrast: null, used: Li, contrastMethod: 'curve' },
    });
  }
  const step0 = steps[0]!.color.oklch;
  for (const s of steps) { s.contrast.wcagVsStep0 = wcag21Fast(s.color.oklch, step0); s.contrast.apcaOnStep0 = apcaFast(s.color.oklch, step0); }

  if (gamut === 'p3' && (input.sibling ?? true)) {
    for (const s of steps) {
      const { mapped } = gamutMap(s.color.oklch, 'srgb');
      const q = quantize(mapped, 'srgb');
      s.sibling = { ...q, deltaEFromP3: deltaEOK(q.oklch, s.color.oklch) };
    }
  }

  const spineSolved = spineIdx.map((i) => steps[i]!.color.oklch);
  const dEs: number[] = [];
  for (let i = 1; i < spineSolved.length; i++) dEs.push(deltaEOK(spineSolved[i - 1]!, spineSolved[i]!));
  const dMean = dEs.reduce((a, b) => a + b, 0) / Math.max(1, dEs.length);
  const dCv = dMean > 0 ? Math.sqrt(dEs.reduce((a, b) => a + (b - dMean) ** 2, 0) / dEs.length) / dMean : 0;

  return {
    dna: { id: dna.id, name: dna.name, mode: dna.mode, kinship: dna.kinship.hybridWithinJnd, numbering: dna.steps.numbering?.class ?? null },
    target: { hueAtPeak: tintHue ?? 0, seed: null },
    selection: { families: [{ family: ref.family, weight: 1, deltaDeg: tintHue !== null && ref.tintHue !== null ? Math.abs(hueDelta(tintHue, ref.tintHue)) : 0 }], rule: 'neutral' },
    contrastSurface: dna.mode === 'light' ? 'white' : 'step0',
    keyStep: null,
    gamut,
    background: bg,
    mode: 0,
    seed: null,
    neutral: {
      family: ref.family,
      tintHue,
      tintStrength: ref.tintStrength * strengthMul,
      referenceTintHue: ref.tintHue,
      referenceTintStrength: ref.tintStrength,
      strengthMultiplier: strengthMul,
      pure: ref.pure || strengthMul === 0 || tintHue === null,
    },
    spacing: { mode: spacingMode, rule: spacingChoice.rule, deltaE: dEs, mean: dMean, cv: dCv, min: Math.min(...dEs), max: Math.max(...dEs), referenceCv: dna.steps.spacing.cvDeltaE, segments: null },
    steps,
    warnings,
  };
}
