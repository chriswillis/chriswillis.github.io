import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import Color from 'colorjs.io';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solveRamp } from '../src/solver/index.ts';
import { deltaEOK, parseToOklch, type Oklch } from '../src/color/oklch.ts';
import { loadPaletteColors } from '../src/ingest/palettes-dataset.ts';
import { wcag21 } from '../src/contrast/index.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));
const hex = (o: Oklch) => new Color('oklch', [o.l, o.c, o.h]).to('srgb').toString({ format: 'hex' });

describe('identity: seeding a system with its own key color reproduces the family', () => {
  for (const id of ids) {
    const dna = DNA[id]!;
    it(`${id}: every family round-trips within quantization`, () => {
      const gamut = dna.authoredGamut;
      let worst = 0;
      for (const f of Object.values(dna.families)) {
        const k = f.keyIndex;
        const seed: Oklch = { l: f.knots.L[k]!, c: f.knots.C[k]!, h: f.knots.h[k]! };
        // replication is exactly what `spacing: 'reference'` is for: reproducing the
        // reference's own values means keeping its own step placement
        const r = solveRamp({ dna, seed, gamut, sibling: false, spacing: 'reference' });
        expect(r.selection.families[0]!.family).toBe(f.family);
        expect(r.seed!.stepKey).toBe(f.knots.key[k]);
        expect(Math.abs(r.seed!.gainApplied - 1)).toBeLessThan(0.02);
        for (let i = 0; i < f.knots.n.length; i++) {
          const ref: Oklch = { l: f.knots.L[i]!, c: f.knots.C[i]!, h: f.knots.h[i]! };
          const d = deltaEOK(ref, r.steps[i]!.color.oklch);
          worst = Math.max(worst, d);
          expect(d, `${id}/${f.family} step ${f.knots.key[i]}`).toBeLessThan(0.006);
        }
      }
      // sRGB systems reproduce the reference hex exactly at the seed step
      if (gamut === 'srgb') {
        const f = Object.values(dna.families)[0]!;
        const k = f.keyIndex;
        const r = solveRamp({ dna, seed: { l: f.knots.L[k]!, c: f.knots.C[k]!, h: f.knots.h[k]! }, gamut, sibling: false, spacing: 'reference' });
        expect(r.steps[k]!.color.native).toBe(hex({ l: f.knots.L[k]!, c: f.knots.C[k]!, h: f.knots.h[k]! }));
      }
    });
  }
});

describe('Tailwind v3 blue is recovered from one seed and Tailwind v4 DNA', () => {
  it('max ΔEOK to the real v3 ramp is under one JND', () => {
    const v3 = loadPaletteColors('tailwind')['blue'] as Record<string, string>;
    const r = solveRamp({ dna: DNA['tailwind-v4']!, seed: v3['500']!, gamut: 'srgb', sibling: false, spacing: 'reference' });
    let worst = 0;
    for (const s of r.steps) worst = Math.max(worst, deltaEOK(s.color.oklch, parseToOklch(v3[s.key]!)));
    expect(worst).toBeLessThan(0.02);
    expect(r.steps.find((s) => s.key === '500')!.color.native).toBe('#3b82f6');
  });
});

const hexArb = fc.tuple(fc.integer({ min: 8, max: 247 }), fc.integer({ min: 8, max: 247 }), fc.integer({ min: 8, max: 247 })).map(([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
const lightIds = ids.filter((id) => DNA[id]!.mode === 'light');

describe('solver properties (random seeds × systems × gamuts × modes)', () => {
  it('seed is exact, promises hold, output in gamut, curve mode monotone, deterministic', () => {
    fc.assert(
      fc.property(hexArb, fc.constantFrom(...lightIds), fc.constantFrom('srgb', 'p3'), fc.constantFrom(0, 0.5, 1), (seedHex, id, gamut, mode) => {
        const dna = DNA[id]!;
        const r = solveRamp({ dna, seed: seedHex, gamut: gamut as 'srgb' | 'p3', mode });
        const seedStep = r.steps[r.seed!.stepIndex]!;
        // seed exact (achromatic seeds aside — a gray has no hue to pin)
        if (parseToOklch(seedHex).c > 0.02) {
          if (gamut === 'srgb') expect(seedStep.color.native).toBe(seedHex);
          expect(r.seed!.achievedDeltaE).toBeLessThan(1e-6);
        }
        for (const s of r.steps) {
          // in gamut (Color.js oracle)
          expect(new Color('oklch', [s.color.oklch.l, s.color.oklch.c, s.color.oklch.h]).inGamut(gamut === 'p3' ? 'p3' : 'srgb', { epsilon: 0.001 })).toBe(true);
          // promises (Color.js oracle for the verification itself)
          for (const p of s.promises) expect(p.met, `${id} ${s.key} ${p.threshold}`).toBe(true);
          for (const p of s.promises) expect(wcag21(s.color.oklch, r.background)).toBeGreaterThanOrEqual(p.threshold - 1e-9);
          if (s.nudge) expect(Math.abs(s.nudge.deltaL)).toBeLessThanOrEqual(0.02 + 1e-12);
          if (s.sibling) expect(new Color('oklch', [s.sibling.oklch.l, s.sibling.oklch.c, s.sibling.oklch.h]).inGamut('srgb', { epsilon: 0.001 })).toBe(true);
        }
        // curve-faithful lightness is monotone along the spine (intended exactly; final within 8-bit quantization)
        if (mode === 0) {
          const spineSteps = r.steps.filter((s) => !s.detached);
          for (let i = 1; i < spineSteps.length; i++) {
            expect(spineSteps[i]!.intended.l).toBeLessThan(spineSteps[i - 1]!.intended.l + 1e-9);
            expect(spineSteps[i]!.color.oklch.l).toBeLessThan(spineSteps[i - 1]!.color.oklch.l + 0.004);
          }
          expect(r.warnings.some((w) => w.includes('not monotone'))).toBe(false);
        }
        // deterministic
        expect(JSON.stringify(solveRamp({ dna, seed: seedHex, gamut: gamut as 'srgb' | 'p3', mode }))).toBe(JSON.stringify(r));
      }),
      { numRuns: 200 },
    );
  });
  it('hue-only targets work at every degree for the two flagship systems in both gamuts', () => {
    for (const id of ['tailwind-v4', 'radix-light']) for (const gamut of ['srgb', 'p3'] as const) for (let h = 0; h < 360; h += 3) {
      const r = solveRamp({ dna: DNA[id]!, hue: h, gamut, sibling: false });
      for (const s of r.steps) for (const p of s.promises) expect(p.met).toBe(true);
      const spineSteps = r.steps.filter((s) => !s.detached);
      for (let i = 1; i < spineSteps.length; i++) {
        expect(spineSteps[i]!.intended.l, `${id} ${gamut} h${h} ${spineSteps[i - 1]!.key}→${spineSteps[i]!.key}`).toBeLessThan(spineSteps[i - 1]!.intended.l + 1e-9);
        expect(spineSteps[i]!.color.oklch.l).toBeLessThan(spineSteps[i - 1]!.color.oklch.l + 0.004);
      }
    }
  });
});

describe('solver options', () => {
  it('renumbering to 7 steps drops detached steps and stays monotone', () => {
    const r = solveRamp({ dna: DNA['radix-light']!, hue: 100, gamut: 'srgb', renumber: 7, sibling: false });
    expect(r.steps).toHaveLength(7);
    expect(r.steps.every((s) => !s.detached)).toBe(true);
    for (let i = 1; i < 7; i++) expect(r.steps[i]!.color.oklch.l).toBeLessThan(r.steps[i - 1]!.color.oklch.l);
    expect(r.warnings.some((w) => w.includes('renumbering drops detached'))).toBe(true);
  });
  it('a forced family is used with weight 1', () => {
    const r = solveRamp({ dna: DNA['radix-light']!, hue: 30, family: 'blue', gamut: 'srgb', sibling: false });
    expect(r.selection).toEqual({ rule: 'forced', families: [{ family: 'blue', weight: 1, deltaDeg: expect.any(Number) }] });
  });
  it('contrast-faithful on a tinted background keeps the first step near the background, not white', () => {
    const r = solveRamp({ dna: DNA['tailwind-v4']!, hue: 180, gamut: 'srgb', background: '#f4f1ea', mode: 1, sibling: false });
    expect(r.steps[0]!.color.oklch.l).toBeLessThan(0.995);
    expect(r.steps[0]!.color.oklch.l).toBeGreaterThan(0.93);
    expect(r.contrastSurface).toBe('white');
  });
  it('the gain clamp is reported and the seed still wins', () => {
    // a very muted seed against a shell-riding reference
    const r = solveRamp({ dna: DNA['tailwind-v4']!, seed: '#6b7c9a', gamut: 'srgb', sibling: false });
    expect(r.seed!.gainClamped).toBe(true);
    expect(r.steps[r.seed!.stepIndex]!.color.native).toBe('#6b7c9a');
  });
});

describe('even spacing', () => {
  it('evens out every system without moving the endpoints or changing the mean step', () => {
    for (const id of ids) {
      const dna = DNA[id]!;
      const ref = solveRamp({ dna, seed: '#7c3aed', gamut: 'srgb', sibling: false, spacing: 'reference' });
      const even = solveRamp({ dna, seed: '#7c3aed', gamut: 'srgb', sibling: false, spacing: 'even' });
      // evenness improves and lands in a tight band
      // a clamped seed gain leaves one perceptual bump (the seed is more chromatic than the
      // reference curve allows); without a clamp the ramp is even
      expect(even.spacing.cv, `${id} cv`).toBeLessThan(even.seed!.gainClamped ? 0.2 : 0.12);
      expect(even.spacing.cv, `${id} cv vs reference`).toBeLessThanOrEqual(ref.spacing.cv + 1e-9);
      // endpoints of the spine are untouched: same lightness as reference spacing
      const spineRef = ref.steps.filter((s) => !s.detached);
      const spineEven = even.steps.filter((s) => !s.detached);
      expect(spineEven[0]!.color.oklch.l).toBeCloseTo(spineRef[0]!.color.oklch.l, 2);
      expect(spineEven.at(-1)!.color.oklch.l).toBeCloseTo(spineRef.at(-1)!.color.oklch.l, 2);
      // same number of steps and same keys
      expect(even.steps.map((s) => s.key)).toEqual(ref.steps.map((s) => s.key));
      // mean step size is preserved (arc length is redistributed, not rescaled)
      expect(even.spacing.mean).toBeCloseTo(ref.spacing.mean, 2);
    }
  });
  it('the seed stays exact and its step move is reported', () => {
    const r = solveRamp({ dna: DNA['radix-light']!, seed: '#7c3aed', gamut: 'srgb', sibling: false, spacing: 'even' });
    expect(r.steps[r.seed!.stepIndex]!.color.native).toBe('#7c3aed');
    expect(r.seed!.referenceStepKey).toBe('9');
    expect(r.seed!.stepKey).not.toBe('9');
    expect(r.warnings.some((w) => w.includes('even spacing moved the seed'))).toBe(true);
  });
  it('seedStep keeps the reference role step, and the uneven halves are reported', () => {
    const r = solveRamp({ dna: DNA['polaris']!, seed: '#7c3aed', gamut: 'srgb', sibling: false, spacing: 'even', seedStep: '13' });
    expect(r.seed!.stepKey).toBe('13');
    expect(r.steps[r.seed!.stepIndex]!.color.native).toBe('#7c3aed');
    expect(r.spacing.segments).not.toBeNull();
    expect(r.warnings.some((w) => w.includes('splits the ramp unevenly'))).toBe(true);
  });
  it('is tight across the seed space: median cv under 0.08, p90 under 0.15 (fixed sample, deterministic)', () => {
    let rng = 12345;
    const rnd = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const cvs: number[] = [];
    for (let t = 0; t < 400; t++) {
      const hex = `#${[0, 1, 2].map(() => Math.floor(8 + rnd() * 240).toString(16).padStart(2, '0')).join('')}`;
      const id = lightIds[Math.floor(rnd() * lightIds.length)]!;
      const r = solveRamp({ dna: DNA[id]!, seed: hex, gamut: rnd() < 0.5 ? 'srgb' : 'p3', spacing: 'even', sibling: false });
      const gaps = r.spacing.deltaE;
      const k = r.steps.filter((s) => !s.detached).findIndex((s) => s.isSeed);
      const away = gaps.filter((_, i) => i !== k - 1 && i !== k);
      const m = away.reduce((a, b) => a + b, 0) / away.length;
      cvs.push(Math.sqrt(away.reduce((a, b) => a + (b - m) ** 2, 0) / away.length) / m);
    }
    cvs.sort((a, b) => a - b);
    expect(cvs[Math.floor(cvs.length * 0.5)]!).toBeLessThan(0.08);
    expect(cvs[Math.floor(cvs.length * 0.9)]!).toBeLessThan(0.15);
  });
  it('holds every solver guarantee under random seeds', () => {
    fc.assert(
      fc.property(hexArb, fc.constantFrom(...lightIds), fc.constantFrom('srgb', 'p3'), (seedHex, id, gamut) => {
        const r = solveRamp({ dna: DNA[id]!, seed: seedHex, gamut: gamut as 'srgb' | 'p3', spacing: 'even' });
        if (parseToOklch(seedHex).c > 0.02 && gamut === 'srgb') expect(r.steps[r.seed!.stepIndex]!.color.native).toBe(seedHex);
        const spine = r.steps.filter((s) => !s.detached);
        for (let i = 1; i < spine.length; i++) expect(spine[i]!.intended.l).toBeLessThan(spine[i - 1]!.intended.l + 1e-9);
        for (const s of r.steps) {
          for (const p of s.promises) expect(p.met).toBe(true);
          expect(new Color('oklch', [s.color.oklch.l, s.color.oklch.c, s.color.oklch.h]).inGamut(gamut === 'p3' ? 'p3' : 'srgb', { epsilon: 0.001 })).toBe(true);
        }
        // A seed whose chroma is outside what the reference's own curve allows is clamped, and
        // that leaves a bump in the two gaps touching the seed. The guarantee is that the rest
        // of the ramp is even, so assert that directly rather than loosening the whole bound.
        const gaps = r.spacing.deltaE;
        const k = r.steps.filter((s) => !s.detached).findIndex((s) => s.isSeed);
        const away = gaps.filter((_, i) => i !== k - 1 && i !== k);
        const m = away.reduce((a, b) => a + b, 0) / Math.max(1, away.length);
        const cvAway = Math.sqrt(away.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, away.length)) / m;
        // Hard per-case bound. The typical figure is far tighter — see the statistical test
        // below, which pins the median and p90 over a fixed sample rather than guessing here.
        expect(cvAway, `${id} ${seedHex} cv away from seed`).toBeLessThan(0.3);
        if (!r.seed!.gainClamped) expect(r.spacing.cv).toBeLessThan(0.3);
      }),
      { numRuns: 120 },
    );
  });
});
