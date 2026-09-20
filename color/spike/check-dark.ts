/**
 * Phase 3 validation: derive Radix's dark scale from its light one and compare
 * with the real thing, under each setting. Reproduces the numbers quoted in
 * docs/dark-mode.md and src/dark/mirror.ts.
 *
 * Run: npx tsx spike/check-dark.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDNA } from '../src/dna/schema.ts';
import { deriveDarkDNA, compareDNA } from '../src/dark/mirror.ts';
import { deltaEOK } from '../src/color/oklch.ts';

const light = parseDNA(readFileSync('dna/radix-light.json', 'utf8'));
const dark = parseDNA(readFileSync('dna/radix-dark.json', 'utf8'));
const surface = { l: dark.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };
const lightSurface = { l: light.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const rms = (x: number[]) => Math.sqrt(mean(x.map((v) => v * v)));

console.log('Derived Radix dark vs Radix\'s own, 25 families × 12 steps');
console.log('setting                             RMS ΔEOK  median   p90    <2JND  worst families');
const rows: Record<string, number> = {};
for (const [name, opt] of [
  ['balanced λ = 0.5 (the default)', {}],
  ['λ = 0 — pure WCAG mirror, no calibration', { lambda: 0, nearSurfaceGain: false }],
  ['λ = 1 — pure APCA mirror, no calibration', { lambda: 1, nearSurfaceGain: false }],
  ['no near-surface gain', { nearSurfaceGain: false }],
  ['λ(n) fit to Radix', { lambda: 'radix' as const }],
  ['no chroma factor', { chroma: 'none' as const }],
  ["source system's own w(n)", { chromaPolicy: 'source' as const }],
  ['no pin', { pinKeyStep: false }],
  ['no minimum step separation', { minStepDeltaE: 0 }],
] as const) {
  const d = deriveDarkDNA(light, { surface, lightSurface, ...(opt as object) });
  const c = compareDNA(d, dark);
  const s = c.all.slice().sort((a, b) => a - b);
  const worst = Object.entries(c.perFamily).map(([f, r]) => [f, rms(r)] as const).sort((a, b) => b[1] - a[1]);
  rows[name] = rms(c.all);
  console.log(`${name.padEnd(35)} ${rms(c.all).toFixed(4)}  ${s[Math.floor(s.length / 2)]!.toFixed(4)}  ${s[Math.floor(s.length * 0.9)]!.toFixed(4)}  ${`${((c.all.filter((x) => x < 0.04).length / c.all.length) * 100).toFixed(0)}%`.padStart(4)}   ${worst.slice(0, 3).map(([f, v]) => `${f} ${v.toFixed(3)}`).join(', ')}`);
}

// how far apart adjacent steps end up — the property the separation pass protects
const gaps = (dna: typeof dark) => Object.values(dna.families).map((f) => {
  const k = f.knots;
  let mn = Infinity;
  for (let i = 1; i < k.n.length; i++) mn = Math.min(mn, deltaEOK({ l: k.L[i - 1]!, c: k.C[i - 1]!, h: k.h[i - 1]! }, { l: k.L[i]!, c: k.C[i]!, h: k.h[i]! }));
  return mn;
});
const g1 = gaps(deriveDarkDNA(light, { surface, lightSurface }));
const g0 = gaps(deriveDarkDNA(light, { surface, lightSurface, minStepDeltaE: 0 }));
const gr = gaps(dark);
console.log('\nSmallest adjacent ΔEOK within a family, over the 25 families (the floor the separation pass defends):');
console.log(`  derived, separation on   min ${Math.min(...g1).toFixed(4)}   mean ${mean(g1).toFixed(4)}`);
console.log(`  derived, separation off  min ${Math.min(...g0).toFixed(4)}   mean ${mean(g0).toFixed(4)}`);
console.log(`  Radix's own dark         min ${Math.min(...gr).toFixed(4)}   mean ${mean(gr).toFixed(4)}`);
console.log('  (the pass targets one JND before quantization, which shaves up to 0.002 off — the delivered floor matches Radix\'s own)');

const d = deriveDarkDNA(light, { surface, lightSurface });
console.log(`\nderivation record: pinned ${d.derivedFrom!.pinnedKey}, ${d.derivedFrom!.shellLimited.length} shell-limited, ${d.derivedFrom!.separated.length} separated, ${d.derivedFrom!.mapping.steps}/${d.derivedFrom!.mapping.total} gamut-mapped (max ΔEOK ${d.derivedFrom!.mapping.maxDeltaE.toFixed(4)})`);
console.log('blue derived:', d.families['blue']!.knots.L.map((x) => x.toFixed(3)).join(' '));
console.log('blue actual :', dark.families['blue']!.knots.L.map((x) => x.toFixed(3)).join(' '));
console.log('gray derived:', d.neutrals['gray']!.knots.L.map((x) => x.toFixed(3)).join(' '));
console.log('gray actual :', dark.neutrals['gray']!.knots.L.map((x) => x.toFixed(3)).join(' '));
const nAll: number[] = [];
for (const [name, nd] of Object.entries(d.neutrals)) {
  const nb = dark.neutrals[name];
  if (!nb) continue;
  for (let i = 0; i < nd.knots.L.length; i++) nAll.push(Math.abs(nd.knots.L[i]! - nb.knots.L[i]!));
}
console.log(`neutrals: RMS ΔL ${rms(nAll).toFixed(4)} — Radix re-authors its grays per mode, so this is the honest gap, not a bug`);
writeFileSync('out/dark-check.json', JSON.stringify(rows, null, 1));
