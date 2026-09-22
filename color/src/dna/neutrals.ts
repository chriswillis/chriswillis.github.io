/**
 * Neutral (gray) ramps need different DNA from chromatic families.
 *
 * Relative chroma is the transferable quantity for a hue family, but it is
 * meaningless for a neutral: the sRGB cusp at L 0.985, h 257° is about 0.004,
 * so Tailwind slate-50's chroma of 0.003 reads as relC 0.75 and a JND of noise
 * moves it by half. What actually distinguishes one neutral from another is a
 * **tint** — a hue that is near-constant down the ramp, and an absolute chroma
 * envelope a hundredth the size of a chromatic ramp's:
 *
 *   Tailwind v4   slate 257° C≤0.046 · gray 260° C≤0.034 · zinc 286° C≤0.017
 *                 stone 56° C≤0.013 · neutral pure gray C=0
 *   Radix         slate · mauve · sage · olive · sand · gray (pure)
 *
 * So a neutral's DNA is: the lightness spine (as for any ramp), an absolute
 * chroma envelope, and a single tint hue with its stability. Transferring it
 * means keeping L and the envelope and rotating the tint — which is exactly the
 * "tint your grays toward the brand hue" move that slate is to blue.
 */
import { findSpine, type SpineResult } from './spine.ts';
import { circularMean, circularSd, hueDelta, wrap360, mean } from '../color/oklch.ts';
import type { RampDNA } from './extract.ts';

/** Below this peak chroma a ramp is a pure gray with no tint to transfer. */
export const PURE_GRAY_MAX_CHROMA = 0.002;
/** Steps below this chroma have unreliable hue and are excluded from the tint estimate. */
const TINT_MIN_CHROMA = 0.002;

export interface NeutralDNA {
  family: string;
  /** Chroma-weighted circular mean hue of the tint; null for a pure gray. */
  tintHue: number | null;
  /** Circular SD of the tint hue over the steps that carry enough chroma to have one. */
  tintSd: number;
  /** Peak absolute chroma — how strongly the ramp is tinted. */
  tintStrength: number;
  pure: boolean;
  spine: { indices: number[]; detached: { index: number; delta: number }[]; flattened: { index: number; from: number; to: number }[]; L: number[] };
  knots: {
    key: string[]; n: number[]; L: number[]; C: number[]; h: number[]; Y: number[];
    inGamut: { srgb: boolean[]; p3: boolean[] };
    contrast: {
      wcagVsFirst: number[]; wcagVsLast: number[]; apcaOnFirst: number[]; apcaOnLast: number[];
      wcagVsWhite: number[]; wcagVsBlack: number[]; apcaOnWhite: number[]; apcaOnBlack: number[];
    };
  };
}

/** Chroma-weighted tint estimate: near-achromatic steps carry no usable hue. */
export function estimateTint(steps: { C: number; h: number }[]): { hue: number | null; sd: number; strength: number } {
  const strength = Math.max(0, ...steps.map((s) => s.C));
  const usable = steps.filter((s) => s.C >= TINT_MIN_CHROMA && Number.isFinite(s.h));
  if (strength < PURE_GRAY_MAX_CHROMA || usable.length === 0) return { hue: null, sd: 0, strength };
  // weight by chroma so the tinted end of the ramp decides the hue
  let x = 0, y = 0;
  for (const s of usable) { const r = (s.h * Math.PI) / 180; x += s.C * Math.cos(r); y += s.C * Math.sin(r); }
  const hue = wrap360((Math.atan2(y, x) * 180) / Math.PI);
  return { hue, sd: circularSd(usable.map((s) => s.h)), strength };
}

export function extractNeutral(r: RampDNA): NeutralDNA {
  const sp: SpineResult = findSpine(r.steps.map((s) => s.L));
  const tint = estimateTint(r.steps.map((s) => ({ C: s.C, h: s.h })));
  return {
    family: r.family,
    tintHue: tint.hue,
    tintSd: tint.sd,
    tintStrength: tint.strength,
    pure: tint.hue === null,
    spine: { indices: sp.spine, detached: sp.detached, flattened: sp.flattened, L: sp.L },
    knots: {
      key: r.steps.map((s) => s.key),
      n: r.steps.map((s) => s.n),
      L: r.steps.map((s) => s.L),
      C: r.steps.map((s) => s.C),
      h: r.steps.map((s) => s.h),
      Y: r.steps.map((s) => s.Y),
      inGamut: { srgb: r.steps.map((s) => s.inGamut.srgb), p3: r.steps.map((s) => s.inGamut.p3) },
      contrast: {
        wcagVsFirst: r.steps.map((s) => s.contrast.wcagVsFirst), wcagVsLast: r.steps.map((s) => s.contrast.wcagVsLast),
        apcaOnFirst: r.steps.map((s) => s.contrast.apcaOnFirst), apcaOnLast: r.steps.map((s) => s.contrast.apcaOnLast),
        wcagVsWhite: r.steps.map((s) => s.contrast.wcagVsWhite), wcagVsBlack: r.steps.map((s) => s.contrast.wcagVsBlack),
        apcaOnWhite: r.steps.map((s) => s.contrast.apcaOnWhite), apcaOnBlack: r.steps.map((s) => s.contrast.apcaOnBlack),
      },
    },
  };
}

export interface NeutralSetMetrics {
  /** Families ordered by tint strength, weakest first. */
  byStrength: string[];
  /** RMS deviation of L between neutral families at matching steps — near zero means one shared spine. */
  spineAgreement: number;
  /** Range of tint hues offered, and whether the system ships a pure gray. */
  tintHues: { family: string; hue: number | null; strength: number }[];
  hasPureGray: boolean;
}

export function neutralSetMetrics(ns: NeutralDNA[]): NeutralSetMetrics {
  const byStrength = [...ns].sort((a, b) => a.tintStrength - b.tintStrength).map((x) => x.family);
  let agreement = 0;
  const uniform = ns.length > 1 && ns.every((x) => x.knots.n.length === ns[0]!.knots.n.length);
  if (uniform) {
    const devs: number[] = [];
    for (let i = 0; i < ns[0]!.knots.L.length; i++) {
      const col = ns.map((x) => x.knots.L[i]!);
      const m = mean(col);
      devs.push(Math.sqrt(mean(col.map((v) => (v - m) ** 2))));
    }
    agreement = mean(devs);
  }
  return {
    byStrength,
    spineAgreement: agreement,
    tintHues: ns.map((x) => ({ family: x.family, hue: x.tintHue, strength: x.tintStrength })),
    hasPureGray: ns.some((x) => x.pure),
  };
}

/** Pick the neutral whose tint hue is nearest a target, preferring one with real tint. */
export function nearestNeutral(ns: NeutralDNA[], tintHue: number | null): NeutralDNA {
  if (ns.length === 0) throw new Error('nearestNeutral: no neutrals');
  if (tintHue === null) return ns.find((x) => x.pure) ?? [...ns].sort((a, b) => a.tintStrength - b.tintStrength)[0]!;
  const tinted = ns.filter((x) => !x.pure);
  if (tinted.length === 0) return ns[0]!;
  return tinted.reduce((best, x) => (Math.abs(hueDelta(tintHue, x.tintHue!)) < Math.abs(hueDelta(tintHue, best.tintHue!)) ? x : best));
}

export { circularMean };
