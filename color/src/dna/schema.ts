/**
 * Serialized DNA. Versioned. Curves are stored as knots plus a fit method and
 * reconstructed with src/dna/curves.ts, so a DNA file is re-knottable — the
 * seed-color solver warps the lightness spine and applies a chroma gain by
 * editing knots, not sampled arrays.
 */
import type { Direction } from './spine.ts';
import type { NumberingMetrics, HueDriftMetrics, StepSpacingMetrics } from './metrics.ts';
import type { Classification } from './centroids.ts';
import type { NeutralDNA, NeutralSetMetrics } from './neutrals.ts';
import type { DarkDerivation } from '../dark/mirror.ts';
import type { Gamut } from '../gamut/shell.ts';

export const DNA_SCHEMA = 'palette-dna/1' as const;

export interface Toolchain { culori: string; colorjs: string; nutelch: string; apca: string }

export interface SourceInfo {
  /** `derived` marks a DNA computed from another one rather than extracted from published values (see dark/mirror.ts). */
  kind: 'dataset' | 'npm' | 'inline' | 'derived';
  ref: string;
  version?: string;
  commit?: string;
  license?: string;
}

export interface Stat { mean: number[]; sd: number[] }

export interface FamilyKnots {
  key: string[];
  n: number[];
  L: number[];
  C: number[];
  h: number[];
  Y: number[];
  relC: Record<Gamut, number[]>;
  cuspC: Record<Gamut, number[]>;
  /** Hue drift from the peak-chroma step, degrees, signed. */
  dh: number[];
  inGamut: Record<Gamut, boolean[]>;
  contrast: {
    wcagVsFirst: number[]; wcagVsLast: number[]; apcaOnFirst: number[]; apcaOnLast: number[];
    wcagVsWhite: number[]; wcagVsBlack: number[]; apcaOnWhite: number[]; apcaOnBlack: number[];
  };
}

export interface FamilyDNA {
  family: string;
  hueAtPeak: number;
  peakIndex: number;
  keyIndex: number;
  classification: Classification | null;
  spine: {
    indices: number[];
    /** Set when the ramp had too many inversions for the bounded search (see spine.ts). */
    fallback?: boolean;
    detached: { index: number; delta: number; role?: string }[];
    flattened: { index: number; from: number; to: number }[];
    /** L used for the spine fit (after flattening). */
    L: number[];
  };
  knots: FamilyKnots;
  /** Curves sampled on `grid` for plotting/aggregation. L comes from the spine fit. */
  sampled: { L: number[]; C: number[]; relC: number[]; dh: number[] };
}

export interface SystemDNA {
  $schema: typeof DNA_SCHEMA;
  id: string;
  name: string;
  mode: 'light' | 'dark';
  pairedWith?: string;
  source: SourceInfo;
  extractedAt: string;
  toolchain: Toolchain;
  authoredGamut: Gamut;
  steps: {
    keys: string[] | null;
    counts: number[];
    direction: Direction;
    keyStep: { rule: 'documented' | 'peak-chroma'; key: string | null };
    numbering: NumberingMetrics | null;
    /** How evenly the reference spaces its own steps in ΔEOK (Carbon 0.14 … Radix 0.90). */
    spacing: StepSpacingMetrics;
  };
  nativeShell: { gamut: Gamut; midOvershoot: number; evidence: Record<Gamut, number> };
  chroma: { w: number[]; wMean: number; label: 'relative' | 'absolute' | 'mixed'; basis: 'steps' | 'grid'; gamut: Gamut };
  kinship: { hybridWithinJnd: number; relWithinJnd: number; absWithinJnd: number; hybridMeanErr: number };
  hueDrift: HueDriftMetrics;
  fit: { L: 'pchip'; C: 'catmull-rom'; relC: 'catmull-rom'; dh: 'catmull-rom'; w: 'linear' };
  grid: number[];
  aggregate: { L: Stat; C: Stat; relC: Stat; dh: Stat };
  families: Record<string, FamilyDNA>;
  /** The system's gray ramps. Their DNA is a lightness spine, a small absolute chroma envelope and a tint hue — see dna/neutrals.ts. */
  neutrals: Record<string, NeutralDNA>;
  neutralMetrics: NeutralSetMetrics | null;
  /** Present only on a DNA produced by `deriveDarkDNA`: which light DNA it came from and on what terms. */
  derivedFrom?: DarkDerivation;
}

export function serializeDNA(dna: SystemDNA): string {
  return JSON.stringify(dna, (_, v) => (typeof v === 'number' ? Number(v.toFixed(6)) : v), 1);
}

function fail(path: string, why: string): never {
  throw new Error(`DNA validation failed at ${path}: ${why}`);
}
function isNumArr(v: unknown): v is number[] { return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x)); }

/** Structural validation; throws on malformed input. */
export function parseDNA(json: string | unknown): SystemDNA {
  const d = (typeof json === 'string' ? JSON.parse(json) : json) as Partial<SystemDNA>;
  if (d.$schema !== DNA_SCHEMA) fail('$schema', `expected ${DNA_SCHEMA}, got ${String(d.$schema)}`);
  if (typeof d.id !== 'string' || !d.id) fail('id', 'missing');
  if (d.mode !== 'light' && d.mode !== 'dark') fail('mode', 'must be light|dark');
  if (!d.families || typeof d.families !== 'object') fail('families', 'missing');
  if (!isNumArr(d.grid)) fail('grid', 'not a number array');
  if (!d.chroma || !isNumArr(d.chroma.w)) fail('chroma.w', 'not a number array');
  for (const [name, f] of Object.entries(d.families)) {
    const k = f.knots;
    if (!k) fail(`families.${name}.knots`, 'missing');
    const N = k.n.length;
    for (const key of ['L', 'C', 'h', 'Y', 'dh'] as const) if (!isNumArr(k[key]) || k[key].length !== N) fail(`families.${name}.knots.${key}`, `length ${k[key]?.length} != ${N}`);
    for (let i = 1; i < N; i++) if (!(k.n[i]! > k.n[i - 1]!)) fail(`families.${name}.knots.n`, 'not strictly increasing');
    if (!f.spine || !Array.isArray(f.spine.indices) || f.spine.indices.length < 2) fail(`families.${name}.spine`, 'needs ≥2 spine steps');
    for (const i of f.spine.indices) if (i < 0 || i >= N) fail(`families.${name}.spine.indices`, `index ${i} out of range`);
  }
  if (d.derivedFrom !== undefined) {
    const v = d.derivedFrom;
    if (typeof v.from !== 'string') fail('derivedFrom.from', 'missing');
    for (const s of ['lightSurface', 'darkSurface'] as const) if (!v[s] || typeof v[s].l !== 'number') fail(`derivedFrom.${s}`, 'not a color');
    if (d.mode !== 'dark') fail('derivedFrom', 'only a dark DNA can be derived');
  }
  if (d.neutrals === undefined || typeof d.neutrals !== 'object') fail('neutrals', 'missing (rebuild with npm run build:dna)');
  for (const [name, nd] of Object.entries(d.neutrals)) {
    if (!nd.knots || !isNumArr(nd.knots.L)) fail(`neutrals.${name}.knots.L`, 'not a number array');
    if (nd.tintHue !== null && !Number.isFinite(nd.tintHue)) fail(`neutrals.${name}.tintHue`, 'must be a number or null');
  }
  return d as SystemDNA;
}
