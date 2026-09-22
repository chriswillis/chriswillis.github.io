/**
 * Lea Verou's cross-system dataset (github.com/color-js/palettes, data/).
 * Pinned commit recorded in vendor-src; we read the normalized per-palette
 * files and the published hues.json for validation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../vendor/palettes/data/', import.meta.url).pathname;

export type PaletteColors = Record<string, Record<string, string> | string>;

export interface PaletteMeta {
  id: string;
  name: string;
  url?: string;
  data?: string;
}

export function loadPaletteMeta(): PaletteMeta[] {
  return (JSON.parse(readFileSync(join(ROOT, 'palette_metadata.json'), 'utf8')) as PaletteMeta[]).filter((p) => p.id);
}

export function loadPaletteColors(id: string): PaletteColors {
  return JSON.parse(readFileSync(join(ROOT, 'colors', `${id}.json`), 'utf8'));
}

export interface PublishedHueStats {
  name: string;
  type: 'hue' | 'neutral';
  hue: { min: number; max: number; mid: number; mean: number; median: number; stddev: number };
  chroma: { min: number; max: number; mid: number; mean: number; median: number; stddev: number };
  palettes: Record<string, Record<string, string>>;
  palette_count: number;
}

export function loadPublishedHues(): Record<string, PublishedHueStats> {
  return JSON.parse(readFileSync(join(ROOT, 'hues.json'), 'utf8'));
}
