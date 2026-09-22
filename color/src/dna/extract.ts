/**
 * Phase 0/1 extractor: decompose a reference ramp into curves indexed by
 * normalized step n ∈ [0,1].
 *
 *   L(n)     raw OKLab lightness
 *   relC(n)  chroma / cusp chroma at (L(n), h(n)), per gamut
 *   Δh(n)    hue drift relative to the anchor step (and, separately, the
 *            peak-chroma step)
 *   contrast(n) WCAG 2.1 and APCA against the ramp's own step-0 and step-max
 *
 * n is index-based: n_i = i / (N−1). Tailwind's 50/100/…/950 labels are
 * nominal, so the label value is not used as a coordinate.
 */
import { parseToOklch, hueDelta, type Oklch } from '../color/oklch.ts';
import { shell, type Gamut } from '../gamut/shell.ts';
import { wcag21, apca, relativeLuminance } from '../contrast/index.ts';
import type { Ramp } from '../ingest/types.ts';
import { converter } from 'culori';

const toRgb = converter('rgb');
const toP3 = converter('p3');
// Tolerant gamut test. A hex color with a 0 or 255 channel lands at ±1e-9 after the
// OKLCH round trip; culori's inGamut has no epsilon and reports it out of gamut.
// Color.js uses 0.000075; we match it.
const EPS = 0.000075;
const within = (c: { r?: number; g?: number; b?: number } | undefined) => !!c && [c.r, c.g, c.b].every((v) => v !== undefined && v >= -EPS && v <= 1 + EPS);
const inSrgb = (c: Parameters<typeof toRgb>[0]) => within(toRgb(c));
const inP3 = (c: Parameters<typeof toP3>[0]) => within(toP3(c));

export interface StepDNA {
  key: string;
  n: number;
  L: number;
  C: number;
  h: number;
  Y: number;
  relC: Record<Gamut, number>;
  cuspC: Record<Gamut, number>;
  /** Hue drift from the anchor step, degrees, signed. */
  dhAnchor: number;
  /** Hue drift from the peak-chroma step, degrees, signed. */
  dhPeak: number;
  inGamut: Record<Gamut, boolean>;
  contrast: {
    wcagVsFirst: number;
    wcagVsLast: number;
    apcaOnFirst: number; // this step as text on step-0
    apcaOnLast: number; // this step as text on step-max
    wcagVsWhite: number;
    wcagVsBlack: number;
    apcaOnWhite: number;
    apcaOnBlack: number;
  };
}

export interface RampDNA {
  system: string;
  family: string;
  authoredGamut: Gamut;
  numbering: Ramp['numbering'];
  anchorIndex: number;
  peakIndex: number;
  steps: StepDNA[];
}

const WHITE: Oklch = { l: 1, c: 0, h: NaN };
const BLACK: Oklch = { l: 0, c: 0, h: NaN };

export function extractRamp(ramp: Ramp): RampDNA {
  const cols = ramp.steps.map((s) => parseToOklch(s.css));
  const N = cols.length;
  const anchor = cols[ramp.anchorIndex]!;
  let peakIndex = 0;
  for (let i = 1; i < N; i++) if (cols[i]!.c > cols[peakIndex]!.c) peakIndex = i;
  const peak = cols[peakIndex]!;
  const first = cols[0]!;
  const last = cols[N - 1]!;
  const srgb = shell('srgb');
  const p3 = shell('p3');

  const steps: StepDNA[] = cols.map((c, i) => {
    const h = Number.isNaN(c.h) ? anchor.h : c.h;
    const cuspS = srgb.cuspChroma(c.l, h);
    const cuspP = p3.cuspChroma(c.l, h);
    const culori = { mode: 'oklch' as const, l: c.l, c: c.c, h };
    return {
      key: ramp.steps[i]!.key,
      n: N > 1 ? i / (N - 1) : 0,
      L: c.l,
      C: c.c,
      h,
      Y: relativeLuminance(c),
      cuspC: { srgb: cuspS, p3: cuspP },
      relC: { srgb: cuspS > 0 ? c.c / cuspS : 0, p3: cuspP > 0 ? c.c / cuspP : 0 },
      dhAnchor: hueDelta(h, anchor.h),
      dhPeak: hueDelta(h, peak.h),
      inGamut: { srgb: inSrgb(culori), p3: inP3(culori) },
      contrast: {
        wcagVsFirst: wcag21(c, first),
        wcagVsLast: wcag21(c, last),
        apcaOnFirst: apca(c, first),
        apcaOnLast: apca(c, last),
        wcagVsWhite: wcag21(c, WHITE),
        wcagVsBlack: wcag21(c, BLACK),
        apcaOnWhite: apca(c, WHITE),
        apcaOnBlack: apca(c, BLACK),
      },
    };
  });

  return {
    system: ramp.system,
    family: ramp.family,
    authoredGamut: ramp.gamut,
    numbering: ramp.numbering,
    anchorIndex: ramp.anchorIndex,
    peakIndex,
    steps,
  };
}

/** Linear resample of a per-step series onto a common n grid. */
export function resample(ns: number[], ys: number[], grid: number[]): number[] {
  return grid.map((g) => {
    if (g <= ns[0]!) return ys[0]!;
    if (g >= ns[ns.length - 1]!) return ys[ys.length - 1]!;
    let i = 0;
    while (ns[i + 1]! < g) i++;
    const t = (g - ns[i]!) / (ns[i + 1]! - ns[i]!);
    return ys[i]! + t * (ys[i + 1]! - ys[i]!);
  });
}
