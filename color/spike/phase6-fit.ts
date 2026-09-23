/**
 * Does an H–K term earn its place, and at what strength?
 *
 * `phase6-hk.ts` showed the residual correlates with Nayatani's prediction at
 * r = −0.37. Correlation is not improvement: the question here is whether
 * applying the correction actually moves the derived dark scale closer to the
 * one Radix ships, and if so how much of the full model to apply.
 *
 * The correction treats the mirror's output as an *apparent* lightness target
 * and solves for the measured L that appears there. Γ ≥ 1, so chromatic steps
 * move darker — the direction the residual said they should.
 *
 * Two RMS figures are reported, and the difference between them matters:
 *
 *   naive      — bolt the correction on and measure. This conflates two things,
 *                because the existing calibration has a free parameter per step
 *                that was fitted without H–K and is already absorbing whatever
 *                mean shift the correction would introduce.
 *   recentred  — remove the per-step mean of the correction first, leaving only
 *                its hue- and chroma-dependent variation. This is what the term
 *                is worth if the calibration were refitted alongside it, and so
 *                it is the honest test of whether the model adds information
 *                rather than just re-parameterising a shift.
 *
 * Run: npx tsx spike/phase6-fit.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA } from '../src/dna/schema.ts';
import { deriveDarkDNA } from '../src/dark/mirror.ts';
import { deltaEOK, type Oklch } from '../src/color/oklch.ts';
import { lForApparent, DARK_SURROUND, type HKMethod } from '../src/color/hk.ts';

const light = parseDNA(readFileSync('dna/radix-light.json', 'utf8'));
const authored = parseDNA(readFileSync('dna/radix-dark.json', 'utf8'));
const derived = deriveDarkDNA(light, { gamut: light.authoredGamut });

const fams = Object.keys(authored.families).filter((f) => derived.families[f]);
const nSteps = authored.families[fams[0]!]!.knots.L.length;
const hueOf = (h: number) => (Number.isFinite(h) ? h : 0);

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const rms = (x: number[]) => Math.sqrt(mean(x.map((v) => v * v)));

interface Cell { fam: string; step: number; d: Oklch; a: Oklch }
const cells: Cell[] = [];
for (const f of fams) {
  for (let i = 0; i < nSteps; i++) {
    const dk = derived.families[f]!.knots, ak = authored.families[f]!.knots;
    cells.push({
      fam: f, step: i,
      d: { l: dk.L[i]!, c: dk.C[i]!, h: hueOf(dk.h[i]!) },
      a: { l: ak.L[i]!, c: ak.C[i]!, h: hueOf(ak.h[i]!) },
    });
  }
}

const baseline = rms(cells.map((c) => deltaEOK(c.d, c.a)));

/** Apply the correction at `strength`, optionally removing its per-step mean. */
function score(strength: number, method: HKMethod, recentre: boolean): number {
  const corrected = cells.map((c) => ({
    ...c,
    lc: lForApparent(c.d.l, c.d.c, c.d.h, DARK_SURROUND, { strength, method }),
  }));
  let shift = new Map<number, number>();
  if (recentre) {
    for (let i = 0; i < nSteps; i++) {
      const g = corrected.filter((c) => c.step === i);
      shift.set(i, mean(g.map((c) => c.lc - c.d.l)));
    }
  }
  return rms(corrected.map((c) => {
    const l = c.lc - (shift.get(c.step) ?? 0);
    return deltaEOK({ l: Math.min(1, Math.max(0, l)), c: c.d.c, h: c.d.h }, c.a);
  }));
}

console.log(`Baseline (no H–K): RMS ΔEOK ${baseline.toFixed(4)} over ${cells.length} steps\n`);
console.log('strength    VCC naive   VCC recentred   VAC naive   VAC recentred');
const grid = Array.from({ length: 21 }, (_, i) => i / 20);
const results: Record<string, { s: number; v: number }[]> = { 'vcc-naive': [], 'vcc-recentred': [], 'vac-naive': [], 'vac-recentred': [] };
for (const s of grid) {
  const vn = score(s, 'vcc', false), vr = score(s, 'vcc', true);
  const an = score(s, 'vac', false), ar = score(s, 'vac', true);
  results['vcc-naive']!.push({ s, v: vn }); results['vcc-recentred']!.push({ s, v: vr });
  results['vac-naive']!.push({ s, v: an }); results['vac-recentred']!.push({ s, v: ar });
  const mark = (v: number) => (v < baseline ? ' ✓' : '  ');
  console.log(
    `${s.toFixed(2).padStart(6)}    ${vn.toFixed(4)}${mark(vn)}   ${vr.toFixed(4)}${mark(vr)}      ${an.toFixed(4)}${mark(an)}   ${ar.toFixed(4)}${mark(ar)}`,
  );
}

console.log('\n## Best of each');
const best: Record<string, { s: number; v: number }> = {};
for (const [k, xs] of Object.entries(results)) {
  const b = xs.reduce((p, q) => (q.v < p.v ? q : p));
  best[k] = b;
  const delta = ((b.v - baseline) / baseline) * 100;
  console.log(`${k.padEnd(15)} strength ${b.s.toFixed(2)}  RMS ${b.v.toFixed(4)}  ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs baseline`);
}

const win = best['vcc-recentred']!;
console.log(`\nVerdict: the honest figure is VCC recentred — strength ${win.s.toFixed(2)},`);
console.log(`RMS ${baseline.toFixed(4)} → ${win.v.toFixed(4)} (${(((win.v - baseline) / baseline) * 100).toFixed(1)}%).`);
console.log(`In JND terms that is ${((baseline - win.v) / 0.02).toFixed(2)} of a JND recovered.`);

mkdirSync('out', { recursive: true });
writeFileSync('out/phase6-fit.json', JSON.stringify({ baseline, results, best }, null, 1));
console.log('\nwrote out/phase6-fit.json');
