import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import {
  hkGamma, apparentL, lForApparent, deltaEHK, suvTheta,
  coefficientQ, coefficientKBr, defaultViewing,
  AVERAGE_SURROUND, DARK_SURROUND, DEFAULT_STRENGTH,
} from '../src/color/hk.ts';
import { parseToOklch, deltaEOK, type Oklch } from '../src/color/oklch.ts';
import { solveRamp } from '../src/solver/index.ts';
import { uniformity } from '../src/validate/audit.ts';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { palette } from '../src/palette.ts';

const DNA = (id: string): SystemDNA => parseDNA(readFileSync(`dna/${id}.json`, 'utf8'));
const tw = DNA('tailwind-v4');
const FULL = { strength: 1 } as const;

describe('the H–K model', () => {
  it('leaves an achromatic colour exactly alone', () => {
    for (const l of [0, 0.2, 0.5, 0.8, 1]) {
      expect(hkGamma({ l, c: 0, h: NaN }, AVERAGE_SURROUND, FULL)).toBe(1);
      expect(apparentL({ l, c: 0, h: NaN }, AVERAGE_SURROUND, FULL)).toBe(l);
    }
  });

  it('never makes a colour appear darker than it measures', () => {
    fc.assert(fc.property(
      fc.double({ min: 0.02, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 0.37, noNaN: true }),
      fc.double({ min: 0, max: 360, noNaN: true }),
      (l, c, h) => {
        const g = hkGamma({ l, c, h }, AVERAGE_SURROUND, FULL);
        expect(g).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(g)).toBe(true);
        // the S_uv cap is what keeps this bounded as lightness approaches zero
        expect(g).toBeLessThan(3);
      },
    ));
  });

  it('has the hue signature the effect is known by: strongest at red and magenta, null at yellow-green', () => {
    const at = (h: number) => hkGamma({ l: 0.5, c: 0.15, h }, AVERAGE_SURROUND, FULL);
    const byHue = Array.from({ length: 36 }, (_, i) => ({ h: i * 10, g: at(i * 10) }));
    const strongest = byHue.reduce((p, q) => (q.g > p.g ? q : p));
    const weakest = byHue.reduce((p, q) => (q.g < p.g ? q : p));
    // OKLCH puts red near 30° and magenta near 330°; the two maxima wrap around 0
    expect(strongest.h > 300 || strongest.h < 60).toBe(true);
    // and the null sits in the yellow-green quadrant
    expect(weakest.h).toBeGreaterThanOrEqual(80);
    expect(weakest.h).toBeLessThanOrEqual(140);
    // the effect is not flat — that is what makes it separable from plain chroma
    expect(strongest.g - weakest.g).toBeGreaterThan(0.1);
  });

  it('is WEAKER in a dark surround, which is the opposite of the folk claim', () => {
    // K_Br rises with adapting luminance, so the effect is largest in a bright room
    expect(coefficientKBr(200)).toBeGreaterThan(coefficientKBr(40));
    expect(coefficientKBr(40)).toBeGreaterThan(coefficientKBr(8));
    for (const h of [0, 60, 145, 210, 264, 330]) {
      const light = hkGamma({ l: 0.5, c: 0.15, h }, AVERAGE_SURROUND, FULL);
      const dark = hkGamma({ l: 0.5, c: 0.15, h }, DARK_SURROUND, FULL);
      if (light > 1) expect(dark, `h=${h}`).toBeLessThan(light);
    }
  });

  it('q(θ) is the published four-harmonic series', () => {
    // spot-check against the closed form rather than trusting the transcription
    const t = 1.234;
    const expected = -0.01585
      - 0.03017 * Math.cos(t) - 0.04556 * Math.cos(2 * t) - 0.02667 * Math.cos(3 * t) - 0.00295 * Math.cos(4 * t)
      + 0.14592 * Math.sin(t) + 0.05084 * Math.sin(2 * t) - 0.01900 * Math.sin(3 * t) - 0.00764 * Math.sin(4 * t);
    expect(coefficientQ(t)).toBeCloseTo(expected, 12);
    // and it is periodic
    expect(coefficientQ(t + 2 * Math.PI)).toBeCloseTo(coefficientQ(t), 10);
  });

  it('strength 0 collapses to plain OKLab', () => {
    const a = parseToOklch('#7c3aed'), b = parseToOklch('#db2777');
    expect(hkGamma(a, AVERAGE_SURROUND, { strength: 0 })).toBe(1);
    expect(deltaEHK(a, b, AVERAGE_SURROUND, { strength: 0 })).toBeCloseTo(deltaEOK(a, b), 12);
  });

  it('inverts, including where apparent lightness is not monotone in L', () => {
    // #dc2626 is the case that broke a naive bisection: S_uv grows as L falls, so
    // Γ rises while L falls and the product turns over near black.
    for (const css of ['#7c3aed', '#dc2626', '#16a34a', '#eab308', '#db2777', '#0891b2']) {
      const o = parseToOklch(css);
      for (const strength of [0.25, 1]) {
        const target = apparentL(o, AVERAGE_SURROUND, { strength });
        const back = lForApparent(target, o.c, o.h, AVERAGE_SURROUND, { strength });
        expect(Math.abs(back - o.l), `${css} @ ${strength}`).toBeLessThan(1e-6);
      }
    }
  });

  it('gives a sane S_uv and hue angle, and zero for achromatic', () => {
    expect(suvTheta({ l: 0.5, c: 0, h: NaN })).toEqual({ suv: 0, theta: 0 });
    const { suv } = suvTheta(parseToOklch('#db2777'));
    expect(suv).toBeGreaterThan(0);
    expect(Number.isFinite(suv)).toBe(true);
  });

  it('picks a dimmer adapting luminance for dark mode', () => {
    expect(defaultViewing('dark').adaptingLuminance).toBeLessThan(defaultViewing('light').adaptingLuminance);
    expect(defaultViewing('dark').surround).toBe('dark');
  });
});

describe('the spacing trade', () => {
  const pink = tw.families['pink'] ?? Object.values(tw.families)[0]!;
  const base = { dna: tw, family: pink.family, hue: pink.hueAtPeak, gamut: 'srgb' as const, sibling: false, spacing: 'even' as const };

  it('reports both rulers whichever built the ramp', () => {
    const a = solveRamp({ ...base });
    expect(a.spacing.lightness).toBe('oklab');
    expect(a.spacing.deltaEHK.length).toBe(a.spacing.deltaE.length);
    expect(a.spacing.cvHK).toBeGreaterThan(0);
    const b = solveRamp({ ...base, lightness: 'hk' });
    expect(b.spacing.lightness).toBe('hk');
  });

  it('actually moves evenness from one ruler to the other', () => {
    const hk = { strength: 1 };
    const a = solveRamp({ ...base, hk });
    const b = solveRamp({ ...base, lightness: 'hk', hk });
    // each ramp is more even under the ruler it was built with
    expect(b.spacing.cvHK).toBeLessThan(a.spacing.cvHK);
    expect(a.spacing.cv).toBeLessThan(b.spacing.cv);
  });

  it('is a trade, not a free improvement — apparent evenness is bought with measured evenness', () => {
    const hk = { strength: 0.25 };
    const a = solveRamp({ ...base, hk });
    const b = solveRamp({ ...base, lightness: 'hk', hk });
    const gainedApparent = a.spacing.cvHK - b.spacing.cvHK;
    const lostMeasured = b.spacing.cv - a.spacing.cv;
    expect(gainedApparent).toBeGreaterThan(0);
    expect(lostMeasured).toBeGreaterThan(0);
    // measured across the corpus the swap is close to 1:1; assert only that the
    // cost is the same order as the gain, so a future change cannot quietly
    // present this as a free win
    expect(lostMeasured).toBeGreaterThan(gainedApparent * 0.3);
  });

  it('leaves the ramp in gamut and monotone in lightness', () => {
    const b = solveRamp({ ...base, lightness: 'hk', hk: { strength: 1 } });
    const ls = b.steps.map((s) => s.color.oklch.l);
    const desc = ls.every((v, i) => i === 0 || v <= ls[i - 1]! + 1e-9);
    const asc = ls.every((v, i) => i === 0 || v >= ls[i - 1]! - 1e-9);
    expect(desc || asc).toBe(true);
    for (const s of b.steps) expect(s.color.oklch.l).toBeGreaterThanOrEqual(0);
  });
});

describe('the audit reports apparent spacing whether or not it was used', () => {
  it('fills in the apparent block with its assumptions', () => {
    const ramp = solveRamp({ dna: tw, seed: '#db2777', gamut: 'srgb', sibling: false });
    const u = uniformity(ramp.steps.map((s) => s.color.oklch), 'light', null);
    expect(u.apparent.deltaE.length).toBe(u.deltaE.length);
    expect(u.apparent.strength).toBe(DEFAULT_STRENGTH);
    expect(u.apparent.viewing.adaptingLuminance).toBe(AVERAGE_SURROUND.adaptingLuminance);
    expect(u.apparent.ratio).toBeCloseTo(u.apparent.cv / u.cv, 6);
  });

  it('flags a pink seed, where the effect is strong, and leaves a cyan one alone', () => {
    const fired = (seed: string) =>
      palette({ seed }).lint.findings.some((f) => f.rule === 'apparent-spacing-differs');
    expect(fired('#db2777')).toBe(true);
    expect(fired('#0891b2')).toBe(false);
  });

  it('files it as info, not as a defect — neither ruler is the right one', () => {
    const f = palette({ seed: '#db2777' }).lint.findings.find((x) => x.rule === 'apparent-spacing-differs')!;
    expect(f.severity).toBe('info');
    expect(f.remedy).toMatch(/trade, not a fix/);
    expect(f.evidence.cvMeasured).toBeLessThan(f.evidence.cvApparent as number);
  });

  it('stops firing once the ramp is spaced by the apparent ruler', () => {
    const p = palette({ seed: '#db2777', lightness: 'hk' });
    expect(p.pair.light.spacing.lightness).toBe('hk');
    expect(p.lint.findings.some((f) => f.rule === 'apparent-spacing-differs')).toBe(false);
  });
});

describe('opting in does not break the pipeline', () => {
  it('still solves, tokenizes and audits cleanly enough to report', () => {
    const p = palette({ seed: '#db2777', lightness: 'hk', neutrals: true });
    expect(p.tokens.semantics.length).toBeGreaterThan(0);
    expect(p.lint.counts.error).toBe(0);
    // the seed is still exact — the ruler changes where the *other* steps land
    expect(p.pair.pin).not.toBeNull();
    expect(p.pair.pin!.deltaE).toBeLessThan(1e-6);
  });
});
