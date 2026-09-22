/**
 * Phase 3 measurement: what is the light → dark relationship, measured on the
 * only reference that ships both (Radix, 25 families × 12 steps)?
 *
 * Questions:
 *  1. Is the step-9 solid really pinned across modes for every family?
 *  2. Which domain mirrors the lightness best: L, WCAG, APCA, affine-in-L?
 *     With the pin, does an anchored mirror beat an unanchored one?
 *  3. What is the chroma relationship — absolute ratio, or relC ratio?
 *  4. Does hue drift survive the mode change?
 *  5. Does the fitted correction generalize across families (leave-one-out)?
 *
 * Run: npx tsx spike/phase3.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { wcag21Fast, apcaFast } from '../src/contrast/fast.ts';
import { shell } from '../src/gamut/shell.ts';
import { hueDelta, deltaEOK, type Oklch } from '../src/color/oklch.ts';

const light = parseDNA(readFileSync('dna/radix-light.json', 'utf8'));
const dark = parseDNA(readFileSync('dna/radix-dark.json', 'utf8'));
const fams = Object.keys(light.families).filter((f) => f in dark.families);
const N = 12;
const sh = shell('srgb');

const rms = (x: number[]) => Math.sqrt(x.reduce((a, b) => a + b * b, 0) / Math.max(1, x.length));
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };
const f3 = (v: number) => v.toFixed(3).padStart(6);

// backgrounds: each mode's own step 1 of its gray
const bgL: Oklch = { l: light.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };
const bgD: Oklch = { l: dark.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };
console.log(`backgrounds: light gray-1 L ${bgL.l.toFixed(3)}   dark gray-1 L ${bgD.l.toFixed(3)}`);

// ── 1. the pin ────────────────────────────────────────────────────────────────
console.log('\n## 1. Which steps are identical across modes?');
const pinDE: number[][] = Array.from({ length: N }, () => []);
for (const f of fams) {
  const a = light.families[f]!.knots, b = dark.families[f]!.knots;
  for (let i = 0; i < N; i++) pinDE[i]!.push(deltaEOK({ l: a.L[i]!, c: a.C[i]!, h: a.h[i]! }, { l: b.L[i]!, c: b.C[i]!, h: b.h[i]! }));
}
console.log('step  maxΔEOK  meanΔEOK   identical/25');
for (let i = 0; i < N; i++) {
  const id = pinDE[i]!.filter((d) => d < 1e-9).length;
  console.log(`${String(i + 1).padStart(4)}  ${f3(Math.max(...pinDE[i]!))}  ${f3(mean(pinDE[i]!))}   ${id}/${fams.length}`);
}

// also check the neutrals
console.log('\nneutrals:');
for (const g of Object.keys(light.neutrals).filter((g) => g in dark.neutrals)) {
  const a = light.neutrals[g]!.knots, b = dark.neutrals[g]!.knots;
  const des = a.L.map((_, i) => deltaEOK({ l: a.L[i]!, c: a.C[i]!, h: Number.isNaN(a.h[i]!) ? 0 : a.h[i]! }, { l: b.L[i]!, c: b.C[i]!, h: Number.isNaN(b.h[i]!) ? 0 : b.h[i]! }));
  console.log(`  ${g.padEnd(6)} min ΔEOK ${f3(Math.min(...des))} at step ${des.indexOf(Math.min(...des)) + 1}   (no pin expected)`);
}

// ── 2. mirrors ────────────────────────────────────────────────────────────────
// Each candidate predicts dark L at step i from the light ramp, holding the dark
// chroma and hue at Radix's actual values (so the comparison is about L alone).
function bisect(f: (L: number) => number, target: number, lo: number, hi: number): { L: number; reached: boolean } {
  const flo = f(lo), fhi = f(hi);
  const inc = fhi > flo;
  if ((inc && (target <= flo || target >= fhi)) || (!inc && (target >= flo || target <= fhi))) return { L: Math.abs(target - flo) < Math.abs(target - fhi) ? lo : hi, reached: false };
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if ((f(m) < target) === inc) lo = m; else hi = m; }
  return { L: (lo + hi) / 2, reached: true };
}

type Mirror = { name: string; predict: (f: string, i: number) => { L: number; reached: boolean } };

const mirrors: Mirror[] = [
  {
    name: 'L (1 − L)',
    predict: (_f, i) => ({ L: 1 - light.families[_f]!.knots.L[i]!, reached: true }),
  },
  {
    name: 'L affine (bg→bg, ends pinned)',
    predict: (f, i) => {
      // map light's [bg, darkest] onto dark's [bg, lightest]
      const a = light.families[f]!.knots.L, b = dark.families[f]!.knots.L;
      const [l0, l1] = [a[0]!, a[N - 1]!];
      const [d0, d1] = [b[0]!, b[N - 1]!];
      return { L: d0 + ((a[i]! - l0) / (l1 - l0)) * (d1 - d0), reached: true };
    },
  },
  {
    name: 'WCAG vs own bg',
    predict: (f, i) => {
      const a = light.families[f]!.knots, b = dark.families[f]!.knots;
      const target = wcag21Fast({ l: a.L[i]!, c: a.C[i]!, h: a.h[i]! }, bgL);
      return bisect((L) => wcag21Fast({ l: L, c: b.C[i]!, h: b.h[i]! }, bgD), target, bgD.l, 1);
    },
  },
  {
    name: 'APCA vs own bg',
    predict: (f, i) => {
      const a = light.families[f]!.knots, b = dark.families[f]!.knots;
      const target = Math.abs(apcaFast({ l: a.L[i]!, c: a.C[i]!, h: a.h[i]! }, bgL));
      return bisect((L) => Math.abs(apcaFast({ l: L, c: b.C[i]!, h: b.h[i]! }, bgD)), target, bgD.l, 1);
    },
  },
  {
    name: 'APCA, WCAG below Lc 8',
    predict: (f, i) => {
      const a = light.families[f]!.knots, b = dark.families[f]!.knots;
      const lc = Math.abs(apcaFast({ l: a.L[i]!, c: a.C[i]!, h: a.h[i]! }, bgL));
      if (lc >= 8) return bisect((L) => Math.abs(apcaFast({ l: L, c: b.C[i]!, h: b.h[i]! }, bgD)), lc, bgD.l, 1);
      const target = wcag21Fast({ l: a.L[i]!, c: a.C[i]!, h: a.h[i]! }, bgL);
      return bisect((L) => wcag21Fast({ l: L, c: b.C[i]!, h: b.h[i]! }, bgD), target, bgD.l, 1);
    },
  },
];

console.log('\n## 2. Mirror accuracy (RMS ΔL against Radix dark, all 25 families)');
console.log('mirror                        allsteps   ex-9   worst step (RMS)   worst family');
const perMirror: Record<string, { resid: number[][]; reachedFail: number }> = {};
for (const m of mirrors) {
  const resid: number[][] = Array.from({ length: N }, () => []);
  let fail = 0;
  const byFam: Record<string, number[]> = {};
  for (const f of fams) {
    byFam[f] = [];
    for (let i = 0; i < N; i++) {
      const p = m.predict(f, i);
      if (!p.reached) fail++;
      const r = p.L - dark.families[f]!.knots.L[i]!;
      resid[i]!.push(r);
      byFam[f]!.push(r);
    }
  }
  perMirror[m.name] = { resid, reachedFail: fail };
  const all = resid.flat();
  const ex9 = resid.filter((_, i) => i !== 8).flat();
  const perStep = resid.map((r) => rms(r));
  const ws = perStep.indexOf(Math.max(...perStep));
  const famR = Object.entries(byFam).map(([f, r]) => [f, rms(r)] as const).sort((a, b) => b[1] - a[1])[0]!;
  console.log(`${m.name.padEnd(30)}${f3(rms(all))} ${f3(rms(ex9))}   ${String(ws + 1).padStart(2)} (${rms(resid[ws]!).toFixed(3)})      ${famR[0]} ${famR[1].toFixed(3)}${fail ? `   [${fail} unreachable]` : ''}`);
}

console.log('\nper-step RMS ΔL:');
console.log('mirror                        ' + Array.from({ length: N }, (_, i) => String(i + 1).padStart(6)).join(''));
for (const m of mirrors) console.log(m.name.padEnd(30) + perMirror[m.name]!.resid.map((r) => f3(rms(r))).join(''));

console.log('\nper-step MEAN ΔL (systematic bias — this is what a correction would remove):');
console.log('mirror                        ' + Array.from({ length: N }, (_, i) => String(i + 1).padStart(6)).join(''));
for (const m of mirrors) console.log(m.name.padEnd(30) + perMirror[m.name]!.resid.map((r) => f3(mean(r))).join(''));

console.log('\nper-step SD of ΔL across families (the irreducible part):');
console.log('mirror                        ' + Array.from({ length: N }, (_, i) => String(i + 1).padStart(6)).join(''));
for (const m of mirrors) console.log(m.name.padEnd(30) + perMirror[m.name]!.resid.map((r) => f3(sd(r))).join(''));

// ── 3. corrected mirror, leave-one-family-out ─────────────────────────────────
console.log('\n## 3. Mirror + per-step mean correction, leave-one-family-out');
console.log('mirror                        raw RMS  corrected RMS (LOFO)   improvement');
for (const m of mirrors) {
  const resid = perMirror[m.name]!.resid;
  const corrected: number[] = [];
  for (let fi = 0; fi < fams.length; fi++) {
    for (let i = 0; i < N; i++) {
      const others = resid[i]!.filter((_, j) => j !== fi);
      corrected.push(resid[i]![fi]! - mean(others));
    }
  }
  const raw = rms(resid.flat());
  const cor = rms(corrected);
  console.log(`${m.name.padEnd(30)}${f3(raw)} ${f3(cor)}                ${((1 - cor / raw) * 100).toFixed(0)}%`);
}

// ── 4. chroma ─────────────────────────────────────────────────────────────────
console.log('\n## 4. Chroma: is the dark/light relationship stable in absolute C or in relC?');
console.log('step   absC ratio (mean±sd)    relC ratio (mean±sd)    relC_light   relC_dark');
const absRatio: number[][] = Array.from({ length: N }, () => []);
const relRatio: number[][] = Array.from({ length: N }, () => []);
const relL: number[][] = Array.from({ length: N }, () => []);
const relD: number[][] = Array.from({ length: N }, () => []);
for (const f of fams) {
  const a = light.families[f]!.knots, b = dark.families[f]!.knots;
  for (let i = 0; i < N; i++) {
    const ra = a.relC.srgb[i]!, rb = b.relC.srgb[i]!;
    relL[i]!.push(ra); relD[i]!.push(rb);
    if (a.C[i]! > 0.004) { absRatio[i]!.push(b.C[i]! / a.C[i]!); if (ra > 0.02) relRatio[i]!.push(rb / ra); }
  }
}
for (let i = 0; i < N; i++) {
  const A = absRatio[i]!, R = relRatio[i]!;
  const cv = (x: number[]) => (x.length && mean(x) ? sd(x) / mean(x) : NaN);
  console.log(`${String(i + 1).padStart(4)}   ${mean(A).toFixed(2)} ± ${sd(A).toFixed(2)} (cv ${cv(A).toFixed(2)})   ${mean(R).toFixed(2)} ± ${sd(R).toFixed(2)} (cv ${cv(R).toFixed(2)})      ${mean(relL[i]!).toFixed(2)}        ${mean(relD[i]!).toFixed(2)}`);
}

// the same, but comparing relC at the MIRRORED lightness — the fair test, because relC is
// a function of L and the dark step sits at a different L.
console.log('\nrelC transferred at the dark step\'s own L (what the solver would actually do):');
console.log('step   predicted C from light relC   actual dark C   ratio (mean±sd)');
for (let i = 0; i < N; i++) {
  const rs: number[] = [];
  for (const f of fams) {
    const a = light.families[f]!.knots, b = dark.families[f]!.knots;
    const pred = a.relC.srgb[i]! * sh.cuspChroma(b.L[i]!, b.h[i]!);
    if (b.C[i]! > 0.004 && pred > 0.004) rs.push(b.C[i]! / pred);
  }
  console.log(`${String(i + 1).padStart(4)}   ${mean(rs).toFixed(2)} ± ${sd(rs).toFixed(2)}  (cv ${(sd(rs) / mean(rs)).toFixed(2)}, n=${rs.length})`);
}

// ── 5. hue drift ──────────────────────────────────────────────────────────────
console.log('\n## 5. Hue drift: dh_dark vs dh_light (degrees, relative to each mode\'s own peak step)');
console.log('step   mean |dh_d − dh_l|   max   sd');
for (let i = 0; i < N; i++) {
  const ds = fams.map((f) => {
    const a = light.families[f]!, b = dark.families[f]!;
    return hueDelta(b.knots.dh[i]!, a.knots.dh[i]!);
  });
  console.log(`${String(i + 1).padStart(4)}   ${f3(mean(ds.map(Math.abs)))}   ${f3(Math.max(...ds.map(Math.abs)))} ${f3(sd(ds))}`);
}
const peakShift = fams.map((f) => hueDelta(dark.families[f]!.hueAtPeak, light.families[f]!.hueAtPeak));
console.log(`peak hue shift dark − light: mean ${mean(peakShift).toFixed(2)}°, max |${Math.max(...peakShift.map(Math.abs)).toFixed(2)}|°  (peak index: light ${light.families['blue']!.peakIndex}, dark ${dark.families['blue']!.peakIndex})`);

// ── 6. what does the pinned step imply? ───────────────────────────────────────
console.log('\n## 6. Contrast of the pinned step 9 in each mode (it cannot be both)');
console.log('fam      WCAG light  WCAG dark   APCA light  APCA dark');
for (const f of ['blue', 'yellow', 'green', 'red']) {
  const a = light.families[f]!.knots;
  const c: Oklch = { l: a.L[8]!, c: a.C[8]!, h: a.h[8]! };
  console.log(`${f.padEnd(8)} ${wcag21Fast(c, bgL).toFixed(2).padStart(9)}  ${wcag21Fast(c, bgD).toFixed(2).padStart(9)}   ${apcaFast(c, bgL).toFixed(1).padStart(9)}  ${apcaFast(c, bgD).toFixed(1).padStart(9)}`);
}

mkdirSync('out', { recursive: true });
writeFileSync('out/phase3.json', JSON.stringify({
  backgrounds: { light: bgL.l, dark: bgD.l },
  pin: { step: 9, identicalFamilies: pinDE[8]!.filter((d) => d < 1e-9).length, of: fams.length },
  mirrors: Object.fromEntries(mirrors.map((m) => [m.name, {
    rmsAll: rms(perMirror[m.name]!.resid.flat()),
    perStepRms: perMirror[m.name]!.resid.map((r) => rms(r)),
    perStepMean: perMirror[m.name]!.resid.map((r) => mean(r)),
    perStepSd: perMirror[m.name]!.resid.map((r) => sd(r)),
  }])),
  chroma: { relCTransferRatio: Array.from({ length: N }, (_, i) => mean(relRatio[i]!)) },
}, null, 1));
console.log('\nwrote out/phase3.json');
