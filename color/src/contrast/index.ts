/**
 * Contrast metrics. Color.js is the oracle and, for the spike, also the
 * implementation. Hot-path culori versions come in Phase 2.
 *
 * WCAG 2.1: symmetric, (Y1+0.05)/(Y2+0.05). Normative.
 * APCA: polarity-aware Lc. Color.js implements APCA 0.0.98G-4. Reported, not
 * guaranteed.
 */
import Color from 'colorjs.io';
import type { Oklch } from '../color/oklch.ts';

export const APCA_VERSION = 'APCA-W3 0.0.98G-4 (colorjs.io 0.7.1)';

function toColor(o: Oklch): Color {
  return new Color('oklch', [o.l, o.c, Number.isNaN(o.h) ? 0 : o.h]);
}

export function wcag21(a: Oklch, b: Oklch): number {
  return toColor(a).contrast(toColor(b), 'WCAG21');
}

/** APCA Lc with `fg` as text and `bg` as background. Signed. */
export function apca(fg: Oklch, bg: Oklch): number {
  return toColor(bg).contrast(toColor(fg), 'APCA');
}

export function relativeLuminance(o: Oklch): number {
  return toColor(o).luminance;
}
