/**
 * Generic ingest: a palette is `{ family: { stepKey: cssColor } }`. Produces
 * Ramps normalized to the system's mode (light scales run light → dark; dark
 * scales are kept as authored, dark → light), with neutrals dropped and the
 * key step resolved.
 */
import { parseToOklch } from '../color/oklch.ts';
import type { Ramp } from './types.ts';

export type PaletteInput = Record<string, Record<string, string>>;

export interface IngestOptions {
  id: string;
  /** 'light' (default) normalizes to light → dark. 'dark' keeps dark → light. */
  mode?: 'light' | 'dark';
  /** Step key the system documents as its key/brand step (Tailwind '500', Radix '9'). */
  keyStepKey?: string;
  /** Gamut the values were authored for. Default 'srgb'; Tailwind v4 is 'p3'. */
  gamut?: 'srgb' | 'p3';
  /** Families to treat as neutral regardless of chroma. */
  neutrals?: string[];
  /** 'chromatic' (default) drops neutrals; 'neutral' keeps only them. */
  select?: 'chromatic' | 'neutral';
  /** Max-chroma threshold below which a family counts as neutral. */
  neutralChroma?: number;
  /** Sort step keys numerically (default) or keep insertion order. */
  keyOrder?: 'numeric' | 'insertion';
}

export function ingestPalette(colors: PaletteInput, opts: IngestOptions): Map<string, Ramp> {
  const mode = opts.mode ?? 'light';
  const ramps = new Map<string, Ramp>();
  for (const [family, scale] of Object.entries(colors)) {
    if (!scale || typeof scale !== 'object') continue;
    const wantNeutral = opts.select === 'neutral';
    const namedNeutral = opts.neutrals?.includes(family) ?? false;
    let entries = Object.entries(scale);
    if (entries.length < 3) continue;
    if ((opts.keyOrder ?? 'numeric') === 'numeric' && entries.every(([k]) => Number.isFinite(Number(k)))) {
      entries = entries.sort((a, b) => Number(a[0]) - Number(b[0]));
    }
    let cols = entries.map(([, css]) => parseToOklch(css));
    const lowChroma = Math.max(...cols.map((c) => c.c)) < (opts.neutralChroma ?? 0.05);
    const isNeutral = namedNeutral || lowChroma;
    if (wantNeutral ? !isNeutral : isNeutral) continue;
    let steps = entries.map(([key, css]) => ({ key, css }));
    const firstL = cols[0]!.l;
    const lastL = cols[cols.length - 1]!.l;
    const needsReverse = mode === 'light' ? firstL < lastL : firstL > lastL;
    if (needsReverse) {
      steps = [...steps].reverse();
      cols = [...cols].reverse();
    }
    let anchorIndex = opts.keyStepKey ? steps.findIndex((s) => s.key === opts.keyStepKey) : -1;
    if (anchorIndex < 0) {
      anchorIndex = 0;
      for (let i = 1; i < cols.length; i++) if (cols[i]!.c > cols[anchorIndex]!.c) anchorIndex = i;
    }
    ramps.set(family, { system: opts.id, family, gamut: opts.gamut ?? 'srgb', steps, anchorIndex, numbering: 'nominal' });
  }
  return ramps;
}
