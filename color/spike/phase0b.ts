/**
 * Phase 0, part b — the transfer test, outlier hunt, L-indexed comparison,
 * and the dark-mode mirror comparison. Appends to out/phase0.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { converter } from 'culori';
import { loadTailwindV4 } from '../src/ingest/tailwind.ts';
import { loadRadix } from '../src/ingest/radix.ts';
import { extractRamp, resample, type RampDNA } from '../src/dna/extract.ts';
import { shell } from '../src/gamut/shell.ts';
import { parseToOklch, mean, sd, type Oklch } from '../src/color/oklch.ts';
import { wcag21, apca } from '../src/contrast/index.ts';

const JND = 0.02; // ΔEOK just-noticeable difference (the CSS Color 4 gamut-mapping JND)
const toOkhsl = converter('okhsl');
const fromOkhsl = converter('oklch');

const TW_CHROMATIC = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const RADIX_BRIGHT = ['sky', 'mint', 'lime', 'yellow', 'amber'];
const FOCUS = ['blue', 'yellow', 'green'];

const tw = loadTailwindV4();
const rxL = loadRadix({ mode: 'light', gamut: 'srgb' });
const rxD = loadRadix({ mode: 'dark', gamut: 'srgb' });

const dna: Record<string, Record<string, RampDNA>> = { 'tailwind-v4': {}, 'radix-light': {}, 'radix-dark': {} };
for (const f of TW_CHROMATIC) dna['tailwind-v4']![f] = extractRamp(tw.get(f)!);
for (const f of rxL.keys()) dna['radix-light']![f] = extractRamp(rxL.get(f)!);
for (const f of rxD.keys()) dna['radix-dark']![f] = extractRamp(rxD.get(f)!);

// ────────────────────────────────────────────────────────────────────────────
// A. Transfer error. Take hue A's curve under normalization N, apply it at
//    hue B's own (L, h) per step, and measure |C_pred − C_actual| — which is
//    the ΔEOK of the miss since L and h are held. This is what the solver will
//    actually do, measured in perceptual units.
// ────────────────────────────────────────────────────────────────────────────
type Norm = 'absC' | 'relC_srgb' | 'relC_p3' | 'relC_peak_srgb' | 'okhsl_s';
const NORMS: Norm[] = ['absC', 'relC_srgb', 'relC_p3', 'relC_peak_srgb', 'okhsl_s'];

function predictC(norm: Norm, src: RampDNA, dst: RampDNA, i: number): number {
  const s = src.steps[i]!;
  const d = dst.steps[i]!;
  switch (norm) {
    case 'absC': return s.C;
    case 'relC_srgb': return s.relC.srgb * shell('srgb').cuspChroma(d.L, d.h);
    case 'relC_p3': return s.relC.p3 * shell('p3').cuspChroma(d.L, d.h);
    case 'relC_peak_srgb': {
      const pkS = shell('srgb').peak(src.steps[src.anchorIndex]!.h).c;
      const pkD = shell('srgb').peak(dst.steps[dst.anchorIndex]!.h).c;
      return (s.C / pkS) * pkD;
    }
    case 'okhsl_s': {
      const sat = toOkhsl({ mode: 'oklch', l: s.L, c: s.C, h: s.h }).s ?? 0;
      const dl = toOkhsl({ mode: 'oklch', l: d.L, c: d.C, h: d.h }).l ?? d.L;
      const out = fromOkhsl({ mode: 'okhsl', h: d.h, s: sat, l: dl });
      return out.c;
    }
  }
}

function transferErrors(sys: string, fams: string[], norm: Norm) {
  const errsByStep: number[][] = [];
  const all: number[] = [];
  for (const a of fams) for (const b of fams) {
    if (a === b) continue;
    const A = dna[sys]![a]!;
    const B = dna[sys]![b]!;
    for (let i = 0; i < A.steps.length; i++) {
      const e = Math.abs(predictC(norm, A, B, i) - B.steps[i]!.C);
      (errsByStep[i] ??= []).push(e);
      all.push(e);
    }
  }
  const sorted = [...all].sort((x, y) => x - y);
  return {
    mean: mean(all),
    median: sorted[Math.floor(sorted.length / 2)]!,
    p90: sorted[Math.floor(sorted.length * 0.9)]!,
    withinJnd: all.filter((e) => e <= JND).length / all.length,
    within2Jnd: all.filter((e) => e <= 2 * JND).length / all.length,
    perStepMean: errsByStep.map(mean),
  };
}

console.log('══ A. Transfer error (ΔEOK) — apply hue A\'s curve to hue B, all ordered pairs ══');
console.log(`(JND = ${JND} ΔEOK. "within JND" = fraction of transferred steps a viewer could not distinguish from the system's real step)`);
const transferReport: any = {};
for (const sys of ['tailwind-v4', 'radix-light']) {
  const all = Object.keys(dna[sys]!);
  const regular = sys === 'radix-light' ? all.filter((f) => !RADIX_BRIGHT.includes(f)) : all;
  transferReport[sys] = {};
  for (const [label, fams] of [['all', all], ['focus', FOCUS], ['regular', regular]] as const) {
    if (label === 'regular' && sys !== 'radix-light') continue;
    console.log(`\n${sys} / ${label} (${fams.length} families)`);
    console.log('norm'.padEnd(16), ' mean   median   p90   ≤1JND  ≤2JND   per-step mean →');
    for (const norm of NORMS) {
      const t = transferErrors(sys, fams, norm);
      transferReport[sys][`${label}:${norm}`] = t;
      console.log(norm.padEnd(16), t.mean.toFixed(4), t.median.toFixed(4).padStart(7), t.p90.toFixed(4).padStart(7), (t.withinJnd * 100).toFixed(0).padStart(5) + '%', (t.within2Jnd * 100).toFixed(0).padStart(5) + '%', '  ', t.perStepMean.map((x) => x.toFixed(3)).join(' '));
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// B. Radix outliers: which hues sit far from the system's median relC curve?
// ────────────────────────────────────────────────────────────────────────────
console.log('\n══ B. Radix light — per-family RMS distance from the median relC_srgb curve ══');
{
  const fams = Object.keys(dna['radix-light']!);
  const curves = fams.map((f) => dna['radix-light']![f]!.steps.map((s) => s.relC.srgb));
  const N = curves[0]!.length;
  const median = Array.from({ length: N }, (_, i) => { const col = curves.map((c) => c[i]!).sort((a, b) => a - b); return col[Math.floor(col.length / 2)]!; });
  const dist = fams.map((f, k) => ({ f, d: Math.sqrt(mean(curves[k]!.map((x, i) => (x - median[i]!) ** 2))), bright: RADIX_BRIGHT.includes(f) })).sort((a, b) => b.d - a.d);
  console.log('median curve:', median.map((x) => x.toFixed(2)).join(' '));
  for (const o of dist) console.log(`  ${o.f.padEnd(8)} ${o.d.toFixed(3)} ${o.bright ? '← documented "bright" scale' : ''}`);
  (transferReport as any).radixOutliers = dist;
  console.log(`  mean distance, bright: ${mean(dist.filter((o) => o.bright).map((o) => o.d)).toFixed(3)}   regular: ${mean(dist.filter((o) => !o.bright).map((o) => o.d)).toFixed(3)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// C. L-indexed view: relC as a function of L rather than of step index.
//    Cross-system comparison on the overlapping L range.
// ────────────────────────────────────────────────────────────────────────────
console.log('\n══ C. relC_srgb as a function of L (not step): within-system SD on a common L grid ══');
const LGRID = Array.from({ length: 13 }, (_, i) => 0.35 + i * 0.05); // 0.35 … 0.95
function relCofL(r: RampDNA): number[] {
  // steps are light→dark; resample needs ascending x. Use only the monotone spine (drop detached bright 9–10 if L rises).
  const pts = r.steps.map((s) => ({ L: s.L, v: s.relC.srgb })).sort((a, b) => a.L - b.L);
  const dedup = pts.filter((p, i) => i === 0 || p.L > pts[i - 1]!.L + 1e-6);
  return resample(dedup.map((p) => p.L), dedup.map((p) => p.v), LGRID);
}
const lIndexed: any = {};
for (const sys of ['tailwind-v4', 'radix-light']) {
  const fams = Object.keys(dna[sys]!).filter((f) => !(sys === 'radix-light' && RADIX_BRIGHT.includes(f)));
  const curves = fams.map((f) => relCofL(dna[sys]![f]!));
  const m = LGRID.map((_, i) => mean(curves.map((c) => c[i]!)));
  const s = LGRID.map((_, i) => sd(curves.map((c) => c[i]!)));
  lIndexed[sys] = { L: LGRID, mean: m, sd: s, families: Object.fromEntries(fams.map((f, k) => [f, curves[k]])) };
  console.log(`\n${sys} (${fams.length} families${sys === 'radix-light' ? ', bright scales excluded' : ''})`);
  console.log('L    ', LGRID.map((x) => x.toFixed(2)).join('  '));
  console.log('mean ', m.map((x) => x.toFixed(2)).join('  '));
  console.log('SD   ', s.map((x) => x.toFixed(2)).join('  '));
}
{
  const a = lIndexed['tailwind-v4'].mean as number[];
  const b = lIndexed['radix-light'].mean as number[];
  console.log('\n|mean_TW − mean_Radix| per L:', a.map((x, i) => Math.abs(x - b[i]!).toFixed(2)).join('  '));
  console.log('pooled within-SD per L:      ', a.map((_, i) => ((lIndexed['tailwind-v4'].sd[i] + lIndexed['radix-light'].sd[i]) / 2).toFixed(2)).join('  '));
}

// ────────────────────────────────────────────────────────────────────────────
// D. Which mirror best predicts Radix dark from Radix light? Solve L_dark per
//    step (holding the actual dark C and h) so that the chosen quantity
//    matches the light step's value against its own background, then compare
//    to the real dark L. Also report relC of the dark scales.
// ────────────────────────────────────────────────────────────────────────────
console.log('\n══ D. Radix dark from Radix light — which mirror comes closest? (RMS ΔL vs actual dark) ══');
function solveL(target: number, f: (L: number) => number, lo = 0.0, hi = 1.0): number {
  // f monotone in L; bisect
  let flo = f(lo), fhi = f(hi);
  const inc = fhi > flo;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if ((fm < target) === inc) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const darkMirror: any = {};
for (const fam of FOCUS) {
  const L = dna['radix-light']![fam]!.steps;
  const D = dna['radix-dark']![fam]!.steps;
  const bgL: Oklch = { l: L[0]!.L, c: L[0]!.C, h: L[0]!.h };
  const bgD: Oklch = { l: D[0]!.L, c: D[0]!.C, h: D[0]!.h };
  const rows = L.map((ls, i) => {
    const ds = D[i]!;
    const withC = (Lv: number): Oklch => ({ l: Lv, c: ds.C, h: ds.h });
    const predLmirror = 1 - ls.L;
    const predWcag = i === 0 ? ds.L : solveL(wcag21({ l: ls.L, c: ls.C, h: ls.h }, bgL), (Lv) => wcag21(withC(Lv), bgD), bgD.l, 1);
    const predApca = i === 0 ? ds.L : solveL(Math.abs(apca({ l: ls.L, c: ls.C, h: ls.h }, bgL)), (Lv) => Math.abs(apca(withC(Lv), bgD)), bgD.l, 1);
    return { key: ls.key, actual: ds.L, lMirror: predLmirror, wcagMirror: predWcag, apcaMirror: predApca, relC_light: ls.relC.srgb, relC_dark: ds.relC.srgb };
  });
  const rmsOf = (k: 'lMirror' | 'wcagMirror' | 'apcaMirror') => Math.sqrt(mean(rows.slice(1).map((r) => (r[k] - r.actual) ** 2)));
  darkMirror[fam] = { rows, rms: { lMirror: rmsOf('lMirror'), wcagMirror: rmsOf('wcagMirror'), apcaMirror: rmsOf('apcaMirror') } };
  console.log(`\n${fam}: step  actual L_dark   1−L_light   WCAG-mirror   APCA-mirror  | relC_srgb light  dark`);
  for (const r of rows) console.log(`  ${r.key.padStart(4)}     ${r.actual.toFixed(3)}          ${r.lMirror.toFixed(3)}       ${r.wcagMirror.toFixed(3)}         ${r.apcaMirror.toFixed(3)}     |      ${r.relC_light.toFixed(2)}        ${r.relC_dark.toFixed(2)}`);
  console.log(`  RMS ΔL:  L-mirror ${darkMirror[fam].rms.lMirror.toFixed(3)}   WCAG-mirror ${darkMirror[fam].rms.wcagMirror.toFixed(3)}   APCA-mirror ${darkMirror[fam].rms.apcaMirror.toFixed(3)}`);
}

const prev = JSON.parse(readFileSync('out/phase0.json', 'utf8'));
writeFileSync('out/phase0.json', JSON.stringify({ ...prev, transferReport, lIndexed, darkMirror, radixDarkDna: dna['radix-dark'] }, null, 1));
console.log('\nappended to out/phase0.json');
