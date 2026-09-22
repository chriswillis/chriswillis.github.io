import { readFileSync } from 'node:fs';
import { parseDNA } from '../src/dna/schema.ts';
import { solveRamp } from '../src/solver/index.ts';
const tw = parseDNA(readFileSync('dna/tailwind-v4.json', 'utf8'));
const rx = parseDNA(readFileSync('dna/radix-light.json', 'utf8'));
function show(r: ReturnType<typeof solveRamp>) {
  console.log(`\n${r.dna.id}  target hue ${r.target.hueAtPeak.toFixed(1)}  families ${r.selection.families.map(f=>`${f.family}:${f.weight.toFixed(2)}`).join(' ')} (${r.selection.rule})  mode ${r.mode}  gamut ${r.gamut}`);
  if (r.seed) console.log(`  seed → step ${r.seed.stepKey} (idx ${r.seed.stepIndex}, nShift ${r.seed.nShift.toFixed(3)}), gain raw ${r.seed.gainRaw.toFixed(2)} applied ${r.seed.gainApplied.toFixed(2)}, achieved ΔE ${r.seed.achievedDeltaE.toFixed(4)}`);
  for (const w of r.warnings) console.log('  ⚠', w);
  console.log('  key   L      C      h     | mapΔE  quantΔE | WCAG/bg APCA/bg | promises | nudge | native                 sibling(ΔE)');
  for (const s of r.steps) console.log(`  ${s.key.padEnd(5)} ${s.color.oklch.l.toFixed(3)}  ${s.color.oklch.c.toFixed(3)}  ${s.color.oklch.h.toFixed(1).padStart(5)} | ${s.mappingDeltaE.toFixed(3)}  ${s.quantizationDeltaE.toFixed(4)}  | ${s.contrast.wcagVsBg.toFixed(2).padStart(6)} ${s.contrast.apcaOnBg.toFixed(1).padStart(6)} | ${s.promises.map(p=>p.threshold+(p.met?'✓':'✗')).join(' ').padEnd(12)} | ${s.nudge?s.nudge.jnd+'J':'-'}     | ${s.color.native.padEnd(38)} ${s.sibling?s.sibling.native+' ('+s.sibling.deltaEFromP3.toFixed(3)+')':''}${s.isSeed?'  ← seed':''}${s.detached?'  (detached'+(s.role?': '+s.role:'')+')':''}`);
}
show(solveRamp({ dna: tw, seed: '#3b82f6', gamut: 'p3' }));            // Tailwind v3 blue-500 as seed
show(solveRamp({ dna: tw, seed: '#0f766e', gamut: 'srgb', mode: 1 }));  // teal-700 seed, contrast-faithful in sRGB
show(solveRamp({ dna: rx, seed: '#e5484d', gamut: 'srgb' }));           // Radix red-9 as seed
show(solveRamp({ dna: rx, seed: '#ffe629', gamut: 'srgb' }));           // Radix yellow-9 (bright, detached)
show(solveRamp({ dna: tw, hue: 200, gamut: 'p3', background: '#f4f1ea', mode: 0.5 }));
