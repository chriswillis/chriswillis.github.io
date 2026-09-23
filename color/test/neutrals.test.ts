import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import Color from 'colorjs.io';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solveNeutralRamp } from '../src/solver/neutral.ts';
import { estimateTint, nearestNeutral } from '../src/dna/neutrals.ts';
import { deltaEOK, hueDelta, parseToOklch } from '../src/color/oklch.ts';
import { wcag21 } from '../src/contrast/index.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));

describe('neutral extraction', () => {
  it('every system has at least one neutral ramp', () => {
    for (const id of ids) expect(Object.keys(DNA[id]!.neutrals).length, id).toBeGreaterThan(0);
  });
  it('Tailwind v4 ships nine neutrals including four tinted ones added after the original five', () => {
    const n = DNA['tailwind-v4']!.neutrals;
    for (const f of ['slate', 'gray', 'zinc', 'neutral', 'stone', 'mauve', 'olive', 'mist', 'taupe']) expect(Object.keys(n)).toContain(f);
    expect(n['neutral']!.pure).toBe(true);
    expect(n['slate']!.tintHue!).toBeCloseTo(259, -1);
    expect(n['slate']!.tintStrength).toBeGreaterThan(n['zinc']!.tintStrength);
  });
  it('a pure gray reports no tint; a tinted one reports a stable hue', () => {
    expect(estimateTint([{ C: 0, h: NaN }, { C: 0, h: NaN }]).hue).toBeNull();
    const t = estimateTint([{ C: 0.001, h: 10 }, { C: 0.04, h: 258 }, { C: 0.045, h: 260 }]);
    // chroma-weighted, so the near-achromatic outlier at 10° does not drag the estimate
    expect(t.hue!).toBeGreaterThan(250);
    expect(t.strength).toBeCloseTo(0.045, 5);
  });
  it('neutral families in a system share one lightness spine', () => {
    for (const id of ['tailwind-v4', 'radix-light', 'carbon']) {
      expect(DNA[id]!.neutralMetrics!.spineAgreement, id).toBeLessThan(0.01);
    }
  });
  it('nearestNeutral picks by tint hue and falls back to a pure gray when no tint is wanted', () => {
    const pool = Object.values(DNA['tailwind-v4']!.neutrals);
    expect(nearestNeutral(pool, 60).family).toBe('stone');
    expect(nearestNeutral(pool, null).pure).toBe(true);
  });
});

describe('neutral solver', () => {
  it('reproduces every authored neutral ramp within quantization', () => {
    for (const id of ids) {
      const dna = DNA[id]!;
      for (const [name, n] of Object.entries(dna.neutrals)) {
        const r = solveNeutralRamp({ dna, family: name, gamut: dna.authoredGamut, sibling: false, spacing: 'reference' });
        expect(r.steps).toHaveLength(n.knots.n.length);
        for (let i = 0; i < n.knots.n.length; i++) {
          const ref = { l: n.knots.L[i]!, c: n.knots.C[i]!, h: Number.isNaN(n.knots.h[i]!) ? 0 : n.knots.h[i]! };
          expect(deltaEOK(ref, r.steps[i]!.color.oklch), `${id}/${name} step ${n.knots.key[i]}`).toBeLessThan(0.004);
        }
      }
    }
  });
  it('tinting keeps lightness and moves hue to the target', () => {
    const dna = DNA['tailwind-v4']!;
    const base = solveNeutralRamp({ dna, family: 'slate', gamut: 'srgb', sibling: false, spacing: 'reference' });
    const tinted = solveNeutralRamp({ dna, family: 'slate', tintHue: 30, gamut: 'srgb', sibling: false, spacing: 'reference' });
    for (let i = 0; i < base.steps.length; i++) {
      expect(tinted.steps[i]!.intended.l).toBeCloseTo(base.steps[i]!.intended.l, 6);
      expect(tinted.steps[i]!.intended.c).toBeCloseTo(base.steps[i]!.intended.c, 6);
      if (tinted.steps[i]!.intended.c > 0.01) expect(Math.abs(hueDelta(tinted.steps[i]!.intended.h, 30))).toBeLessThan(12);
    }
    expect(tinted.neutral!.tintHue).toBe(30);
  });
  it('tintFrom takes the hue from a brand color, and tintStrength scales the envelope', () => {
    const dna = DNA['tailwind-v4']!;
    const full = solveNeutralRamp({ dna, family: 'slate', tintFrom: '#7c3aed', gamut: 'srgb', sibling: false, spacing: 'reference' });
    const half = solveNeutralRamp({ dna, family: 'slate', tintFrom: '#7c3aed', tintStrength: 0.5, gamut: 'srgb', sibling: false, spacing: 'reference' });
    const brandHue = parseToOklch('#7c3aed').h;
    expect(Math.abs(hueDelta(full.neutral!.tintHue!, brandHue))).toBeLessThan(0.5);
    for (let i = 0; i < full.steps.length; i++) expect(half.steps[i]!.intended.c).toBeCloseTo(full.steps[i]!.intended.c / 2, 6);
    const none = solveNeutralRamp({ dna, family: 'slate', tintFrom: '#7c3aed', tintStrength: 0, gamut: 'srgb', sibling: false, spacing: 'reference' });
    for (const s of none.steps) expect(s.intended.c).toBe(0);
  });
  it('a pure gray cannot carry a tint, and says so', () => {
    const r = solveNeutralRamp({ dna: DNA['tailwind-v4']!, family: 'neutral', tintFrom: '#7c3aed', gamut: 'srgb', sibling: false });
    for (const s of r.steps) expect(s.intended.c).toBe(0);
    expect(r.warnings.some((w) => w.includes('pure gray'))).toBe(true);
  });
  it('an achromatic tintFrom is rejected with a warning rather than producing a hue of 0', () => {
    const r = solveNeutralRamp({ dna: DNA['tailwind-v4']!, family: 'slate', tintFrom: '#808080', gamut: 'srgb', sibling: false });
    expect(r.warnings.some((w) => w.includes('achromatic'))).toBe(true);
    expect(r.neutral!.tintHue).toBeCloseTo(DNA['tailwind-v4']!.neutrals['slate']!.tintHue!, 6);
  });
  it('even spacing evens a role-indexed neutral ramp', () => {
    const ref = solveNeutralRamp({ dna: DNA['radix-light']!, family: 'slate', gamut: 'srgb', sibling: false, spacing: 'reference' });
    const even = solveNeutralRamp({ dna: DNA['radix-light']!, family: 'slate', gamut: 'srgb', sibling: false, spacing: 'even' });
    expect(ref.spacing.cv).toBeGreaterThan(0.5);
    expect(even.spacing.cv).toBeLessThan(0.1);
  });
  it('holds the solver guarantees over random tints, systems and gamuts', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 360, noNaN: true }), fc.constantFrom(...ids), fc.constantFrom('srgb', 'p3'), fc.constantFrom('auto', 'reference', 'even'), fc.double({ min: 0, max: 2, noNaN: true }), (hue, id, gamut, spacing, strength) => {
        const r = solveNeutralRamp({ dna: DNA[id]!, tintHue: hue, tintStrength: strength, gamut: gamut as 'srgb' | 'p3', spacing: spacing as 'auto' | 'reference' | 'even' });
        for (const s of r.steps) {
          expect(new Color('oklch', [s.color.oklch.l, s.color.oklch.c, s.color.oklch.h]).inGamut(gamut === 'p3' ? 'p3' : 'srgb', { epsilon: 0.001 })).toBe(true);
          for (const p of s.promises) {
            expect(p.met).toBe(true);
            expect(wcag21(s.color.oklch, r.background)).toBeGreaterThanOrEqual(p.threshold - 1e-9);
          }
        }
        // the spine stays monotone in lightness
        const spine = r.steps.filter((s) => !s.detached);
        for (let i = 1; i < spine.length; i++) {
          const dir = DNA[id]!.mode === 'light' ? -1 : 1;
          expect((spine[i]!.intended.l - spine[i - 1]!.intended.l) * dir).toBeGreaterThan(-1e-9);
        }
      }),
      { numRuns: 150 },
    );
  });
});
