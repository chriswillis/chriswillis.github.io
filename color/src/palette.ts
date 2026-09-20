/**
 * The one-call entry point: a seed in, a validated token set out.
 *
 * ```ts
 * const p = palette({ seed: '#7c3aed' });
 * p.tokens;   // primitives + semantics, both modes
 * p.lint;     // every finding, with its evidence and its remedy
 * ```
 *
 * **The default reference is Tailwind v4.** Its curves are the ones a generated
 * palette inherits unless another is named — the lightness spine, the relative
 * chroma shape, the hue drift, the chroma blend policy. It is the most widely
 * used of the thirteen, it documents a key step (500) so the brand fill has
 * somewhere to pin, and it is authored for Display P3, which makes P3 the
 * natural output and gives the sRGB sibling something to be a sibling of.
 *
 * One thing cannot default to it. The dark-mode calibration in `dark/mirror.ts`
 * — λ, the chroma factor, the transfer weights, the near-surface gain — is
 * measured from Radix because Radix is the only reference here that ships a
 * light *and* a dark scale of the same palette. Tailwind has no dark scale, so
 * there is nothing in it to measure. The reference supplies the curves; Radix
 * supplies the light-to-dark relationship; they are different questions and only
 * one of them has thirteen possible answers.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseDNA, type SystemDNA } from './dna/schema.ts';
import { solvePair, type SolvePairInput, type SolvedPair } from './solver/pair.ts';
import { buildTokens, type TokenSet, type BuildOptions } from './tokens/build.ts';
import { audit, type Audit } from './validate/audit.ts';
import { lint, type LintResult, type LintOptions } from './validate/lint.ts';
import type { SolvedRamp } from './solver/index.ts';

/**
 * The reference a palette inherits its curves from when none is named.
 * Tailwind v4: the most used of the thirteen, with a documented key step and
 * P3-authored values.
 */
export const DEFAULT_REFERENCE = 'tailwind-v4' as const;

/** Where the built DNA files live, relative to this module. */
const DNA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dna');

const cache = new Map<string, SystemDNA>();

/** Load a built-in DNA by id. `dna/index.json` lists them. */
export function loadDNA(id: string = DEFAULT_REFERENCE): SystemDNA {
  const hit = cache.get(id);
  if (hit) return hit;
  let raw: string;
  try {
    raw = readFileSync(resolve(DNA_DIR, `${id}.json`), 'utf8');
  } catch {
    throw new Error(`loadDNA: no built-in DNA "${id}". Run \`npm run build:dna\`, or see dna/index.json for the ids.`);
  }
  const dna = parseDNA(raw);
  cache.set(id, dna);
  return dna;
}

let idsCache: string[] | null = null;

/** The ids of the built-in DNA files. */
export function builtinDNAIds(): string[] {
  if (idsCache) return idsCache;
  const idx = JSON.parse(readFileSync(resolve(DNA_DIR, 'index.json'), 'utf8')) as { systems: { id: string }[] };
  idsCache = idx.systems.map((s) => s.id);
  return idsCache;
}

export interface PaletteOptions extends Omit<SolvePairInput, 'light' | 'dark'> {
  /**
   * The reference to inherit curves from: a built-in id, a SystemDNA, or omitted
   * for Tailwind v4.
   */
  reference?: string | SystemDNA;
  /**
   * The reference's own dark scale. A built-in id or a SystemDNA. Omitted, it is
   * derived from the light one — unless the light reference names a `pairedWith`
   * built-in, in which case that is used, because an authored dark scale beats a
   * derived one.
   */
  dark?: string | SystemDNA;
  /** Further families to solve with the same reference, keyed by name: `{ danger: '#dc2626' }`. */
  families?: Record<string, string>;
  build?: Omit<BuildOptions, 'families' | 'neutrals'>;
  lint?: LintOptions;
}

export interface Palette {
  tokens: TokenSet;
  audit: Audit;
  lint: LintResult;
  pair: SolvedPair;
  /** The extra families, when any were asked for. */
  families: Record<string, { light: SolvedRamp; dark: SolvedRamp }>;
  reference: { id: string; name: string; dark: { id: string; kind: 'authored' | 'derived' } };
}

const asDNA = (v: string | SystemDNA | undefined, fallback?: string): SystemDNA | undefined =>
  v === undefined ? (fallback ? loadDNA(fallback) : undefined) : typeof v === 'string' ? loadDNA(v) : v;

/**
 * Solve, tokenize, audit and lint in one call. Every part is available
 * separately; this is the path that picks sensible defaults for all of them.
 */
export function palette(opts: PaletteOptions): Palette {
  const { reference, dark, families: extraSeeds, build, lint: lintOpts, ...solve } = opts;
  const light = asDNA(reference, DEFAULT_REFERENCE)!;
  // an authored dark scale beats a derived one, so take the reference's own when it has one
  const darkDna = asDNA(dark) ?? (light.pairedWith && builtinDNAIds().includes(light.pairedWith) ? loadDNA(light.pairedWith) : undefined);

  const pair = solvePair({ ...solve, light, ...(darkDna ? { dark: darkDna } : {}) });

  const families: Record<string, { light: SolvedRamp; dark: SolvedRamp }> = {};
  // the neutrals belong to the set, not to each family: solve them once, with the brand
  const { neutrals: _n, ...perFamily } = solve;
  for (const [name, seed] of Object.entries(extraSeeds ?? {})) {
    const p = solvePair({ ...perFamily, light, ...(darkDna ? { dark: darkDna } : {}), seed });
    families[name] = { light: p.light, dark: p.dark };
  }

  const tokens = buildTokens(pair, { ...build, families });
  const a = audit(tokens, { reference: light, families, ramps: { light: pair.light, dark: pair.dark } });
  const l = lint(tokens, a, lintOpts);
  return {
    tokens, audit: a, lint: l, pair, families,
    reference: { id: light.id, name: light.name, dark: pair.darkSource },
  };
}
