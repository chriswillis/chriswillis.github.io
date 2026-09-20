/**
 * Phase 0 — spike. Extracts DNA from Tailwind v4 and Radix (light, sRGB), runs
 * the cluster analysis that tests the premise, validates hue centroids against
 * the published cross-system statistics, and runs two empirical checks that
 * bear on later phases (Radix dark vs light; Radix P3 vs sRGB pairing).
 *
 * Writes out/phase0.json (consumed by spike/plot.py) and prints a report.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { converter } from 'culori';
import Color from 'colorjs.io';
import { loadTailwindV4 } from '../src/ingest/tailwind.ts';
import { loadRadix } from '../src/ingest/radix.ts';
import { loadPaletteMeta, loadPaletteColors, loadPublishedHues } from '../src/ingest/palettes-dataset.ts';
import { extractRamp, resample, type RampDNA } from '../src/dna/extract.ts';
import { shell } from '../src/gamut/shell.ts';
import { parseToOklch, hueDelta, circularMean, circularSd, deltaEOK, mean, sd, wrap360 } from '../src/color/oklch.ts';
import { wcag21, apca } from '../src/contrast/index.ts';
import type { Ramp } from '../src/ingest/types.ts';

mkdirSync('out', { recursive: true });
const toOkhsl = converter('okhsl');

const TW_CHROMATIC = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const FOCUS = ['blue', 'yellow', 'green'];

const tw = loadTailwindV4();
const rxL = loadRadix({ mode: 'light', gamut: 'srgb' });
const rxD = loadRadix({ mode: 'dark', gamut: 'srgb' });
const rxLP3 = loadRadix({ mode: 'light', gamut: 'p3' });

const systems: Record<string, Map<string, Ramp>> = { 'tailwind-v4': tw, 'radix-light': rxL };
const dna: Record<string, Record<string, RampDNA>> = {};
for (const [sys, ramps] of Object.entries(systems)) {
  dna[sys] = {};
  const fams = sys === 'tailwind-v4' ? TW_CHROMATIC : [...ramps.keys()];
  for (const f of fams) dna[sys]![f] = extractRamp(ramps.get(f)!);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Chroma normalizations under test
// ────────────────────────────────────────────────────────────────────────────
type Norm = 'absC' | 'relC_srgb' | 'relC_p3' | 'relC_peak_srgb' | 'okhsl_s';
const NORMS: Norm[] = ['absC', 'relC_srgb', 'relC_p3', 'relC_peak_srgb', 'okhsl_s'];

function series(r: RampDNA, norm: Norm): number[] {
  const pk = shell('srgb').peak(r.steps[r.anchorIndex]!.h).c;
  return r.steps.map((s) => {
    switch (norm) {
      case 'absC': return s.C;
      case 'relC_srgb': return s.relC.srgb;
      case 'relC_p3': return s.relC.p3;
      case 'relC_peak_srgb': return s.C / pk;
      case 'okhsl_s': {
        const o = toOkhsl({ mode: 'oklch', l: s.L, c: s.C, h: s.h });
        return o.s ?? 0;
      }
    }
  });
}

// Within-system spread: per-step SD and CV across hue families.
function withinSpread(sys: string, fams: string[], norm: Norm) {
  const rows = fams.map((f) => series(dna[sys]![f]!, norm));
  const N = rows[0]!.length;
  const perStepSd: number[] = [];
  const perStepCv: number[] = [];
  const perStepMean: number[] = [];
  for (let i = 0; i < N; i++) {
    const col = rows.map((r) => r[i]!);
    const m = mean(col);
    perStepMean.push(m);
    perStepSd.push(sd(col));
    perStepCv.push(m > 0 ? sd(col) / m : NaN);
  }
  return { perStepMean, perStepSd, perStepCv, meanCv: mean(perStepCv.filter(Number.isFinite)) };
}

// Between-system separation on a common n grid: silhouette with system labels.
const GRID = Array.from({ length: 23 }, (_, i) => i / 22);
function curveOnGrid(r: RampDNA, norm: Norm): number[] {
  return resample(r.steps.map((s) => s.n), series(r, norm), GRID);
}
function rms(a: number[], b: number[]): number {
  return Math.sqrt(mean(a.map((x, i) => (x - b[i]!) ** 2)));
}
function silhouette(groups: Record<string, number[][]>) {
  const labels = Object.keys(groups);
  const pts = labels.flatMap((l) => groups[l]!.map((v) => ({ l, v })));
  let total = 0;
  for (const p of pts) {
    const own = pts.filter((q) => q.l === p.l && q !== p);
    const a = mean(own.map((q) => rms(p.v, q.v)));
    const b = Math.min(...labels.filter((l) => l !== p.l).map((l) => mean(pts.filter((q) => q.l === l).map((q) => rms(p.v, q.v)))));
    total += (b - a) / Math.max(a, b);
  }
  const intra: Record<string, number> = {};
  for (const l of labels) {
    const g = groups[l]!;
    const ds: number[] = [];
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) ds.push(rms(g[i]!, g[j]!));
    intra[l] = mean(ds);
  }
  const inter = mean(groups[labels[0]!]!.flatMap((x) => groups[labels[1]!]!.map((y) => rms(x, y))));
  return { silhouette: total / pts.length, intra, inter };
}

console.log('\n══ 1. Which chroma normalization transfers across hues within a system? ══');
console.log('(mean per-step coefficient of variation across hue families; lower = more transferable)');
const clusterReport: any = {};
for (const sys of Object.keys(dna)) {
  const all = Object.keys(dna[sys]!);
  clusterReport[sys] = {};
  console.log(`\n${sys}  (${all.length} chromatic families; focus = blue/yellow/green)`);
  console.log('norm'.padEnd(16), 'meanCV(all)', 'meanCV(focus)', ' per-step CV (all families) →');
  for (const norm of NORMS) {
    const a = withinSpread(sys, all, norm);
    const f = withinSpread(sys, FOCUS, norm);
    clusterReport[sys][norm] = { all: a, focus: f };
    console.log(norm.padEnd(16), a.meanCv.toFixed(3).padStart(11), f.meanCv.toFixed(3).padStart(13), ' ', a.perStepCv.map((x) => x.toFixed(2)).join(' '));
  }
}

console.log('\n══ 2. Do relC curves cluster within a system and diverge between systems? ══');
console.log('(silhouette over RMS distance between curves resampled to a common n grid; +1 = perfectly separated, 0 = indistinguishable)');
const sepReport: any = {};
for (const norm of NORMS) {
  const groups: Record<string, number[][]> = {};
  for (const sys of Object.keys(dna)) groups[sys] = Object.values(dna[sys]!).map((r) => curveOnGrid(r, norm));
  const s = silhouette(groups);
  sepReport[norm] = s;
  console.log(norm.padEnd(16), 'silhouette', s.silhouette.toFixed(3), ' intra TW', s.intra['tailwind-v4']!.toFixed(3), ' intra Radix', s.intra['radix-light']!.toFixed(3), ' inter', s.inter.toFixed(3));
}
// Same test restricted to the three focus hues (what the brief literally asks)
{
  const groups: Record<string, number[][]> = {};
  for (const sys of Object.keys(dna)) groups[sys] = FOCUS.map((f) => curveOnGrid(dna[sys]![f]!, 'relC_srgb'));
  const s = silhouette(groups);
  sepReport['relC_srgb_focus'] = s;
  console.log('relC_srgb (blue/yellow/green only): silhouette', s.silhouette.toFixed(3), 'intra TW', s.intra['tailwind-v4']!.toFixed(3), 'intra Radix', s.intra['radix-light']!.toFixed(3), 'inter', s.inter.toFixed(3));
}

// Where does relC_srgb break? Per-step SD for the focus hues, both systems.
console.log('\n── relC (sRGB cusp) per step, focus hues — where the spread lives ──');
for (const sys of Object.keys(dna)) {
  const keys = dna[sys]![FOCUS[0]!]!.steps.map((s) => s.key);
  console.log(`\n${sys}`.padEnd(14), keys.map((k) => k.padStart(6)).join(''));
  for (const f of FOCUS) console.log(f.padEnd(13), series(dna[sys]![f]!, 'relC_srgb').map((x) => x.toFixed(2).padStart(6)).join(''));
  const w = withinSpread(sys, FOCUS, 'relC_srgb');
  console.log('SD'.padEnd(13), w.perStepSd.map((x) => x.toFixed(2).padStart(6)).join(''));
  console.log('absC SD'.padEnd(13), withinSpread(sys, FOCUS, 'absC').perStepSd.map((x) => x.toFixed(3).padStart(6)).join(''));
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Lightness monotonicity and hue-drift shape
// ────────────────────────────────────────────────────────────────────────────
console.log('\n══ 3. L monotonicity (PCHIP precondition) and Δh shape ══');
const monoReport: any = {};
for (const sys of Object.keys(dna)) {
  const bad: string[] = [];
  for (const [f, r] of Object.entries(dna[sys]!)) {
    const L = r.steps.map((s) => s.L);
    const violations = L.slice(1).map((l, i) => (l >= L[i]! ? `${r.steps[i]!.key}→${r.steps[i + 1]!.key} (${L[i]!.toFixed(3)}→${l.toFixed(3)})` : null)).filter(Boolean);
    if (violations.length) bad.push(`${f}: ${violations.join(', ')}`);
  }
  monoReport[sys] = bad;
  console.log(`${sys}: ${bad.length === 0 ? 'L strictly decreasing for every family' : 'L NOT monotone for ' + bad.length + ' families:'}`);
  for (const b of bad) console.log('   ', b);
}
console.log('\nΔh from anchor (deg), focus hues:');
for (const sys of Object.keys(dna)) {
  for (const f of FOCUS) {
    const r = dna[sys]![f]!;
    const dh = r.steps.map((s) => s.dhAnchor);
    const signChanges = dh.slice(1).map((d, i) => Math.sign(d - dh[i]!)).filter((s, i, a) => i > 0 && s !== 0 && s !== a[i - 1]).length;
    console.log(`${sys.padEnd(13)} ${f.padEnd(7)} range ${(Math.max(...dh) - Math.min(...dh)).toFixed(1).padStart(5)}°  monotone: ${signChanges === 0 ? 'yes' : 'no (' + signChanges + ' direction changes)'}   ${dh.map((x) => x.toFixed(0).padStart(4)).join('')}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Hue-family centroids vs published cross-system statistics
// ────────────────────────────────────────────────────────────────────────────
console.log('\n══ 4. Hue centroids across the 11-palette dataset ══');
const published = loadPublishedHues();
const metas = loadPaletteMeta();
const hueReport: any = {};
const FAMS = ['blue', 'green', 'yellow', 'cyan', 'red', 'orange', 'purple'];
console.log('family  published(mean±sd, n)      reproduced (their method, culori)   one-per-palette @peak-chroma (circular mean±sd)');
for (const fam of FAMS) {
  const pooled: number[] = []; // their method: 1–2 middle colors per palette
  const perPalettePeak: number[] = [];
  for (const m of metas) {
    const colors = loadPaletteColors(m.id);
    const scale = colors[fam];
    if (!scale || typeof scale !== 'object') continue;
    const vals = Object.values(scale);
    if (vals.length < 2) continue;
    const mid = vals.slice(Math.floor(vals.length / 2), Math.ceil(vals.length / 2) + 1);
    for (const css of mid) {
      const o = parseToOklch(css);
      if (Number.isFinite(o.h)) pooled.push(o.h);
    }
    const ok = vals.map(parseToOklch);
    const pk = ok.reduce((a, b) => (b.c > a.c ? b : a));
    perPalettePeak.push(pk.h);
  }
  // reproduce their (non-circular, unwrap-then-population-sd) stat
  const unwrapped = [...pooled];
  for (let i = 1; i < unwrapped.length; i++) {
    const d = unwrapped[i]! - unwrapped[i - 1]!;
    if (Math.abs(d) > 180) unwrapped[i] = unwrapped[i]! + (d < 0 ? 360 : -360);
  }
  const p = published[fam]!;
  hueReport[fam] = {
    published: { mean: p.hue.mean, sd: p.hue.stddev, n: p.palette_count },
    reproduced: { mean: mean(unwrapped), sd: sd(unwrapped), count: unwrapped.length },
    peakPerPalette: { mean: circularMean(perPalettePeak), sd: circularSd(perPalettePeak), n: perPalettePeak.length },
  };
  console.log(
    fam.padEnd(8),
    `${p.hue.mean.toFixed(1)}° ± ${p.hue.stddev.toFixed(2)} (n=${p.palette_count})`.padEnd(26),
    `${wrap360(mean(unwrapped)).toFixed(1)}° ± ${sd(unwrapped).toFixed(2)} (${unwrapped.length} vals)`.padEnd(35),
    `${circularMean(perPalettePeak).toFixed(1)}° ± ${circularSd(perPalettePeak).toFixed(2)} (n=${perPalettePeak.length})`,
  );
}
// Nearest-centroid classification of Tailwind and Radix focus ramps, with z-scores
console.log('\nNearest-centroid classification of anchor hues (σ from published stats):');
const centroids = Object.entries(published).filter(([, v]) => v.type === 'hue' && v.palette_count >= 3).map(([k, v]) => ({ name: k, mean: wrap360(v.hue.mean), sd: v.hue.stddev }));
const classReport: any = {};
for (const sys of Object.keys(dna)) {
  for (const f of FOCUS) {
    const r = dna[sys]![f]!;
    const h = r.steps[r.anchorIndex]!.h;
    const ranked = centroids.map((c) => ({ ...c, d: Math.abs(hueDelta(h, c.mean)), z: Math.abs(hueDelta(h, c.mean)) / c.sd })).sort((a, b) => a.d - b.d);
    classReport[`${sys}/${f}`] = { h, top: ranked.slice(0, 3) };
    console.log(`${sys.padEnd(13)} ${f.padEnd(7)} h=${h.toFixed(1).padStart(6)}  → ${ranked.slice(0, 3).map((c) => `${c.name} (Δ${c.d.toFixed(1)}°, z=${c.z.toFixed(2)})`).join('  |  ')}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Radix dark vs light: lightness mirror or contrast mirror?
// ────────────────────────────────────────────────────────────────────────────
console.log('\n══ 5. Radix dark scales: reflection of light scales? ══');
const darkReport: any = {};
for (const f of FOCUS) {
  const L = rxL.get(f)!.steps.map((s) => parseToOklch(s.css));
  const D = rxD.get(f)!.steps.map((s) => parseToOklch(s.css));
  const bgL = L[0]!;
  const bgD = D[0]!;
  const rows = L.map((l, i) => {
    const d = D[i]!;
    return {
      key: rxL.get(f)!.steps[i]!.key,
      L_light: l.l, L_dark: d.l, L_mirror: 1 - l.l,
      C_light: l.c, C_dark: d.c,
      wcag_light: wcag21(l, bgL), wcag_dark: wcag21(d, bgD),
      apca_light: apca(l, bgL), apca_dark: apca(d, bgD),
    };
  });
  darkReport[f] = rows;
  console.log(`\n${f}: step  L_light  L_dark  1−L_light | C_light  C_dark  ratio | WCAG vs bg: light  dark | APCA on bg: light   dark`);
  for (const r of rows) {
    console.log(`  ${r.key.padStart(6)}   ${r.L_light.toFixed(3)}   ${r.L_dark.toFixed(3)}   ${r.L_mirror.toFixed(3)}    |  ${r.C_light.toFixed(3)}   ${r.C_dark.toFixed(3)}  ${(r.C_dark / Math.max(r.C_light, 1e-6)).toFixed(2).padStart(5)} |             ${r.wcag_light.toFixed(2).padStart(5)} ${r.wcag_dark.toFixed(2).padStart(5)} |           ${r.apca_light.toFixed(1).padStart(6)} ${r.apca_dark.toFixed(1).padStart(6)}`);
  }
  const rmsLmirror = Math.sqrt(mean(rows.map((r) => (r.L_dark - r.L_mirror) ** 2)));
  const rmsWcag = Math.sqrt(mean(rows.map((r) => (Math.log(r.wcag_dark) - Math.log(r.wcag_light)) ** 2)));
  const rmsApca = Math.sqrt(mean(rows.map((r) => (Math.abs(r.apca_dark) - Math.abs(r.apca_light)) ** 2)));
  const chromaRatio = mean(rows.slice(2, 11).map((r) => r.C_dark / r.C_light));
  console.log(`  RMS(L_dark − (1−L_light)) = ${rmsLmirror.toFixed(3)}   RMS Δlog(WCAG vs own bg) = ${rmsWcag.toFixed(3)}   RMS Δ|APCA| = ${rmsApca.toFixed(1)} Lc   mean C_dark/C_light (steps 3–11) = ${chromaRatio.toFixed(2)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Radix P3 vs sRGB: same relC or same absolute color?
// ────────────────────────────────────────────────────────────────────────────
console.log('\n══ 6. Radix P3 siblings: pinned to the same color, or the same relC? ══');
const p3Report: any = {};
const cjToOklch = (css: string) => { const c = new Color(css).to('oklch'); const [l, cc, h] = c.coords as [number, number, number]; return { l, c: cc, h: Number.isNaN(h) ? NaN : wrap360(h) }; };
for (const f of FOCUS) {
  const S = rxL.get(f)!.steps.map((s) => parseToOklch(s.css));
  const P = rxLP3.get(f)!.steps.map((s) => cjToOklch(s.css)); // Color.js parses color(display-p3 …) reliably
  const rows = S.map((s, i) => {
    const p = P[i]!;
    const inSrgbP3 = new Color('oklch', [p.l, p.c, Number.isNaN(p.h) ? 0 : p.h]).inGamut('srgb');
    return {
      key: rxL.get(f)!.steps[i]!.key,
      dE: deltaEOK(s, p),
      relC_s_of_srgb: shell('srgb').relC(s.l, s.c, s.h),
      relC_p3_of_p3: shell('p3').relC(p.l, p.c, p.h),
      C_srgb: s.c, C_p3: p.c, p3InsideSrgb: inSrgbP3,
    };
  });
  p3Report[f] = rows;
  console.log(`\n${f}: step   ΔEOK(sRGB,P3)  P3 color inside sRGB?   C_srgb  C_p3   relC_srgb(sRGB val)  relC_p3(P3 val)`);
  for (const r of rows) console.log(`  ${r.key.padStart(4)}      ${r.dE.toFixed(4)}          ${String(r.p3InsideSrgb).padEnd(5)}           ${r.C_srgb.toFixed(3)}  ${r.C_p3.toFixed(3)}      ${r.relC_s_of_srgb.toFixed(3)}              ${r.relC_p3_of_p3.toFixed(3)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Dump
// ────────────────────────────────────────────────────────────────────────────
writeFileSync('out/phase0.json', JSON.stringify({ dna, clusterReport, sepReport, monoReport, hueReport, classReport, darkReport, p3Report, grid: GRID }, null, 1));
console.log('\nwrote out/phase0.json');
