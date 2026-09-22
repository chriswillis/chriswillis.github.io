/**
 * Is the Helmholtz–Kohlrausch effect visible in Radix's authored dark scale?
 *
 * The dark mirror reproduces Radix's own dark scale to RMS ΔEOK 0.038 using four
 * fitted per-step arrays. What is left over is either noise or structure, and the
 * cheapest structure to test for is H–K: saturated colours look brighter than
 * their luminance says, so a designer compensating for it would author a
 * high-chroma step *darker* than a pure contrast mirror places it.
 *
 * That is a signed, chroma-correlated prediction, so it is falsifiable. The test
 * is run WITHIN each step index across the 25 families, which removes the step
 * number as a confound — the calibration already has a free parameter per step,
 * so any effect it could absorb, it has.
 *
 * Two controls, because a correlation here has innocent explanations:
 *   1. the same regression on Radix's LIGHT scale (L against C within a step).
 *      If light mode shows the same slope, it is an authoring habit, not a
 *      dark-mode compensation.
 *   2. the Nayatani q(θ) hue signature. H–K is strongest around blue/violet and
 *      weakest around yellow-green. Chroma correlation with the wrong hue
 *      pattern is not H–K, it is something else wearing its coat.
 *
 * Run: npx tsx spike/phase6-hk.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { converter } from 'culori';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { deriveDarkDNA } from '../src/dark/mirror.ts';

const light = parseDNA(readFileSync('dna/radix-light.json', 'utf8'));
const dark = parseDNA(readFileSync('dna/radix-dark.json', 'utf8'));
const derived = deriveDarkDNA(light, { gamut: light.authoredGamut });

const toLchuv = converter('lchuv');
const hueOf = (h: number) => (Number.isFinite(h) ? h : 0);

/** CIELUV saturation and hue angle, which is what Nayatani's model is defined on. */
function suvTheta(l: number, c: number, h: number): { s: number; theta: number } {
  const p = toLchuv({ mode: 'oklch', l, c, h: hueOf(h) });
  const L = p.l ?? 0, C = p.c ?? 0, H = p.h ?? 0;
  return { s: L > 1e-6 ? C / L : 0, theta: (H * Math.PI) / 180 };
}

/**
 * Nayatani (1997) VAC. K_Br rises with adapting luminance, so H–K is predicted
 * to be *weaker* in a dark surround, not stronger — worth stating because the
 * folk version of this says the opposite.
 */
function qTheta(t: number): number {
  return -0.01585
    - 0.03017 * Math.cos(t) - 0.04556 * Math.cos(2 * t) - 0.02667 * Math.cos(3 * t) - 0.00295 * Math.cos(4 * t)
    + 0.14592 * Math.sin(t) + 0.05084 * Math.sin(2 * t) - 0.01900 * Math.sin(3 * t) - 0.00764 * Math.sin(4 * t);
}
const kBr = (La: number) => 0.2717 * (6.469 + 6.362 * La ** 0.4495) / (6.469 + La ** 0.4495);
/** Γ for object colours. VAC uses −0.1340, VCC −0.8660; the two methods differ in
 *  which of the pair the observer adjusts, and VCC reports a much larger effect. */
const gammaObject = (s: number, theta: number, La: number, method: number) =>
  1 + (method * qTheta(theta) + 0.0872 * kBr(La)) * s;
/** A screen is emissive, so the *luminous* variant is the applicable one: Nayatani
 *  puts a cube on top of the object form, which is ~2.3× steeper at the achromatic
 *  point. It is normalised so an achromatic colour returns exactly 1. */
const gammaLuminous = (g: number) => 0.4462 * (g + 0.3086) ** 3;
const VAC = -0.1340, VCC = -0.8660;

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
function pearson(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i]! - mx, b = y[i]! - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
/** Least-squares slope of y on x. */
const slope = (x: number[], y: number[]) => {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i]! - mx; sxy += a * (y[i]! - my); sxx += a * a; }
  return sxx > 0 ? sxy / sxx : 0;
};

const fams = Object.keys(dark.families).filter((f) => derived.families[f] && light.families[f]);
const nSteps = dark.families[fams[0]!]!.knots.L.length;

interface StepRow { step: number; n: number; rC: number; rHK: number; slopeC: number; meanRes: number; sdRes: number; lightSlopeC: number }
const rows: StepRow[] = [];
const pooled: { res: number; C: number; hk: number; fam: string; step: number }[] = [];
const allModels: Record<string, number[]> = {};
const allRes: number[] = [];
const allStep: number[] = [];

for (let i = 0; i < nSteps; i++) {
  const res: number[] = [], Cs: number[] = [], hks: number[] = [];
  const lightL: number[] = [], lightC: number[] = [];
  for (const f of fams) {
    const a = dark.families[f]!.knots, d = derived.families[f]!.knots, lg = light.families[f]!.knots;
    const La = a.L[i]!, Ca = a.C[i]!, ha = hueOf(a.h[i]!);
    const Ld = d.L[i]!;
    const { s, theta } = suvTheta(La, Ca, ha);
    // dark surround: take the adapting luminance low, ~20 cd/m²
    const models = {
      'VAC object':   gammaObject(s, theta, 20, VAC) - 1,
      'VCC object':   gammaObject(s, theta, 20, VCC) - 1,
      'VAC luminous': gammaLuminous(gammaObject(s, theta, 20, VAC)) - 1,
      'VCC luminous': gammaLuminous(gammaObject(s, theta, 20, VCC)) - 1,
      'chroma only':  Ca,
    };
    for (const [k, v] of Object.entries(models)) (allModels[k] ??= []).push(v);
    const hk = models['VAC luminous']!;
    res.push(La - Ld); Cs.push(Ca); hks.push(hk);
    allRes.push(La - Ld); allStep.push(i);
    lightL.push(lg.L[i]!); lightC.push(lg.C[i]!);
    pooled.push({ res: La - Ld, C: Ca, hk, fam: f, step: i });
  }
  rows.push({
    step: i, n: fams.length,
    rC: pearson(Cs, res), rHK: pearson(hks, res), slopeC: slope(Cs, res),
    meanRes: mean(res), sdRes: Math.sqrt(mean(res.map((v) => (v - mean(res)) ** 2))),
    lightSlopeC: slope(lightC, lightL),
  });
}

console.log('## Residual of the derived dark scale against Radix\'s authored one, by step');
console.log('   ΔL = authored L − derived L. Correlated with chroma within each step, across 25 families.');
console.log('   H–K predicts a NEGATIVE slope: a chromatic step authored darker than luminance alone asks.\n');
console.log('step   mean ΔL    sd ΔL     r(ΔL, C)   slope(ΔL/C)    r(ΔL, Nayatani)   [control] slope(L/C) in LIGHT mode');
for (const r of rows) {
  console.log(
    `${String(r.step).padStart(3)}   ${r.meanRes.toFixed(4).padStart(8)}  ${r.sdRes.toFixed(4).padStart(8)}   ` +
    `${r.rC.toFixed(3).padStart(7)}   ${r.slopeC.toFixed(3).padStart(10)}    ${r.rHK.toFixed(3).padStart(12)}      ${r.lightSlopeC.toFixed(3).padStart(10)}`,
  );
}

// pooled, after removing the per-step mean (which the calibration already fits)
const byStep = new Map<number, number[]>();
for (const p of pooled) byStep.set(p.step, [...(byStep.get(p.step) ?? []), p.res]);
const centred = pooled.map((p) => ({ ...p, res: p.res - mean(byStep.get(p.step)!) }));
const rCpooled = pearson(centred.map((p) => p.C), centred.map((p) => p.res));
const rHKpooled = pearson(centred.map((p) => p.hk), centred.map((p) => p.res));
console.log(`\nPooled, per-step means removed (n=${centred.length}):`);
console.log(`   r(ΔL, chroma)          = ${rCpooled.toFixed(3)}   → explains ${(100 * rCpooled ** 2).toFixed(1)}% of the residual variance`);
console.log(`   r(ΔL, Nayatani H–K)    = ${rHKpooled.toFixed(3)}   → explains ${(100 * rHKpooled ** 2).toFixed(1)}%`);
const sdAll = Math.sqrt(mean(centred.map((p) => p.res ** 2)));
console.log(`   residual sd in L       = ${sdAll.toFixed(4)}  (for scale: one JND in ΔEOK is 0.02)`);

// ── which model of the effect fits best, all centred per step ────────────────
console.log('\n## Which formulation of the effect tracks the residual?');
console.log('   (all per-step means removed first, so only within-step structure counts)\n');
const stepMeanRes = new Map<number, number>();
for (let i = 0; i < nSteps; i++) {
  const v = allRes.filter((_, k) => allStep[k] === i);
  stepMeanRes.set(i, mean(v));
}
const resC = allRes.map((v, k) => v - stepMeanRes.get(allStep[k]!)!);
console.log('model            r       R²      direction');
for (const [name, vals] of Object.entries(allModels)) {
  const sm = new Map<number, number>();
  for (let i = 0; i < nSteps; i++) sm.set(i, mean(vals.filter((_, k) => allStep[k] === i)));
  const vc = vals.map((v, k) => v - sm.get(allStep[k]!)!);
  const r = pearson(vc, resC);
  const dir = r < 0 ? 'as H–K predicts' : 'opposite to H–K';
  console.log(`${name.padEnd(15)} ${r.toFixed(3).padStart(6)}  ${(100 * r * r).toFixed(1).padStart(5)}%   ${dir}`);
}
const best = Object.entries(allModels).map(([n, vals]) => {
  const sm = new Map<number, number>();
  for (let i = 0; i < nSteps; i++) sm.set(i, mean(vals.filter((_, k) => allStep[k] === i)));
  return [n, Math.abs(pearson(vals.map((v, k) => v - sm.get(allStep[k]!)!), resC))] as const;
}).sort((a, b) => b[1] - a[1])[0]!;
const sdRes = Math.sqrt(mean(resC.map((v) => v * v)));
console.log(`\nBest: ${best[0]} at r=${best[1].toFixed(3)}. Residual sd is ${sdRes.toFixed(4)} in L,`);
console.log(`so modelling it would recover about ${(best[1] * sdRes).toFixed(4)} of L — ${(best[1] * sdRes / 0.02).toFixed(2)} of a JND.`);

mkdirSync('out', { recursive: true });
writeFileSync('out/phase6-hk.json', JSON.stringify({ rows, rCpooled, rHKpooled, sdAll }, null, 1));
console.log('\nwrote out/phase6-hk.json');
