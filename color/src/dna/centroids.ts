/**
 * Hue-family centroids across the cross-system dataset, and a nearest-centroid
 * classifier that reports σ as a confidence figure (z = |Δh| / σ).
 *
 * Two estimators are kept:
 *  - `published`: the dataset's own method (1–2 middle steps by index, pooled,
 *    unwrapped, population SD). Reproduces palettes.colorjs.io to the digit.
 *  - `peak`: one value per palette at the ramp's peak-chroma step, circular
 *    mean and SD. This is the classifier default: yellow's σ halves because the
 *    within-ramp drift toward orange no longer contaminates the estimate.
 */
import { parseToOklch, circularMean, circularSd, hueDelta, wrap360, mean, sd } from '../color/oklch.ts';

export interface CentroidStat { mean: number; sd: number; n: number }
export interface FamilyCentroid { family: string; published: CentroidStat; peak: CentroidStat }
export interface CentroidTable { $schema: 'palette-dna/centroids/1'; source: string; families: FamilyCentroid[] }

export type PaletteColors = Record<string, Record<string, string> | string>;

export function computeCentroids(palettes: { id: string; colors: PaletteColors }[], source: string, minPalettes = 3): CentroidTable {
  const byFamily = new Map<string, { pooled: number[]; peak: number[]; maxC: number }>();
  for (const p of palettes) {
    for (const [fam, scale] of Object.entries(p.colors)) {
      if (!scale || typeof scale !== 'object') continue;
      const vals = Object.values(scale);
      if (vals.length < 2) continue;
      const ok = vals.map(parseToOklch);
      const maxC = Math.max(...ok.map((o) => o.c));
      const entry = byFamily.get(fam) ?? { pooled: [], peak: [], maxC: 0 };
      entry.maxC = Math.max(entry.maxC, maxC);
      const mid = ok.slice(Math.floor(ok.length / 2), Math.ceil(ok.length / 2) + 1);
      for (const o of mid) if (Number.isFinite(o.h)) entry.pooled.push(o.h);
      const pk = ok.reduce((a, b) => (b.c > a.c ? b : a));
      if (Number.isFinite(pk.h)) entry.peak.push(pk.h);
      byFamily.set(fam, entry);
    }
  }
  const families: FamilyCentroid[] = [];
  for (const [fam, e] of byFamily) {
    if (e.peak.length < minPalettes || e.maxC < 0.05) continue; // chromatic families with enough support
    // published method: unwrap sequentially then population stats
    const unwrapped = [...e.pooled];
    for (let i = 1; i < unwrapped.length; i++) {
      const d = unwrapped[i]! - unwrapped[i - 1]!;
      if (Math.abs(d) > 180) unwrapped[i] = unwrapped[i]! + (d < 0 ? 360 : -360);
    }
    families.push({
      family: fam,
      published: { mean: wrap360(mean(unwrapped)), sd: sd(unwrapped), n: e.pooled.length },
      peak: { mean: circularMean(e.peak), sd: circularSd(e.peak), n: e.peak.length },
    });
  }
  families.sort((a, b) => b.peak.n - a.peak.n || a.family.localeCompare(b.family));
  return { $schema: 'palette-dna/centroids/1', source, families };
}

export interface Classification {
  family: string;
  deltaDeg: number;
  /** |Δh| / σ of the winning centroid. Below 1 is well inside the family; above 2 is a poor fit. */
  z: number;
  sigma: number;
  runnerUp: { family: string; deltaDeg: number; z: number } | null;
  estimator: 'peak' | 'published';
}

export function classifyHue(h: number, table: CentroidTable, estimator: 'peak' | 'published' = 'peak'): Classification {
  const ranked = table.families
    .map((f) => { const c = f[estimator]; const d = Math.abs(hueDelta(h, c.mean)); return { family: f.family, deltaDeg: d, z: d / Math.max(c.sd, 1e-6), sigma: c.sd }; })
    .sort((a, b) => a.deltaDeg - b.deltaDeg);
  const top = ranked[0]!;
  const ru = ranked[1] ?? null;
  return { family: top.family, deltaDeg: top.deltaDeg, z: top.z, sigma: top.sigma, runnerUp: ru ? { family: ru.family, deltaDeg: ru.deltaDeg, z: ru.z } : null, estimator };
}
