/**
 * The fuzz harness: throw the input space at the library and rank what comes
 * back.
 *
 * This is not the audit. The audit asks whether *a palette* is any good; this
 * asks whether *the library* is. The distinction drives everything here, and it
 * is why findings come in three kinds rather than one:
 *
 *   crash      — a solve threw. Always a library defect, always the worst thing
 *                in the report, and always reproducible from the case alone.
 *   invariant  — the library broke a promise it makes in its own documentation:
 *                the seed is exact, output is in gamut, lightness is monotone,
 *                the same input gives the same output. A palette cannot be
 *                "imperfect" in these ways; only the code can be wrong.
 *   finding    — a lint finding. Mostly a fact about the palette, not a defect —
 *                Open Color genuinely cannot hold AA body text — so these are
 *                ranked by rarity rather than by count. A rule firing on 90% of
 *                cases is describing the corpus; one firing on 0.3% is pointing
 *                at something.
 *
 * Deterministic by construction. The same `seed` for the campaign produces the
 * same cases in the same order, because a fuzz finding you cannot reproduce is
 * an anecdote.
 */
import { parseToOklch, deltaEOK, type Oklch } from '../color/oklch.ts';
import { exactCuspChroma, type Gamut } from '../gamut/shell.ts';
import { solvePair } from '../solver/pair.ts';
import { gamutMap } from '../solver/index.ts';
import { buildTokens } from '../tokens/build.ts';
import { audit } from './audit.ts';
import { lint, type Severity } from './lint.ts';
import type { SystemDNA } from '../dna/schema.ts';
import type { SolvedRamp } from '../solver/index.ts';

export interface FuzzCase {
  seed: string;
  reference: string;
  spacing: 'auto' | 'reference' | 'even';
  lightness: 'oklab' | 'hk';
  gamut: Gamut;
}

export interface Violation {
  kind: 'crash' | 'invariant' | 'finding';
  rule: string;
  severity: Severity;
  message: string;
  evidence: Record<string, number | string | boolean>;
  case: FuzzCase;
}

export interface FuzzResult {
  campaign: { seed: number; cases: number; elapsedMs: number; perCaseMs: number };
  crashes: Violation[];
  invariants: Violation[];
  /** Per lint rule: how often it fired, and the single worst instance. */
  byRule: Record<string, { kind: Violation['kind']; severity: Severity; count: number; rate: number; worst: Violation }>;
  /** Crashes and invariant breaks first, then the rarest lint rules. */
  worst: Violation[];
  /** Cases that produced nothing at all. */
  clean: number;
}

export interface FuzzOptions {
  /** The references to solve against, keyed by id. Light scales only. */
  references: Record<string, SystemDNA>;
  /** How many random seeds. The fixed edge cases are added on top. */
  cases?: number;
  /** Campaign seed. The same number replays the same campaign. */
  seed?: number;
  /** Restrict the settings matrix; by default every combination is sampled. */
  spacing?: FuzzCase['spacing'][];
  lightness?: FuzzCase['lightness'][];
  gamut?: Gamut[];
  /** Called after each case, for progress on a long campaign. */
  onProgress?: (done: number, total: number) => void;
}

/** mulberry32 — small, fast, and good enough that the campaign is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The cases that are always run, whatever the campaign seed. Every one of these
 * is somewhere the library has an edge: the ends of the lightness axis, zero
 * chroma where hue is undefined, and chroma past what any gamut holds so the
 * mapper has to do something.
 */
export const EDGE_SEEDS: string[] = [
  '#000000', '#ffffff', '#808080',          // the ends and the middle, achromatic
  '#010101', '#fefefe',                     // one step in from each end
  'oklch(0.5 0 0)',                         // zero chroma, hue undefined
  'oklch(0.5 0.4 0)', 'oklch(0.5 0.4 120)', // past the sRGB shell, two hues
  'oklch(0.99 0.3 90)', 'oklch(0.02 0.3 270)', // saturated at both extremes of L
  '#ff0000', '#00ff00', '#0000ff',          // sRGB primaries
  '#ffff00', '#00ffff', '#ff00ff',          // and secondaries
];

function randomSeed(r: () => number): string {
  // Sample in OKLCH rather than hex: uniform hex clusters in the middle of the
  // lightness axis and almost never produces a highly chromatic colour, which
  // is exactly where the interesting behaviour is.
  const l = 0.05 + r() * 0.9;
  const c = r() < 0.25 ? r() * 0.02 : r() * 0.32; // a quarter near-achromatic
  const h = r() * 360;
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
}

/** Checks the library's own promises, which a palette cannot legitimately fail. */
function invariants(c: FuzzCase, light: SolvedRamp, dark: SolvedRamp, seedIn: Oklch): Violation[] {
  const out: Violation[] = [];
  const add = (rule: string, message: string, evidence: Record<string, number | string | boolean>) =>
    out.push({ kind: 'invariant', rule, severity: 'error', message, evidence, case: c });

  for (const [mode, ramp] of [['light', light], ['dark', dark]] as const) {
    if (ramp.steps.length === 0) { add('empty-ramp', `${mode} ramp has no steps`, { mode }); continue; }

    // In gamut — the solver maps last and promises the result fits. Checked
    // against the exact bisection oracle rather than the nutelch LUT: the LUT is
    // an interpolation and disagrees with the true boundary by a few thousandths,
    // which is enough to report a step the solver mapped correctly.
    for (const s of ramp.steps) {
      const max = exactCuspChroma(c.gamut, s.color.oklch.l, Number.isFinite(s.color.oklch.h) ? s.color.oklch.h : 0);
      // 8-bit quantization can push a step a hair past the boundary on its own
      if (s.color.oklch.c > max + 2e-3) {
        add('out-of-gamut', `${mode} step ${s.key} carries C ${s.color.oklch.c.toFixed(4)} where ${c.gamut} holds ${max.toFixed(4)}`,
          { mode, step: s.key, chroma: Number(s.color.oklch.c.toFixed(5)), allowed: Number(max.toFixed(5)) });
      }
      if (!Number.isFinite(s.color.oklch.l) || !Number.isFinite(s.color.oklch.c)) {
        add('non-finite', `${mode} step ${s.key} is not a finite colour`, { mode, step: s.key });
      }
    }

    // Lightness monotone along the spine. Tolerance is one 8-bit step, not zero:
    // the emitted colour is quantized, and near white one LSB moves OKLab L by
    // about 0.002. Asserting exact monotonicity on quantized output reports
    // rounding as a defect, which is how this check first read three cases that
    // turned out to be one least-significant bit of blue.
    const QUANT_L = 0.004;
    const spine = ramp.steps.filter((s) => !s.detached).map((s) => s.color.oklch.l);
    if (spine.length > 2) {
      const desc = spine.every((v, i) => i === 0 || v <= spine[i - 1]! + QUANT_L);
      const asc = spine.every((v, i) => i === 0 || v >= spine[i - 1]! - QUANT_L);
      if (!desc && !asc) {
        add('non-monotone', `${mode} spine lightness turns around`, { mode, first: Number(spine[0]!.toFixed(4)), last: Number(spine[spine.length - 1]!.toFixed(4)) });
      }
    }

    // no two steps identical — two tokens with one colour is a defect the caller cannot see
    for (let i = 1; i < ramp.steps.length; i++) {
      const d = deltaEOK(ramp.steps[i - 1]!.color.oklch, ramp.steps[i]!.color.oklch);
      if (d === 0) add('duplicate-steps', `${mode} steps ${ramp.steps[i - 1]!.key} and ${ramp.steps[i]!.key} are the same colour`, { mode, a: ramp.steps[i - 1]!.key, b: ramp.steps[i]!.key });
    }
  }

  // The seed is exact at its step — the premise of the whole library. But a seed
  // outside the output gamut cannot be reproduced and is not meant to be: the
  // promise is exactness against the *mapped* seed, which is the best the gamut
  // allows. Comparing against the raw input instead reports every out-of-gamut
  // seed as a defect, which is a bug in the check and not in the solver.
  const placed = light.steps.find((s) => s.isSeed);
  if (!placed) {
    add('seed-not-placed', 'the seed was not placed on any step', {});
  } else {
    const { mapped } = gamutMap(seedIn, c.gamut);
    const d = deltaEOK(placed.color.oklch, mapped);
    // 8-bit quantization is allowed; anything past that is not
    if (d > 0.01) add('seed-inexact', `the seed came back ΔEOK ${d.toFixed(4)} from the in-gamut colour it asked for`, { deltaE: Number(d.toFixed(5)), step: placed.key });
  }

  return out;
}

export function fuzz(opts: FuzzOptions): FuzzResult {
  const refIds = Object.keys(opts.references).filter((id) => opts.references[id]!.mode === 'light');
  if (refIds.length === 0) throw new Error('fuzz: no light references supplied');
  const campaignSeed = opts.seed ?? 1;
  const r = rng(campaignSeed);
  const spacings = opts.spacing ?? (['auto', 'reference', 'even'] as const);
  const lightnesses = opts.lightness ?? (['oklab', 'hk'] as const);
  const gamuts = opts.gamut ?? (['srgb', 'p3'] as const);

  const seeds = [...EDGE_SEEDS, ...Array.from({ length: opts.cases ?? 200 }, () => randomSeed(r))];
  const cases: FuzzCase[] = seeds.map((seed) => ({
    seed,
    reference: refIds[Math.floor(r() * refIds.length)]!,
    spacing: spacings[Math.floor(r() * spacings.length)]!,
    lightness: lightnesses[Math.floor(r() * lightnesses.length)]!,
    gamut: gamuts[Math.floor(r() * gamuts.length)]!,
  }));

  const crashes: Violation[] = [];
  const invariantHits: Violation[] = [];
  const findings: Violation[] = [];
  let clean = 0;
  const t0 = Date.now();

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    const light = opts.references[c.reference]!;
    try {
      const seedIn = parseToOklch(c.seed);
      const pair = solvePair({ light, seed: c.seed, gamut: c.gamut, spacing: c.spacing, lightness: c.lightness });
      const inv = invariants(c, pair.light, pair.dark, seedIn);

      const tokens = buildTokens(pair);
      const a = audit(tokens, { reference: light, ramps: { light: pair.light, dark: pair.dark } });
      const l = lint(tokens, a);

      // determinism: the same case twice must agree exactly
      const again = solvePair({ light, seed: c.seed, gamut: c.gamut, spacing: c.spacing, lightness: c.lightness });
      const same = again.light.steps.every((s, k) => s.color.native === pair.light.steps[k]!.color.native)
        && again.dark.steps.every((s, k) => s.color.native === pair.dark.steps[k]!.color.native);
      if (!same) inv.push({ kind: 'invariant', rule: 'non-deterministic', severity: 'error', message: 'the same case solved twice gave different colours', evidence: {}, case: c });

      // promises the solver made, re-measured on the emitted 8-bit colour
      for (const mode of tokens.modes) {
        const p = a.promises[mode];
        if (p && p.broken > 0) {
          const b = p.checked.find((x) => !x.held)!;
          inv.push({
            kind: 'invariant', rule: 'promise-broken', severity: 'error',
            message: `${mode} step ${b.step} promised ${b.threshold}:1 and measures ${b.measured.toFixed(2)}:1`,
            evidence: { mode, step: b.step, threshold: b.threshold, measured: Number(b.measured.toFixed(3)), broken: p.broken },
            case: c,
          });
        }
      }

      invariantHits.push(...inv);
      for (const f of l.findings) {
        findings.push({ kind: 'finding', rule: f.rule, severity: f.severity, message: f.message, evidence: f.evidence, case: c });
      }
      if (inv.length === 0 && l.findings.filter((f) => f.severity !== 'info').length === 0) clean++;
    } catch (e) {
      crashes.push({
        kind: 'crash', rule: 'threw', severity: 'error',
        message: (e as Error).message ?? String(e),
        evidence: { stack: ((e as Error).stack ?? '').split('\n').slice(0, 3).join(' | ') },
        case: c,
      });
    }
    opts.onProgress?.(i + 1, cases.length);
  }

  const elapsedMs = Date.now() - t0;

  // ── ranking ────────────────────────────────────────────────────────────────
  // Lint rules are ranked by rarity, not by count. A rule that fires on most
  // cases is describing the corpus — Open Color cannot hold AA body text, and
  // saying so 400 times is one fact, not 400 problems. A rule that fires twice
  // in a thousand cases is pointing at something specific.
  // `count` is instances, `rate` is the share of *cases* that saw the rule at
  // all. They are different questions and conflating them gives rates over 100%:
  // one case can produce a dozen `requirement-unmet` findings, and a dozen of one
  // problem is still one case.
  const byRule: FuzzResult['byRule'] = {};
  const casesSeen: Record<string, Set<number>> = {};
  const caseIndex = new Map<FuzzCase, number>(cases.map((c, i) => [c, i]));
  for (const v of [...invariantHits, ...findings]) {
    const e = byRule[v.rule];
    (casesSeen[v.rule] ??= new Set()).add(caseIndex.get(v.case) ?? -1);
    if (!e) { byRule[v.rule] = { kind: v.kind, severity: v.severity, count: 1, rate: 0, worst: v }; continue; }
    e.count++;
    if (v.severity === 'error' && e.severity !== 'error') { e.severity = 'error'; e.worst = v; }
  }
  for (const [rule, e] of Object.entries(byRule)) e.rate = (casesSeen[rule]?.size ?? 0) / Math.max(1, cases.length);

  const sevRank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const worst: Violation[] = [
    ...crashes,
    ...invariantHits,
    ...Object.entries(byRule)
      .filter(([, e]) => e.kind === 'finding' && e.severity !== 'info')
      .sort((a, b) => sevRank[a[1].severity] - sevRank[b[1].severity] || a[1].rate - b[1].rate)
      .map(([, e]) => e.worst),
  ];

  return {
    campaign: { seed: campaignSeed, cases: cases.length, elapsedMs, perCaseMs: elapsedMs / Math.max(1, cases.length) },
    crashes, invariants: invariantHits, byRule, worst, clean,
  };
}

/** A one-line command that replays a single case. */
export function reproduce(c: FuzzCase): string {
  return `palette({ seed: '${c.seed}', reference: '${c.reference}', spacing: '${c.spacing}', lightness: '${c.lightness}', gamut: '${c.gamut}' })`;
}
