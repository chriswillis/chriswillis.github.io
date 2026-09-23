/**
 * Is a ramp that is even by ΔEOK also even in appearance?
 *
 * This is a different question from the one `phase6-fit.ts` answered, and the
 * difference is why it is worth asking separately. The dark mirror is judged by
 * how close it lands to a scale Radix already authored — it is imitation, and
 * there the H–K term buys 0.03 of a JND, which is nothing.
 *
 * Even spacing has no authored ground truth to imitate. It is a *claim*: that
 * the steps are equally far apart. ΔEOK measures that claim in a space with no
 * H–K term, while a ramp sweeps chroma from near zero at its ends to a peak in
 * the middle — so Γ varies substantially along exactly the axis being equalised.
 * If the claim is false, no amount of fitting Radix would reveal it, because
 * Radix never made the claim.
 *
 * Run: npx tsx spike/phase6-spacing.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solveRamp } from '../src/solver/index.ts';
import { deltaEOK, type Oklch } from '../src/color/oklch.ts';
import { deltaEHK, hkGamma, AVERAGE_SURROUND, DARK_SURROUND } from '../src/color/hk.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));
const lightIds = ids.filter((id) => DNA[id]!.mode === 'light');

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };
const cv = (d: number[]) => { const m = mean(d); return m > 0 ? sd(d) / m : 0; };

const STRENGTH = 1; // measure the effect at full size; the question is whether it is visible at all

function gaps(ramp: Oklch[], hk: boolean): number[] {
  const out: number[] = [];
  for (let i = 1; i < ramp.length; i++) {
    out.push(hk ? deltaEHK(ramp[i - 1]!, ramp[i]!, AVERAGE_SURROUND, { strength: STRENGTH }) : deltaEOK(ramp[i - 1]!, ramp[i]!));
  }
  return out;
}

interface Row { id: string; fam: string; cvOK: number; cvHK: number; gammaRange: number }
const rows: Row[] = [];

for (const id of lightIds) {
  const dna = DNA[id]!;
  if (dna.steps.keys === null) continue;
  for (const f of Object.values(dna.families)) {
    const r = solveRamp({ dna, family: f.family, hue: f.hueAtPeak, gamut: 'srgb', sibling: false, spacing: 'even' });
    const colors = r.steps.map((s) => s.color.oklch);
    const gs = colors.map((c) => hkGamma(c, AVERAGE_SURROUND, { strength: STRENGTH }));
    rows.push({ id, fam: f.family, cvOK: cv(gaps(colors, false)), cvHK: cv(gaps(colors, true)), gammaRange: Math.max(...gs) - Math.min(...gs) });
  }
}

console.log('## A ramp made even in ΔEOK, measured again in apparent lightness\n');
console.log('   CV of step size. Lower is more even. Same ramp, two rulers.\n');
console.log('system          n    CV by ΔEOK    CV by ΔE_HK    ratio    Γ range along ramp');
const bySystem = new Map<string, Row[]>();
for (const r of rows) bySystem.set(r.id, [...(bySystem.get(r.id) ?? []), r]);
for (const [id, rs] of bySystem) {
  const a = mean(rs.map((r) => r.cvOK)), b = mean(rs.map((r) => r.cvHK));
  console.log(
    `${id.padEnd(14)} ${String(rs.length).padStart(3)}    ${a.toFixed(4).padStart(8)}      ${b.toFixed(4).padStart(8)}     ${(b / Math.max(1e-9, a)).toFixed(2).padStart(5)}    ${mean(rs.map((r) => r.gammaRange)).toFixed(3)}`,
  );
}
const allOK = mean(rows.map((r) => r.cvOK)), allHK = mean(rows.map((r) => r.cvHK));
console.log(`\nAll ${rows.length} ramps: CV ${allOK.toFixed(4)} by ΔEOK → ${allHK.toFixed(4)} by ΔE_HK  (${(allHK / allOK).toFixed(2)}×)`);

// the worst offenders, since a mean hides them
const worst = [...rows].sort((a, b) => b.cvHK / Math.max(1e-9, b.cvOK) - a.cvHK / Math.max(1e-9, a.cvOK)).slice(0, 8);
console.log('\nWorst ramps — even by measurement, least even in appearance:');
for (const r of worst) console.log(`   ${r.id}/${r.fam}`.padEnd(28) + `CV ${r.cvOK.toFixed(4)} → ${r.cvHK.toFixed(4)}  (${(r.cvHK / r.cvOK).toFixed(1)}×)   Γ range ${r.gammaRange.toFixed(3)}`);

// for scale: how does this compare with the gap even spacing was introduced to close?
console.log('\nFor scale, the reference-spacing CV that even spacing was introduced to fix was 0.359 → 0.032.');

mkdirSync('out', { recursive: true });
writeFileSync('out/phase6-spacing.json', JSON.stringify({ strength: STRENGTH, allOK, allHK, rows }, null, 1));
console.log('wrote out/phase6-spacing.json');
