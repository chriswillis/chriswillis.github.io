/** Solver demo → out/solver-demo.json (rendered by spike/plot_solver.py). */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDNA } from '../src/dna/schema.ts';
import { solveRamp, type SolvedRamp } from '../src/solver/index.ts';
import { loadPaletteColors } from '../src/ingest/palettes-dataset.ts';
import { parseToOklch, deltaEOK } from '../src/color/oklch.ts';
import Color from 'colorjs.io';
import { formatHex } from 'culori';

const dna = (id: string) => parseDNA(readFileSync(`dna/${id}.json`, 'utf8'));
const hexOf = (o: { l: number; c: number; h: number }) => {
  const c = new Color('oklch', [o.l, o.c, o.h]).to('srgb').toGamut({ method: 'css' });
  const [r, g, b] = c.coords as [number, number, number];
  return formatHex({ mode: 'rgb', r, g, b });
};

function pack(r: SolvedRamp) {
  return {
    dna: r.dna, selection: r.selection, spacing: { mode: r.spacing.mode, cv: r.spacing.cv, mean: r.spacing.mean, deltaE: r.spacing.deltaE },
    seed: r.seed ? { stepKey: r.seed.stepKey, referenceStepKey: r.seed.referenceStepKey, gainApplied: r.seed.gainApplied, gainClamped: r.seed.gainClamped } : null,
    mode: r.mode, gamut: r.gamut, background: hexOf(r.background), warnings: r.warnings,
    steps: r.steps.map((s) => ({ key: s.key, hex: s.sibling ? s.sibling.native : hexOf(s.color.oklch), native: s.color.native, L: s.color.oklch.l, C: s.color.oklch.c, h: s.color.oklch.h, isSeed: s.isSeed, detached: s.detached, wcagVsBg: s.contrast.wcagVsBg, apcaOnBg: s.contrast.apcaOnBg, mappingDeltaE: s.mappingDeltaE, promises: s.promises, nudge: s.nudge })),
  };
}

const SEED = '#7c3aed';
const SYSTEMS = ['radix-light', 'polaris', 'material', 'tailwind-v4', 'carbon'];
const oneSeed = SYSTEMS.map((id) => pack(solveRamp({ dna: dna(id), seed: SEED, gamut: 'srgb' })));
const oneSeedEven = SYSTEMS.map((id) => pack(solveRamp({ dna: dna(id), seed: SEED, gamut: 'srgb', spacing: 'even' })));
const roleKept = pack(solveRamp({ dna: dna('radix-light'), seed: SEED, gamut: 'srgb', spacing: 'even', seedStep: '9' }));

const v3 = loadPaletteColors('tailwind')['blue'] as Record<string, string>;
const recon = solveRamp({ dna: dna('tailwind-v4'), seed: v3['500']!, gamut: 'srgb' });
const reconstruction = { real: Object.entries(v3).map(([key, hex]) => ({ key, hex })), generated: pack(recon), deltaE: recon.steps.map((s) => deltaEOK(s.color.oklch, parseToOklch(v3[s.key]!))) };

const modes = [0, 0.5, 1].map((mode) => pack(solveRamp({ dna: dna('tailwind-v4'), hue: 30, gamut: 'srgb', background: '#efe9dc', mode })));

const radixYellow = pack(solveRamp({ dna: dna('radix-light'), seed: '#ffe629', gamut: 'srgb' }));
const p3 = pack(solveRamp({ dna: dna('tailwind-v4'), seed: SEED, gamut: 'p3' }));

writeFileSync('out/solver-demo.json', JSON.stringify({ seed: SEED, oneSeed, oneSeedEven, roleKept, reconstruction, modes, radixYellow, p3 }, null, 1));
console.log('wrote out/solver-demo.json');
for (const r of oneSeed) console.log(r.dna.id.padEnd(12), r.seed!.stepKey.padStart(4), `gain ${r.seed!.gainApplied.toFixed(2)}${r.seed!.gainClamped ? '*' : ' '}`, r.selection.families.map((f) => `${f.family}:${f.weight.toFixed(2)}`).join(' '), '|', r.steps.map((s) => s.hex).join(' '));
