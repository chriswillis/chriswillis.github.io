/**
 * Phase 0, part c — hybrid transfer. C_t = w·relC_ref·cusp(L_t,h_t) + (1−w)·absC_ref.
 * Fit w per step (and a single w per system) by minimizing cross-hue transfer
 * error. Reports whether the blend beats either pure normalization.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTailwindV4 } from '../src/ingest/tailwind.ts';
import { loadRadix } from '../src/ingest/radix.ts';
import { extractRamp, type RampDNA } from '../src/dna/extract.ts';
import { shell } from '../src/gamut/shell.ts';
import { mean } from '../src/color/oklch.ts';

const JND = 0.02;
const TW_CHROMATIC = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const RADIX_BRIGHT = ['sky', 'mint', 'lime', 'yellow', 'amber'];
const tw = loadTailwindV4();
const rx = loadRadix({ mode: 'light', gamut: 'srgb' });
const dna: Record<string, Record<string, RampDNA>> = { 'tailwind-v4': {}, 'radix-light': {} };
for (const f of TW_CHROMATIC) dna['tailwind-v4']![f] = extractRamp(tw.get(f)!);
for (const f of rx.keys()) dna['radix-light']![f] = extractRamp(rx.get(f)!);

function errorsAt(sys: string, fams: string[], i: number, w: number): number[] {
  const out: number[] = [];
  const sh = shell('srgb');
  for (const a of fams) for (const b of fams) {
    if (a === b) continue;
    const s = dna[sys]![a]!.steps[i]!;
    const d = dna[sys]![b]!.steps[i]!;
    const pred = w * s.relC.srgb * sh.cuspChroma(d.L, d.h) + (1 - w) * s.C;
    out.push(Math.abs(pred - d.C));
  }
  return out;
}

const WS = Array.from({ length: 21 }, (_, k) => k / 20);
const report: any = {};
for (const sys of Object.keys(dna)) {
  const fams = Object.keys(dna[sys]!).filter((f) => !(sys === 'radix-light' && RADIX_BRIGHT.includes(f)));
  const N = dna[sys]![fams[0]!]!.steps.length;
  const keys = dna[sys]![fams[0]!]!.steps.map((s) => s.key);
  // per-step best w
  const perStep = Array.from({ length: N }, (_, i) => {
    let best = { w: 0, err: Infinity };
    for (const w of WS) { const e = mean(errorsAt(sys, fams, i, w)); if (e < best.err) best = { w, err: e }; }
    return best;
  });
  // single w
  let bestSingle = { w: 0, err: Infinity, jnd: 0 };
  for (const w of WS) {
    const all = Array.from({ length: N }, (_, i) => errorsAt(sys, fams, i, w)).flat();
    const e = mean(all);
    if (e < bestSingle.err) bestSingle = { w, err: e, jnd: all.filter((x) => x <= JND).length / all.length };
  }
  const pure = (w: number) => { const all = Array.from({ length: N }, (_, i) => errorsAt(sys, fams, i, w)).flat(); return { err: mean(all), jnd: all.filter((x) => x <= JND).length / all.length }; };
  const hybridAll = Array.from({ length: N }, (_, i) => errorsAt(sys, fams, i, perStep[i]!.w)).flat();
  report[sys] = { keys, perStep, single: bestSingle, pureRel: pure(1), pureAbs: pure(0), hybrid: { err: mean(hybridAll), jnd: hybridAll.filter((x) => x <= JND).length / hybridAll.length } };
  console.log(`\n${sys} (${fams.length} families${sys === 'radix-light' ? ', bright excluded' : ''})`);
  console.log('step        ', keys.map((k) => k.padStart(5)).join(''));
  console.log('best w(n)   ', perStep.map((p) => p.w.toFixed(2).padStart(5)).join(''));
  console.log('err @best w ', perStep.map((p) => p.err.toFixed(3).padStart(5)).join(''));
  console.log(`pure relC (w=1):   mean err ${report[sys].pureRel.err.toFixed(4)}  ≤JND ${(report[sys].pureRel.jnd * 100).toFixed(0)}%`);
  console.log(`pure absC (w=0):   mean err ${report[sys].pureAbs.err.toFixed(4)}  ≤JND ${(report[sys].pureAbs.jnd * 100).toFixed(0)}%`);
  console.log(`single w=${bestSingle.w.toFixed(2)}:     mean err ${bestSingle.err.toFixed(4)}  ≤JND ${(bestSingle.jnd * 100).toFixed(0)}%`);
  console.log(`per-step w(n):     mean err ${report[sys].hybrid.err.toFixed(4)}  ≤JND ${(report[sys].hybrid.jnd * 100).toFixed(0)}%`);
}
const prev = JSON.parse(readFileSync('out/phase0.json', 'utf8'));
writeFileSync('out/phase0.json', JSON.stringify({ ...prev, hybridReport: report }, null, 1));
