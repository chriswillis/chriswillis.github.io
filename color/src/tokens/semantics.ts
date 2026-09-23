/**
 * Semantic family hues, derived rather than hand-picked.
 *
 * Until now the DNA transfer covered the brand and stopped: `families: { danger:
 * '#dc2626' }` meant *you* chose the red. This places danger, warning, success
 * and info by measurement instead — inside the hue windows the corpus says those
 * names actually occupy, at the positions that keep every family furthest from
 * every other, including under colour-vision deficiency.
 *
 * Four things the measurement (`spike/phase7-semantics.ts`) settled:
 *
 * **Convention is narrow.** Across the eleven shipping systems that publish them,
 * red sits at 26.1° ± 2.4, green at 150.7° ± 5.1, blue at 256.7° ± 5.0. Two standard
 * deviations of red is a ten-degree window. Warning is the exception and is
 * treated as a union, because the references genuinely disagree — orange 48.7°,
 * amber 67.0° and yellow 93.0° all ship under that meaning, so its window is 80°
 * wide and pretending otherwise would invent a precision the data lacks.
 *
 * **The search is worth running inside it.** Median gain over the conventional
 * hues is ΔEOK 0.0147, about three quarters of a JND, and in the worst case it
 * is the difference between 0.0000 and 0.0218 — a brand at 26° and danger at
 * 26.1° are the same hue, and nothing but moving one of them helps.
 *
 * **It beats hand-picking, like for like.** Scored against five of each
 * reference's own families chosen the same way — their red, orange/amber/yellow,
 * green, blue, and the remaining family furthest from those four standing in for
 * a brand — derived hues win on **all twelve**, median 0.0174 → 0.0235. Scoring
 * against a reference's full set of 9–25 families would be rigged, since more
 * families means more chances at a close pair, so that is not the comparison.
 *
 * **The brand is usually in the closest pair, and that is not a finding.** Over
 * 18 brand hues it is true 83% of the time, because a fifth family added to four
 * fixed ones will usually end up nearest one of them. It is reported as data.
 * What earns a warning is the separation being *poor* — below what nine in ten
 * references reach — which happens on one brand hue in twenty-four.
 */
import type { SystemDNA } from '../dna/schema.ts';
import type { CentroidTable } from '../dna/centroids.ts';
import type { Gamut } from '../gamut/shell.ts';
import { solveRamp } from '../solver/index.ts';
import { deltaEOK, hueDelta, wrap360, type Oklch } from '../color/oklch.ts';
import { simulate, DEFICIENCIES } from '../validate/audit.ts';
import { position, type Band } from '../validate/baseline.ts';

/**
 * What the references themselves score on this measure, like for like.
 *
 * Comparing our five families against a system's full set would be rigged — a
 * palette of twenty-five has far more chances to contain a close pair than one
 * of five, and on that comparison every reference "loses" by a wide margin. So
 * each reference is scored on five of its own families chosen the same way: its
 * red, its orange/amber/yellow, its green, its blue, and whichever remaining
 * family sits furthest from those four, standing in for a brand.
 *
 * Measured in `spike/phase7-semantics.ts`, which prints this literal and says so
 * when it has gone stale. Derived hues beat hand-picked ones on all twelve,
 * median 0.0174 → 0.0235, which is the case for doing this at all.
 */
export const FIVE_FAMILY_SEPARATION: Band = { p10: 0.0104, median: 0.0174, p90: 0.0189, min: 0.0095, max: 0.0211 };

export interface SemanticRoleSpec {
  name: string;
  /** The corpus families that carry this meaning. Several where the references disagree. */
  families: string[];
}

/**
 * The four semantic families essentially every design system ships. Not a
 * taxonomy invention: `info` is the only one with a weak claim, and it is
 * included for two measured reasons. Blue is tied for the most attested family
 * in the corpus and the second tightest after red — 256.7° ± 5.0 across eleven
 * systems — so the window is real whether or not the name is. And leaving it out
 * would free the search to place the other three on top of a colour nearly every
 * system already ships, which is the opposite of what the search is for.
 */
export const SEMANTIC_ROLES: SemanticRoleSpec[] = [
  { name: 'danger', families: ['red'] },
  { name: 'warning', families: ['orange', 'amber', 'yellow'] },
  { name: 'success', families: ['green'] },
  { name: 'info', families: ['blue'] },
];

export interface HueBand {
  role: string;
  /** The hue the best-attested family sits at — where convention points. */
  centre: number;
  lo: number;
  hi: number;
  sigmas: number;
  from: { family: string; mean: number; sd: number; n: number }[];
}

/** How many standard deviations of the corpus count as "still that colour". */
export const DEFAULT_SIGMAS = 2;

export function conventionBands(
  centroids: CentroidTable,
  roles: SemanticRoleSpec[] = SEMANTIC_ROLES,
  sigmas: number = DEFAULT_SIGMAS,
): Record<string, HueBand> {
  const out: Record<string, HueBand> = {};
  for (const role of roles) {
    const from = role.families
      .map((f) => {
        const c = centroids.families.find((x) => x.family === f)?.peak;
        return c ? { family: f, mean: c.mean, sd: c.sd, n: c.n } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    if (from.length === 0) continue;
    // the centre is the best-attested family's own mean, not the middle of the
    // union — a union's midpoint can land on a hue no system actually uses
    const best = from.reduce((a, b) => (b.n > a.n ? b : a));
    out[role.name] = {
      role: role.name,
      centre: best.mean,
      lo: Math.min(...from.map((p) => p.mean - sigmas * p.sd)),
      hi: Math.max(...from.map((p) => p.mean + sigmas * p.sd)),
      sigmas,
      from,
    };
  }
  return out;
}

/**
 * The steps families are actually told apart at. Not the whole ramp: two
 * families at the same step share a lightness by construction, so the ends —
 * near-white and near-black — are close for every pair and would dominate a
 * worst-case score with a fact about lightness rather than about hue.
 */
function sampleSteps(dna: SystemDNA, hue: number, gamut: Gamut): Oklch[] {
  const r = solveRamp({ dna, hue, gamut, sibling: false });
  const mid = Math.floor(r.steps.length / 2);
  return [mid - 2, mid, mid + 2]
    .filter((i) => i >= 0 && i < r.steps.length)
    .map((i) => r.steps[i]!.color.oklch);
}

export interface Separation {
  /** The closest any two families come, at any sampled step, in any of the four views. */
  min: number;
  binding: { a: string; b: string; view: 'normal' | 'protan' | 'deutan' | 'tritan' };
  /**
   * Every family pair's own worst distance, ascending — so `profile[0] === min`.
   * The tail is what makes the objective optimisable: see `compareSeparation`.
   */
  profile: number[];
}

/**
 * Compare two palettes by worst pair, then by second-worst, and so on.
 *
 * The obvious objective is the minimum alone, and it does not work. Minimum is
 * flat: while one pair is the binding one, moving any *other* family changes the
 * score not at all, so single-coordinate descent sees a plateau and stops — even
 * where a hue set inside the same windows scores a third higher. Comparing the
 * whole sorted vector breaks the plateau: a move that improves the second-worst
 * pair is accepted, which frees a later move to improve the worst one. This is
 * the standard leximin repair for a maximin objective, and it is free — the
 * pairwise distances were computed anyway.
 *
 * Measured over 12 references × 9 brand hues: median 0.0206 → 0.0225, mean
 * 0.0223 → 0.0237, best case +0.0166 (0.83 JND), at the same 13 × 3 budget.
 * Raising the resolution to 21 or 25 on top of it buys 0.0000–0.0003 for twice
 * the time, so the plateau, not the grid, was the binding constraint.
 */
export function compareSeparation(a: Separation, b: Separation): number {
  const n = Math.min(a.profile.length, b.profile.length);
  for (let i = 0; i < n; i++) {
    if (Math.abs(a.profile[i]! - b.profile[i]!) > 1e-9) return a.profile[i]! - b.profile[i]!;
  }
  return 0;
}

/** Worst-case separation: a palette is only as distinguishable as its closest pair. */
export function separation(colors: Record<string, Oklch[]>): Separation {
  const names = Object.keys(colors);
  let min = Infinity;
  let binding: Separation['binding'] = { a: names[0] ?? '', b: names[1] ?? '', view: 'normal' };
  const profile: number[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const A = colors[names[i]!]!, B = colors[names[j]!]!;
      let worst = Infinity;
      for (let s = 0; s < Math.min(A.length, B.length); s++) {
        for (const view of ['normal', ...DEFICIENCIES] as const) {
          const d = view === 'normal'
            ? deltaEOK(A[s]!, B[s]!)
            : deltaEOK(simulate(A[s]!, view), simulate(B[s]!, view));
          if (d < worst) worst = d;
          if (d < min) { min = d; binding = { a: names[i]!, b: names[j]!, view }; }
        }
      }
      if (Number.isFinite(worst)) profile.push(worst);
    }
  }
  profile.sort((x, y) => x - y);
  return { min: Number.isFinite(min) ? min : 0, binding, profile };
}

export interface DeriveSemanticsInput {
  dna: SystemDNA;
  centroids: CentroidTable;
  /** The brand's peak hue, which the semantics have to stay clear of. */
  brandHue: number;
  gamut?: Gamut;
  roles?: SemanticRoleSpec[];
  sigmas?: number;
  /** Positions sampled per band per sweep. */
  resolution?: number;
  sweeps?: number;
}

export interface DerivedSemantics {
  /** The chosen hue per role. */
  hues: Record<string, number>;
  /** What convention alone would have picked. */
  conventional: Record<string, number>;
  bands: Record<string, HueBand>;
  achieved: Separation;
  /** The same score at the conventional hues, so the gain is visible. */
  baseline: Separation;
  gain: number;
  /**
   * Set when the closest pair in the palette involves the brand. Reported as
   * data, not as a problem: measured over 18 brand hues it is true 83% of the
   * time, because a fifth family added to four fixed ones will usually end up
   * nearest one of them. A flag that fires five times in six describes the
   * structure rather than the palette.
   */
  brandCollision: { role: string; deltaHue: number; separation: number; view: string } | null;
  /**
   * The roles whose hue ended up on the boundary of what convention allows.
   * Data, not a warning: a maximin optimum over a box usually *is* on the
   * boundary, and measured over 144 cases at least one role sits there 93% of
   * the time, 2.2 roles per case. A flag that fires nine times in ten is
   * describing the search, not the palette.
   */
  atBandEdge: string[];
  /** Where the achieved separation sits against the same measure on the references. */
  corpus: ReturnType<typeof position>;
  warnings: string[];
}

export function deriveSemanticHues(input: DeriveSemanticsInput): DerivedSemantics {
  const { dna, centroids, brandHue } = input;
  const gamut: Gamut = input.gamut ?? 'p3';
  const roles = input.roles ?? SEMANTIC_ROLES;
  const bands = conventionBands(centroids, roles, input.sigmas ?? DEFAULT_SIGMAS);
  const names = Object.keys(bands);
  const warnings: string[] = [];
  if (names.length === 0) {
    return {
      hues: {}, conventional: {}, bands, gain: 0, brandCollision: null, atBandEdge: [],
      achieved: { min: 0, binding: { a: '', b: '', view: 'normal' }, profile: [] },
      baseline: { min: 0, binding: { a: '', b: '', view: 'normal' }, profile: [] },
      corpus: position(0, FIVE_FAMILY_SEPARATION, true),
      warnings: ['no semantic role matched a family in the centroid table; hues were not derived'],
    };
  }

  // One solve per distinct hue, reused across every candidate set that contains it.
  const cache = new Map<string, Oklch[]>();
  const stepsAt = (hue: number): Oklch[] => {
    const k = hue.toFixed(1);
    let v = cache.get(k);
    if (!v) { v = sampleSteps(dna, hue, gamut); cache.set(k, v); }
    return v;
  };
  const score = (hues: Record<string, number>): Separation => {
    const colors: Record<string, Oklch[]> = { brand: stepsAt(brandHue) };
    for (const [n, h] of Object.entries(hues)) colors[n] = stepsAt(h);
    return separation(colors);
  };

  const conventional = Object.fromEntries(names.map((n) => [n, bands[n]!.centre]));
  const baseline = score(conventional);

  // Coordinate descent. The objective is a min over pairs, so it is piecewise and
  // not differentiable; but it is low-dimensional and each axis is a short
  // interval, so sweeping one hue at a time over its band converges in two or
  // three passes and costs about 11 ms. The comparison is leximin rather than
  // min — see `compareSeparation` for why the plateau, not the grid, is what
  // limits a maximin search.
  const resolution = input.resolution ?? 13;
  const sweeps = input.sweeps ?? 3;
  let hues = { ...conventional };
  let best = baseline;
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let moved = false;
    for (const n of names) {
      const b = bands[n]!;
      for (let t = 0; t < resolution; t++) {
        const h = wrap360(b.lo + ((b.hi - b.lo) * t) / Math.max(1, resolution - 1));
        const trial = { ...hues, [n]: h };
        const s = score(trial);
        if (compareSeparation(s, best) > 0) { best = s; hues = trial; moved = true; }
      }
    }
    if (!moved) break;
  }

  const achieved = best;

  let brandCollision: DerivedSemantics['brandCollision'] = null;
  if (achieved.binding.a === 'brand' || achieved.binding.b === 'brand') {
    const role = achieved.binding.a === 'brand' ? achieved.binding.b : achieved.binding.a;
    const dh = Math.abs(hueDelta(brandHue, hues[role] ?? bands[role]?.centre ?? brandHue));
    brandCollision = { role, deltaHue: dh, separation: achieved.min, view: achieved.binding.view };
  }

  // The warning is about the *separation*, not about who is in the closest pair.
  // Below the corpus p10 means worse than nine in ten shipping systems measured
  // the same way — which is worth saying. "The brand is in the closest pair" is
  // true 83% of the time and worth nothing.
  const corpus = position(achieved.min, FIVE_FAMILY_SEPARATION, true);
  if (achieved.min < FIVE_FAMILY_SEPARATION.p10) {
    const who = brandCollision
      ? `your brand and ${brandCollision.role}, ${brandCollision.deltaHue.toFixed(0)}° apart in hue`
      : `${achieved.binding.a} and ${achieved.binding.b}`;
    // The remedy deliberately does not say "widen the windows". Doubling them —
    // sigmas 2 to 4 — is worth a median 0.0036 on exactly the 19 cases that
    // trigger this, under a fifth of a JND, and 8 of the 19 stay below p10
    // anyway. It would buy almost nothing at the cost of danger no longer
    // reading as red, which is a bad trade to recommend.
    warnings.push(
      `the closest pair in this palette is ${who}, ΔEOK ${achieved.min.toFixed(4)} under ${achieved.binding.view} vision — ` +
      `below the ${FIVE_FAMILY_SEPARATION.p10} that nine in ten reference systems reach on the same measure. ` +
      `Hue has nothing left to give here: the search already used the whole window convention allows, and widening it further ` +
      `costs the meaning of the name for a fraction of a JND. ` +
      (brandCollision
        ? `Tell your brand and ${brandCollision.role} apart by something besides hue — a different step, an icon, a label — or pick a brand hue further from ${brandCollision.role}.`
        : `Separate ${achieved.binding.a} and ${achieved.binding.b} by step or by shape rather than by colour, or drop a role you do not use.`),
    );
  }

  // Where a role landed against convention is reported, not warned about — see
  // `atBandEdge`.
  const atBandEdge = names.filter((n) => {
    const b = bands[n]!;
    return Math.abs(hueDelta(hues[n]!, b.lo)) < 0.05 || Math.abs(hueDelta(hues[n]!, b.hi)) < 0.05;
  });

  return { hues, conventional, bands, achieved, baseline, gain: achieved.min - baseline.min, brandCollision, atBandEdge, corpus, warnings };
}
