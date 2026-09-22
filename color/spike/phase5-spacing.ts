/**
 * Should `spacing: 'even'` be the default?
 *
 * The case against it was never that even spacing is worse — it is that
 * respacing moves what a numbered step means. Five of the thirteen references
 * number by contrast rather than by convention: at each step, every hue lands on
 * the same contrast, so `carbon-60` is a promise and not a label. Re-placing
 * those steps at equal perceptual distance would break the promise while keeping
 * the number.
 *
 * That is a measurable claim, so this measures it: solve every family of every
 * system under both spacings and recompute the numbering metric — the SD across
 * hues of log WCAG contrast at each step, which is what classified them in the
 * first place (below 0.05 = contrast-bearing).
 *
 * Run: npx tsx spike/phase5-spacing.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solveRamp } from '../src/solver/index.ts';
import { wcag21Fast } from '../src/contrast/fast.ts';
import { deltaEOK, type Oklch } from '../src/color/oklch.ts';
import { CONTRAST_BEARING_THRESHOLD } from '../src/dna/metrics.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };

/** The numbering metric: SD across hues of log contrast at each interior step, averaged. */
function sigmaLogCR(ramps: Oklch[][], surface: Oklch): number {
  const n = ramps[0]!.length;
  const per: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    per.push(sd(ramps.map((r) => Math.log(wcag21Fast(r[i]!, surface)))));
  }
  return mean(per);
}

function spacingCv(ramp: Oklch[]): number {
  const d: number[] = [];
  for (let i = 1; i < ramp.length; i++) d.push(deltaEOK(ramp[i - 1]!, ramp[i]!));
  const m = mean(d);
  return m > 0 ? sd(d) / m : 0;
}

interface Row {
  id: string;
  numbering: string;
  declaredSigma: number;
  ref: { sigma: number; cv: number; minStep: number };
  even: { sigma: number; cv: number; minStep: number };
}

const rows: Row[] = [];
for (const id of ids) {
  const d = DNA[id]!;
  if (d.steps.keys === null) continue; // variable step counts: the metric is undefined
  const surface: Oklch = d.mode === 'light' ? { l: 1, c: 0, h: 0 } : (() => {
    const g = Object.values(d.neutrals)[0];
    return g ? { l: g.knots.L[0]!, c: g.knots.C[0]!, h: Number.isFinite(g.knots.h[0]!) ? g.knots.h[0]! : 0 } : { l: 0.15, c: 0, h: 0 };
  })();
  const byMode = (spacing: 'reference' | 'even') => Object.values(d.families).map((f) =>
    solveRamp({ dna: d, family: f.family, hue: f.hueAtPeak, gamut: 'srgb', background: surface, sibling: false, spacing })
      .steps.map((s) => s.color.oklch));
  const ref = byMode('reference');
  const even = byMode('even');
  rows.push({
    id,
    numbering: d.steps.numbering?.class ?? 'n/a',
    declaredSigma: d.steps.numbering?.sigmaLogCR ?? NaN,
    ref: { sigma: sigmaLogCR(ref, surface), cv: mean(ref.map(spacingCv)), minStep: Math.min(...ref.map((r) => { const dd: number[] = []; for (let i = 1; i < r.length; i++) dd.push(deltaEOK(r[i - 1]!, r[i]!)); return Math.min(...dd); })) },
    even: { sigma: sigmaLogCR(even, surface), cv: mean(even.map(spacingCv)), minStep: Math.min(...even.map((r) => { const dd: number[] = []; for (let i = 1; i < r.length; i++) dd.push(deltaEOK(r[i - 1]!, r[i]!)); return Math.min(...dd); })) },
  });
}

console.log('## Does even spacing break contrast-bearing numbering?');
console.log(`   (the metric that classified them: SD across hues of log WCAG contrast per step; under ${CONTRAST_BEARING_THRESHOLD} = contrast-bearing)\n`);
console.log('system         numbering          σ reference   σ even    verdict                    spacing CV ref→even   smallest step ref→even');
for (const r of rows) {
  const stillBearing = r.even.sigma < CONTRAST_BEARING_THRESHOLD;
  const wasBearing = r.numbering === 'contrast-bearing';
  const verdict = wasBearing ? (stillBearing ? 'still contrast-bearing' : 'BREAKS the promise') : (stillBearing ? 'becomes contrast-bearing' : 'nominal either way');
  console.log(`${r.id.padEnd(14)} ${r.numbering.padEnd(18)} ${r.ref.sigma.toFixed(4).padStart(9)}  ${r.even.sigma.toFixed(4).padStart(8)}   ${verdict.padEnd(26)} ${r.ref.cv.toFixed(2)} → ${r.even.cv.toFixed(2)}          ${r.ref.minStep.toFixed(4)} → ${r.even.minStep.toFixed(4)}`);
}

const bearing = rows.filter((r) => r.numbering === 'contrast-bearing');
const broken = bearing.filter((r) => r.even.sigma >= CONTRAST_BEARING_THRESHOLD);
console.log(`\n${broken.length} of ${bearing.length} contrast-bearing systems lose the property under even spacing: ${broken.map((r) => r.id).join(', ') || 'none'}`);
console.log(`Spacing CV, all systems: reference mean ${mean(rows.map((r) => r.ref.cv)).toFixed(3)} → even mean ${mean(rows.map((r) => r.even.cv)).toFixed(3)}`);
console.log(`Smallest step, worst system: reference ${Math.min(...rows.map((r) => r.ref.minStep)).toFixed(4)} → even ${Math.min(...rows.map((r) => r.even.minStep)).toFixed(4)}`);

// ── what a seed costs under each spacing ──────────────────────────────────────
console.log('\n## With a seed: does even spacing move the seed off its step?');
console.log('system         seed step ref   seed step even   note');
for (const id of ['tailwind-v4', 'radix-light', 'carbon', 'material']) {
  const d = DNA[id]!;
  for (const seed of ['#7c3aed', '#c2410c']) {
    const a = solveRamp({ dna: d, seed, gamut: 'srgb', spacing: 'reference' });
    const b = solveRamp({ dna: d, seed, gamut: 'srgb', spacing: 'even' });
    const moved = a.seed!.stepKey !== b.seed!.stepKey;
    console.log(`${id.padEnd(14)} ${seed} ${a.seed!.stepKey.padEnd(8)} ${b.seed!.stepKey.padEnd(12)} ${moved ? 'moved — the seed ranks elsewhere on an even ramp' : 'same step'}`);
  }
}

mkdirSync('out', { recursive: true });
writeFileSync('out/phase5-spacing.json', JSON.stringify({ threshold: CONTRAST_BEARING_THRESHOLD, rows, broken: broken.map((r) => r.id) }, null, 1));
console.log('\nwrote out/phase5-spacing.json');
