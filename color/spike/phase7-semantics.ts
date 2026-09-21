/**
 * Phase 7 — should the semantic hues be derived, and if so how well does it work?
 *
 * The library made you hand-pick danger, success and warning, so the DNA transfer
 * covered the brand and then stopped. The obvious improvement is to *derive*
 * them: place the hues so the families stay apart from each other and from the
 * brand, including under colour-vision deficiency, which the corpus says is
 * exactly where shipping systems fail.
 *
 * But the room to move is bounded by convention, and convention is narrow — two
 * standard deviations of red across eleven systems is a ten-degree window. So the
 * first question is whether a search inside it has anywhere to go, and the second
 * is whether what it finds is any better than what people pick by hand.
 *
 * This is the file that answers both, and it is the source of
 * `FIVE_FAMILY_SEPARATION` in `src/tokens/semantics.ts` — it prints the literal.
 *
 * Run: npx tsx spike/phase7-semantics.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solveRamp } from '../src/solver/index.ts';
import { hueDelta, type Oklch } from '../src/color/oklch.ts';
import type { CentroidTable } from '../src/dna/centroids.ts';
import {
  deriveSemanticHues, conventionBands, separation, SEMANTIC_ROLES, FIVE_FAMILY_SEPARATION,
} from '../src/tokens/semantics.ts';

const centroids = JSON.parse(readFileSync('dna/centroids.json', 'utf8')) as CentroidTable;
const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));
const lightIds = ids.filter((id) => DNA[id]!.mode === 'light');
const BANDS = conventionBands(centroids);
const q = (x: number[], p: number) => { const s = x.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]!; };
const f4 = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(4);

/** The steps a family is told apart at: the solid and the two either side. */
function stepsOf(dna: SystemDNA, hue: number, family?: string): Oklch[] {
  const r = solveRamp({ dna, hue, gamut: 'srgb', sibling: false, ...(family ? { family } : {}) });
  const mid = Math.floor(r.steps.length / 2);
  return [mid - 2, mid, mid + 2].filter((i) => i >= 0 && i < r.steps.length).map((i) => r.steps[i]!.color.oklch);
}

console.log('## What convention allows\n');
console.log('role      centre   band (±2σ of the corpus)   width');
for (const r of SEMANTIC_ROLES) {
  const b = BANDS[r.name]!;
  console.log(`${r.name.padEnd(9)} ${b.centre.toFixed(1).padStart(6)}   ${b.lo.toFixed(1).padStart(6)} … ${b.hi.toFixed(1).padStart(6)}            ${(b.hi - b.lo).toFixed(1).padStart(5)}°`);
}

// ── 1. is there anything to find inside the window? ──────────────────────────
console.log('\n## Does moving inside the band buy anything?\n');
console.log('   worst pair separation (ΔEOK) under normal vision + protan/deutan/tritan\n');
console.log('reference     brand   conventional   optimised   gain     binding pair');
const rows: { ref: string; brand: number; base: number; opt: number; gain: number; hues: Record<string, number> }[] = [];
for (const ref of ['tailwind-v4', 'radix-light', 'material']) {
  for (const brandHue of [264, 26, 150, 90]) {
    const d = deriveSemanticHues({ dna: DNA[ref]!, centroids, brandHue, gamut: 'srgb' });
    rows.push({ ref, brand: brandHue, base: d.baseline.min, opt: d.achieved.min, gain: d.gain, hues: d.hues });
    console.log(
      `${ref.padEnd(13)} ${String(brandHue).padStart(5)}°  ${d.baseline.min.toFixed(4).padStart(12)}  ${d.achieved.min.toFixed(4).padStart(10)}  ${f4(d.gain)}   ` +
      `${d.achieved.binding.a}/${d.achieved.binding.b} ${d.achieved.binding.view}`,
    );
  }
}
const gains = rows.map((r) => r.gain).sort((a, b) => a - b);
const med = gains[Math.floor(gains.length / 2)]!;
console.log(`\nGain: median ${med.toFixed(4)} ΔEOK, best ${gains[gains.length - 1]!.toFixed(4)}, worst ${gains[0]!.toFixed(4)}`);
console.log(`One JND is 0.02, so the median gain is ${(med / 0.02).toFixed(2)} of a JND.`);

// ── 2. is it better than hand-picking? ───────────────────────────────────────
//
// Five families against five. Scoring our five against a reference's full 9–25
// would be rigged: more families means more chances at a close pair, and on that
// comparison every reference "loses" by a mile. So each reference is scored on
// five of its own — its red, its orange/amber/yellow, its green, its blue, and
// whichever remaining family sits furthest from those four, standing in for a
// brand — at the colours it actually publishes, per-family curves and all.
console.log('\n## Against the references, five families to five\n');
console.log('reference      brand    theirs   ours     verdict   binding pair (ours)');
const WANT = [['red'], ['orange', 'amber', 'yellow'], ['green'], ['blue']];
const theirsAll: number[] = [];
const oursAll: number[] = [];
let won = 0;
for (const id of lightIds) {
  const d = DNA[id]!;
  const picked: Record<string, Oklch[]> = {};
  for (const alts of WANT) {
    const fam = alts.map((a) => d.families[a]).find(Boolean);
    if (fam) picked[fam.family] = stepsOf(d, fam.hueAtPeak, fam.family);
  }
  if (Object.keys(picked).length < 4) { console.log(`${id.padEnd(14)} skipped — only ${Object.keys(picked).length} of the four roles`); continue; }
  let standHue: number | null = null, far = -1;
  for (const fam of Object.values(d.families)) {
    if (picked[fam.family]) continue;
    const dd = Math.min(...Object.keys(picked).map((k) => Math.abs(hueDelta(fam.hueAtPeak, d.families[k]!.hueAtPeak))));
    if (dd > far) { far = dd; standHue = fam.hueAtPeak; }
  }
  const brandHue = standHue ?? 300;
  if (standHue !== null) picked['brandish'] = stepsOf(d, standHue);
  const theirs = separation(picked).min;
  const ours = deriveSemanticHues({ dna: d, centroids, brandHue, gamut: 'srgb' });
  theirsAll.push(theirs); oursAll.push(ours.achieved.min);
  if (ours.achieved.min > theirs) won++;
  console.log(
    `${id.padEnd(14)} ${brandHue.toFixed(0).padStart(4)}°   ${theirs.toFixed(4)}   ${ours.achieved.min.toFixed(4)}   ` +
    `${(ours.achieved.min > theirs ? 'ours' : 'theirs').padEnd(7)}   ${ours.achieved.binding.a}/${ours.achieved.binding.b} ${ours.achieved.binding.view}`,
  );
}
console.log(`\nours wins ${won} of ${theirsAll.length};  median theirs ${q(theirsAll, 0.5).toFixed(4)} → ours ${q(oursAll, 0.5).toFixed(4)}`);

const BAND = { p10: q(theirsAll, 0.1), median: q(theirsAll, 0.5), p90: q(theirsAll, 0.9), min: Math.min(...theirsAll), max: Math.max(...theirsAll) };
console.log('\nFIVE_FAMILY_SEPARATION (paste into src/tokens/semantics.ts):');
console.log(`  { p10: ${BAND.p10.toFixed(4)}, median: ${BAND.median.toFixed(4)}, p90: ${BAND.p90.toFixed(4)}, min: ${BAND.min.toFixed(4)}, max: ${BAND.max.toFixed(4)} }`);
const drift = (['p10', 'median', 'p90', 'min', 'max'] as const).filter((k) => Math.abs(FIVE_FAMILY_SEPARATION[k] - BAND[k]) > 5e-5);
console.log(drift.length ? `  ⚠ the shipped constant is stale on: ${drift.join(', ')}` : '  ✓ matches the shipped constant');

// ── 3. how often does the warning fire, and on what? ─────────────────────────
console.log('\n## When the brand sits on top of a semantic hue\n');
console.log('brand    nearest role   Δhue   separation   corpus         warns');
let fired = 0, n = 0;
for (let brandHue = 0; brandHue < 360; brandHue += 15) {
  const d = deriveSemanticHues({ dna: DNA['tailwind-v4']!, centroids, brandHue, gamut: 'srgb' });
  let near = SEMANTIC_ROLES[0]!.name, nd = 360;
  for (const r of SEMANTIC_ROLES) { const x = Math.abs(hueDelta(brandHue, BANDS[r.name]!.centre)); if (x < nd) { nd = x; near = r.name; } }
  const warns = d.warnings.some((w) => w.includes('below the'));
  n++; if (warns) fired++;
  if (warns || brandHue % 45 === 0) {
    console.log(
      `${String(brandHue).padStart(5)}°   ${near.padEnd(13)}  ${nd.toFixed(0).padStart(4)}°   ${d.achieved.min.toFixed(4).padStart(10)}   ${d.corpus.verdict.padEnd(14)} ${warns ? 'yes' : ''}`,
    );
  }
}
console.log(`\nthe warning fires on ${fired} of ${n} brand hues (${((fired / n) * 100).toFixed(0)}%)`);

mkdirSync('out', { recursive: true });
writeFileSync('out/phase7-semantics.json', JSON.stringify({ bands: BANDS, rows, band: BAND, theirs: theirsAll, ours: oursAll }, null, 1));

const t0 = Date.now();
for (let i = 0; i < 5; i++) deriveSemanticHues({ dna: DNA['tailwind-v4']!, centroids, brandHue: 264 + i, gamut: 'srgb' });
console.log(`\nOne derivation: ${((Date.now() - t0) / 5).toFixed(0)} ms`);
console.log('wrote out/phase7-semantics.json');
