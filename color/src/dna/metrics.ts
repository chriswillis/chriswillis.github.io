/**
 * System-level metrics derived from the extracted ramps: whether the step
 * numbering carries a contrast promise, the first step meeting AA/AA-large
 * across all hues, and hue-drift ranges.
 */
import { mean, sd } from '../color/oklch.ts';
import type { RampDNA } from './extract.ts';

export interface NumberingMetrics {
  /** 'white' for light scales; the ramp's own step 0 for dark scales. */
  surface: 'white' | 'own-step-0';
  /** Per step: min and max WCAG 2.1 contrast across hue families. */
  perStepMin: number[];
  perStepMax: number[];
  /** Per step: SD across hues of log contrast. */
  perStepSigmaLogCR: number[];
  /** Mean of perStepSigmaLogCR over interior steps. */
  sigmaLogCR: number;
  class: 'contrast-bearing' | 'nominal';
  /** Step key (uniform systems) at which every hue meets the threshold, or null. */
  firstStepAtLeast: { '4.5': string | null; '3': string | null };
}

export const CONTRAST_BEARING_THRESHOLD = 0.05;

export function numberingMetrics(ramps: RampDNA[], darkScale: boolean): NumberingMetrics | null {
  const N = ramps[0]!.steps.length;
  if (!ramps.every((r) => r.steps.length === N)) return null;
  const keys = ramps[0]!.steps.map((s) => s.key);
  const perStepMin: number[] = [], perStepMax: number[] = [], perStepSigmaLogCR: number[] = [];
  let f45: string | null = null, f3: string | null = null;
  for (let i = 0; i < N; i++) {
    const cs = ramps.map((r) => (darkScale ? r.steps[i]!.contrast.wcagVsFirst : r.steps[i]!.contrast.wcagVsWhite));
    perStepMin.push(Math.min(...cs));
    perStepMax.push(Math.max(...cs));
    perStepSigmaLogCR.push(sd(cs.map(Math.log)));
    if (f45 === null && Math.min(...cs) >= 4.5) f45 = keys[i]!;
    if (f3 === null && Math.min(...cs) >= 3) f3 = keys[i]!;
  }
  const interior = perStepSigmaLogCR.slice(1, -1);
  const sigmaLogCR = interior.length ? mean(interior) : mean(perStepSigmaLogCR);
  return {
    surface: darkScale ? 'own-step-0' : 'white',
    perStepMin, perStepMax, perStepSigmaLogCR, sigmaLogCR,
    class: sigmaLogCR < CONTRAST_BEARING_THRESHOLD ? 'contrast-bearing' : 'nominal',
    firstStepAtLeast: { '4.5': f45, '3': f3 },
  };
}

export interface HueDriftMetrics { meanRange: number; maxRange: number; maxRangeFamily: string }

export function hueDriftMetrics(ramps: RampDNA[]): HueDriftMetrics {
  const ranges = ramps.map((r) => { const d = r.steps.map((s) => s.dhPeak); return { f: r.family, r: Math.max(...d) - Math.min(...d) }; });
  const maxR = ranges.reduce((a, b) => (b.r > a.r ? b : a));
  return { meanRange: mean(ranges.map((x) => x.r)), maxRange: maxR.r, maxRangeFamily: maxR.f };
}

export interface StepSpacingMetrics {
  /** Mean ΔEOK between consecutive spine steps, averaged over families. */
  meanDeltaE: number;
  /** Coefficient of variation of consecutive step ΔEOK (0 = perfectly even), averaged over families. */
  cvDeltaE: number;
  minDeltaE: number;
  maxDeltaE: number;
  class: 'even' | 'uneven' | 'role-indexed';
}

/** How evenly the reference spaces its own steps, perceptually. Spine steps only. */
export function stepSpacingMetrics(ramps: RampDNA[], spines: number[][]): StepSpacingMetrics {
  const cvs: number[] = [], means: number[] = [];
  let mn = Infinity, mx = 0;
  ramps.forEach((r, fi) => {
    const idx = spines[fi]!;
    const d: number[] = [];
    for (let k = 1; k < idx.length; k++) {
      const a = r.steps[idx[k - 1]!]!, b = r.steps[idx[k]!]!;
      d.push(Math.sqrt((a.L - b.L) ** 2 + (a.C * Math.cos((a.h * Math.PI) / 180) - b.C * Math.cos((b.h * Math.PI) / 180)) ** 2 + (a.C * Math.sin((a.h * Math.PI) / 180) - b.C * Math.sin((b.h * Math.PI) / 180)) ** 2));
    }
    const m = mean(d);
    means.push(m); cvs.push(m > 0 ? sd(d) / m : 0);
    mn = Math.min(mn, ...d); mx = Math.max(mx, ...d);
  });
  const cv = mean(cvs);
  return { meanDeltaE: mean(means), cvDeltaE: cv, minDeltaE: mn, maxDeltaE: mx, class: cv < 0.25 ? 'even' : cv < 0.5 ? 'uneven' : 'role-indexed' };
}

export function isDarkScale(ramps: RampDNA[]): boolean {
  return mean(ramps.map((r) => r.steps[0]!.L)) < 0.5;
}
