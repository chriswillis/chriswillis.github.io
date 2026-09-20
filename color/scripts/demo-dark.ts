/**
 * Phase 3 demo: one seed through both modes, for every kind of reference.
 * Writes out/dark-demo.json, which spike/plot_dark.py renders as fig10.
 *
 * Run: npx tsx scripts/demo-dark.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solvePair } from '../src/solver/pair.ts';
import { deriveDarkDNA, compareDNA } from '../src/dark/mirror.ts';
import { deltaEOK } from '../src/color/oklch.ts';

const load = (id: string) => parseDNA(readFileSync(`dna/${id}.json`, 'utf8')) as SystemDNA;
const SEED = '#7c3aed';
mkdirSync('out', { recursive: true });

const rms = (x: number[]) => Math.sqrt(x.reduce((a, b) => a + b * b, 0) / x.length);
const pair = (label: string, light: SystemDNA, dark?: SystemDNA, extra: Record<string, unknown> = {}) => {
  const p = solvePair({ light, dark, seed: SEED, gamut: 'srgb', neutrals: true, ...extra });
  return {
    label,
    system: light.id,
    darkSource: p.darkSource,
    pin: p.pin,
    keys: p.light.steps.map((s) => s.key),
    light: p.light.steps.map((s) => s.color.native),
    dark: p.dark.steps.map((s) => s.color.native),
    lightGrays: p.neutrals!.light.steps.map((s) => s.color.native),
    darkGrays: p.neutrals!.dark.steps.map((s) => s.color.native),
    lightBg: p.light.background,
    darkBg: p.dark.background,
    correspondence: p.correspondence,
    warnings: [...p.warnings, ...p.darkSource.warnings],
  };
};

const radixL = load('radix-light'), radixD = load('radix-dark');
const darkSurface = { l: radixD.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };
const lightSurface = { l: radixL.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };

// How well the derivation reproduces the one authored dark scale there is
const settings = [
  ['balanced λ = 0.5 (default)', {}],
  ['λ = 0 — WCAG mirror', { lambda: 0 as const, nearSurfaceGain: false }],
  ['λ = 1 — APCA mirror', { lambda: 1 as const, nearSurfaceGain: false }],
  ['λ(n) fit to Radix', { lambda: 'radix' as const }],
  ['no pin', { pinKeyStep: false }],
] as const;
const fidelity = settings.map(([label, opt]) => {
  const d = deriveDarkDNA(radixL, { surface: darkSurface, lightSurface, ...(opt as object) });
  const c = compareDNA(d, radixD);
  const s = c.all.slice().sort((a, b) => a - b);
  return { label, rms: rms(c.all), median: s[Math.floor(s.length / 2)]!, p90: s[Math.floor(s.length * 0.9)]!, withinTwoJnd: c.all.filter((x) => x < 0.04).length / c.all.length };
});

// the derived Radix dark, family by family, against the real one
const derived = deriveDarkDNA(radixL, { surface: darkSurface, lightSurface });
const cmp = compareDNA(derived, radixD);
const blue = {
  keys: radixL.families['blue']!.knots.key,
  light: radixL.families['blue']!.knots.L,
  authoredDark: radixD.families['blue']!.knots.L,
  derivedDark: derived.families['blue']!.knots.L,
  authoredC: radixD.families['blue']!.knots.C,
  derivedC: derived.families['blue']!.knots.C,
};

const out = {
  seed: SEED,
  pairs: [
    pair('Radix — authored dark scale', radixL, radixD),
    pair('Radix — derived, for comparison', radixL, undefined, { mirror: { surface: darkSurface, lightSurface }, darkBackground: darkSurface }),
    pair('Tailwind v4 — derived', load('tailwind-v4')),
    pair('Carbon — derived', load('carbon')),
    pair('Material — derived', load('material')),
  ],
  fidelity,
  blue,
  perFamily: Object.fromEntries(Object.entries(cmp.perFamily).map(([f, r]) => [f, rms(r)])),
  derivation: derived.derivedFrom,
};
writeFileSync('out/dark-demo.json', JSON.stringify(out, null, 1));

console.log(`seed ${SEED}`);
for (const p of out.pairs) {
  console.log(`\n${p.label}  (${p.darkSource.kind} ${p.darkSource.id}) — pinned at step ${p.pin!.stepKey}`);
  console.log(`  light  ${p.light.join(' ')}`);
  console.log(`  dark   ${p.dark.join(' ')}`);
  console.log(`  the pinned color reads ${p.pin!.light.wcagVsBg.toFixed(2)}:1 on the light background and ${p.pin!.dark.wcagVsBg.toFixed(2)}:1 on the dark one`);
  for (const w of p.warnings) console.log(`  ! ${w}`);
}
console.log('\nDerived vs Radix\'s authored dark scale:');
for (const f of fidelity) console.log(`  ${f.label.padEnd(30)} RMS ΔEOK ${f.rms.toFixed(4)}  median ${f.median.toFixed(4)}  within 2 JND ${(f.withinTwoJnd * 100).toFixed(0)}%`);
console.log('\nwrote out/dark-demo.json');
