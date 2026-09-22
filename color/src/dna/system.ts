/**
 * extractSystemDNA: ramps → SystemDNA. Pure — no I/O at all. The toolchain
 * stamp is passed in (see `dna/toolchain.ts`, which is the node-only half),
 * because this module is on the solve path and has to bundle for a browser.
 */
import type { Ramp } from '../ingest/types.ts';
import { extractRamp, resample, type RampDNA } from './extract.ts';
import { findSpine, type Direction } from './spine.ts';
import { fitWeights, type StepPoint } from './weights.ts';
import { numberingMetrics, hueDriftMetrics, isDarkScale, stepSpacingMetrics } from './metrics.ts';
import { classifyHue, type CentroidTable } from './centroids.ts';
import { extractNeutral, neutralSetMetrics } from './neutrals.ts';
import { pchip, catmullRom, grid as makeGrid } from './curves.ts';
import { mean, sd } from '../color/oklch.ts';
import { APCA_VERSION } from '../contrast/index.ts';
import type { Gamut } from '../gamut/shell.ts';
import { DNA_SCHEMA, type FamilyDNA, type SystemDNA, type SourceInfo, type Toolchain, type Stat } from './schema.ts';

export interface ExtractOptions {
  id: string;
  name: string;
  mode?: 'light' | 'dark';
  pairedWith?: string;
  source: SourceInfo;
  /** Documented key step, if the system has one (Tailwind '500', Radix '9'). */
  keyStepKey?: string;
  /** Roles for detached steps, keyed by step key (e.g. Radix step roles). */
  roles?: Record<string, string>;
  centroids?: CentroidTable;
  /** The system's gray ramps, extracted separately (see dna/neutrals.ts). */
  neutralRamps?: Map<string, Ramp> | Ramp[];
  gridSize?: number;
  toolchain?: Toolchain;
  now?: () => string;
}

function stat(rows: number[][]): Stat {
  const N = rows[0]!.length;
  return { mean: Array.from({ length: N }, (_, i) => mean(rows.map((r) => r[i]!))), sd: Array.from({ length: N }, (_, i) => sd(rows.map((r) => r[i]!))) };
}

export function familyFromRamp(r: RampDNA, grid: number[], roles?: Record<string, string>, centroids?: CentroidTable): FamilyDNA {
  const L = r.steps.map((s) => s.L);
  const sp = findSpine(L);
  const n = r.steps.map((s) => s.n);
  const Lcurve = pchip(sp.spine.map((i) => n[i]!), sp.spine.map((i) => sp.L[i]!));
  const Ccurve = catmullRom(n, r.steps.map((s) => s.C));
  const relCurve = catmullRom(n, r.steps.map((s) => s.relC.srgb));
  const dhCurve = catmullRom(n, r.steps.map((s) => s.dhPeak));
  const peak = r.steps[r.peakIndex]!;
  return {
    family: r.family,
    hueAtPeak: peak.h,
    peakIndex: r.peakIndex,
    keyIndex: r.anchorIndex,
    classification: centroids ? classifyHue(peak.h, centroids) : null,
    spine: {
      indices: sp.spine,
      ...(sp.fallback ? { fallback: true } : {}),
      detached: sp.detached.map((d) => ({ ...d, ...(roles?.[r.steps[d.index]!.key] ? { role: roles[r.steps[d.index]!.key]! } : {}) })),
      flattened: sp.flattened,
      L: sp.L,
    },
    knots: {
      key: r.steps.map((s) => s.key),
      n,
      L,
      C: r.steps.map((s) => s.C),
      h: r.steps.map((s) => s.h),
      Y: r.steps.map((s) => s.Y),
      relC: { srgb: r.steps.map((s) => s.relC.srgb), p3: r.steps.map((s) => s.relC.p3) },
      cuspC: { srgb: r.steps.map((s) => s.cuspC.srgb), p3: r.steps.map((s) => s.cuspC.p3) },
      dh: r.steps.map((s) => s.dhPeak),
      inGamut: { srgb: r.steps.map((s) => s.inGamut.srgb), p3: r.steps.map((s) => s.inGamut.p3) },
      contrast: {
        wcagVsFirst: r.steps.map((s) => s.contrast.wcagVsFirst), wcagVsLast: r.steps.map((s) => s.contrast.wcagVsLast),
        apcaOnFirst: r.steps.map((s) => s.contrast.apcaOnFirst), apcaOnLast: r.steps.map((s) => s.contrast.apcaOnLast),
        wcagVsWhite: r.steps.map((s) => s.contrast.wcagVsWhite), wcagVsBlack: r.steps.map((s) => s.contrast.wcagVsBlack),
        apcaOnWhite: r.steps.map((s) => s.contrast.apcaOnWhite), apcaOnBlack: r.steps.map((s) => s.contrast.apcaOnBlack),
      },
    },
    sampled: { L: grid.map(Lcurve), C: grid.map(Ccurve), relC: grid.map(relCurve), dh: grid.map(dhCurve) },
  };
}

export function extractSystemDNA(ramps: Map<string, Ramp> | Ramp[], opts: ExtractOptions): SystemDNA {
  const neutralList = opts.neutralRamps ? (opts.neutralRamps instanceof Map ? [...opts.neutralRamps.values()] : opts.neutralRamps) : [];
  const neutralDnas = neutralList.map((r) => extractNeutral(extractRamp(r)));
  const list = ramps instanceof Map ? [...ramps.values()] : ramps;
  if (list.length === 0) throw new Error('extractSystemDNA: no ramps');
  const grid = makeGrid(opts.gridSize ?? 21);
  const dnas = list.map(extractRamp);
  const dark = opts.mode === 'dark' || (opts.mode === undefined && isDarkScale(dnas));
  const counts = [...new Set(dnas.map((d) => d.steps.length))].sort((a, b) => a - b);
  const uniform = counts.length === 1;
  const keys = uniform ? dnas[0]!.steps.map((s) => s.key) : null;

  const families: Record<string, FamilyDNA> = {};
  for (const d of dnas) families[d.family] = familyFromRamp(d, grid, opts.roles, opts.centroids);

  // chroma blend weights, in both shells; native shell = the one that transfers better
  const seriesFor = (g: Gamut): StepPoint[][] => dnas.map((d) => uniform
    ? d.steps.map((s) => ({ L: s.L, h: s.h, C: s.C, relC: s.relC[g] }))
    : grid.map((x, i) => {
        const ns = d.steps.map((s) => s.n);
        return { L: resample(ns, d.steps.map((s) => s.L), [x])[0]!, h: resample(ns, d.steps.map((s) => s.h), [x])[0]!, C: resample(ns, d.steps.map((s) => s.C), [x])[0]!, relC: resample(ns, d.steps.map((s) => s.relC[g]), [x])[0]! };
      }));
  const fitS = fitWeights(seriesFor('srgb'), 'srgb');
  const fitP = fitWeights(seriesFor('p3'), 'p3');
  const native: Gamut = fitP.hybrid.mean < fitS.hybrid.mean ? 'p3' : 'srgb';
  const fitN = native === 'p3' ? fitP : fitS;
  const midOvershoot = mean(dnas.flatMap((d) => d.steps.filter((s) => s.n >= 0.33 && s.n <= 0.67).map((s) => s.relC[native])));

  const agg = (k: 'L' | 'C' | 'relC' | 'dh') => stat(Object.values(families).map((f) => f.sampled[k]));

  return {
    $schema: DNA_SCHEMA,
    id: opts.id,
    name: opts.name,
    mode: dark ? 'dark' : 'light',
    ...(opts.pairedWith ? { pairedWith: opts.pairedWith } : {}),
    source: opts.source,
    extractedAt: (opts.now ?? (() => new Date().toISOString()))(),
    toolchain: opts.toolchain ?? { culori: 'unknown', colorjs: 'unknown', nutelch: '0.2.0@915b785', apca: APCA_VERSION },
    authoredGamut: list[0]!.gamut,
    steps: {
      keys,
      counts,
      direction: (dark ? 'dark-to-light' : 'light-to-dark') as Direction,
      keyStep: opts.keyStepKey && keys?.includes(opts.keyStepKey) ? { rule: 'documented', key: opts.keyStepKey } : { rule: 'peak-chroma', key: null },
      numbering: numberingMetrics(dnas, dark),
      spacing: stepSpacingMetrics(dnas, dnas.map((d) => families[d.family]!.spine.indices)),
    },
    nativeShell: { gamut: native, midOvershoot, evidence: { srgb: fitS.hybrid.mean, p3: fitP.hybrid.mean } },
    chroma: { w: fitN.w, wMean: fitN.wMean, label: fitN.label, basis: uniform ? 'steps' : 'grid', gamut: native },
    kinship: { hybridWithinJnd: fitN.hybrid.withinJnd, relWithinJnd: fitN.relC.withinJnd, absWithinJnd: fitN.absC.withinJnd, hybridMeanErr: fitN.hybrid.mean },
    hueDrift: hueDriftMetrics(dnas),
    fit: { L: 'pchip', C: 'catmull-rom', relC: 'catmull-rom', dh: 'catmull-rom', w: 'linear' },
    grid,
    aggregate: { L: agg('L'), C: agg('C'), relC: agg('relC'), dh: agg('dh') },
    families,
    neutrals: Object.fromEntries(neutralDnas.map((n) => [n.family, n])),
    neutralMetrics: neutralDnas.length ? neutralSetMetrics(neutralDnas) : null,
  };
}

/** Reconstruct a family's continuous curves from its knots. */
export function familyCurves(f: FamilyDNA) {
  const n = f.knots.n;
  return {
    L: pchip(f.spine.indices.map((i) => n[i]!), f.spine.indices.map((i) => f.spine.L[i]!)),
    C: catmullRom(n, f.knots.C),
    relC: (g: Gamut = 'srgb') => catmullRom(n, f.knots.relC[g]),
    dh: catmullRom(n, f.knots.dh),
    h: catmullRom(n, f.knots.h),
  };
}
