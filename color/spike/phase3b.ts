/**
 * Phase 3, part 2: fit the light → dark model and score it.
 *
 * Part 1 established that Radix pins step 9 in all 25 families, so the model is
 * "pin the key step, mirror the rest". This part answers, with numbers:
 *
 *  1. Which contrast domain should the mirror work in? WCAG needs a per-step
 *     gain above 1 to reach Radix's dark scale, APCA needs one below 1 — so the
 *     two bracket it. Fit the single blend λ between them.
 *  2. What chroma policy carries the transfer, and what per-step factor?
 *  3. Score the assembled model leave-one-family-out, against the pure mirrors.
 *
 * Run: npx tsx spike/phase3b.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA } from '../src/dna/schema.ts';
import { wcag21Fast, apcaFast } from '../src/contrast/fast.ts';
import { shell } from '../src/gamut/shell.ts';
import { deltaEOK, type Oklch } from '../src/color/oklch.ts';
import { APCA_INVERTIBLE_LC, RADIX_CALIBRATION } from '../src/dark/mirror.ts';

const light = parseDNA(readFileSync('dna/radix-light.json', 'utf8'));
const dark = parseDNA(readFileSync('dna/radix-dark.json', 'utf8'));
const fams = Object.keys(light.families).filter((f) => f in dark.families);
const N = 12;
const PIN = 8;          // step 9, the brand solid
const HOVER = 9;        // step 10, its hover — derived from the pin, not from the background
const sh = shell('srgb');

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const gmean = (x: number[]) => Math.exp(mean(x.map((v) => Math.log(Math.max(1e-9, v)))));
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };
const rms = (x: number[]) => Math.sqrt(mean(x.map((v) => v * v)));
const cv = (x: number[]) => sd(x) / mean(x);

const bgL: Oklch = { l: light.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };
const bgD: Oklch = { l: dark.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };
const wl = light.chroma.w;

function bisect(f: (L: number) => number, t: number, lo: number, hi: number) {
  const a = f(lo), b = f(hi);
  const inc = b > a;
  if ((inc && (t <= a || t >= b)) || (!inc && (t >= a || t <= b))) return Math.abs(t - a) < Math.abs(t - b) ? lo : hi;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if ((f(m) < t) === inc) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ── 1. the two mirrors bracket the answer ─────────────────────────────────────
console.log('## 1. Per-step contrast gain needed to reach Radix\'s dark scale, in each domain');
console.log('step |  WCAG gain (cv)  |  APCA gain (cv)  |  light CR   dark CR  |  verdict');
const gW: number[][] = Array.from({ length: N }, () => []);
const gA: number[][] = Array.from({ length: N }, () => []);
const cwL: number[][] = Array.from({ length: N }, () => []);
const cwD: number[][] = Array.from({ length: N }, () => []);
for (const f of fams) {
  const a = light.families[f]!.knots, b = dark.families[f]!.knots;
  for (let i = 0; i < N; i++) {
    const ca: Oklch = { l: a.L[i]!, c: a.C[i]!, h: a.h[i]! };
    const cb: Oklch = { l: b.L[i]!, c: b.C[i]!, h: b.h[i]! };
    const wa = wcag21Fast(ca, bgL), wb = wcag21Fast(cb, bgD);
    cwL[i]!.push(wa); cwD[i]!.push(wb); gW[i]!.push(wb / wa);
    const aa = Math.abs(apcaFast(ca, bgL)), ab = Math.abs(apcaFast(cb, bgD));
    if (aa > 1 && ab > 1) gA[i]!.push(ab / aa);
  }
}
for (let i = 0; i < N; i++) {
  const c = cv(gW[i]!);
  console.log(`${String(i + 1).padStart(4)} |  ${gmean(gW[i]!).toFixed(3)} (${c.toFixed(2)})    |  ${gA[i]!.length ? gmean(gA[i]!).toFixed(3) : '  —  '} (${gA[i]!.length ? cv(gA[i]!).toFixed(2) : ' — '})    |  ${mean(cwL[i]!).toFixed(2).padStart(6)}  ${mean(cwD[i]!).toFixed(2).padStart(7)}  |  ${c > 0.4 ? 'role-defined: cannot be mirrored' : 'contrast-defined: mirrors'}`);
}
console.log('WCAG needs 1.0–1.9× to reach Radix; APCA needs 0.44–0.93×. Neither is right alone, and they bracket it.');

// ── 2. λ, the one number between them ─────────────────────────────────────────
console.log('\n## 2. λ: where Radix\'s dark scale sits between the WCAG mirror (0) and the APCA mirror (1)');
console.log('step   L_wcag  L_apca  L_actual |  λ mean ± sd   n');
const lam: number[][] = Array.from({ length: N }, () => []);
for (let i = 0; i < N; i++) {
  let sw = 0, sa = 0, sr = 0, n = 0;
  for (const f of fams) {
    const a = light.families[f]!.knots, b = dark.families[f]!.knots;
    const ca: Oklch = { l: a.L[i]!, c: a.C[i]!, h: a.h[i]! };
    const cd = { c: b.C[i]!, h: b.h[i]! };
    const Lw = bisect((L) => wcag21Fast({ l: L, ...cd }, bgD), wcag21Fast(ca, bgL), bgD.l, 1);
    const ta = Math.abs(apcaFast(ca, bgL));
    if (ta < APCA_INVERTIBLE_LC) continue;
    const La = bisect((L) => Math.abs(apcaFast({ l: L, ...cd }, bgD)), ta, bgD.l, 1);
    if (Math.abs(La - Lw) < 0.02) continue;
    lam[i]!.push((b.L[i]! - Lw) / (La - Lw));
    sw += Lw; sa += La; sr += b.L[i]!; n++;
  }
  console.log(`${String(i + 1).padStart(4)}   ${n ? (sw / n).toFixed(3) : '  —  '}   ${n ? (sa / n).toFixed(3) : '  —  '}   ${n ? (sr / n).toFixed(3) : '  —  '}    |  ${lam[i]!.length ? `${mean(lam[i]!).toFixed(2)} ± ${sd(lam[i]!).toFixed(2)}` : '  —  '}   ${lam[i]!.length}`);
}
const nonPin = lam.filter((_, i) => i !== PIN && i !== HOVER).flat();
console.log(`λ over the non-pinned steps: ${mean(nonPin).toFixed(3)} ± ${sd(nonPin).toFixed(3)} (n=${nonPin.length}). Steps 1–3 never reach |Lc| ${APCA_INVERTIBLE_LC}, so APCA is not invertible there and the WCAG mirror stands alone.`);

// ── 3. chroma: which policy, and what factor ──────────────────────────────────
console.log('\n## 3. Chroma. Grid search per step over the blend weight, LOFO mean |ΔC|');
console.log('step  best w  factor  |  LOFO |ΔC|: best   source w   pure relative   pure absolute');
const chosen: { w: number; f: number }[] = [];
for (let i = 0; i < N; i++) {
  const rows = fams.map((f) => {
    const a = light.families[f]!.knots, b = dark.families[f]!.knots;
    return { relC: a.relC.srgb[i]!, Cl: a.C[i]!, cusp: sh.cuspChroma(b.L[i]!, a.h[i]!), Cd: b.C[i]! };
  });
  const fitFac = (w: number, sub: typeof rows) => {
    const rs = sub.filter((r) => r.Cd > 0.004).map((r) => r.Cd / Math.max(1e-6, w * r.relC * r.cusp + (1 - w) * r.Cl));
    return rs.length ? gmean(rs) : 1;
  };
  const err = (w: number, fac: number, sub: typeof rows) => mean(sub.map((r) => Math.abs(fac * (w * r.relC * r.cusp + (1 - w) * r.Cl) - r.Cd)));
  const best = (sub: typeof rows) => { let bw = 0, bf = 1, be = Infinity; for (let k = 0; k <= 20; k++) { const w = k / 20, fac = fitFac(w, sub); const e = err(w, fac, sub); if (e < be) { be = e; bw = w; bf = fac; } } return { w: bw, f: bf }; };
  chosen.push(best(rows));
  const lofo = (pick: (sub: typeof rows) => { w: number; f: number }) => mean(fams.map((_, fi) => {
    const p = pick(rows.filter((_, j) => j !== fi)), r = rows[fi]!;
    return Math.abs(p.f * (p.w * r.relC * r.cusp + (1 - p.w) * r.Cl) - r.Cd);
  }));
  const wS = wl[i] ?? light.chroma.wMean;
  console.log(`${String(i + 1).padStart(4)}  ${chosen[i]!.w.toFixed(2)}    ${chosen[i]!.f.toFixed(2)}    |  ${lofo(best).toFixed(4)}        ${lofo((s) => ({ w: wS, f: fitFac(wS, s) })).toFixed(4)}      ${lofo((s) => ({ w: 1, f: fitFac(1, s) })).toFixed(4)}          ${lofo((s) => ({ w: 0, f: fitFac(0, s) })).toFixed(4)}`);
}
console.log(`transfer w: ${chosen.map((c) => c.w.toFixed(2)).join(' ')}`);
console.log(`source   w: ${wl.map((v) => v.toFixed(2)).join(' ')}   (fit for hue-to-hue transfer at constant L, not for a mode flip)`);
console.log(`factor    : ${chosen.map((c) => c.f.toFixed(2)).join(' ')}`);
console.log(`shipped   : ${RADIX_CALIBRATION.transferW.map((v) => v.toFixed(2)).join(' ')} / ${RADIX_CALIBRATION.chroma.map((v) => v.toFixed(2)).join(' ')}`);

// ── 4. the assembled model, leave-one-family-out ──────────────────────────────
const facRows = Array.from({ length: N }, (_, i) => fams.map((f) => {
  const a = light.families[f]!.knots, b = dark.families[f]!.knots;
  const w = RADIX_CALIBRATION.transferW[i] ?? 0.3;
  const p = Math.max(0, w * a.relC.srgb[i]! * sh.cuspChroma(b.L[i]!, a.h[i]!) + (1 - w) * a.C[i]!);
  return (p > 0.004 && b.C[i]! > 0.004) ? b.C[i]! / p : NaN;
}).filter(Number.isFinite));

function build(f: string, lamAt: (i: number) => number, fac: number[], hov: { dL: number; dC: number }) {
  const a = light.families[f]!.knots;
  const out: Oklch[] = [];
  for (let i = 0; i < N; i++) {
    const h = a.h[i]!;
    if (i === PIN) { out.push({ l: a.L[i]!, c: a.C[i]!, h }); continue; }
    if (i === HOVER) { out.push({ l: out[PIN]!.l + hov.dL, c: Math.max(0, out[PIN]!.c + hov.dC), h }); continue; }
    const w = RADIX_CALIBRATION.transferW[i] ?? 0.3;
    const ca: Oklch = { l: a.L[i]!, c: a.C[i]!, h };
    const tw = wcag21Fast(ca, bgL), ta = Math.abs(apcaFast(ca, bgL));
    let L = a.L[i]!, C = a.C[i]!;
    for (let it = 0; it < 3; it++) {
      const Lw = bisect((x) => wcag21Fast({ l: x, c: C, h }, bgD), tw, bgD.l, 1);
      const La = ta >= APCA_INVERTIBLE_LC ? bisect((x) => Math.abs(apcaFast({ l: x, c: C, h }, bgD)), ta, bgD.l, 1) : Lw;
      const l = ta >= APCA_INVERTIBLE_LC ? lamAt(i) : 0;
      L = (1 - l) * Lw + l * La;
      C = Math.max(0, fac[i]! * (w * a.relC.srgb[i]! * sh.cuspChroma(L, h) + (1 - w) * a.C[i]!));
    }
    out.push({ l: L, c: C, h });
  }
  return out;
}

console.log('\n## 4. The assembled model, leave-one-family-out (nothing from the held-out family\'s dark scale)');
console.log('model                                RMS ΔEOK  median   p90    <1JND <2JND <3JND   worst families');
const scores: Record<string, number> = {};
for (const [name, lamFn] of [
  ['λ = 0 — pure WCAG mirror', (_i: number, _l: number[]) => 0],
  ['λ = 1 — pure APCA mirror', (_i: number, _l: number[]) => 1],
  ['λ = 0.5 — balanced (the default)', (_i: number, _l: number[]) => 0.5],
  ['λ(n) — fit per step to Radix', (i: number, l: number[]) => l[i]!],
] as const) {
  const des: number[] = [];
  const perFam: [string, number][] = [];
  fams.forEach((f, fi) => {
    const fac = Array.from({ length: N }, (_, i) => { const o = facRows[i]!.filter((_, j) => j !== fi); return o.length ? gmean(o) : 1; });
    const lamL = Array.from({ length: N }, (_, i) => { const o = lam[i]!.filter((_, j) => j !== fi); return o.length ? mean(o) : 0.5; });
    const hov = {
      dL: mean(fams.filter((_, j) => j !== fi).map((g) => dark.families[g]!.knots.L[HOVER]! - dark.families[g]!.knots.L[PIN]!)),
      dC: mean(fams.filter((_, j) => j !== fi).map((g) => dark.families[g]!.knots.C[HOVER]! - dark.families[g]!.knots.C[PIN]!)),
    };
    const got = build(f, (i) => lamFn(i, lamL), fac, hov);
    const b = dark.families[f]!.knots;
    let acc = 0;
    for (let i = 0; i < N; i++) { const d = deltaEOK(got[i]!, { l: b.L[i]!, c: b.C[i]!, h: b.h[i]! }); des.push(d); acc += d * d; }
    perFam.push([f, Math.sqrt(acc / N)]);
  });
  perFam.sort((a, b) => b[1] - a[1]);
  const s = des.slice().sort((a, b) => a - b);
  scores[name] = rms(des);
  const pc = (t: number) => `${((des.filter((d) => d < t).length / des.length) * 100).toFixed(0)}%`.padStart(4);
  console.log(`${name.padEnd(36)} ${rms(des).toFixed(4)}  ${s[Math.floor(s.length / 2)]!.toFixed(4)}  ${s[Math.floor(s.length * 0.9)]!.toFixed(4)}  ${pc(0.02)}  ${pc(0.04)}  ${pc(0.06)}   ${perFam.slice(0, 3).map(([f, v]) => `${f} ${v.toFixed(3)}`).join(', ')}`);
}
console.log('The balanced mirror halves the error of either pure one. Fitting λ per step buys another ~12%, from ten more parameters taken from a single system — which is why it is opt-in, not the default.');

mkdirSync('out', { recursive: true });
writeFileSync('out/phase3b.json', JSON.stringify({
  surfaces: { light: bgL.l, dark: bgD.l },
  gain: { wcag: gW.map((g) => gmean(g)), wcagCv: gW.map(cv), apca: gA.map((g) => (g.length ? gmean(g) : null)) },
  lambda: { perStep: lam.map((l) => (l.length ? mean(l) : null)), overall: mean(nonPin), sd: sd(nonPin) },
  chroma: { transferW: chosen.map((c) => c.w), factor: chosen.map((c) => c.f), sourceW: wl },
  scores,
}, null, 1));
console.log('\nwrote out/phase3b.json');
