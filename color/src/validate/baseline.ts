/**
 * Phase 4 — the corpus baseline.
 *
 * An audit that invents its own pass marks reports its author's opinion. These
 * bands are measured instead: 185 chromatic ramps across the 13 reference
 * systems in `dna/`, run through every check the harness runs
 * (`npx tsx spike/phase4.ts` regenerates them). A result is reported as a
 * position in this distribution — "your worst deuteranope step pair is ΔEOK
 * 0.031, which beats 9 of the 13 systems" — rather than as a badge.
 *
 * Two of the numbers here are worth reading before trusting any of them.
 *
 * **Sub-JND steps are normal.** 37 of the 185 shipping ramps have an adjacent
 * pair closer than one JND, and the corpus median smallest step is 0.035. A
 * generated ramp that keeps every pair above 0.02 is at the better end of the
 * corpus, not merely adequate.
 *
 * **Within-ramp colour-vision deficiency is nearly free; between families it is
 * not.** A single-hue ramp is mostly a lightness ramp, and CVD preserves
 * lightness, so simulating a ramp barely moves its step separation (median
 * smallest adjacent pair 0.029 protan, against 0.035 unsimulated). Telling one
 * *family* from another at the same step is where it bites: under deuteranopia
 * Tailwind v4 loses 8.8% of its family pairs (violet and purple go from ΔEOK
 * 0.056 to 0.004), Tailwind v3's blue and purple go from 0.163 to 0.004, while
 * Carbon, Atlassian, Primer and Polaris lose none. A harness that only checks
 * within a ramp would call every one of these systems clean.
 */

export interface Band {
  p10: number;
  median: number;
  p90: number;
  min: number;
  max: number;
}

export interface CorpusBaseline {
  source: string;
  ramps: number;
  systems: number;
  /** Coefficient of variation of consecutive-step ΔEOK. Lower is more even. */
  stepUniformityCv: Band;
  /** The smallest consecutive-step ΔEOK in a ramp. */
  smallestStep: Band;
  cvd: Record<'protan' | 'deutan' | 'tritan', { minAdjacent: Band; collapsedPairs: Band }>;
  /** Share of ordered step pairs clearing 4.5:1, and Lc 60. */
  usable45: Band;
  usableLc60: Band;
  /** Mean relative chroma against the sRGB shell, and the share of steps sitting on it. */
  relCSrgb: Band;
  atShellSrgb: Band;
  /** Share of same-step family pairs that become indistinguishable under deuteranopia. */
  crossFamilyDeutanCollapse: Record<string, number>;
}

export const CORPUS: CorpusBaseline = {
  source: '185 chromatic ramps across the 13 reference systems in dna/ (spike/phase4.ts)',
  ramps: 185,
  systems: 13,
  stepUniformityCv: { p10: 0.158, median: 0.335, p90: 0.921, min: 0.062, max: 1.081 },
  smallestStep: { p10: 0.014, median: 0.035, p90: 0.052, min: 0.008, max: 0.075 },
  cvd: {
    protan: { minAdjacent: { p10: 0.012, median: 0.029, p90: 0.047, min: 0.006, max: 0.068 }, collapsedPairs: { p10: 0, median: 0, p90: 1, min: 0, max: 5 } },
    deutan: { minAdjacent: { p10: 0.013, median: 0.032, p90: 0.045, min: 0.008, max: 0.072 }, collapsedPairs: { p10: 0, median: 0, p90: 0, min: 0, max: 5 } },
    tritan: { minAdjacent: { p10: 0.013, median: 0.031, p90: 0.054, min: 0.005, max: 0.074 }, collapsedPairs: { p10: 0, median: 0, p90: 0, min: 0, max: 5 } },
  },
  usable45: { p10: 0.089, median: 0.288, p90: 0.346, min: 0, max: 0.455 },
  usableLc60: { p10: 0.122, median: 0.242, p90: 0.325, min: 0, max: 0.477 },
  relCSrgb: { p10: 0.573, median: 0.873, p90: 0.999, min: 0.185, max: 1.039 },
  atShellSrgb: { p10: 0, median: 0.273, p90: 0.8, min: 0, max: 1 },
  crossFamilyDeutanCollapse: {
    opencolor: 0.0152, openprops: 0.0167, tailwind: 0.0441, 'tailwind-v4': 0.0882,
    material: 0.0256, spectrum: 0.0128, primer: 0, polaris: 0, carbon: 0,
    atlassian: 0, webawesome: 0, 'radix-light': 0.02, 'radix-dark': 0.02,
  },
};

/** Where a value sits in a band: 0 at p10, 1 at p90, clamped, with `higherIsBetter` flipping the sense. */
export function position(value: number, band: Band, higherIsBetter: boolean): { percentileish: number; verdict: 'better than most' | 'typical' | 'worse than most' } {
  const span = band.p90 - band.p10;
  const raw = span === 0 ? 0.5 : (value - band.p10) / span;
  const t = Math.min(1, Math.max(0, raw));
  const good = higherIsBetter ? t : 1 - t;
  return { percentileish: t, verdict: good > 0.66 ? 'better than most' : good < 0.33 ? 'worse than most' : 'typical' };
}

/**
 * Where a cross-family CVD collapse rate sits against the 13 reference systems.
 * `ties` matters here because five of the thirteen lose no family pairs at all,
 * so a perfect score beats eight and ties four — saying only "better than eight"
 * would read as a ranking it has not earned.
 */
export function beatsSystems(rate: number): { beats: number; ties: number; of: number } {
  const rates = Object.values(CORPUS.crossFamilyDeutanCollapse);
  return { beats: rates.filter((r) => r > rate).length, ties: rates.filter((r) => Math.abs(r - rate) < 1e-9).length, of: rates.length };
}
