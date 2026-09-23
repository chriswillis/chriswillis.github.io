/**
 * Loader for any palette in the vendored color-js/palettes dataset, routed
 * through the generic ingest.
 */
import { loadPaletteColors, loadPaletteMeta, loadPublishedHues } from './palettes-dataset.ts';
import { ingestPalette, type PaletteInput } from './index.ts';
import type { Ramp } from './types.ts';

/** Systems whose documentation names a canonical key step. Others use peak chroma. */
export const CONVENTIONAL_ANCHOR: Record<string, string> = {
  tailwind: '500',
  'tailwind-v4': '500',
  material: '500',
  carbon: '60',
  primer: '5',
};

export const DATASET_IDS = ['opencolor', 'openprops', 'tailwind', 'tailwind-v4', 'material', 'spectrum', 'primer', 'polaris', 'carbon', 'atlassian', 'webawesome'];

export function datasetName(id: string): string {
  return loadPaletteMeta().find((m) => m.id === id)?.name ?? id;
}

export function datasetPaletteInput(id: string): { colors: PaletteInput; neutrals: string[] } {
  const colors = loadPaletteColors(id);
  const hues = loadPublishedHues();
  const input: PaletteInput = {};
  const neutrals: string[] = [];
  for (const [family, scale] of Object.entries(colors)) {
    if (!scale || typeof scale !== 'object') continue;
    input[family] = scale;
    if (hues[family]?.type === 'neutral') neutrals.push(family);
  }
  return { colors: input, neutrals };
}

export function loadDatasetPalette(id: string): Map<string, Ramp> {
  const { colors, neutrals } = datasetPaletteInput(id);
  return ingestPalette(colors, { id, mode: 'light', keyStepKey: CONVENTIONAL_ANCHOR[id], gamut: id === 'tailwind-v4' ? 'p3' : 'srgb', neutrals });
}

/** The same palette's neutral (gray) ramps, which loadDatasetPalette drops. */
export function loadDatasetNeutrals(id: string): Map<string, Ramp> {
  const { colors, neutrals } = datasetPaletteInput(id);
  const usable = neutrals.filter((n) => !/^transparent-/.test(n));
  const subset = Object.fromEntries(usable.filter((n) => colors[n]).map((n) => [n, colors[n]!]));
  return ingestPalette(subset, { id, mode: 'light', keyStepKey: CONVENTIONAL_ANCHOR[id], gamut: id === 'tailwind-v4' ? 'p3' : 'srgb', neutrals: usable, select: 'neutral' });
}
