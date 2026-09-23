/**
 * Independent verification with Color.js only (the oracle): no culori, no LUT.
 *  1. Recompute cusp chroma by bisection with Color.js inGamut and compare to
 *     the LUT values used in the analysis, on every step of the six focus ramps.
 *  2. Recompute the headline Tailwind transfer-error number (relC_srgb, all 17
 *     hues) with Color.js conversions and exact cusps.
 *  3. Radix step-11 WCAG ratio vs steps 1–3 across all 25 hues (is the
 *     numbering contrast-bearing at 11?).
 */
import Color from 'colorjs.io';
import { readFileSync } from 'node:fs';
import { loadTailwindV4 } from '../src/ingest/tailwind.ts';
import { loadRadix } from '../src/ingest/radix.ts';

const D = JSON.parse(readFileSync('out/phase0.json', 'utf8'));

function exactCusp(gamut: 'srgb' | 'p3', L: number, h: number): number {
  let lo = 0, hi = 0.6;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (new Color('oklch', [L, mid, h]).inGamut(gamut)) lo = mid; else hi = mid;
  }
  return lo;
}
function oklch(css: string): [number, number, number] {
  const c = new Color(css).to('oklch');
  const [l, cc, h] = c.coords as [number, number, number];
  return [l, cc, Number.isNaN(h) ? 0 : ((h % 360) + 360) % 360];
}

// 1. LUT vs Color.js exact cusp on the six focus ramps
let worst = 0, worstRel = 0;
for (const sys of ['tailwind-v4', 'radix-light']) for (const fam of ['blue', 'yellow', 'green']) {
  for (const s of D.dna[sys][fam].steps) {
    for (const g of ['srgb', 'p3'] as const) {
      const ex = exactCusp(g, s.L, s.h);
      const lut = s.cuspC[g];
      worst = Math.max(worst, Math.abs(ex - lut));
      const relEx = s.C / ex;
      worstRel = Math.max(worstRel, Math.abs(relEx - s.relC[g]));
    }
  }
}
console.log(`1. cusp: worst |LUT − Color.js exact| = ${worst.toFixed(4)} chroma; worst relC discrepancy = ${worstRel.toFixed(4)}  (spec: ≤ 0.009 chroma)`);

// 2. Tailwind relC_srgb transfer error, Color.js end to end
const tw = loadTailwindV4();
const fams = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const ramps = fams.map((f) => tw.get(f)!.steps.map((s) => { const [L, C, h] = oklch(s.css); return { L, C, h, cusp: exactCusp('srgb', L, h) }; }));
const errs: number[] = [];
for (let a = 0; a < ramps.length; a++) for (let b = 0; b < ramps.length; b++) {
  if (a === b) continue;
  for (let i = 0; i < 11; i++) {
    const relA = ramps[a]![i]!.C / ramps[a]![i]!.cusp;
    errs.push(Math.abs(relA * ramps[b]![i]!.cusp - ramps[b]![i]!.C));
  }
}
const meanErr = errs.reduce((x, y) => x + y, 0) / errs.length;
const jnd = errs.filter((e) => e <= 0.02).length / errs.length;
console.log(`2. Tailwind relC_srgb transfer error (Color.js end to end): mean ${meanErr.toFixed(4)}, ≤1 JND ${(jnd * 100).toFixed(0)}%   (analysis reported ${D.transferReport['tailwind-v4']['all:relC_srgb'].mean.toFixed(4)}, ${(D.transferReport['tailwind-v4']['all:relC_srgb'].withinJnd * 100).toFixed(0)}%)`);

// 3. Radix step 11 (and 12) vs steps 1–3, all hues
const rx = loadRadix({ mode: 'light', gamut: 'srgb' });
const rows: { fam: string; r11_1: number; r11_2: number; r11_3: number; r12_1: number; r9_1: number }[] = [];
for (const [fam, ramp] of rx) {
  const c = ramp.steps.map((s) => new Color(s.css));
  rows.push({ fam, r11_1: c[10]!.contrast(c[0]!, 'WCAG21'), r11_2: c[10]!.contrast(c[1]!, 'WCAG21'), r11_3: c[10]!.contrast(c[2]!, 'WCAG21'), r12_1: c[11]!.contrast(c[0]!, 'WCAG21'), r9_1: c[8]!.contrast(c[0]!, 'WCAG21') });
}
rows.sort((a, b) => a.r11_1 - b.r11_1);
console.log('3. Radix light WCAG 2.1 — step 11 vs 1 / 2 / 3, step 12 vs 1, step 9 vs 1 (sorted by 11 vs 1):');
for (const r of rows) console.log(`   ${r.fam.padEnd(8)} 11/1 ${r.r11_1.toFixed(2)}  11/2 ${r.r11_2.toFixed(2)}  11/3 ${r.r11_3.toFixed(2)}   12/1 ${r.r12_1.toFixed(2)}   9/1 ${r.r9_1.toFixed(2)}`);
const min11 = Math.min(...rows.map((r) => r.r11_1)), min11_3 = Math.min(...rows.map((r) => r.r11_3));
console.log(`   min 11/1 = ${min11.toFixed(2)}, min 11/3 = ${min11_3.toFixed(2)}, families with 11/1 < 4.5: ${rows.filter((r) => r.r11_1 < 4.5).map((r) => r.fam).join(', ') || 'none'}`);
console.log(`   step 9 vs 1 ranges ${Math.min(...rows.map((r) => r.r9_1)).toFixed(2)} – ${Math.max(...rows.map((r) => r.r9_1)).toFixed(2)}`);

// 4. Tailwind: step-500 vs white across hues (is 500 contrast-bearing?)
const c500 = fams.map((f) => ({ f, r: new Color(tw.get(f)!.steps[5]!.css).contrast(new Color('white'), 'WCAG21') }));
console.log(`4. Tailwind 500 vs white: ${Math.min(...c500.map((x) => x.r)).toFixed(2)} (${c500.reduce((a, b) => (b.r < a.r ? b : a)).f}) – ${Math.max(...c500.map((x) => x.r)).toFixed(2)} (${c500.reduce((a, b) => (b.r > a.r ? b : a)).f})`);
const c700 = fams.map((f) => ({ f, r: new Color(tw.get(f)!.steps[7]!.css).contrast(new Color('white'), 'WCAG21') }));
console.log(`   Tailwind 700 vs white: ${Math.min(...c700.map((x) => x.r)).toFixed(2)} (${c700.reduce((a, b) => (b.r < a.r ? b : a)).f}) – ${Math.max(...c700.map((x) => x.r)).toFixed(2)} (${c700.reduce((a, b) => (b.r > a.r ? b : a)).f})`);
