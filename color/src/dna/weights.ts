/**
 * Chroma blend weight w(n): the per-step mix of relative (shell-fraction) and
 * absolute chroma that best predicts one hue family's chroma from another's
 * within the same system.
 *
 *   C_pred = w · relC_src · cusp(L_dst, h_dst) + (1 − w) · C_src
 *
 * Fit by grid search on w ∈ [0,1] minimizing mean |C_pred − C_dst| over all
 * ordered family pairs at each step. Also reports the pure-relative,
 * pure-absolute and blended transfer statistics that make up "kinship".
 */
import { shell, type Gamut } from '../gamut/shell.ts';
import { mean } from '../color/oklch.ts';

export interface StepPoint { L: number; h: number; C: number; relC: number }

export interface TransferStat { mean: number; median: number; withinJnd: number; perStep: number[] }

export interface WeightFit {
  w: number[];
  wMean: number;
  label: 'relative' | 'absolute' | 'mixed';
  absC: TransferStat;
  relC: TransferStat;
  hybrid: TransferStat;
}

export const JND = 0.02;

export function predictChroma(w: number, src: StepPoint, dst: { L: number; h: number }, gamut: Gamut = 'srgb'): number {
  const rel = src.relC * shell(gamut).cuspChroma(dst.L, dst.h);
  return w * rel + (1 - w) * src.C;
}

/**
 * `series[f][i]` is family f at step i (all families must share a step count —
 * resample to a grid first if they do not).
 */
export function fitWeights(series: StepPoint[][], gamut: Gamut = 'srgb', resolution = 20): WeightFit {
  const N = series[0]!.length;
  const F = series.length;
  const errs = (w: number | number[]): number[][] => {
    const per: number[][] = Array.from({ length: N }, () => []);
    for (let a = 0; a < F; a++) for (let b = 0; b < F; b++) {
      if (a === b) continue;
      for (let i = 0; i < N; i++) {
        const ww = Array.isArray(w) ? w[i]! : w;
        per[i]!.push(Math.abs(predictChroma(ww, series[a]![i]!, series[b]![i]!, gamut) - series[b]![i]!.C));
      }
    }
    return per;
  };
  const stat = (per: number[][]): TransferStat => {
    const all = per.flat().sort((x, y) => x - y);
    return { mean: mean(all), median: all[Math.floor(all.length / 2)] ?? 0, withinJnd: all.filter((e) => e <= JND).length / Math.max(1, all.length), perStep: per.map(mean) };
  };
  const candidates = Array.from({ length: resolution + 1 }, (_, k) => k / resolution);
  const perW = candidates.map((w) => errs(w).map(mean));
  const w = Array.from({ length: N }, (_, i) => {
    let best = 0;
    for (let k = 1; k < candidates.length; k++) if (perW[k]![i]! < perW[best]![i]!) best = k;
    return candidates[best]!;
  });
  const wMean = mean(w);
  return {
    w,
    wMean,
    label: wMean > 0.7 ? 'relative' : wMean < 0.3 ? 'absolute' : 'mixed',
    absC: stat(errs(0)),
    relC: stat(errs(1)),
    hybrid: stat(errs(w)),
  };
}
