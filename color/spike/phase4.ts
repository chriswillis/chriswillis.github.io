/**
 * Phase 4 measurement: what do shipping palettes actually achieve?
 *
 * An audit that invents its own pass marks is an audit that tells you what its
 * author thinks. The thresholds here come from the corpus instead: 13 reference
 * systems, 250-odd ramps, measured on every check the harness runs. A generated
 * palette is then reported against that distribution — "your ramp's worst
 * deuteranope step pair is ΔEOK 0.031, better than 9 of the 13" — which is a
 * claim the numbers support, unlike a red-amber-green badge.
 *
 * Run: npx tsx spike/phase4.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { filterDeficiencyProt, filterDeficiencyDeuter, filterDeficiencyTrit, converter } from 'culori';
import { parseDNA, type SystemDNA, type FamilyDNA } from '../src/dna/schema.ts';
import { wcag21Fast, apcaFast } from '../src/contrast/fast.ts';
import { shell } from '../src/gamut/shell.ts';
import { deltaEOK, type Oklch } from '../src/color/oklch.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));

const toOklch = converter('oklch');
const sim = {
  protan: filterDeficiencyProt(1),
  deutan: filterDeficiencyDeuter(1),
  tritan: filterDeficiencyTrit(1),
};
const asOklch = (o: Oklch) => ({ mode: 'oklch' as const, l: o.l, c: o.c, h: Number.isFinite(o.h) ? o.h : undefined });
function simulate(o: Oklch, kind: keyof typeof sim): Oklch {
  const r = toOklch(sim[kind](asOklch(o)));
  return { l: r?.l ?? 0, c: r?.c ?? 0, h: r?.h ?? 0 };
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };
const q = (x: number[], p: number) => { const s = x.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]!; };
const f = (v: number, d = 3) => v.toFixed(d).padStart(d + 3);

const colorsOf = (fam: FamilyDNA): Oklch[] => fam.knots.L.map((_, i) => ({ l: fam.knots.L[i]!, c: fam.knots.C[i]!, h: Number.isFinite(fam.knots.h[i]!) ? fam.knots.h[i]! : 0 }));

interface RampStats {
  system: string;
  family: string;
  steps: number;
  /** consecutive ΔEOK along the whole ramp */
  meanStep: number;
  cvStep: number;
  minStep: number;
  /** worst consecutive pair under each simulation */
  cvd: Record<'protan' | 'deutan' | 'tritan', { minAdjacent: number; minAny: number; collapsedPairs: number }>;
  /** share of all ordered step pairs that clear 4.5:1 / Lc 60 */
  usable45: number;
  usableLc60: number;
  /** relative chroma used, and what is left to each shell at that lightness */
  headroom: { srgb: number; p3: number; atShellSrgb: number };
}

function statsFor(system: string, family: string, cols: Oklch[]): RampStats {
  const adj: number[] = [];
  for (let i = 1; i < cols.length; i++) adj.push(deltaEOK(cols[i - 1]!, cols[i]!));
  const cvd = {} as RampStats['cvd'];
  for (const kind of ['protan', 'deutan', 'tritan'] as const) {
    const s = cols.map((c) => simulate(c, kind));
    const a: number[] = [];
    for (let i = 1; i < s.length; i++) a.push(deltaEOK(s[i - 1]!, s[i]!));
    let minAny = Infinity;
    let collapsed = 0;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const d = deltaEOK(s[i]!, s[j]!);
      minAny = Math.min(minAny, d);
      if (d < 0.02 && deltaEOK(cols[i]!, cols[j]!) >= 0.02) collapsed++;
    }
    cvd[kind] = { minAdjacent: Math.min(...a), minAny, collapsedPairs: collapsed };
  }
  let n45 = 0, nLc = 0, pairs = 0;
  for (let i = 0; i < cols.length; i++) for (let j = 0; j < cols.length; j++) {
    if (i === j) continue;
    pairs++;
    if (wcag21Fast(cols[i]!, cols[j]!) >= 4.5) n45++;
    if (Math.abs(apcaFast(cols[i]!, cols[j]!)) >= 60) nLc++;
  }
  const shS = shell('srgb'), shP = shell('p3');
  const relS = cols.map((c) => (c.c > 0 ? c.c / Math.max(1e-6, shS.cuspChroma(c.l, c.h)) : 0));
  const relP = cols.map((c) => (c.c > 0 ? c.c / Math.max(1e-6, shP.cuspChroma(c.l, c.h)) : 0));
  return {
    system, family, steps: cols.length,
    meanStep: mean(adj), cvStep: sd(adj) / Math.max(1e-9, mean(adj)), minStep: Math.min(...adj),
    cvd,
    usable45: n45 / pairs, usableLc60: nLc / pairs,
    headroom: { srgb: mean(relS), p3: mean(relP), atShellSrgb: relS.filter((r) => r >= 0.98).length / relS.length },
  };
}

const all: RampStats[] = [];
for (const id of ids) {
  const d = DNA[id]!;
  for (const fam of Object.values(d.families)) all.push(statsFor(id, fam.family, colorsOf(fam)));
}
const chromatic = all;

console.log(`## The corpus: ${chromatic.length} chromatic ramps across ${ids.length} systems\n`);

console.log('## 1. Step-to-step uniformity (ΔEOK between consecutive steps)');
console.log('system          ramps   mean ΔEOK      CV of ΔEOK      smallest step');
for (const id of ids) {
  const r = chromatic.filter((x) => x.system === id);
  console.log(`${id.padEnd(15)} ${String(r.length).padStart(3)}   ${f(mean(r.map((x) => x.meanStep)))}        ${f(mean(r.map((x) => x.cvStep)), 2)}          ${f(Math.min(...r.map((x) => x.minStep)))}`);
}
const cvAll = chromatic.map((x) => x.cvStep);
const minAll = chromatic.map((x) => x.minStep);
console.log(`corpus: CV p10 ${f(q(cvAll, 0.1), 2)} median ${f(q(cvAll, 0.5), 2)} p90 ${f(q(cvAll, 0.9), 2)};  smallest step p10 ${f(q(minAll, 0.1))} median ${f(q(minAll, 0.5))}`);
console.log(`${minAll.filter((v) => v < 0.02).length} of ${minAll.length} ramps have an adjacent pair under one JND`);

console.log('\n## 2. Colour-vision deficiency: does the ramp survive simulation?');
console.log('                 smallest adjacent ΔEOK under simulation        pairs that collapse (were ≥1 JND, now under)');
console.log('system          protan   deutan   tritan                       protan  deutan  tritan');
for (const id of ids) {
  const r = chromatic.filter((x) => x.system === id);
  const m = (k: 'protan' | 'deutan' | 'tritan') => f(mean(r.map((x) => x.cvd[k].minAdjacent)));
  const c = (k: 'protan' | 'deutan' | 'tritan') => mean(r.map((x) => x.cvd[k].collapsedPairs)).toFixed(1).padStart(6);
  console.log(`${id.padEnd(15)} ${m('protan')}  ${m('deutan')}  ${m('tritan')}                  ${c('protan')}  ${c('deutan')}  ${c('tritan')}`);
}
for (const k of ['protan', 'deutan', 'tritan'] as const) {
  const v = chromatic.map((x) => x.cvd[k].minAdjacent);
  const coll = chromatic.map((x) => x.cvd[k].collapsedPairs);
  console.log(`corpus ${k.padEnd(7)}: smallest adjacent ΔEOK p10 ${f(q(v, 0.1))} median ${f(q(v, 0.5))};  ${v.filter((x) => x < 0.02).length}/${v.length} ramps drop an adjacent pair under a JND;  collapsed pairs median ${q(coll, 0.5)}, p90 ${q(coll, 0.9)}`);
}

console.log('\n## 3. Usable text pairs — of all ordered step pairs, how many clear 4.5:1 and Lc 60?');
console.log('system          ≥4.5:1     ≥Lc 60     the two disagree on');
for (const id of ids) {
  const r = chromatic.filter((x) => x.system === id);
  const a = mean(r.map((x) => x.usable45)), b = mean(r.map((x) => x.usableLc60));
  console.log(`${id.padEnd(15)} ${(a * 100).toFixed(1).padStart(5)}%     ${(b * 100).toFixed(1).padStart(5)}%     ${(Math.abs(a - b) * 100).toFixed(1).padStart(5)}% of pairs`);
}

console.log('\n## 4. Gamut headroom — how much of the shell each system spends');
console.log('system          mean relC (sRGB)   mean relC (P3)   steps sitting on the sRGB shell');
for (const id of ids) {
  const r = chromatic.filter((x) => x.system === id);
  console.log(`${id.padEnd(15)} ${f(mean(r.map((x) => x.headroom.srgb)), 2)}              ${f(mean(r.map((x) => x.headroom.p3)), 2)}            ${(mean(r.map((x) => x.headroom.atShellSrgb)) * 100).toFixed(1).padStart(5)}%`);
}

// ── 5. the CVD risk that actually matters: between families, not within a ramp ──
// A single-hue ramp is mostly a lightness ramp, and colour-vision deficiency
// preserves lightness, so within-ramp separation barely moves. Telling one family
// from another at the same step is the check that bites — a chart legend, a status
// palette, a set of category badges.
console.log('\n## 5. Between families at the same step: which pairs become indistinguishable?');
console.log('system          pairs   collapse under protan / deutan / tritan     worst pair (deutan)');
const crossRows: Record<string, unknown> = {};
for (const id of ids) {
  const d = DNA[id]!;
  const fams = Object.values(d.families);
  if (fams.length < 2) continue;
  const keyOf = (f: FamilyDNA) => { const i = f.keyIndex; const k = f.knots; return { l: k.L[i]!, c: k.C[i]!, h: Number.isFinite(k.h[i]!) ? k.h[i]! : 0 }; };
  const cols = fams.map(keyOf);
  const counts: Record<string, number> = {};
  let worst: { a: string; b: string; before: number; after: number } | null = null;
  let pairs = 0;
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
    pairs++;
    const before = deltaEOK(cols[i]!, cols[j]!);
    for (const kind of ['protan', 'deutan', 'tritan'] as const) {
      const after = deltaEOK(simulate(cols[i]!, kind), simulate(cols[j]!, kind));
      if (before >= 0.02 && after < 0.02) counts[kind] = (counts[kind] ?? 0) + 1;
      if (kind === 'deutan' && (!worst || after < worst.after)) worst = { a: fams[i]!.family, b: fams[j]!.family, before, after };
    }
  }
  const pct = (k: string) => `${(((counts[k] ?? 0) / pairs) * 100).toFixed(1)}%`.padStart(6);
  console.log(`${id.padEnd(15)} ${String(pairs).padStart(4)}   ${pct('protan')} ${pct('deutan')} ${pct('tritan')}                     ${worst!.a}/${worst!.b} ${worst!.before.toFixed(3)} → ${worst!.after.toFixed(3)}`);
  crossRows[id] = { pairs, collapsed: counts, worstDeutan: worst };
}

mkdirSync('out', { recursive: true });
const band = (pick: (s: RampStats) => number) => {
  const v = chromatic.map(pick);
  return { p10: q(v, 0.1), median: q(v, 0.5), p90: q(v, 0.9), min: Math.min(...v), max: Math.max(...v) };
};
const baseline = {
  source: `${chromatic.length} chromatic ramps across ${ids.length} reference systems in dna/`,
  stepUniformityCv: band((s) => s.cvStep),
  smallestStep: band((s) => s.minStep),
  cvd: {
    protan: { minAdjacent: band((s) => s.cvd.protan.minAdjacent), collapsedPairs: band((s) => s.cvd.protan.collapsedPairs) },
    deutan: { minAdjacent: band((s) => s.cvd.deutan.minAdjacent), collapsedPairs: band((s) => s.cvd.deutan.collapsedPairs) },
    tritan: { minAdjacent: band((s) => s.cvd.tritan.minAdjacent), collapsedPairs: band((s) => s.cvd.tritan.collapsedPairs) },
  },
  usable45: band((s) => s.usable45),
  usableLc60: band((s) => s.usableLc60),
  relCSrgb: band((s) => s.headroom.srgb),
  atShellSrgb: band((s) => s.headroom.atShellSrgb),
  crossFamily: crossRows,
  perSystem: Object.fromEntries(ids.map((id) => {
    const r = chromatic.filter((x) => x.system === id);
    return [id, {
      ramps: r.length,
      cvStep: mean(r.map((x) => x.cvStep)),
      minStep: Math.min(...r.map((x) => x.minStep)),
      cvdMinAdjacent: { protan: mean(r.map((x) => x.cvd.protan.minAdjacent)), deutan: mean(r.map((x) => x.cvd.deutan.minAdjacent)), tritan: mean(r.map((x) => x.cvd.tritan.minAdjacent)) },
      collapsedPairs: { protan: mean(r.map((x) => x.cvd.protan.collapsedPairs)), deutan: mean(r.map((x) => x.cvd.deutan.collapsedPairs)), tritan: mean(r.map((x) => x.cvd.tritan.collapsedPairs)) },
      usable45: mean(r.map((x) => x.usable45)),
      usableLc60: mean(r.map((x) => x.usableLc60)),
      relCSrgb: mean(r.map((x) => x.headroom.srgb)),
    }];
  })),
};
writeFileSync('out/phase4-baseline.json', JSON.stringify(baseline, null, 1));
console.log('\nwrote out/phase4-baseline.json');
