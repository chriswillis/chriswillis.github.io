/**
 * Phase 4 — the validation harness. Everything the generator claims, measured.
 *
 * The audit answers five questions about a token set, each against the corpus
 * baseline in `baseline.ts` rather than against a threshold of my own:
 *
 *  1. **The contrast matrix.** Every ordered pair of steps, in WCAG 2.1 and
 *     APCA, in both modes — so "which of these can I put on which" is a lookup
 *     rather than a guess, and the pairs where the two measures disagree are
 *     listed rather than averaged away.
 *  2. **Step uniformity.** Consecutive ΔEOK along the ramp, its coefficient of
 *     variation, and the same numbers for the reference the ramp was generated
 *     from, so a ramp is compared with its own parent as well as the corpus.
 *  3. **Colour-vision deficiency.** Protan, deutan and tritan simulation, within
 *     each ramp and — the check that actually bites — between families at the
 *     same step.
 *  4. **Gamut headroom.** Per step, the chroma left to the sRGB and P3 shells,
 *     and what the solver gave up getting there.
 *  5. **Promises.** Every contrast promise the solver made, re-measured on the
 *     emitted 8-bit colour rather than on the intended one.
 *
 * Nothing here repairs anything. A harness that quietly fixes what it finds is a
 * generator with extra steps.
 */
import { filterDeficiencyProt, filterDeficiencyDeuter, filterDeficiencyTrit, converter } from 'culori';
import type { SolvedRamp } from '../solver/index.ts';
import type { TokenSet, Mode, PrimitiveToken } from '../tokens/build.ts';
import type { SystemDNA } from '../dna/schema.ts';
import { shell, type Gamut } from '../gamut/shell.ts';
import { deltaEOK, type Oklch } from '../color/oklch.ts';
import { deltaEHK, defaultViewing, DEFAULT_STRENGTH, type ViewingConditions, type HKOptions } from '../color/hk.ts';
import { wcag21Fast, apcaFast } from '../contrast/fast.ts';
import { CORPUS, position, beatsSystems, type Band } from './baseline.ts';
import { JND } from '../dna/weights.ts';

export { JND };

export type Deficiency = 'protan' | 'deutan' | 'tritan';
export const DEFICIENCIES: Deficiency[] = ['protan', 'deutan', 'tritan'];

const toOklch = converter('oklch');
const FILTERS: Record<Deficiency, (c: unknown) => unknown> = {
  protan: filterDeficiencyProt(1) as (c: unknown) => unknown,
  deutan: filterDeficiencyDeuter(1) as (c: unknown) => unknown,
  tritan: filterDeficiencyTrit(1) as (c: unknown) => unknown,
};

/**
 * Machado, Oliveira & Fernandes (2009), as implemented by culori, at full
 * severity. A simulation is a model of what a dichromat's display would have to
 * show a trichromat to convey the same information — not a picture of what they
 * see, which nobody has — so it is good for "can these two be told apart" and
 * bad for "is this the right colour".
 */
export function simulate(color: Oklch, kind: Deficiency): Oklch {
  const r = toOklch(FILTERS[kind]({ mode: 'oklch', l: color.l, c: color.c, h: Number.isFinite(color.h) ? color.h : undefined }) as never) as { l?: number; c?: number; h?: number } | undefined;
  return { l: r?.l ?? 0, c: r?.c ?? 0, h: r?.h ?? 0 };
}

export interface ContrastCell {
  wcag: number;
  /** Signed: positive for a light foreground on a dark background, as APCA defines it. */
  apca: number;
  deltaE: number;
  /** Clears SC 1.4.3 (4.5:1) and APCA bronze (Lc 60) respectively. */
  bodyWcag: boolean;
  bodyApca: boolean;
}

export interface ContrastMatrix {
  mode: Mode;
  keys: string[];
  /** `cells[fg][bg]` — foreground first, which is the order the criteria are written in. */
  cells: ContrastCell[][];
  /** Share of ordered pairs clearing each measure, and the pairs where they disagree. */
  usable: { wcag: number; apca: number; disagree: number };
  disagreements: { fg: string; bg: string; wcag: number; apca: number }[];
}

export interface UniformityReport {
  mode: Mode;
  /** ΔEOK between consecutive steps of the emitted ramp. */
  deltaE: number[];
  mean: number;
  cv: number;
  min: number;
  max: number;
  /** The same measures on the reference this ramp came from. */
  reference: { cv: number; min: number } | null;
  corpus: { cv: ReturnType<typeof position>; min: ReturnType<typeof position> };
  /**
   * The same ramp measured with a ruler that carries a Helmholtz–Kohlrausch
   * term, so its lightness axis is apparent rather than measured. Reported
   * whether or not the ramp was built that way, because the two definitions of
   * "evenly spaced" genuinely disagree and the disagreement is invisible in
   * ΔEOK alone. `ratio` is cvHK ÷ cv: 1 means the two rulers agree, and large
   * means the ramp is even by one and not the other.
   *
   * Measured across the corpus (`spike/phase6-spacing.ts`): ramps even by ΔEOK
   * average cv 0.035 and cvHK 0.263 at full strength — and the worst are the
   * magentas, pinks and purples the effect predicts, not a random scatter.
   */
  apparent: { deltaE: number[]; mean: number; cv: number; ratio: number; viewing: ViewingConditions; strength: number };
}

export interface CvdReport {
  mode: Mode;
  within: Record<Deficiency, { minAdjacent: number; collapsedPairs: { a: string; b: string; before: number; after: number }[]; corpus: ReturnType<typeof position> }>;
  /** Families compared at the same step — the check that matters. Empty with one family. */
  betweenFamilies: Record<Deficiency, { pairs: number; collapsed: { a: string; b: string; step: string; before: number; after: number }[]; rate: number }>;
  /** How the between-family deuteranope rate compares with the 13 reference systems. */
  standing: { beats: number; ties: number; of: number } | null;
}

export interface HeadroomStep {
  key: string;
  chroma: number;
  /** Chroma the shell allows at this lightness and hue. */
  shell: Record<Gamut, number>;
  relC: Record<Gamut, number>;
  /** Chroma still available before the shell, per gamut. Negative means past it. */
  headroom: Record<Gamut, number>;
  /** What the solver could not deliver: gamut mapping and 8-bit quantization. */
  gaveUp: { mapping: number; quantization: number };
  /** ΔEOK from the sRGB sibling, for a P3 set. */
  siblingDeltaE: number;
}

export interface HeadroomReport {
  mode: Mode;
  steps: HeadroomStep[];
  meanRelCSrgb: number;
  onShellSrgb: number;
  corpus: { relC: ReturnType<typeof position>; onShell: ReturnType<typeof position> };
}

export interface PromiseCheck {
  mode: Mode;
  /** Every WCAG threshold the solver promised, re-measured on the emitted colour. */
  checked: { step: string; threshold: number; measured: number; held: boolean }[];
  held: number;
  broken: number;
}

export interface Audit {
  name: string;
  modes: Mode[];
  matrix: Partial<Record<Mode, ContrastMatrix>>;
  uniformity: Partial<Record<Mode, UniformityReport>>;
  cvd: Partial<Record<Mode, CvdReport>>;
  headroom: Partial<Record<Mode, HeadroomReport>>;
  promises: Partial<Record<Mode, PromiseCheck>>;
  corpus: typeof CORPUS;
}

export interface AuditOptions {
  /** The reference DNA, so uniformity can be compared with the ramp's own parent. */
  reference?: SystemDNA;
  /** Extra families to include in the between-family CVD check, keyed by name. */
  families?: Record<string, Partial<Record<Mode, SolvedRamp>>>;
  /** Solved ramps to read promises and mapping deltas from, when the token set came from elsewhere. */
  ramps?: Partial<Record<Mode, SolvedRamp>>;
  /** The reference family to compare uniformity against. Default: the family the solver selected. */
  referenceFamily?: string;
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };

/** Every ordered pair of a mode's primitives, in both contrast measures. */
export function contrastMatrix(colors: { key: string; color: Oklch }[], mode: Mode): ContrastMatrix {
  const keys = colors.map((c) => c.key);
  const cells: ContrastCell[][] = [];
  let okW = 0, okA = 0, dis = 0, n = 0;
  const disagreements: ContrastMatrix['disagreements'] = [];
  for (let i = 0; i < colors.length; i++) {
    const row: ContrastCell[] = [];
    for (let j = 0; j < colors.length; j++) {
      const w = wcag21Fast(colors[i]!.color, colors[j]!.color);
      const a = apcaFast(colors[i]!.color, colors[j]!.color);
      const cell: ContrastCell = { wcag: w, apca: a, deltaE: deltaEOK(colors[i]!.color, colors[j]!.color), bodyWcag: w >= 4.5, bodyApca: Math.abs(a) >= 60 };
      row.push(cell);
      if (i !== j) {
        n++;
        if (cell.bodyWcag) okW++;
        if (cell.bodyApca) okA++;
        if (cell.bodyWcag !== cell.bodyApca) { dis++; disagreements.push({ fg: keys[i]!, bg: keys[j]!, wcag: w, apca: a }); }
      }
    }
    cells.push(row);
  }
  disagreements.sort((x, y) => Math.abs(y.wcag - 4.5) - Math.abs(x.wcag - 4.5));
  return { mode, keys, cells, usable: { wcag: okW / Math.max(1, n), apca: okA / Math.max(1, n), disagree: dis / Math.max(1, n) }, disagreements };
}

export function uniformity(
  colors: Oklch[],
  mode: Mode,
  reference: Oklch[] | null,
  hkOpts: { viewing?: ViewingConditions; hk?: HKOptions } = {},
): UniformityReport {
  const d: number[] = [];
  for (let i = 1; i < colors.length; i++) d.push(deltaEOK(colors[i - 1]!, colors[i]!));
  const m = mean(d);
  const cv = m > 0 ? sd(d) / m : 0;
  const viewing = hkOpts.viewing ?? defaultViewing(mode);
  const strength = hkOpts.hk?.strength ?? DEFAULT_STRENGTH;
  const dh: number[] = [];
  for (let i = 1; i < colors.length; i++) dh.push(deltaEHK(colors[i - 1]!, colors[i]!, viewing, { ...hkOpts.hk, strength }));
  const hm = mean(dh);
  const cvHK = hm > 0 ? sd(dh) / hm : 0;
  let ref: UniformityReport['reference'] = null;
  if (reference && reference.length > 1) {
    const rd: number[] = [];
    for (let i = 1; i < reference.length; i++) rd.push(deltaEOK(reference[i - 1]!, reference[i]!));
    const rm = mean(rd);
    ref = { cv: rm > 0 ? sd(rd) / rm : 0, min: Math.min(...rd) };
  }
  return {
    mode, deltaE: d, mean: m, cv, min: Math.min(...d), max: Math.max(...d), reference: ref,
    corpus: { cv: position(cv, CORPUS.stepUniformityCv, false), min: position(Math.min(...d), CORPUS.smallestStep, true) },
    apparent: { deltaE: dh, mean: hm, cv: cvHK, ratio: cv > 1e-9 ? cvHK / cv : 1, viewing, strength },
  };
}

export function cvdReport(
  ramp: { key: string; color: Oklch }[],
  families: Record<string, { key: string; color: Oklch }[]>,
  mode: Mode,
  solidKeyByFamily: Record<string, string>,
): CvdReport {
  const within = {} as CvdReport['within'];
  for (const kind of DEFICIENCIES) {
    const s = ramp.map((r) => simulate(r.color, kind));
    const adj: number[] = [];
    for (let i = 1; i < s.length; i++) adj.push(deltaEOK(s[i - 1]!, s[i]!));
    const collapsed: { a: string; b: string; before: number; after: number }[] = [];
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const before = deltaEOK(ramp[i]!.color, ramp[j]!.color);
      const after = deltaEOK(s[i]!, s[j]!);
      if (before >= JND && after < JND) collapsed.push({ a: ramp[i]!.key, b: ramp[j]!.key, before, after });
    }
    within[kind] = { minAdjacent: adj.length ? Math.min(...adj) : 0, collapsedPairs: collapsed, corpus: position(adj.length ? Math.min(...adj) : 0, CORPUS.cvd[kind].minAdjacent, true) };
  }

  const names = Object.keys(families);
  const between = {} as CvdReport['betweenFamilies'];
  for (const kind of DEFICIENCIES) {
    const collapsed: { a: string; b: string; step: string; before: number; after: number }[] = [];
    let pairs = 0;
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const fa = families[names[i]!]!, fb = families[names[j]!]!;
      const ka = solidKeyByFamily[names[i]!], kb = solidKeyByFamily[names[j]!];
      const ca = fa.find((s) => s.key === ka) ?? fa[Math.floor(fa.length / 2)];
      const cb = fb.find((s) => s.key === kb) ?? fb[Math.floor(fb.length / 2)];
      if (!ca || !cb) continue;
      pairs++;
      const before = deltaEOK(ca.color, cb.color);
      const after = deltaEOK(simulate(ca.color, kind), simulate(cb.color, kind));
      if (before >= JND && after < JND) collapsed.push({ a: names[i]!, b: names[j]!, step: ca.key, before, after });
    }
    between[kind] = { pairs, collapsed, rate: pairs ? collapsed.length / pairs : 0 };
  }
  return { mode, within, betweenFamilies: between, standing: names.length > 1 ? beatsSystems(between.deutan.rate) : null };
}

export function headroom(primitives: PrimitiveToken[], mode: Mode, family: string): HeadroomReport {
  const shS = shell('srgb'), shP = shell('p3');
  const steps: HeadroomStep[] = [];
  for (const p of primitives) {
    if (p.family !== family) continue;
    const v = p.values[mode];
    const e = p.evidence[mode];
    if (!v || !e) continue;
    const cs = shS.cuspChroma(v.oklch.l, v.oklch.h);
    const cp = shP.cuspChroma(v.oklch.l, v.oklch.h);
    steps.push({
      key: p.step, chroma: v.oklch.c,
      shell: { srgb: cs, p3: cp },
      relC: { srgb: cs > 0 ? v.oklch.c / cs : 0, p3: cp > 0 ? v.oklch.c / cp : 0 },
      headroom: { srgb: cs - v.oklch.c, p3: cp - v.oklch.c },
      gaveUp: { mapping: e.mappingDeltaE, quantization: e.quantizationDeltaE },
      siblingDeltaE: v.siblingDeltaE,
    });
  }
  const rel = steps.map((s) => s.relC.srgb);
  const onShell = steps.filter((s) => s.relC.srgb >= 0.98).length / Math.max(1, steps.length);
  return {
    mode, steps, meanRelCSrgb: mean(rel), onShellSrgb: onShell,
    corpus: { relC: position(mean(rel), CORPUS.relCSrgb, false), onShell: position(onShell, CORPUS.atShellSrgb, false) },
  };
}

export function promiseCheck(ramp: SolvedRamp, mode: Mode): PromiseCheck {
  const checked: PromiseCheck['checked'] = [];
  for (const s of ramp.steps) {
    for (const p of s.promises) {
      const measured = wcag21Fast(s.color.oklch, ramp.background);
      checked.push({ step: s.key, threshold: p.threshold, measured, held: measured >= p.threshold - 1e-9 });
    }
  }
  return { mode, checked, held: checked.filter((c) => c.held).length, broken: checked.filter((c) => !c.held).length };
}

/** The whole harness over a token set. */
export function audit(set: TokenSet, opts: AuditOptions = {}): Audit {
  const brand = set.primitives.find((p) => p.kind === 'chromatic')?.family ?? set.primitives[0]?.family ?? 'brand';
  const out: Audit = { name: set.name, modes: set.modes, matrix: {}, uniformity: {}, cvd: {}, headroom: {}, promises: {}, corpus: CORPUS };

  for (const mode of set.modes) {
    const ramp = set.primitives.filter((p) => p.family === brand && p.values[mode]).map((p) => ({ key: p.step, color: p.values[mode]!.oklch }));
    if (!ramp.length) continue;
    out.matrix[mode] = contrastMatrix(ramp, mode);

    // The token set files the seed's ramp under its own name ("brand"), but the
    // reference knows it by the family the solver picked — so ask the solved ramp
    // which family it came from before looking it up.
    const refFamily = opts.referenceFamily
      ?? opts.ramps?.[mode]?.selection.families.slice().sort((x, y) => y.weight - x.weight)[0]?.family
      ?? brand;
    const refFam = opts.reference?.families[refFamily] ?? opts.reference?.families[brand];
    const refColors = refFam
      ? refFam.knots.L.map((_, i) => ({ l: refFam.knots.L[i]!, c: refFam.knots.C[i]!, h: Number.isFinite(refFam.knots.h[i]!) ? refFam.knots.h[i]! : 0 }))
      : null;
    out.uniformity[mode] = uniformity(ramp.map((r) => r.color), mode, refColors);

    // families for the between-family check: the brand plus anything the caller added
    const families: Record<string, { key: string; color: Oklch }[]> = { [brand]: ramp };
    const solidKey: Record<string, string> = {};
    const solidTok = set.semantics.find((s) => s.role === 'background/solid');
    if (solidTok?.alias[mode]) solidKey[brand] = solidTok.alias[mode]!.step;
    for (const [name, byMode] of Object.entries(opts.families ?? {})) {
      const r = byMode[mode];
      if (!r) continue;
      families[name] = r.steps.map((s) => ({ key: s.key, color: s.color.oklch }));
      const seeded = r.steps.find((s) => s.isSeed);
      solidKey[name] = seeded?.key ?? r.keyStep?.key ?? r.steps[Math.floor(r.steps.length / 2)]!.key;
    }
    out.cvd[mode] = cvdReport(ramp, families, mode, solidKey);
    out.headroom[mode] = headroom(set.primitives, mode, brand);

    const solved = opts.ramps?.[mode];
    if (solved) out.promises[mode] = promiseCheck(solved, mode);
  }
  return out;
}

export type { Band };
