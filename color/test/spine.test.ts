import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { findSpine } from '../src/dna/spine.ts';
import { loadRadix } from '../src/ingest/radix.ts';
import { parseToOklch } from '../src/color/oklch.ts';

const L = (mode: 'light' | 'dark', fam: string) => loadRadix({ mode, gamut: 'srgb' }).get(fam)!.steps.map((s) => parseToOklch(s.css).l);

describe('findSpine', () => {
  it('keeps a monotone ramp whole', () => {
    const r = findSpine([0.97, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]);
    expect(r.direction).toBe('light-to-dark');
    expect(r.spine).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r.detached).toEqual([]);
  });
  it('detaches Radix yellow 9–10 in light mode', () => {
    const r = findSpine(L('light', 'yellow'));
    expect(r.detached.map((d) => d.index)).toEqual([8, 9]);
    expect(r.spine).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 10, 11]);
  });
  it('detaches the same steps 9–10 in dark mode (not the text steps)', () => {
    const r = findSpine(L('dark', 'yellow'));
    expect(r.direction).toBe('dark-to-light');
    expect(r.detached.map((d) => d.index)).toEqual([8, 9]);
  });
  it('flattens Radix iris 10→11 instead of detaching', () => {
    const r = findSpine(L('light', 'iris'));
    expect(r.detached).toEqual([]);
    expect(r.flattened.map((f) => f.index)).toEqual([10]);
    expect(r.spine.length).toBe(12);
  });
  it('all five Radix bright scales detach exactly steps 9 and 10 in both modes', () => {
    for (const fam of ['sky', 'mint', 'lime', 'yellow', 'amber']) for (const mode of ['light', 'dark'] as const) {
      expect(findSpine(L(mode, fam)).detached.map((d) => d.index), `${fam} ${mode}`).toEqual([8, 9]);
    }
  });
  it('spine is strictly monotone after flattening, for any input', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 3, maxLength: 16 }), (Ls) => {
        const r = findSpine(Ls);
        const sign = r.direction === 'light-to-dark' ? -1 : 1;
        for (let k = 1; k < r.spine.length; k++) {
          expect((r.L[r.spine[k]!]! - r.L[r.spine[k - 1]!]!) * sign).toBeGreaterThan(0);
        }
        expect(r.spine.length + r.detached.length).toBe(Ls.length);
      }),
    );
  });
});
