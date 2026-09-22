/**
 * Extract L, chroma (absolute, relative, blend weight) and hue-drift curves for
 * every system in the dataset plus Radix light/dark. Writes:
 *   out/dna/<system>.json         per-family per-step extraction (serialized DNA, pre-fit)
 *   out/all-systems.json          per-system curves on a common n grid + summary metrics
 * and prints a summary table.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import Color from 'colorjs.io';
import { DATASET_IDS, datasetName, loadDatasetPalette } from '../src/ingest/dataset.ts';
import { loadRadix } from '../src/ingest/radix.ts';
import { extractRamp, resample, type RampDNA } from '../src/dna/extract.ts';
import { shell } from '../src/gamut/shell.ts';
import { mean, sd, hueDelta } from '../src/color/oklch.ts';
import type { Ramp } from '../src/ingest/types.ts';

mkdirSync('out/dna', { recursive: true });
const JND = 0.02;
const GRID = Array.from({ length: 21 }, (_, i) => i / 20);
const FOCUS = ['blue', 'yellow', 'green'];

const systems: { id: string; name: string; ramps: Map<string, Ramp> }[] = DATASET_IDS.map((id) => ({ id, name: datasetName(id), ramps: loadDatasetPalette(id) }));
systems.push({ id: 'radix-light', name: 'Radix Colors (light)', ramps: loadRadix({ mode: 'light', gamut: 'srgb' }) });
systems.push({ id: 'radix-dark', name: 'Radix Colors (dark)', ramps: loadRadix({ mode: 'dark', gamut: 'srgb' }) });

interface FamilyCurves { L: number[]; absC: number[]; relC: number[]; dh: number[]; h: number[] }
interface SystemOut {
  id: string; name: string; families: string[]; stepCounts: number[]; keys: string[] | null;
  anchorRule: string;
  curves: Record<string, FamilyCurves>; // on GRID
  mean: FamilyCurves; sd: FamilyCurves;
  monotoneViolations: string[];
  transfer: { absC: TransferStat; relC: TransferStat; hybrid: TransferStat; w: number[]; wLabel: string; basis: 'steps' | 'grid' };
  contrast: { surface: string; perStepMinWhite: number[]; perStepMaxWhite: number[]; perStepCvWhite: number[]; invariance: number; first45: string | null; first30: string | null; first45Idx: number | null; numbering: string };
  gamut: { outsideSrgbFraction: number };
  hueDrift: { meanRange: number; maxRange: number; maxRangeFamily: string };
}
interface TransferStat { mean: number; median: number; withinJnd: number; perStep: number[] }

const sh = shell('srgb');

function predict(norm: 'absC' | 'relC' | number, s: { C: number; relC: number }, d: { L: number; h: number }): number {
  if (norm === 'absC') return s.C;
  const rel = s.relC * sh.cuspChroma(d.L, d.h);
  if (norm === 'relC') return rel;
  return norm * rel + (1 - norm) * s.C;
}

const out: Record<string, SystemOut> = {};
const summaryRows: string[] = [];

for (const sys of systems) {
  const fams = [...sys.ramps.keys()];
  const dna: Record<string, RampDNA> = {};
  for (const f of fams) dna[f] = extractRamp(sys.ramps.get(f)!);
  writeFileSync(`out/dna/${sys.id}.json`, JSON.stringify({ system: sys.id, name: sys.name, extractedAt: new Date().toISOString(), families: dna }, null, 1));

  const stepCounts = [...new Set(fams.map((f) => dna[f]!.steps.length))].sort((a, b) => a - b);
  const uniform = stepCounts.length === 1;
  const keys = uniform ? dna[fams[0]!]!.steps.map((s) => s.key) : null;

  // curves on the grid
  const curves: Record<string, FamilyCurves> = {};
  for (const f of fams) {
    const r = dna[f]!;
    const ns = r.steps.map((s) => s.n);
    curves[f] = {
      L: resample(ns, r.steps.map((s) => s.L), GRID),
      absC: resample(ns, r.steps.map((s) => s.C), GRID),
      relC: resample(ns, r.steps.map((s) => s.relC.srgb), GRID),
      dh: resample(ns, r.steps.map((s) => s.dhPeak), GRID),
      h: resample(ns, r.steps.map((s) => s.h), GRID),
    };
  }
  const agg = (k: keyof FamilyCurves, fn: (xs: number[]) => number) => GRID.map((_, i) => fn(fams.map((f) => curves[f]![k][i]!)));
  const meanC: FamilyCurves = { L: agg('L', mean), absC: agg('absC', mean), relC: agg('relC', mean), dh: agg('dh', mean), h: agg('h', mean) };
  const sdC: FamilyCurves = { L: agg('L', sd), absC: agg('absC', sd), relC: agg('relC', sd), dh: agg('dh', sd), h: agg('h', sd) };

  // monotonicity (in either direction — Radix dark runs dark → light by design)
  const violations: string[] = [];
  const darkScale = mean(fams.map((f) => dna[f]!.steps[0]!.L)) < 0.5;
  for (const f of fams) {
    const L = dna[f]!.steps.map((s) => s.L);
    for (let i = 1; i < L.length; i++) {
      const bad = darkScale ? L[i]! <= L[i - 1]! : L[i]! >= L[i - 1]!;
      if (bad) violations.push(`${f} ${dna[f]!.steps[i - 1]!.key}→${dna[f]!.steps[i]!.key}`);
    }
  }

  // transfer errors — at actual steps when uniform, else on the grid
  type Pt = { L: number; h: number; C: number; relC: number };
  const series: Pt[][] = fams.map((f) => uniform
    ? dna[f]!.steps.map((s) => ({ L: s.L, h: s.h, C: s.C, relC: s.relC.srgb }))
    : GRID.map((_, i) => ({ L: curves[f]!.L[i]!, h: curves[f]!.h[i]!, C: curves[f]!.absC[i]!, relC: curves[f]!.relC[i]! })));
  const N = series[0]!.length;
  const errsFor = (norm: 'absC' | 'relC' | number[]): number[][] => {
    const per: number[][] = Array.from({ length: N }, () => []);
    for (let a = 0; a < series.length; a++) for (let b = 0; b < series.length; b++) {
      if (a === b) continue;
      for (let i = 0; i < N; i++) {
        const nrm = Array.isArray(norm) ? norm[i]! : norm;
        per[i]!.push(Math.abs(predict(nrm, series[a]![i]!, series[b]![i]!) - series[b]![i]!.C));
      }
    }
    return per;
  };
  const stat = (per: number[][]): TransferStat => {
    const all = per.flat().sort((x, y) => x - y);
    return { mean: mean(all), median: all[Math.floor(all.length / 2)]!, withinJnd: all.filter((e) => e <= JND).length / all.length, perStep: per.map(mean) };
  };
  const WS = Array.from({ length: 21 }, (_, k) => k / 20);
  const w: number[] = Array.from({ length: N }, (_, i) => {
    let best = { w: 0, e: Infinity };
    for (const ww of WS) {
      const e = mean(errsFor([...Array(N)].map(() => ww))[i]!);
      if (e < best.e) best = { w: ww, e };
    }
    return best.w;
  });
  const tAbs = stat(errsFor('absC')), tRel = stat(errsFor('relC')), tHyb = stat(errsFor(w));
  const wMean = mean(w);
  const wLabel = wMean > 0.7 ? 'relative' : wMean < 0.3 ? 'absolute' : 'mixed';

  // contrast vs white per step (uniform systems) — spread across hues
  let perStepMinWhite: number[] = [], perStepMaxWhite: number[] = [], perStepCvWhite: number[] = [];
  let first45: string | null = null, first30: string | null = null, first45Idx: number | null = null;
  if (uniform) {
    for (let i = 0; i < N; i++) {
      const cs = fams.map((f) => (darkScale ? dna[f]!.steps[i]!.contrast.wcagVsFirst : dna[f]!.steps[i]!.contrast.wcagVsWhite));
      perStepMinWhite.push(Math.min(...cs)); perStepMaxWhite.push(Math.max(...cs));
      perStepCvWhite.push(sd(cs.map(Math.log)));
      if (first45 === null && Math.min(...cs) >= 4.5) { first45 = keys![i]!; first45Idx = i; }
      if (first30 === null && Math.min(...cs) >= 3.0) first30 = keys![i]!;
    }
  }
  const invariance = perStepCvWhite.length ? mean(perStepCvWhite.slice(1, -1)) : NaN; // SD of log-contrast across hues, interior steps
  const numbering = Number.isFinite(invariance) ? (invariance < 0.05 ? 'contrast-bearing (measured)' : 'nominal') : 'unknown';

  const outside = fams.flatMap((f) => dna[f]!.steps.map((s) => (s.inGamut.srgb ? 0 : 1)));
  const ranges = fams.map((f) => { const d = dna[f]!.steps.map((s) => s.dhPeak); return { f, r: Math.max(...d) - Math.min(...d) }; });
  const maxR = ranges.reduce((a, b) => (b.r > a.r ? b : a));

  out[sys.id] = {
    id: sys.id, name: sys.name, families: fams, stepCounts, keys,
    anchorRule: sys.id.startsWith('radix') ? 'step 9' : ['tailwind', 'tailwind-v4', 'material', 'carbon', 'primer'].includes(sys.id) ? 'documented key step' : 'peak chroma',
    curves, mean: meanC, sd: sdC, monotoneViolations: violations,
    transfer: { absC: tAbs, relC: tRel, hybrid: tHyb, w, wLabel, basis: uniform ? 'steps' : 'grid' },
    contrast: { surface: darkScale ? 'own step 1 (dark background)' : 'white', perStepMinWhite, perStepMaxWhite, perStepCvWhite, invariance, first45, first30, first45Idx, numbering },
    gamut: { outsideSrgbFraction: mean(outside) },
    hueDrift: { meanRange: mean(ranges.map((r) => r.r)), maxRange: maxR.r, maxRangeFamily: maxR.f },
  };

  summaryRows.push([
    sys.name.padEnd(22), String(fams.length).padStart(4), stepCounts.join('/').padStart(8),
    (violations.length ? `${violations.length} viol.` : 'yes').padStart(9),
    `${tAbs.mean.toFixed(3)} (${(tAbs.withinJnd * 100).toFixed(0)}%)`.padStart(13),
    `${tRel.mean.toFixed(3)} (${(tRel.withinJnd * 100).toFixed(0)}%)`.padStart(13),
    `${tHyb.mean.toFixed(3)} (${(tHyb.withinJnd * 100).toFixed(0)}%)`.padStart(13),
    `${wMean.toFixed(2)} ${wLabel}`.padStart(14),
    (first45 ?? (uniform ? 'none' : 'n/a')).padStart(8),
    Number.isFinite(invariance) ? `${invariance.toFixed(2)} ${numbering.startsWith('contrast') ? 'CB' : 'nom'}`.padStart(9) : '      n/a',
    `${(out[sys.id]!.gamut.outsideSrgbFraction * 100).toFixed(0)}%`.padStart(5),
    `${out[sys.id]!.hueDrift.meanRange.toFixed(0)}° / ${maxR.r.toFixed(0)}° (${maxR.f})`,
  ].join('  '));
}

console.log('system                  hues     steps  L mono.   transfer err ΔEOK (≤JND): absC        relC       hybrid        w(n) mean   1st≥4.5:1  logCR-SD  >sRGB  Δh range mean / max');
for (const r of summaryRows) console.log(r);
console.log('\nw(n) per system (blend weight: 1 = relative chroma, 0 = absolute):');
for (const s of Object.values(out)) console.log(`  ${s.name.padEnd(22)} ${s.transfer.w.map((x) => x.toFixed(2)).join(' ')}`);
console.log('\nL monotonicity violations:');
for (const s of Object.values(out)) if (s.monotoneViolations.length) console.log(`  ${s.name}: ${s.monotoneViolations.join(', ')}`);
console.log('\nLowest step meeting 4.5:1 / 3:1 across all hues (vs white; vs own step 1 for dark scales), and contrast spread at that step:');
for (const s of Object.values(out)) {
  if (!s.keys) { console.log(`  ${s.name.padEnd(22)} variable step counts — per-family only`); continue; }
  const i = s.contrast.first45Idx;
  console.log(`  ${s.name.padEnd(22)} 4.5:1 → ${String(s.contrast.first45).padStart(4)}   3:1 → ${String(s.contrast.first30).padStart(4)}   ${i !== null ? `at ${s.keys[i]}: ${s.contrast.perStepMinWhite[i]!.toFixed(2)}–${s.contrast.perStepMaxWhite[i]!.toFixed(2)}` : ''}   [${s.contrast.surface}]`);
}

writeFileSync('out/all-systems.json', JSON.stringify({ grid: GRID, focus: FOCUS, systems: out }, null, 1));
console.log('\nwrote out/all-systems.json and out/dna/*.json');
