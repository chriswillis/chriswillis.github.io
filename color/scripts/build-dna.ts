/**
 * Build the built-in DNA files: dna/<id>.json for the 13 reference systems and
 * dna/centroids.json. Deterministic apart from `extractedAt`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { builtinSpecs, PALETTES_DATASET_COMMIT } from '../src/builtins.ts';
import { defaultToolchain } from '../src/dna/toolchain.ts';
import { extractSystemDNA } from '../src/dna/system.ts';
import { serializeDNA } from '../src/dna/schema.ts';
import { computeCentroids } from '../src/dna/centroids.ts';
import { DATASET_IDS } from '../src/ingest/dataset.ts';
import { loadPaletteColors } from '../src/ingest/palettes-dataset.ts';

mkdirSync('dna', { recursive: true });

const centroids = computeCentroids(DATASET_IDS.map((id) => ({ id, colors: loadPaletteColors(id) })), `color-js/palettes@${PALETTES_DATASET_COMMIT.slice(0, 7)} (11 palettes)`);
writeFileSync('dna/centroids.json', JSON.stringify(centroids, (_, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v), 1));
console.log(`centroids: ${centroids.families.length} families`);

const index: Record<string, unknown>[] = [];
for (const spec of builtinSpecs()) {
  const t0 = Date.now();
  const dna = extractSystemDNA(spec.load(), { id: spec.id, name: spec.name, mode: spec.mode, pairedWith: spec.pairedWith, source: spec.source, keyStepKey: spec.keyStepKey, roles: spec.roles, centroids, neutralRamps: spec.loadNeutrals(), toolchain: defaultToolchain() });
  writeFileSync(`dna/${spec.id}.json`, serializeDNA(dna));
  const fams = Object.values(dna.families);
  const detached = fams.reduce((a, f) => a + f.spine.detached.length, 0);
  index.push({ id: dna.id, name: dna.name, mode: dna.mode, families: fams.length, neutrals: Object.keys(dna.neutrals).length, steps: dna.steps.counts, numbering: dna.steps.numbering?.class ?? 'n/a', sigmaLogCR: dna.steps.numbering?.sigmaLogCR, nativeShell: dna.nativeShell.gamut, wMean: dna.chroma.wMean, kinship: dna.kinship.hybridWithinJnd, license: dna.source.license });
  console.log(`${dna.id.padEnd(12)} ${String(fams.length).padStart(2)} fams  steps ${dna.steps.counts.join('/')}  shell ${dna.nativeShell.gamut} (overshoot ${dna.nativeShell.midOvershoot.toFixed(2)})  w̄ ${dna.chroma.wMean.toFixed(2)} ${dna.chroma.label.padEnd(8)}  kinship ${(dna.kinship.hybridWithinJnd * 100).toFixed(0)}%  numbering ${dna.steps.numbering?.class ?? 'n/a'} (${dna.steps.numbering?.sigmaLogCR.toFixed(2) ?? '-'})  detached ${detached}  neutrals ${Object.keys(dna.neutrals).length ? Object.values(dna.neutrals).map((n) => `${n.family}${n.pure ? '(pure)' : `@${n.tintHue!.toFixed(0)}°/${n.tintStrength.toFixed(3)}`}`).join(' ') : 'none'}  ${Date.now() - t0}ms`);
}
writeFileSync('dna/index.json', JSON.stringify({ $schema: 'palette-dna/index/1', systems: index }, null, 1));
console.log('wrote dna/*.json');
