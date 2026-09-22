/**
 * The 13 built-in reference systems: where each comes from, its license, its
 * documented key step, and role labels for detached steps.
 */
import { DATASET_IDS, CONVENTIONAL_ANCHOR, datasetName, loadDatasetPalette, loadDatasetNeutrals } from './ingest/dataset.ts';
import { loadRadix, loadRadixNeutrals, RADIX_ROLES } from './ingest/radix.ts';
import { loadTailwindV4, loadTailwindV4Neutrals, tailwindV4Version } from './ingest/tailwind.ts';
import type { SourceInfo } from './dna/schema.ts';
import type { Ramp } from './ingest/types.ts';

export const PALETTES_DATASET_COMMIT = '6583c31a8edcc6bcc36d5b5dc235d395697cdd00';

const LICENSES: Record<string, string> = {
  opencolor: 'MIT', openprops: 'MIT', tailwind: 'MIT', 'tailwind-v4': 'MIT', material: 'Apache-2.0',
  spectrum: 'Apache-2.0', primer: 'MIT', polaris: 'MIT', carbon: 'Apache-2.0', atlassian: 'Apache-2.0',
  webawesome: 'unverified — check webawesome.com', 'radix-light': 'MIT', 'radix-dark': 'MIT',
};

export interface BuiltinSpec {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  pairedWith?: string;
  keyStepKey?: string;
  roles?: Record<string, string>;
  source: SourceInfo;
  load: () => Map<string, Ramp>;
  /** The system's gray ramps. Extracted into SystemDNA.neutrals. */
  loadNeutrals: () => Map<string, Ramp>;
}

export function builtinSpecs(): BuiltinSpec[] {
  const specs: BuiltinSpec[] = DATASET_IDS.map((id) => ({
    id,
    name: datasetName(id),
    mode: 'light' as const,
    keyStepKey: CONVENTIONAL_ANCHOR[id],
    source: { kind: 'dataset' as const, ref: `color-js/palettes data/colors/${id}.json`, commit: PALETTES_DATASET_COMMIT, license: LICENSES[id] },
    load: () => loadDatasetPalette(id),
    loadNeutrals: () => loadDatasetNeutrals(id),
  }));
  // Tailwind v4 from the npm package (authoritative current theme.css) replaces the dataset copy
  const tw4 = specs.find((s) => s.id === 'tailwind-v4')!;
  tw4.source = { kind: 'npm', ref: 'tailwindcss/theme.css', version: tailwindV4Version(), license: 'MIT' };
  tw4.load = () => loadTailwindV4();
  tw4.loadNeutrals = () => loadTailwindV4Neutrals();
  specs.push(
    { id: 'radix-light', name: 'Radix Colors (light)', mode: 'light', pairedWith: 'radix-dark', keyStepKey: '9', roles: RADIX_ROLES, source: { kind: 'npm', ref: '@radix-ui/colors', version: '3.0.0', license: 'MIT' }, load: () => loadRadix({ mode: 'light', gamut: 'srgb' }), loadNeutrals: () => loadRadixNeutrals({ mode: 'light', gamut: 'srgb' }) },
    { id: 'radix-dark', name: 'Radix Colors (dark)', mode: 'dark', pairedWith: 'radix-light', keyStepKey: '9', roles: RADIX_ROLES, source: { kind: 'npm', ref: '@radix-ui/colors', version: '3.0.0', license: 'MIT' }, load: () => loadRadix({ mode: 'dark', gamut: 'srgb' }), loadNeutrals: () => loadRadixNeutrals({ mode: 'dark', gamut: 'srgb' }) },
  );
  return specs;
}
