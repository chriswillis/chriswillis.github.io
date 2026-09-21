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

/**
 * How far outside [0, 1] a channel may sit and still count as displayable.
 *
 * This is Color.js's default, and matching it is the point: `solver.gamutMap`
 * decides membership with Color.js at this epsilon, so an exact test here left
 * the library with two different answers to the same question. The difference is
 * small — it moves sRGB's cusp under blue by 1e-4 — but a boundary test that
 * disagrees with the mapper is a boundary test that will eventually be believed
 * over it.
 *
 * Note this is a *cusp*: the largest C whose whole radial segment is displayable.
 * That is not the same as membership, because the in-gamut set along a radius is
 * not always an interval. At `#0000ff`'s own L and hue, red dips to −0.009
 * around C 0.29 and returns to −0.00001 at C 0.313, so the primary itself sits
 * beyond its own cusp. Ask `gamutMap` whether a colour is displayable; ask this
 * how much chroma a ramp can carry.
 */
const GAMUT_EPSILON = 0.000075;

export function exactCuspChroma(gamut: Gamut, L: number, h: number, tol = 1e-5): number {
  const test = (c: number) => {
    const col = { mode: 'oklch' as const, l: L, c, h };
    const rgb = gamut === 'srgb' ? toRgb(col) : toP3(col);
    if (!rgb) return false;
    return [rgb.r, rgb.g, rgb.b].every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);
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
