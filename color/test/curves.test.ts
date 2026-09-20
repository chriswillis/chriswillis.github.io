import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { pchip, catmullRom, linear, invertMonotone, grid } from '../src/dna/curves.ts';

const knotsArb = (min = 3, max = 16) =>
  fc
    .integer({ min, max })
    .chain((n) =>
      fc.tuple(
        fc.array(fc.double({ min: 0.001, max: 1, noNaN: true }), { minLength: n - 1, maxLength: n - 1 }),
        fc.array(fc.double({ min: -2, max: 2, noNaN: true }), { minLength: n, maxLength: n }),
      ),
    )
    .map(([gaps, ys]) => {
      // strictly increasing xs in [0,1]
      const raw = [0, ...gaps].map((_, i, a) => a.slice(0, i + 1).reduce((s, v) => s + v, 0));
      const total = raw[raw.length - 1]!;
      const xs = raw.map((v) => v / total);
      return { xs, ys };
    });

const monotoneYs = (ys: number[], decreasing: boolean) => {
  const sorted = [...ys].sort((a, b) => a - b);
  return decreasing ? sorted.reverse() : sorted;
};

describe('pchip', () => {
  it('interpolates every knot', () => {
    fc.assert(
      fc.property(knotsArb(), ({ xs, ys }) => {
        const f = pchip(xs, ys);
        for (let i = 0; i < xs.length; i++) expect(f(xs[i]!)).toBeCloseTo(ys[i]!, 9);
      }),
    );
  });
  it('is monotone between monotone knots (no overshoot), both directions', () => {
    fc.assert(
      fc.property(knotsArb(), fc.boolean(), ({ xs, ys }, dec) => {
        const my = monotoneYs(ys, dec);
        const f = pchip(xs, my);
        const g = grid(400);
        let prev = f(0);
        for (const x of g.slice(1)) {
          const v = f(x);
          if (dec) expect(v).toBeLessThanOrEqual(prev + 1e-9);
          else expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
          prev = v;
        }
        // stays inside the knot range
        const lo = Math.min(...my), hi = Math.max(...my);
        for (const x of g) { expect(f(x)).toBeGreaterThanOrEqual(lo - 1e-9); expect(f(x)).toBeLessThanOrEqual(hi + 1e-9); }
      }),
    );
  });
  it('inverts a strictly monotone curve', () => {
    fc.assert(
      fc.property(knotsArb(3, 10), ({ xs, ys }) => {
        const my = [...new Set(monotoneYs(ys, true))];
        if (my.length < 3) return;
        const f = pchip(xs.slice(0, my.length), my);
        const x = 0.37;
        const y = f(x);
        const xi = invertMonotone(f, y);
        expect(xi).not.toBeNull();
        // Assert what bisection actually guarantees, which is a bracket in *x*: it
        // narrows until the interval is under `tol` and returns the midpoint, so `y`
        // must lie between the curve a tolerance either side of the answer. Asserting
        // a bound in *y* instead means estimating the local slope, and knotsArb can
        // put knots 0.001 apart, where the slope runs to thousands and any fixed
        // multiple of the steepest secant is a statistical bet rather than a property.
        // This version has no slope in it and so has no tail to be caught by.
        const tol = 1e-9;
        const a = f(xi! - tol), b = f(xi! + tol);
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const eps = 1e-12 * Math.max(1, Math.abs(y));
        expect(y).toBeGreaterThanOrEqual(lo - eps);
        expect(y).toBeLessThanOrEqual(hi + eps);
      }),
    );
  });
  it('round-trips its own output on a degenerately flat segment', () => {
    // The failing shape found by the property test: two knots an ulp apart at the
    // top, so the first segment is flat to within rounding and the Hermite form
    // evaluates a hair above its own left endpoint. f(x) must still invert.
    const f = pchip([0, 0.8166, 0.8234, 1], [2, 2 - Number.EPSILON, 1e-81, -2]);
    for (const x of [0, 0.37, 0.5, 0.8, 0.99, 1]) {
      const xi = invertMonotone(f, f(x));
      expect(xi, `x=${x}`).not.toBeNull();
    }
  });
  it('still returns null for a y that is genuinely out of range', () => {
    // the slack is for rounding, not for wrong answers
    const f = pchip([0, 0.5, 1], [1, 0.5, 0.2]);
    expect(invertMonotone(f, 1.1)).toBeNull();
    expect(invertMonotone(f, 0.1)).toBeNull();
    expect(invertMonotone(f, 1 + 1e-6)).toBeNull();
    expect(invertMonotone(f, 0.2 - 1e-6)).toBeNull();
    // but not for one a rounding error out
    expect(invertMonotone(f, 1 + 1e-13)).not.toBeNull();
  });
  it('clamps outside the knot range', () => {
    const f = pchip([0, 0.5, 1], [1, 0.5, 0.2]);
    expect(f(-1)).toBe(1);
    expect(f(2)).toBe(0.2);
  });
});

describe('catmull-rom', () => {
  it('interpolates every knot', () => {
    fc.assert(
      fc.property(knotsArb(), ({ xs, ys }) => {
        const f = catmullRom(xs, ys);
        for (let i = 0; i < xs.length; i++) expect(f(xs[i]!)).toBeCloseTo(ys[i]!, 9);
      }),
    );
  });
  it('is continuous (no jumps at knots)', () => {
    fc.assert(
      fc.property(knotsArb(), ({ xs, ys }) => {
        const f = catmullRom(xs, ys);
        // tolerance scales with the steepest secant (knots may be 0.001 apart)
        let maxSlope = 0;
        for (let i = 1; i < xs.length; i++) maxSlope = Math.max(maxSlope, Math.abs((ys[i]! - ys[i - 1]!) / (xs[i]! - xs[i - 1]!)));
        for (let i = 1; i < xs.length - 1; i++) {
          const x = xs[i]!;
          expect(Math.abs(f(x - 1e-7) - f(x + 1e-7))).toBeLessThan(2e-7 * 4 * maxSlope + 1e-9);
        }
      }),
    );
  });
  it('reproduces a straight line exactly', () => {
    const xs = [0, 0.2, 0.5, 0.9, 1];
    const ys = xs.map((x) => 3 * x - 1);
    const f = catmullRom(xs, ys);
    for (const x of grid(50)) expect(f(x)).toBeCloseTo(3 * x - 1, 9);
  });
});

describe('linear', () => {
  it('matches midpoint arithmetic', () => {
    const f = linear([0, 1], [2, 4]);
    expect(f(0.5)).toBe(3);
  });
});
