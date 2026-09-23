import * as radix from '@radix-ui/colors';
import { ingestPalette, type PaletteInput } from './index.ts';
import type { Ramp } from './types.ts';

export const RADIX_STEPS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export type RadixVariant = { mode: 'light' | 'dark'; gamut: 'srgb' | 'p3' };

export const RADIX_CHROMATIC = [
  'tomato', 'red', 'ruby', 'crimson', 'pink', 'plum', 'purple', 'violet', 'iris', 'indigo',
  'blue', 'cyan', 'teal', 'jade', 'green', 'grass', 'brown', 'orange', 'sky', 'mint', 'lime',
  'yellow', 'amber', 'gold', 'bronze',
];

/** Radix's neutral scales. `gray` is untinted; the rest are tinted to pair with hue families. */
export const RADIX_NEUTRALS = ['gray', 'mauve', 'slate', 'sage', 'olive', 'sand'];

/** Radix's documented step roles. */
export const RADIX_ROLES: Record<string, string> = {
  '1': 'app background',
  '2': 'subtle background',
  '3': 'component background',
  '4': 'component background (hover)',
  '5': 'component background (active/selected)',
  '6': 'subtle border',
  '7': 'border (interactive)',
  '8': 'border (hover) / strong',
  '9': 'solid background',
  '10': 'solid background (hover)',
  '11': 'low-contrast text',
  '12': 'high-contrast text',
};

/**
 * @radix-ui/colors exports `blue`, `blueDark`, `blueP3`, `blueDarkP3` (+ alpha
 * variants we ignore). Keys inside are `blue1..blue12`.
 */
export function radixPaletteInput(variant: RadixVariant, families: string[] = RADIX_CHROMATIC): PaletteInput {
  const all = radix as unknown as Record<string, Record<string, string>>;
  const input: PaletteInput = {};
  for (const family of families) {
    const name = family + (variant.mode === 'dark' ? 'Dark' : '') + (variant.gamut === 'p3' ? 'P3' : '');
    const scale = all[name];
    if (!scale) throw new Error(`Radix export missing: ${name}`);
    input[family] = Object.fromEntries(RADIX_STEPS.map((k) => [k, scale[family + k]!]));
  }
  return input;
}

export function radixId(variant: RadixVariant): string {
  return `radix-${variant.mode}${variant.gamut === 'p3' ? '-p3' : ''}`;
}

export function loadRadix(variant: RadixVariant): Map<string, Ramp> {
  return ingestPalette(radixPaletteInput(variant), { id: radixId(variant), mode: variant.mode, keyStepKey: '9', gamut: variant.gamut, neutralChroma: 0 });
}

/** Radix's six neutral scales. */
export function loadRadixNeutrals(variant: RadixVariant): Map<string, Ramp> {
  return ingestPalette(radixPaletteInput(variant, RADIX_NEUTRALS), { id: radixId(variant), mode: variant.mode, keyStepKey: '9', gamut: variant.gamut, neutrals: RADIX_NEUTRALS, select: 'neutral' });
}
