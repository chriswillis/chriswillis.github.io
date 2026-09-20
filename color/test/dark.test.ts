import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import Color from 'colorjs.io';
import { parseDNA, serializeDNA, type SystemDNA } from '../src/dna/schema.ts';
import { deriveDarkDNA, compareDNA, defaultDarkSurface, RADIX_CALIBRATION, APCA_INVERTIBLE_LC, mirrorStep } from '../src/dark/mirror.ts';
import { solvePair } from '../src/solver/pair.ts';
import { deltaEOK, type Oklch } from '../src/color/oklch.ts';
import { wcag21Fast, apcaFast } from '../src/contrast/fast.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));
const lightIds = ids.filter((id) => DNA[id]!.mode === 'light');
const radixLight = DNA['radix-light']!;
const radixDark = DNA['radix-dark']!;
const RADIX_DARK_SURFACE: Oklch = { l: radixDark.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };
const RADIX_LIGHT_SURFACE: Oklch = { l: radixLight.neutrals['gray']!.knots.L[0]!, c: 0, h: 0 };
const radixOpts = { surface: RADIX_DARK_SURFACE, lightSurface: RADIX_LIGHT_SURFACE };

const rms = (x: number[]) => Math.sqrt(x.reduce((a, b) => a + b * b, 0) / x.length);

describe('the light → dark relationship, as Radix actually authors it', () => {
  it('pins the key step: step 9 is the same color in both scales, in all 25 families', () => {
    for (const [name, f] of Object.entries(radixLight.families)) {
      const d = radixDark.families[name]!;
      const i = f.keyIndex;
      expect(f.knots.key[i]).toBe('9');
      expect(deltaEOK({ l: f.knots.L[i]!, c: f.knots.C[i]!, h: f.knots.h[i]! }, { l: d.knots.L[i]!, c: d.knots.C[i]!, h: d.knots.h[i]! }), name).toBe(0);
    }
  });
  it('pins nothing else — every other step differs, and the neutrals are re-authored', () => {
    for (const [name, f] of Object.entries(radixLight.families)) {
      const d = radixDark.families[name]!;
      for (let i = 0; i < f.knots.n.length; i++) {
        if (i === f.keyIndex) continue;
        expect(deltaEOK({ l: f.knots.L[i]!, c: f.knots.C[i]!, h: f.knots.h[i]! }, { l: d.knots.L[i]!, c: d.knots.C[i]!, h: d.knots.h[i]! }), `${name} ${f.knots.key[i]}`).toBeGreaterThan(0.01);
      }
    }
    for (const [name, n] of Object.entries(radixLight.neutrals)) {
      const d = radixDark.neutrals[name];
      if (!d) continue;
      const closest = Math.min(...n.knots.L.map((_, i) => deltaEOK({ l: n.knots.L[i]!, c: n.knots.C[i]!, h: 0 }, { l: d.knots.L[i]!, c: d.knots.C[i]!, h: 0 })));
      expect(closest, name).toBeGreaterThan(0.02);
    }
  });
  it('costs the pinned step its place in the contrast ladder — which is why it cannot be mirrored', () => {
    const blue = radixLight.families['blue']!.knots;
    const yellow = radixLight.families['yellow']!.knots;
    const at = (k: typeof blue, i: number): Oklch => ({ l: k.L[i]!, c: k.C[i]!, h: k.h[i]! });
    expect(wcag21Fast(at(blue, 8), RADIX_LIGHT_SURFACE)).toBeCloseTo(3.18, 1);
    expect(wcag21Fast(at(blue, 8), RADIX_DARK_SURFACE)).toBeCloseTo(5.78, 1);
    expect(wcag21Fast(at(yellow, 8), RADIX_LIGHT_SURFACE)).toBeCloseTo(1.23, 1);
    expect(wcag21Fast(at(yellow, 8), RADIX_DARK_SURFACE)).toBeCloseTo(14.93, 1);
  });
});

describe('mirrorStep', () => {
  it('reproduces the contrast it was given, in whichever domain λ selects', () => {
    const bgL: Oklch = { l: 1, c: 0, h: 0 };
    const bgD: Oklch = { l: 0.15, c: 0, h: 0 };
    const from: Oklch = { l: 0.5, c: 0.1, h: 250 };
    const w = mirrorStep({ from, lightSurface: bgL, darkSurface: bgD, chromaAt: () => 0.1, hue: 250, lambda: 0 });
    expect(wcag21Fast({ l: w.l, c: w.c, h: w.h }, bgD)).toBeCloseTo(wcag21Fast(from, bgL), 4);
    const a = mirrorStep({ from, lightSurface: bgL, darkSurface: bgD, chromaAt: () => 0.1, hue: 250, lambda: 1 });
    expect(Math.abs(apcaFast({ l: a.l, c: a.c, h: a.h }, bgD))).toBeCloseTo(Math.abs(apcaFast(from, bgL)), 3);
    const b = mirrorStep({ from, lightSurface: bgL, darkSurface: bgD, chromaAt: () => 0.1, hue: 250, lambda: 0.5 });
    expect(b.l).toBeCloseTo((w.l + a.l) / 2, 6);
  });
  it('falls back to WCAG where APCA cannot be inverted, and takes the near-surface gain there', () => {
    const bgL: Oklch = { l: 1, c: 0, h: 0 };
    const bgD: Oklch = { l: 0.15, c: 0, h: 0 };
    const subtle: Oklch = { l: 0.97, c: 0.01, h: 250 }; // barely off white
    expect(Math.abs(apcaFast(subtle, bgL))).toBeLessThan(APCA_INVERTIBLE_LC);
    const bare = mirrorStep({ from: subtle, lightSurface: bgL, darkSurface: bgD, chromaAt: () => 0.01, hue: 250, lambda: 0.5 });
    expect(bare.method).toBe('wcag');
    expect(wcag21Fast({ l: bare.l, c: bare.c, h: bare.h }, bgD)).toBeCloseTo(wcag21Fast(subtle, bgL), 4);
    const gained = mirrorStep({ from: subtle, lightSurface: bgL, darkSurface: bgD, chromaAt: () => 0.01, hue: 250, lambda: 0.5, nearSurfaceGain: 1.12 });
    expect(wcag21Fast({ l: gained.l, c: gained.c, h: gained.h }, bgD)).toBeCloseTo(1.12 * wcag21Fast(subtle, bgL), 4);
    expect(gained.l).toBeGreaterThan(bare.l);
  });
});

describe('deriveDarkDNA against the scale Radix actually ships', () => {
  const derived = deriveDarkDNA(radixLight, radixOpts);

  it('is a well-formed dark DNA that parseDNA accepts and the solvers can use', () => {
    expect(derived.mode).toBe('dark');
    expect(derived.pairedWith).toBe('radix-light');
    expect(derived.source.kind).toBe('derived');
    expect(Object.keys(derived.families)).toHaveLength(Object.keys(radixLight.families).length);
    expect(Object.keys(derived.neutrals)).toHaveLength(Object.keys(radixLight.neutrals).length);
    const round = parseDNA(serializeDNA(derived));
    expect(round.derivedFrom!.from).toBe('radix-light');
    expect(round.derivedFrom!.pinnedKey).toBe('9');
  });

  it('holds the pin exactly in every family', () => {
    for (const [name, f] of Object.entries(derived.families)) {
      const src = radixLight.families[name]!;
      const i = src.keyIndex;
      expect(deltaEOK({ l: f.knots.L[i]!, c: f.knots.C[i]!, h: f.knots.h[i]! }, { l: src.knots.L[i]!, c: src.knots.C[i]!, h: src.knots.h[i]! }), name).toBeLessThan(0.001);
    }
  });

  it('lands within RMS ΔEOK 0.05 of the authored scale, with the median step inside a JND pair', () => {
    const c = compareDNA(derived, radixDark);
    const sorted = c.all.slice().sort((a, b) => a - b);
    expect(rms(c.all)).toBeLessThan(0.05);
    expect(sorted[Math.floor(sorted.length / 2)]!).toBeLessThan(0.04);
    expect(c.all.filter((d) => d < 0.04).length / c.all.length).toBeGreaterThan(0.6);
  });

  it('beats both pure mirrors, and the pin matters more than every other parameter together', () => {
    const score = (o: Parameters<typeof deriveDarkDNA>[1]) => rms(compareDNA(deriveDarkDNA(radixLight, { ...radixOpts, ...o }), radixDark).all);
    const balanced = score({});
    expect(score({ lambda: 0, nearSurfaceGain: false })).toBeGreaterThan(balanced * 1.5);
    expect(score({ lambda: 1, nearSurfaceGain: false })).toBeGreaterThan(balanced * 1.5);
    expect(score({ pinKeyStep: false })).toBeGreaterThan(balanced * 2);
    // the per-step λ fit is better on the system it was fit to, as it must be
    expect(score({ lambda: 'radix' })).toBeLessThan(balanced);
  });

  it('keeps adjacent steps apart, which the pin otherwise collapses', () => {
    const floor = (dna: SystemDNA) => Math.min(...Object.values(dna.families).map((f) => {
      const k = f.knots;
      let mn = Infinity;
      for (let i = 1; i < k.n.length; i++) mn = Math.min(mn, deltaEOK({ l: k.L[i - 1]!, c: k.C[i - 1]!, h: k.h[i - 1]! }, { l: k.L[i]!, c: k.C[i]!, h: k.h[i]! }));
      return mn;
    }));
    const off = floor(deriveDarkDNA(radixLight, { ...radixOpts, minStepDeltaE: 0 }));
    expect(off).toBeLessThan(0.01);
    // the pass targets one JND before quantization, which shaves a little off
    expect(floor(derived)).toBeGreaterThan(0.017);
    expect(floor(derived)).toBeGreaterThanOrEqual(floor(radixDark) - 0.001);
  });

  it('refuses to derive a dark scale from a dark scale', () => {
    expect(() => deriveDarkDNA(radixDark)).toThrow(/already a dark scale/);
  });
});

describe('deriveDarkDNA on every light system', () => {
  it('produces a monotone, in-gamut, correctly ordered dark scale for all twelve', () => {
    for (const id of lightIds) {
      const light = DNA[id]!;
      const dna = deriveDarkDNA(light);
      expect(dna.mode, id).toBe('dark');
      expect(dna.steps.direction, id).toBe('dark-to-light');
      const surface = dna.derivedFrom!.darkSurface;
      for (const [name, f] of Object.entries(dna.families)) {
        const k = f.knots;
        for (let i = 0; i < k.n.length; i++) {
          expect(new Color('oklch', [k.L[i]!, k.C[i]!, k.h[i]!]).inGamut(light.authoredGamut === 'p3' ? 'p3' : 'srgb', { epsilon: 0.001 }), `${id}/${name} ${k.key[i]}`).toBe(true);
        }
        // the spine runs away from the dark surface, i.e. gets lighter. 8-bit quantization
        // can shuffle a pair whose separation is mostly chroma by a hair; the spine's own
        // flattening absorbs that, and the raw inversion stays far inside its tolerance.
        for (let p = 1; p < f.spine.indices.length; p++) {
          const a = f.spine.indices[p - 1]!, b = f.spine.indices[p]!;
          expect(f.spine.L[b]! - f.spine.L[a]!, `${id}/${name} ${k.key[a]}→${k.key[b]}`).toBeGreaterThanOrEqual(0);
          expect(k.L[b]! - k.L[a]!, `${id}/${name} ${k.key[a]}→${k.key[b]} raw`).toBeGreaterThan(-0.002);
        }
        expect(f.spine.detached.length, `${id}/${name} detached`).toBeLessThanOrEqual(light.families[name]!.spine.detached.length + 1);
        // step 0 is the surface tint in both modes: it stays the least contrasting step.
        // (Its lightness is not the test — on Spectrum, whose darkest neutral is pure
        // black, a 1.1:1 tint has to climb to L 0.2 to get there.)
        const cr = k.L.map((_, i) => wcag21Fast({ l: k.L[i]!, c: k.C[i]!, h: k.h[i]! }, surface));
        expect(cr[0]!, `${id}/${name} step 0 contrast`).toBeCloseTo(Math.min(...cr), 6);
        expect(cr[0]!, `${id}/${name} step 0 is a surface tint`).toBeLessThan(1.7);
      }
    }
  });
  it('records what it could not do rather than hiding it', () => {
    const tw = deriveDarkDNA(DNA['tailwind-v4']!);
    const d = tw.derivedFrom!;
    // Tailwind is authored in P3 at high chroma; a mode flip puts several hues where
    // the shell is narrower than the chroma they carry.
    expect(d.shellLimited.length).toBeGreaterThan(0);
    for (const s of d.shellLimited) expect(s.wanted).toBeGreaterThan(s.got);
    expect(d.warnings.some((w) => w.includes('gamut shell'))).toBe(true);
    // and the surface it picked, plus why
    expect(d.surfaceRule).toBe('darkest-neutral');
    expect(d.darkSurface.l).toBeCloseTo(defaultDarkSurface(DNA['tailwind-v4']!).surface.l, 9);
  });
  it('warns when the default surface is a text color rather than an app background', () => {
    // Radix's darkest neutral is gray-12 at L 0.24 — text, not a surface.
    const d = deriveDarkDNA(radixLight).derivedFrom!;
    expect(d.darkSurface.l).toBeGreaterThan(0.22);
    expect(d.warnings.some((w) => w.includes('text color'))).toBe(true);
    expect(deriveDarkDNA(radixLight, radixOpts).derivedFrom!.warnings.some((w) => w.includes('text color'))).toBe(false);
  });
  it('is deterministic', () => {
    const now = () => '2026-01-01T00:00:00.000Z';
    const a = serializeDNA(deriveDarkDNA(DNA['carbon']!, { now }));
    const b = serializeDNA(deriveDarkDNA(DNA['carbon']!, { now }));
    expect(a).toBe(b);
  });
});

describe('solvePair', () => {
  it('puts the seed at the same color and the same step in both modes', () => {
    const p = solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', gamut: 'srgb' });
    expect(p.darkSource.kind).toBe('authored');
    expect(p.pin!.deltaE).toBe(0);
    const ls = p.light.steps.find((s) => s.isSeed)!;
    const ds = p.dark.steps.find((s) => s.isSeed)!;
    expect(ls.key).toBe(ds.key);
    expect(ls.color.native).toBe(ds.color.native);
  });
  it('derives the dark reference when the system does not ship one', () => {
    const p = solvePair({ light: DNA['tailwind-v4']!, seed: '#7c3aed', gamut: 'srgb' });
    expect(p.darkSource.kind).toBe('derived');
    expect(p.pin!.deltaE).toBe(0);
    expect(p.dark.background.l).toBeLessThan(0.2);
    expect(p.light.background.l).toBeGreaterThan(0.9);
    expect(p.correspondence).toHaveLength(p.light.steps.length);
  });
  it('reports what pinning costs instead of pretending it is free', () => {
    // yellow is the case: one color cannot be both a light-mode solid and a dark-mode one
    const p = solvePair({ light: radixLight, dark: radixDark, seed: '#ffe629', gamut: 'srgb' });
    expect(p.pin!.light.wcagVsBg).toBeLessThan(2);
    expect(p.pin!.dark.wcagVsBg).toBeGreaterThan(10);
    expect(p.warnings.some((w) => w.includes('spread'))).toBe(true);
  });
  it('tints both modes\' grays from the seed', () => {
    const p = solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', gamut: 'srgb', neutrals: true });
    for (const m of ['light', 'dark'] as const) {
      expect(p.neutrals![m].neutral!.tintHue).toBeCloseTo(p.light.target.seed!.h, 0);
    }
    // the dark grays sit on the dark background and run the other way
    expect(p.neutrals!.dark.steps[0]!.color.oklch.l).toBeLessThan(0.3);
    expect(p.neutrals!.light.steps[0]!.color.oklch.l).toBeGreaterThan(0.9);
  });
  it('rejects a dark system in the light slot', () => {
    expect(() => solvePair({ light: radixDark, seed: '#7c3aed' })).toThrow(/is a dark scale/);
  });
  it('holds the solver guarantees in both modes over random seeds and systems', () => {
    fc.assert(
      fc.property(
        fc.record({ l: fc.double({ min: 0.2, max: 0.85, noNaN: true }), c: fc.double({ min: 0.02, max: 0.2, noNaN: true }), h: fc.double({ min: 0, max: 360, noNaN: true }) }),
        fc.constantFrom(...lightIds),
        fc.constantFrom('srgb', 'p3'),
        (seed, id, gamut) => {
          const p = solvePair({ light: DNA[id]!, seed, gamut: gamut as 'srgb' | 'p3' });
          expect(p.pin!.deltaE).toBeLessThan(0.001);
          for (const ramp of [p.light, p.dark]) {
            for (const s of ramp.steps) {
              expect(new Color('oklch', [s.color.oklch.l, s.color.oklch.c, s.color.oklch.h]).inGamut(gamut === 'p3' ? 'p3' : 'srgb', { epsilon: 0.001 })).toBe(true);
              for (const pr of s.promises) expect(pr.met).toBe(true);
            }
          }
          // the dark ramp runs away from its background; the light one toward it
          const dspine = p.dark.steps.filter((s) => !s.detached);
          for (let i = 1; i < dspine.length; i++) expect(dspine[i]!.intended.l - dspine[i - 1]!.intended.l).toBeGreaterThan(-1e-9);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('the calibration itself', () => {
  it('is well-formed: one value per position, λ in [0,1], factors positive', () => {
    const c = RADIX_CALIBRATION;
    for (const k of ['lambda', 'chroma', 'transferW', 'nearSurfaceGain'] as const) expect(c[k], k).toHaveLength(c.n.length);
    for (const v of c.lambda) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    for (const v of c.transferW) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    for (const v of c.chroma) expect(v).toBeGreaterThan(0);
    for (const v of c.nearSurfaceGain) expect(v).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < c.n.length; i++) expect(c.n[i]!).toBeGreaterThan(c.n[i - 1]!);
  });
  it('can be overridden end to end: a flat chroma multiplier scales the ramp', () => {
    const a = deriveDarkDNA(radixLight, { ...radixOpts, chroma: 'none', lambda: 0.5 });
    const b = deriveDarkDNA(radixLight, { ...radixOpts, chroma: 0.5, lambda: 0.5 });
    const ka = a.families['blue']!.knots, kb = b.families['blue']!.knots;
    for (let i = 0; i < ka.n.length; i++) {
      if (i === radixLight.families['blue']!.keyIndex) continue;
      expect(kb.C[i]!, `step ${ka.key[i]}`).toBeLessThan(ka.C[i]! + 1e-6);
    }
  });
});

describe('pinning only where a key step is declared', () => {
  it('pins Radix, Tailwind, Carbon, Primer and Material — the systems that document one', () => {
    for (const id of ['radix-light', 'tailwind-v4', 'tailwind', 'carbon', 'primer', 'material']) {
      const light = DNA[id]!;
      expect(light.steps.keyStep.rule, id).toBe('documented');
      expect(deriveDarkDNA(light).derivedFrom!.pinnedKey, id).toBe(light.steps.keyStep.key);
    }
  });
  it('pins nothing where the key is merely where chroma peaks, and says so', () => {
    for (const id of lightIds.filter((i) => DNA[i]!.steps.keyStep.rule !== 'documented')) {
      const d = deriveDarkDNA(DNA[id]!).derivedFrom!;
      expect(d.pinnedKey, id).toBeNull();
      expect(d.warnings.some((w) => w.includes('does not document a key step')), id).toBe(true);
    }
  });
  it('refuses a forced pin that would leave the rest of the ramp nowhere to go', () => {
    // Spectrum's yellow peaks at step 300 of 14, at L 0.88 — pinning that in dark mode
    // leaves eleven steps that must out-contrast it fighting over the top of the axis.
    const d = deriveDarkDNA(DNA['spectrum']!, { pinKeyStep: true }).derivedFrom!;
    expect(d.pinnedKey).toBeNull();
    expect(d.warnings.some((w) => w.includes('near the light surface'))).toBe(true);
  });
  it('hangs the step past the pin off the pin, not off the background', () => {
    // Radix step 10 is the solid's hover. Mirrored against the background it lands
    // ΔEOK 0.003 from the pin; hung off the pin it lands where Radix put it.
    const d = deriveDarkDNA(radixLight, radixOpts);
    const k = d.families['blue']!.knots;
    const pin = radixLight.families['blue']!.keyIndex;
    expect(deltaEOK({ l: k.L[pin]!, c: k.C[pin]!, h: k.h[pin]! }, { l: k.L[pin + 1]!, c: k.C[pin + 1]!, h: k.h[pin + 1]! })).toBeGreaterThan(0.02);
    expect(Math.abs(k.L[pin + 1]! - radixDark.families['blue']!.knots.L[pin + 1]!)).toBeLessThan(0.05);
  });
});
