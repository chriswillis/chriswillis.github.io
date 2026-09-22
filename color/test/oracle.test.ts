/**
 * Color.js is the oracle. culori (hot path) and the nutelch LUT (cusp) must
 * agree with it within stated tolerances on random colors.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import Color from 'colorjs.io';
import { parseToOklch, deltaEOK } from '../src/color/oklch.ts';
import { shell, exactCuspChroma } from '../src/gamut/shell.ts';
import { wcag21, apca } from '../src/contrast/index.ts';

const hexArb = fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 })).map(([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);

describe('culori vs Color.js', () => {
  it('OKLCH coordinates agree to 1e-9 on random sRGB colors', () => {
    fc.assert(
      fc.property(hexArb, (hex) => {
        const a = parseToOklch(hex);
        const [l, c, h] = new Color(hex).to('oklch').coords as [number, number, number];
        expect(a.l).toBeCloseTo(l, 9);
        expect(a.c).toBeCloseTo(c, 9);
        if (c > 1e-4) expect(((a.h - h + 540) % 360) - 180).toBeCloseTo(0, 6);
      }),
      { numRuns: 200 },
    );
  });
  it('ΔEOK matches Color.js deltaEOK', () => {
    fc.assert(
      fc.property(hexArb, hexArb, (x, y) => {
        const d = deltaEOK(parseToOklch(x), parseToOklch(y));
        expect(d).toBeCloseTo(new Color(x).deltaE(new Color(y), 'OK'), 9);
      }),
      { numRuns: 100 },
    );
  });
});

describe('nutelch LUT vs exact cusp (Color.js bisection)', () => {
  const exactCj = (gamut: 'srgb' | 'p3', L: number, h: number) => {
    let lo = 0, hi = 0.6;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (new Color('oklch', [L, mid, h]).inGamut(gamut)) lo = mid; else hi = mid; }
    return lo;
  };
  it('within the documented ±0.009 chroma for L in [0.05, 0.98], both gamuts', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 0.98, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true }), fc.constantFrom('srgb', 'p3'), (L, h, g) => {
        const lut = shell(g as 'srgb' | 'p3').cuspChroma(L, h);
        const ex = exactCj(g as 'srgb' | 'p3', L, h);
        expect(Math.abs(lut - ex)).toBeLessThanOrEqual(0.009);
        // and our culori-based exact oracle agrees with the Color.js one
        // culori has no in-gamut epsilon, Color.js uses 75e-6 in channel units; near dark cusps that is up to ~1e-3 chroma
        expect(Math.abs(exactCuspChroma(g as 'srgb' | 'p3', L, h) - ex)).toBeLessThanOrEqual(2e-3);
      }),
      { numRuns: 150 },
    );
  });
});

describe('contrast wrappers', () => {
  it('WCAG 2.1 is symmetric and APCA is polarity-aware', () => {
    const a = parseToOklch('#1f5fd0'), b = parseToOklch('#f4f4f2');
    expect(wcag21(a, b)).toBeCloseTo(wcag21(b, a), 12);
    expect(apca(a, b)).toBeGreaterThan(0); // dark text on light
    expect(apca(b, a)).toBeLessThan(0); // light text on dark
    expect(Math.abs(apca(a, b))).not.toBeCloseTo(Math.abs(apca(b, a)), 0);
  });
});

describe('fast contrast (culori) vs Color.js', () => {
  it('WCAG 2.1 and APCA agree to 1e-9 on random sRGB pairs, and APCA on random P3 oklch too', async () => {
    const { wcag21Fast, apcaFast } = await import('../src/contrast/fast.ts');
    fc.assert(
      fc.property(hexArb, hexArb, (x, y) => {
        const a = parseToOklch(x), b = parseToOklch(y);
        expect(wcag21Fast(a, b)).toBeCloseTo(wcag21(a, b), 9);
        expect(apcaFast(a, b)).toBeCloseTo(apca(a, b), 9);
      }),
      { numRuns: 200 },
    );
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 0.95, noNaN: true }), fc.double({ min: 0, max: 0.3, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true }), (l, c, h) => {
        const a = { l, c, h }, bg = { l: 0.99, c: 0.005, h: 250 };
        expect(apcaFast(a, bg)).toBeCloseTo(apca(a, bg), 7);
        expect(wcag21Fast(a, bg)).toBeCloseTo(wcag21(a, bg), 9);
      }),
      { numRuns: 200 },
    );
  });
});
