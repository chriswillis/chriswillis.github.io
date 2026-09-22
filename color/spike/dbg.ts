import { readFileSync } from 'node:fs';
import { parseDNA } from '../src/dna/schema.ts';
import { solveRamp } from '../src/solver/index.ts';
import { deltaEOK } from '../src/color/oklch.ts';
const tw = parseDNA(readFileSync('dna/tailwind.json','utf8'));
const f = tw.families['orange']!; const k = f.keyIndex;
const r = solveRamp({ dna: tw, seed: { l: f.knots.L[k]!, c: f.knots.C[k]!, h: f.knots.h[k]! }, gamut: 'srgb', sibling: false });
console.log('selection', JSON.stringify(r.selection), 'seed', JSON.stringify(r.seed));
for (let i = 0; i < r.steps.length; i++) { const s = r.steps[i]!; const ref = { l: f.knots.L[i]!, c: f.knots.C[i]!, h: f.knots.h[i]! };
  console.log(s.key.padEnd(4), 'ref', ref.l.toFixed(4), ref.c.toFixed(4), ref.h.toFixed(2), '| intended', s.intended.l.toFixed(4), s.intended.c.toFixed(4), s.intended.h.toFixed(2), '| final', s.color.oklch.l.toFixed(4), s.color.oklch.c.toFixed(4), s.color.oklch.h.toFixed(2), 'ΔE', deltaEOK(ref, s.color.oklch).toFixed(4), 'ΔE(int)', deltaEOK(ref, s.intended).toFixed(4), 'map', s.mappingDeltaE.toFixed(4), s.color.native); }
// hue-only inversion hunt
for (const id of ['tailwind-v4','radix-light']) { const dna = parseDNA(readFileSync(`dna/${id}.json`,'utf8'));
  for (const gamut of ['srgb','p3'] as const) for (let h = 0; h < 360; h += 3) { const rr = solveRamp({ dna, hue: h, gamut, sibling: false });
    const sp = rr.steps.filter(s=>!s.detached); for (let i=1;i<sp.length;i++) if (sp[i]!.color.oklch.l >= sp[i-1]!.color.oklch.l) { console.log('INVERSION', id, gamut, 'hue', h, 'steps', sp[i-1]!.key, sp[i]!.key, sp[i-1]!.color.oklch.l.toFixed(4), sp[i]!.color.oklch.l.toFixed(4), 'intended', sp[i-1]!.intended.l.toFixed(4), sp[i]!.intended.l.toFixed(4), 'map', sp[i-1]!.mappingDeltaE.toFixed(3), sp[i]!.mappingDeltaE.toFixed(3), JSON.stringify(rr.selection.families.map(x=>x.family+':'+x.weight.toFixed(2)))); } } }
