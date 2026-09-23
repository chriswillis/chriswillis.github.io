import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ingestPalette, type PaletteInput } from './index.ts';
import type { Ramp } from './types.ts';

const require = createRequire(import.meta.url);

export const TAILWIND_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
export const TAILWIND_NEUTRALS = ['slate', 'gray', 'zinc', 'neutral', 'stone'];

/** Parse Tailwind v4's theme.css (oklch() literals, authored for Display-P3). */
export function parseTailwindThemeCss(css: string): PaletteInput {
  const re = /--color-([a-z]+)-(\d+):\s*(oklch\([^)]*\))/g;
  const input: PaletteInput = {};
  for (const m of css.matchAll(re)) {
    const [, family, step, value] = m as unknown as [string, string, string, string];
    (input[family] ??= {})[step] = value;
  }
  for (const f of Object.keys(input)) if (Object.keys(input[f]!).length !== TAILWIND_STEPS.length) delete input[f];
  return input;
}

export function tailwindV4Version(): string {
  return (require('tailwindcss/package.json') as { version: string }).version;
}

export function loadTailwindV4(): Map<string, Ramp> {
  const css = readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8');
  return ingestPalette(parseTailwindThemeCss(css), { id: 'tailwind-v4', mode: 'light', keyStepKey: '500', gamut: 'p3', neutrals: TAILWIND_NEUTRALS });
}

/** Tailwind v4's five neutrals: slate, gray, zinc, neutral (pure), stone. */
export function loadTailwindV4Neutrals(): Map<string, Ramp> {
  const css = readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8');
  return ingestPalette(parseTailwindThemeCss(css), { id: 'tailwind-v4', mode: 'light', keyStepKey: '500', gamut: 'p3', neutrals: TAILWIND_NEUTRALS, select: 'neutral' });
}
