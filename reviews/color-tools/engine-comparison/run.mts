import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const LIB = new URL('../../../color/src/index.ts', import.meta.url).href;
const { ingestPalette, extractSystemDNA, solveRamp } = await import(LIB);
const E = require('./engine.cjs');
const PALS = require('./pals.json');
import { writeFileSync } from 'node:fs';

const D = 180 / Math.PI;
const dE = (p: number[], q: number[]) => Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2]) * 100;
const lab2lch = (p: number[]) => [p[0], Math.hypot(p[1], p[2]), Math.atan2(p[2], p[1])];
const lch2lab = (L: number, C: number, h: number) => [L, C*Math.cos(h), C*Math.sin(h)];
const wrap = (x: number) => ((x + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI;
const fmt = (p: number[]) => E.oklchStr(p[0], p[1], p[2]);

const only = process.argv[2];
const out: any[] = [];
for (const pal of PALS) {
  if (pal.id === 'meridian-dark') continue;
  if (only && pal.id !== only) continue;
  const M = E.build(pal, pal.neutral, pal.gamut);
  const gamut = pal.gamut === 'p3' ? 'p3' : 'srgb';
  for (const r of M.loft) {
    const truth = r.labs as number[][];
    // seed = peak-chroma step among monotone steps
    let k = r.keep[0];
    for (const kk of r.keep) if (Math.hypot(truth[kk][1], truth[kk][2]) > Math.hypot(truth[k][1], truth[k][2])) k = kk;
    const seedLab = truth[k], seedCss = pal.ramps[r.name][k];
    const row: any = { pal: pal.id, palName: pal.name, ramp: r.name, steps: pal.steps, seedStep: pal.steps[k], seedCss,
      truth: truth.map(fmt), truthLab: truth, engines: {} };
    const M2 = E.holdOut(M, r.name);
    // topology, through-color (ramp tool default)
    for (const [name, cap] of [['topology', false], ['topology-fit', true]] as const) {
      try {
        const g = M2.genAnchors([{ lab: seedLab, map: M2.seedMap(seedLab) }], { cap });
        row.engines[name] = g ? g.map((x: any) => [x.L, x.a, x.b]) : null;
      } catch (e: any) { row.engines[name] = { error: e.message }; }
    }
    // baseline: nearest remaining ramp, rotated to the seed hue, chroma scaled at the seed step
    {
      const u = M2.seedMap(seedLab).u ?? Math.atan2(seedLab[2], seedLab[1]);
      const nr = M2.loft[M2.nearestLoft(u)];
      const nl = nr.labs.map(lab2lch), sl = lab2lch(seedLab);
      const ratio = nl[k][1] > 1e-4 ? sl[1] / nl[k][1] : 1;
      row.baselineFrom = nr.name;
      row.engines['nearest-ramp'] = nl.map((p: number[], i: number) => {
        let [L, C, h] = [p[0], p[1]*ratio, sl[2] + wrap(p[2] - nl[k][2])];
        if (i === k) return seedLab;
        const mc = E.maxC(L, h, pal.gamut); if (C > mc) C = mc;
        return lch2lab(L, C, h);
      });
    }
    // palette-dna, rebuilt without the held-out family
    for (const [name, spacing] of [['palette-dna', 'reference'], ['palette-dna-auto', 'auto']] as const) {
      try {
        const colors: Record<string, Record<string, string>> = {};
        for (const [fam, vals] of Object.entries(pal.ramps) as any) if (fam !== r.name)
          colors[fam] = Object.fromEntries(pal.steps.map((s: string, i: number) => [s, vals[i]]));
        const ramps = ingestPalette(colors, { id: pal.id, keyOrder: 'insertion', gamut, neutralChroma: 0 });
        const dna = extractSystemDNA(ramps, { id: pal.id, name: pal.name, source: { kind: 'inline', ref: 'cmp' } });
        const sol = solveRamp({ dna, seed: seedCss, gamut, spacing, sibling: false });
        const byKey: Record<string, number[]> = {};
        for (const s of sol.steps) { const o = s.color.oklch; byKey[s.key] = lch2lab(o.l, o.c, (o.h ?? 0) / D); }
        row.engines[name] = pal.steps.map((s: string) => byKey[s] ?? null);
        row[name + 'Ref'] = (sol as any).reference?.families ?? (sol as any).reference ?? null;
      } catch (e: any) { row.engines[name] = { error: String(e.message).slice(0, 200) }; }
    }
    // score: every step except the seed step
    row.scores = {};
    for (const [name, g] of Object.entries(row.engines) as any) {
      if (!Array.isArray(g)) { row.scores[name] = null; continue; }
      const es = truth.map((t, i) => (i === k || !g[i]) ? null : dE(g[i], t));
      row.scores[name] = { perStep: es, mean: es.filter((x) => x !== null).reduce((a: number, b: any) => a + b, 0) / es.filter((x) => x !== null).length };
      row.engines[name] = g.map((p: any) => p ? fmt(p) : null);
    }
    delete row.truthLab;
    out.push(row);
  }
}
writeFileSync('results.json', JSON.stringify(out));
const T: Record<string, Record<string, number[]>> = {};
for (const r of out) for (const [n, s] of Object.entries(r.scores) as any) if (s) ((T[r.pal] ??= {})[n] ??= []).push(...s.perStep.filter((x: any) => x !== null));
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const errs = out.filter((r) => Object.values(r.engines).some((g: any) => g && g.error)).map((r) => r.pal + '/' + r.ramp + ': ' + JSON.stringify(Object.fromEntries(Object.entries(r.engines).filter(([, g]: any) => g && g.error))));
console.log(errs.slice(0, 8).join('\n'));
for (const [p, m] of Object.entries(T)) console.log(p.padEnd(15), Object.entries(m).map(([n, a]) => `${n} ${med(a).toFixed(2)}/${(a.filter((x) => x < 2).length / a.length * 100).toFixed(0)}%`).join('  '));
