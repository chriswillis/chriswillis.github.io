/**
 * Phase 3.5 demo: one seed → a token set, in every output format.
 * Writes out/tokens/*. Run: npx tsx scripts/demo-tokens.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA } from '../src/dna/schema.ts';
import { solvePair } from '../src/solver/pair.ts';
import { buildTokens } from '../src/tokens/build.ts';
import { toDTCG, resolveDTCG } from '../src/tokens/dtcg.ts';
import { toCSS, toTailwind, toFigma, toReport } from '../src/tokens/emit.ts';

const SEED = '#7c3aed';
const dna = parseDNA(readFileSync('dna/radix-light.json', 'utf8'));
const dark = parseDNA(readFileSync('dna/radix-dark.json', 'utf8'));
mkdirSync('out/tokens', { recursive: true });

const pair = solvePair({ light: dna, dark, seed: SEED, gamut: 'srgb', neutrals: true });
const set = buildTokens(pair, { name: 'Brand · Radix DNA', brandName: 'brand' });

const doc = toDTCG(set);
writeFileSync('out/tokens/tokens.json', JSON.stringify(doc, null, 2));
writeFileSync('out/tokens/tokens.css', toCSS(set));
writeFileSync('out/tokens/theme.css', toTailwind(set));
writeFileSync('out/tokens/figma-variables.json', JSON.stringify(toFigma(set), null, 2));

// every alias resolves
const resolved = resolveDTCG(doc);
console.log(toReport(set));
console.log(`\n${set.primitives.length} primitives, ${set.semantics.length} semantic tokens, ${resolved.size} paths all resolving`);
console.log(`warnings: ${set.warnings.length}`);
for (const w of set.warnings.slice(0, 6)) console.log(`  ${w}`);
if (set.warnings.length > 6) console.log(`  … and ${set.warnings.length - 6} more`);
console.log('\nwrote out/tokens/{tokens.json,tokens.css,theme.css,figma-variables.json}');

// A second set where the requirements do not all hold: Tailwind in P3, dark derived.
const tw = parseDNA(readFileSync('dna/tailwind-v4.json', 'utf8'));
const p3 = solvePair({ light: tw, seed: '#c2410c', gamut: 'p3', neutrals: true });
const set2 = buildTokens(p3, { name: 'Tailwind v4 · P3 · derived dark', brandName: 'brand' });
writeFileSync('out/tokens/tailwind-p3.tokens.json', JSON.stringify(toDTCG(set2), null, 2));
writeFileSync('out/tokens/tailwind-p3.css', toCSS(set2));
writeFileSync('out/tokens/tailwind-p3.figma.json', JSON.stringify(toFigma(set2), null, 2));
console.log('\n' + '─'.repeat(100) + '\n');
console.log(toReport(set2));
console.log(`\nwarnings: ${set2.warnings.length}`);
for (const w of set2.warnings) console.log(`  ${w}`);

// ── data for the figure ───────────────────────────────────────────────────────
import { solveRamp } from '../src/solver/index.ts';
import { assignRoles } from '../src/tokens/assign.ts';
import { ROLES } from '../src/tokens/roles.ts';
import { wcag21Fast, apcaFast } from '../src/contrast/fast.ts';
import type { Oklch } from '../src/color/oklch.ts';

const recovery: Record<string, Record<string, Record<string, number>>> = {};
const onSolid: { family: string; hex: string; L: number; whiteW: number; blackW: number; whiteA: number; blackA: number }[] = [];
for (const [modeName, d] of [['light', dna], ['dark', dark]] as const) {
  recovery[modeName] = {};
  for (const fam of Object.keys(d.families)) {
    const k = d.families[fam]!.knots;
    const page: Oklch = { l: k.L[0]!, c: k.C[0]!, h: k.h[0]! };
    const r = solveRamp({ dna: d, family: fam, hue: d.families[fam]!.hueAtPeak, gamut: 'srgb', background: page, sibling: false });
    const a = assignRoles(r, { family: fam });
    for (const [name, v] of Object.entries(a.roles)) {
      recovery[modeName]![name] ??= {};
      const key = v.stepKey ?? v.chosenFrom ?? v.literal ?? '—';
      recovery[modeName]![name]![key] = (recovery[modeName]![name]![key] ?? 0) + 1;
    }
    if (modeName === 'light') {
      const solid = a.roles['background/solid']!;
      const step = r.steps[solid.stepIndex!]!;
      onSolid.push({
        family: fam, hex: step.color.native, L: solid.color.l,
        whiteW: wcag21Fast({ l: 1, c: 0, h: 0 }, solid.color), blackW: wcag21Fast({ l: 0, c: 0, h: 0 }, solid.color),
        whiteA: Math.abs(apcaFast({ l: 1, c: 0, h: 0 }, solid.color)), blackA: Math.abs(apcaFast({ l: 0, c: 0, h: 0 }, solid.color)),
      });
    }
  }
}
onSolid.sort((a, b) => a.L - b.L);

writeFileSync('out/tokens/figure.json', JSON.stringify({
  roles: ROLES.map((r) => ({ name: r.name, radixStep: r.radixStep ?? null, source: r.source })),
  recovery,
  onSolid,
  set: {
    name: set.name,
    semantics: set.semantics.map((s) => ({
      role: s.role,
      light: { hex: s.values['light'].hex, step: s.evidence['light']?.stepKey ?? s.evidence['light']?.chosenFrom ?? null, met: s.evidence['light']?.met ?? true, wcag: s.evidence['light']?.against.wcag, apca: s.evidence['light']?.against.apca },
      dark: { hex: s.values['dark'].hex, step: s.evidence['dark']?.stepKey ?? s.evidence['dark']?.chosenFrom ?? null, met: s.evidence['dark']?.met ?? true, wcag: s.evidence['dark']?.against.wcag, apca: s.evidence['dark']?.against.apca },
    })),
    backgrounds: { light: set.backgrounds['light'], dark: set.backgrounds['dark'] },
  },
}, null, 1));
console.log('wrote out/tokens/figure.json');
