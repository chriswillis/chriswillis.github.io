/**
 * Solve one seed into a light ramp and a dark ramp at once.
 *
 * The seed is exact in both modes and lands on the same step key in both. That
 * is not a convenience — it is what Radix does: its step 9 solid is
 * byte-identical between its light and dark scales in all 25 families, and it
 * accepts the consequence that the same color reads 3.18:1 on the light surface
 * and 5.78:1 on the dark one. A brand color that changed between modes would
 * not be a brand color.
 *
 * The dark reference is either the system's own dark scale, when it ships one,
 * or `deriveDarkDNA` (see dark/mirror.ts) applied to the light one.
 */
import type { SystemDNA } from '../dna/schema.ts';
import { solveRamp, placeSeed, type SolveInput, type SolvedRamp } from './index.ts';
import { solveNeutralRamp, type SolveNeutralInput } from './neutral.ts';
import { deriveDarkDNA, defaultDarkSurface, type DarkMirrorOptions } from '../dark/mirror.ts';
import { parseToOklch, deltaEOK, wrap360, type Oklch } from '../color/oklch.ts';
import { wcag21Fast, apcaFast } from '../contrast/fast.ts';
import type { Gamut } from '../gamut/shell.ts';

export interface SolvePairInput extends Omit<SolveInput, 'dna' | 'background'> {
  /** The light reference. */
  light: SystemDNA;
  /** The reference's own dark scale, when it ships one (Radix). Omitted, it is derived from `light`. */
  dark?: SystemDNA;
  /** Options for the derivation, ignored when `dark` is supplied. */
  mirror?: DarkMirrorOptions;
  /** The light page background. Default: the light system's lightest neutral. */
  lightBackground?: string | Oklch;
  /** The dark page background. Default: the dark reference's own darkest neutral. */
  darkBackground?: string | Oklch;
  /** Also solve a neutral ramp in each mode, tinted from the seed. */
  neutrals?: boolean | Omit<SolveNeutralInput, 'dna' | 'background' | 'gamut'>;
}

export interface SolvedPair {
  light: SolvedRamp;
  dark: SolvedRamp;
  neutrals?: { light: SolvedRamp; dark: SolvedRamp };
  /** The dark reference used, and where it came from. */
  darkSource: { id: string; kind: 'authored' | 'derived'; warnings: string[] };
  /** The step the seed holds in both modes, and what that one color costs in each. */
  pin: {
    stepKey: string;
    color: Oklch;
    /** Identical in both modes by construction; 0 unless the seed was out of gamut in one of them. */
    deltaE: number;
    light: { wcagVsBg: number; apcaOnBg: number };
    dark: { wcagVsBg: number; apcaOnBg: number };
  } | null;
  /** Step-by-step agreement between the two ramps, for the report. */
  correspondence: { key: string; deltaE: number; lightWcag: number; darkWcag: number; lightApca: number; darkApca: number }[];
  warnings: string[];
}

const asOklch = (c: string | Oklch): Oklch => {
  const o = typeof c === 'string' ? parseToOklch(c) : c;
  return { l: o.l, c: o.c, h: Number.isNaN(o.h) ? 0 : wrap360(o.h) };
};

function lightestNeutral(dna: SystemDNA): Oklch {
  let best: Oklch | null = null;
  for (const n of Object.values(dna.neutrals)) {
    for (let i = 0; i < n.knots.L.length; i++) {
      if (!best || n.knots.L[i]! > best.l) best = { l: n.knots.L[i]!, c: n.knots.C[i]!, h: Number.isNaN(n.knots.h[i]!) ? 0 : n.knots.h[i]! };
    }
  }
  return best ?? { l: 1, c: 0, h: 0 };
}

/**
 * Memoised dark derivation.
 *
 * `deriveDarkDNA` mirrors *every* family in the reference — 17 for Tailwind v4,
 * 25 for Radix — while a single solve needs one. Measured, it is 336 ms against
 * 7 ms for the rest of a pair solve put together: 98% of the cost of
 * `solvePair`, repeated in full on every call, to produce a value that depends
 * only on the reference and the mirror options. Caching it takes a solve from
 * 329 ms to 7 ms, which is the difference between a tool you click and a tool
 * you drag.
 *
 * Keyed by the reference object itself through a WeakMap, so nothing is retained
 * once the caller drops the DNA. The derived DNA is shared between callers and
 * must be treated as immutable — which it already is everywhere in this
 * library, and which `deriveDarkDNA` remains available for when it is not.
 */
const derivedCache = new WeakMap<SystemDNA, Map<string, SystemDNA>>();

/**
 * Key the options stably. Not `JSON.stringify(opts, keys.sort())` — an array
 * replacer filters keys at *every* depth, so a nested `surface: {l, c, h}`
 * would serialise to `{}` and two different surfaces would share a cache entry.
 * Sorting recursively instead keeps the key insensitive to property order
 * without discarding anything.
 */
function stableKey(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableKey).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableKey(o[k])}`).join(',')}}`;
}

function derivedFor(light: SystemDNA, opts: DarkMirrorOptions): SystemDNA {
  let byOpts = derivedCache.get(light);
  if (!byOpts) { byOpts = new Map(); derivedCache.set(light, byOpts); }
  const key = stableKey(opts);
  const hit = byOpts.get(key);
  if (hit) return hit;
  const dna = deriveDarkDNA(light, opts);
  byOpts.set(key, dna);
  return dna;
}

export function solvePair(input: SolvePairInput): SolvedPair {
  const { light } = input;
  if (light.mode !== 'light') throw new Error(`solvePair: ${light.id} is a dark scale; pass it as \`dark\` with a light system as \`light\``);
  const gamut: Gamut = input.gamut ?? 'p3';
  const warnings: string[] = [];

  const dark = input.dark ?? derivedFor(light, { ...input.mirror, gamut: input.mirror?.gamut ?? light.authoredGamut });
  if (input.dark && input.dark.mode !== 'dark') throw new Error(`solvePair: ${input.dark.id} is not a dark scale`);
  const darkSource: SolvedPair['darkSource'] = {
    id: dark.id,
    kind: input.dark ? 'authored' : 'derived',
    warnings: dark.derivedFrom?.warnings ?? [],
  };

  const lightBg = asOklch(input.lightBackground ?? lightestNeutral(light));
  const darkBg = asOklch(input.darkBackground ?? (dark.derivedFrom?.darkSurface ?? defaultDarkSurface(dark).surface));

  // The seed decides its step in the light reference; the dark solve is pinned to that
  // same key so the two ramps line up role for role. Without this a seed whose lightness
  // ranks differently against the dark curve could land a step away and the pair would
  // not correspond.
  const seed = input.seed !== undefined ? asOklch(input.seed) : null;
  let seedStep = input.seedStep;
  const common = { ...input, gamut } as Omit<SolveInput, 'dna'>;
  const lightRamp = solveRamp({ ...common, dna: light, background: lightBg });
  if (seed && !seedStep) seedStep = lightRamp.seed?.stepKey;

  let darkRamp: SolvedRamp;
  if (seed && seedStep && dark.steps.keys?.includes(seedStep)) {
    darkRamp = solveRamp({ ...common, dna: dark, background: darkBg, seedStep });
  } else {
    darkRamp = solveRamp({ ...common, dna: dark, background: darkBg });
    if (seed && seedStep) warnings.push(`the dark reference ${dark.id} has no step "${seedStep}"; the seed was placed independently there, so the two ramps may not correspond step for step`);
  }

  // pin report
  let pin: SolvedPair['pin'] = null;
  if (seed) {
    const ls = lightRamp.steps.find((s) => s.isSeed);
    const ds = darkRamp.steps.find((s) => s.isSeed);
    if (ls && ds) {
      pin = {
        stepKey: ls.key,
        color: ls.color.oklch,
        deltaE: deltaEOK(ls.color.oklch, ds.color.oklch),
        light: { wcagVsBg: ls.contrast.wcagVsBg, apcaOnBg: ls.contrast.apcaOnBg },
        dark: { wcagVsBg: ds.contrast.wcagVsBg, apcaOnBg: ds.contrast.apcaOnBg },
      };
      if (ls.key !== ds.key) warnings.push(`the seed holds step ${ls.key} in light mode and ${ds.key} in dark mode; the ramps do not correspond step for step`);
      if (pin.deltaE > 0.001) warnings.push(`the seed is not identical in both modes (ΔEOK ${pin.deltaE.toFixed(4)}) — it is outside one of the two gamuts and was mapped there`);
      const spread = Math.max(pin.light.wcagVsBg, pin.dark.wcagVsBg) / Math.min(pin.light.wcagVsBg, pin.dark.wcagVsBg);
      if (spread > 2) warnings.push(`holding step ${ls.key} at one color costs it ${pin.light.wcagVsBg.toFixed(2)}:1 on the light background and ${pin.dark.wcagVsBg.toFixed(2)}:1 on the dark one — a ${spread.toFixed(1)}× spread. Radix accepts this for its solids (yellow-9 is 1.23:1 and 14.93:1); if this step carries text, it cannot be one color in both modes.`);
    }
  }

  const correspondence = lightRamp.steps.map((s, i) => {
    const d = darkRamp.steps[i];
    return {
      key: s.key,
      deltaE: d ? deltaEOK(s.color.oklch, d.color.oklch) : NaN,
      lightWcag: s.contrast.wcagVsBg, darkWcag: d?.contrast.wcagVsBg ?? NaN,
      lightApca: s.contrast.apcaOnBg, darkApca: d?.contrast.apcaOnBg ?? NaN,
    };
  });

  let neutrals: SolvedPair['neutrals'];
  if (input.neutrals) {
    const nOpts = typeof input.neutrals === 'object' ? input.neutrals : {};
    const tint = nOpts.tintHue === undefined && nOpts.tintFrom === undefined && seed ? { tintFrom: seed } : {};
    neutrals = {
      light: solveNeutralRamp({ ...nOpts, ...tint, dna: light, gamut, background: lightBg }),
      dark: solveNeutralRamp({ ...nOpts, ...tint, dna: dark, gamut, background: darkBg }),
    };
  }

  // A step that carries body text in one mode and not the other cannot be one text token.
  // This is the cost of pinning, and it lands on the steps nearest the pin: they keep their
  // color and give up their place in the contrast ladder.
  const asymmetric = correspondence.filter((c) => Math.abs(c.lightApca) >= 45 && Math.abs(c.darkApca) < 30);
  if (asymmetric.length) {
    warnings.push(`step${asymmetric.length > 1 ? 's' : ''} ${asymmetric.map((c) => c.key).join(', ')} carr${asymmetric.length > 1 ? 'y' : 'ies'} body text in light mode (|Lc| ${asymmetric.map((c) => Math.abs(c.lightApca).toFixed(0)).join(', ')}) but only |Lc| ${asymmetric.map((c) => Math.abs(c.darkApca).toFixed(0)).join(', ')} in dark mode — they are solids in dark mode, not text. Use a step further from the pin for text, or unpin.`);
  }

  return { light: lightRamp, dark: darkRamp, ...(neutrals ? { neutrals } : {}), darkSource, pin, correspondence, warnings };
}

/** WCAG and APCA of a color against both backgrounds — what a pinned step actually costs. */
export function pinCost(color: Oklch, lightBg: Oklch, darkBg: Oklch) {
  return {
    light: { wcag: wcag21Fast(color, lightBg), apca: apcaFast(color, lightBg) },
    dark: { wcag: wcag21Fast(color, darkBg), apca: apcaFast(color, darkBg) },
  };
}
