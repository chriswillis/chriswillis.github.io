/**
 * Thin interface over the gamut-shell (cusp) math.
 *
 * Everything in the library asks *this* module for cusp chroma. The backing
 * implementation is vendored nutelch (LUT-backed, pre-1.0, pinned). It can be
 * swapped for another implementation by satisfying `GamutShell`.
 *
 * Known limits we design around:
 *  - LUT bilinear interpolation: practical worst-case error about ±0.009 chroma.
 *  - relC <= 1 is not a hard gamut guarantee. Gamut mapping is always the last
 *    pipeline step and every swatch reports ΔEOK between intended and achieved.
 */
import { cusp as nCusp, peak as nPeak, oklchSrgb, oklchP3 } from '../../vendor/nutelch/index.ts';
import type { Lut } from '../../vendor/nutelch/index.ts';
import { converter, inGamut } from 'culori';

export type Gamut = 'srgb' | 'p3';

export interface GamutShell {
  readonly gamut: Gamut;
  /** Max in-gamut chroma at (L, h). L in [0,1], h in degrees. */
  cuspChroma(L: number, h: number): number;
  /** Chroma as a fraction of the shell at (L, h). May exceed 1 (overshoot). */
  relC(L: number, C: number, h: number): number;
  /** The hue's most chromatic color over all L. */
  peak(h: number): { l: number; c: number };
}

const LUTS: Record<Gamut, Lut> = { srgb: oklchSrgb, p3: oklchP3 };

class NutelchShell implements GamutShell {
  constructor(readonly gamut: Gamut, private readonly lut: Lut) {}
  cuspChroma(L: number, h: number): number {
    return nCusp({ lut: this.lut, l: L, h }).c;
  }
  relC(L: number, C: number, h: number): number {
    const cc = this.cuspChroma(L, h);
    return cc > 0 ? C / cc : 0;
  }
  peak(h: number): { l: number; c: number } {
    const p = nPeak({ lut: this.lut, h });
    return { l: p.l, c: p.c };
  }
}

const shells: Partial<Record<Gamut, GamutShell>> = {};
export function shell(gamut: Gamut): GamutShell {
  return (shells[gamut] ??= new NutelchShell(gamut, LUTS[gamut]));
}

// ────────────────────────────────────────────────────────────────────────────
// Exact (slow) reference implementation, used only in tests and verification.
// Binary-searches the boundary chroma with culori's inGamut at fixed (L, h).
// ────────────────────────────────────────────────────────────────────────────
const toRgb = converter('rgb');
const toP3 = converter('p3');
const inSrgb = inGamut('rgb');
const inP3 = inGamut('p3');

export function exactCuspChroma(gamut: Gamut, L: number, h: number, tol = 1e-5): number {
  const test = (c: number) => {
    const col = { mode: 'oklch' as const, l: L, c, h };
    return gamut === 'srgb' ? inSrgb(toRgb(col)) : inP3(toP3(col));
  };
  if (L <= 0 || L >= 1) return 0;
  let lo = 0;
  let hi = 0.6;
  if (test(hi)) return hi; // never happens for real gamuts
  while (hi - lo > tol) {
    const mid = (lo + hi) / 2;
    if (test(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
