/**
 * Phase 4 demo: audit a generated palette and render it.
 * Writes out/audit/*. Run: npx tsx scripts/demo-audit.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA } from '../src/dna/schema.ts';
import { solvePair } from '../src/solver/pair.ts';
import { buildTokens } from '../src/tokens/build.ts';
import { audit } from '../src/validate/audit.ts';
import { lint } from '../src/validate/lint.ts';
import { renderAudit } from '../src/validate/render.ts';
import { reportAudit } from '../src/validate/report.ts';

mkdirSync('out/audit', { recursive: true });
const radixLight = parseDNA(readFileSync('dna/radix-light.json', 'utf8'));
const radixDark = parseDNA(readFileSync('dna/radix-dark.json', 'utf8'));
const tw = parseDNA(readFileSync('dna/tailwind-v4.json', 'utf8'));

// a palette of several families, so the between-family CVD check has something to do
const SEEDS: Record<string, string> = { brand: '#7c3aed', success: '#16a34a', warning: '#d97706', danger: '#dc2626', info: '#0284c7' };

for (const [label, cfg] of [
  ['radix-violet', { light: radixLight, dark: radixDark, seed: SEEDS['brand']!, gamut: 'srgb' as const }],
  ['tailwind-p3-orange', { light: tw, seed: '#c2410c', gamut: 'p3' as const }],
] as const) {
  const pair = solvePair({ ...cfg, neutrals: true });
  const others: Record<string, { light: ReturnType<typeof solvePair>['light']; dark: ReturnType<typeof solvePair>['dark'] }> = {};
  for (const [name, hex] of Object.entries(SEEDS)) {
    if (name === 'brand') continue;
    const p = solvePair({ ...cfg, seed: hex });
    others[name] = { light: p.light, dark: p.dark };
  }
  const set = buildTokens(pair, { name: `${label} palette`, brandName: 'brand' });
  const a = audit(set, { reference: cfg.light, families: others, ramps: { light: pair.light, dark: pair.dark } });
  const l = lint(set, a);
  writeFileSync(`out/audit/${label}.html`, renderAudit(set, a, l, { title: `${label} — palette audit` }));
  writeFileSync(`out/audit/${label}.json`, JSON.stringify({ audit: a, lint: l }, null, 1));
  console.log(reportAudit(set, a, l));
  console.log('');
}
console.log('wrote out/audit/*.html and *.json');
