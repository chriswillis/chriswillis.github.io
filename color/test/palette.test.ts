import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { palette, loadDNA, builtinDNAIds, DEFAULT_REFERENCE } from '../src/palette.ts';
import { chooseSpacing } from '../src/solver/index.ts';
import { solveRamp } from '../src/solver/index.ts';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { deltaEOK } from '../src/color/oklch.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));
const lightIds = ids.filter((id) => DNA[id]!.mode === 'light');

const SEED = '#7c3aed';

describe('loadDNA', () => {
  it('defaults to the reference the library defaults to', () => {
    expect(DEFAULT_REFERENCE).toBe('tailwind-v4');
    expect(loadDNA().id).toBe(DEFAULT_REFERENCE);
  });
  it('lists every built-in, and loads each one', () => {
    const list = builtinDNAIds();
    expect(list).toEqual(ids);
    for (const id of list) expect(loadDNA(id).id).toBe(id);
  });
  it('returns the same object twice — the parse is cached', () => {
    expect(loadDNA('radix-light')).toBe(loadDNA('radix-light'));
  });
  it('names the remedy when the id is unknown', () => {
    expect(() => loadDNA('not-a-system')).toThrow(/no built-in DNA "not-a-system"/);
  });
});

describe('the default reference', () => {
  it('is Tailwind v4 when none is named', () => {
    const p = palette({ seed: SEED });
    expect(p.reference.id).toBe('tailwind-v4');
    expect(p.reference.name).toMatch(/Tailwind/);
  });
  it('is overridable by id or by DNA, and the two agree', () => {
    const byId = palette({ seed: SEED, reference: 'material' });
    const byDna = palette({ seed: SEED, reference: DNA['material']! });
    expect(byId.reference.id).toBe('material');
    expect(byDna.reference.id).toBe('material');
    for (let i = 0; i < byId.pair.light.steps.length; i++) {
      expect(deltaEOK(byId.pair.light.steps[i]!.color.oklch, byDna.pair.light.steps[i]!.color.oklch)).toBeLessThan(1e-9);
    }
  });
  it('documents a key step, which is why the brand fill has somewhere to pin', () => {
    // the whole case for the default rests on this: the seed lands exactly, at cost 0
    const p = palette({ seed: SEED });
    expect(p.pair.pin).not.toBeNull();
    expect(p.pair.pin!.deltaE).toBeLessThan(1e-6);
    expect(loadDNA().steps.key).not.toBeNull();
  });
});

describe('the dark reference', () => {
  it('is derived when the reference ships no dark scale — which Tailwind does not', () => {
    const p = palette({ seed: SEED });
    expect(p.reference.dark.kind).toBe('derived');
    expect(loadDNA('tailwind-v4').pairedWith).toBeUndefined();
  });
  it('prefers the reference\'s own authored dark scale when it has one', () => {
    const p = palette({ seed: SEED, reference: 'radix-light' });
    expect(p.reference.dark.kind).toBe('authored');
    expect(p.reference.dark.id).toBe('radix-dark');
  });
  it('takes an explicit dark reference over the paired one', () => {
    const p = palette({ seed: SEED, reference: 'radix-light', dark: DNA['radix-dark']! });
    expect(p.reference.dark.id).toBe('radix-dark');
    expect(p.reference.dark.kind).toBe('authored');
  });
  it('is calibrated from Radix even when the curves come from Tailwind', () => {
    // the one thing that cannot follow the default: λ, chroma, transfer weight and
    // near-surface gain are measured from the only reference that ships both modes.
    const p = palette({ seed: SEED });
    expect(p.pair.darkSource.kind).toBe('derived');
    expect(p.pair.dark.steps.length).toBe(p.pair.light.steps.length);
    // the seed still holds the same step in both modes
    expect(p.pair.pin!.stepKey).toBe(p.pair.light.seed!.stepKey);
  });
});

describe('spacing defaults to even', () => {
  it('chooses even for a nominally numbered reference', () => {
    for (const id of lightIds.filter((i) => DNA[i]!.steps.numbering?.class !== 'contrast-bearing')) {
      expect(chooseSpacing(DNA[id]!)).toEqual({ mode: 'even', rule: 'even-by-default' });
    }
  });
  it('keeps the reference spacing only where the numbering is a contrast promise', () => {
    const bearing = lightIds.filter((i) => DNA[i]!.steps.numbering?.class === 'contrast-bearing');
    expect(bearing.length).toBeGreaterThan(0);
    for (const id of bearing) {
      expect(chooseSpacing(DNA[id]!)).toEqual({ mode: 'reference', rule: 'contrast-bearing-numbering' });
    }
  });
  it('honours an explicit ask over both', () => {
    expect(chooseSpacing(DNA['carbon']!, 'even')).toEqual({ mode: 'even', rule: 'asked' });
    expect(chooseSpacing(DNA['tailwind-v4']!, 'reference')).toEqual({ mode: 'reference', rule: 'asked' });
  });
  it('actually evens the steps out, everywhere it is chosen', () => {
    for (const id of lightIds) {
      const dna = DNA[id]!;
      if (dna.steps.keys === null) continue;
      const fam = Object.values(dna.families)[0]!;
      const common = { dna, family: fam.family, hue: fam.hueAtPeak, gamut: 'srgb' as const, sibling: false };
      const ref = solveRamp({ ...common, spacing: 'reference' });
      const even = solveRamp({ ...common, spacing: 'even' });
      expect(even.spacing.cv).toBeLessThanOrEqual(ref.spacing.cv + 1e-9);
    }
  });
  it('never collapses two steps onto the same color', () => {
    // the detached-step overflow bug: an anchor's shift used to push its detached
    // followers past L=1, where they all clamped to the same white.
    for (const id of lightIds) {
      const dna = DNA[id]!;
      if (dna.steps.keys === null) continue;
      for (const fam of Object.values(dna.families)) {
        const r = solveRamp({ dna, family: fam.family, hue: fam.hueAtPeak, gamut: 'srgb', sibling: false, spacing: 'even' });
        expect(r.spacing.min).toBeGreaterThan(0.005);
      }
    }
  });
});

describe('palette() composes the whole pipeline', () => {
  const p = palette({ seed: SEED, neutrals: true, families: { danger: '#dc2626' } });

  it('emits primitives for every family it was given', () => {
    const fams = new Set(p.tokens.primitives.map((t) => t.family));
    expect(fams.has('brand')).toBe(true);
    expect(fams.has('danger')).toBe(true);
    expect(p.families['danger']).toBeDefined();
    expect([...fams].some((f) => f !== 'brand' && f !== 'danger')).toBe(true); // the neutral
  });
  it('emits semantics in both modes', () => {
    expect(p.tokens.modes).toEqual(['light', 'dark']);
    expect(p.tokens.semantics.length).toBeGreaterThan(0);
    for (const t of p.tokens.semantics) for (const m of p.tokens.modes) expect(t.values[m]).toBeDefined();
  });
  it('audits and lints what it built, and comes out clean on the default reference', () => {
    expect(p.audit.modes).toEqual(['light', 'dark']);
    expect(p.audit.matrix.light).toBeDefined();
    expect(p.audit.uniformity.dark).toBeDefined();
    expect(p.lint.counts.error).toBe(0);
    expect(p.lint.counts.warning).toBe(0);
    expect(p.lint.clean).toBe(true);
  });
  it('solves the neutrals once for the set, not once per family', () => {
    expect(p.pair.neutrals).toBeDefined();
    expect(p.families['danger']!.light.neutral).toBeUndefined();
  });
  it('records where the numbers came from', () => {
    expect(p.tokens.provenance.reference).toBe('tailwind-v4');
    expect(p.tokens.provenance.darkReference).toEqual({ id: 'tailwind-v4-dark', kind: 'derived' });
    expect(p.tokens.provenance.spacing).toMatch(/even/);
  });
});

describe('every light reference solves, and says what it could not hold', () => {
  // Not every reference can hold every role: Open Color is a ten-step pastel
  // scale whose darkest chromatic step is L 0.55, so nothing in it reaches 4.5:1
  // on white at any spacing. That is a fact about Open Color, and the point of
  // the harness is to report it rather than to paper over it. What must hold
  // universally is that the pipeline completes and that every error carries its
  // evidence and its remedy.
  for (const id of lightIds) {
    it(`${id}`, () => {
      const q = palette({ seed: SEED, reference: id });
      expect(q.pair.light.steps.length).toBeGreaterThan(0);
      expect(q.tokens.semantics.length).toBeGreaterThan(0);
      for (const f of q.lint.findings) {
        expect(f.message.length, `${id}/${f.rule}`).toBeGreaterThan(0);
        expect(f.severity === 'error' ? f.remedy : 'n/a', `${id}/${f.rule}`).toBeTruthy();
      }
    });
  }

  it('is clean on the default reference and on Radix, the two that carry the argument', () => {
    for (const id of ['tailwind-v4', 'radix-light']) {
      const q = palette({ seed: SEED, reference: id });
      const errs = q.lint.findings.filter((f) => f.severity !== 'info');
      expect(errs.map((f) => `${f.severity} ${f.rule}`).join(', ')).toBe('');
    }
  });

  it('never paints a foreground in the colour of the surface it sits on', () => {
    // Measured in spike/phase5-surfaces.ts: before the assignment excluded surface
    // steps from the content and icon categories, content/disabled landed on
    // surface/active in 30 of 2304 corpus pairs across 8 of the 12 references —
    // the light-mode disabled button whose label had gone missing.
    const onSurface: [string, string][] = [
      ['content/normal', 'surface/normal'], ['content/subtle', 'surface/normal'],
      ['content/normal', 'surface/hover'], ['content/subtle', 'surface/hover'],
      ['content/disabled', 'surface/active'], ['icon/normal', 'surface/normal'],
    ];
    for (const id of lightIds) {
      for (const seed of ['#7c3aed', '#dc2626', '#0891b2', '#16a34a']) {
        const q = palette({ seed, reference: id });
        for (const mode of q.tokens.modes) {
          for (const [fgName, sName] of onSurface) {
            const fg = q.tokens.semantics.find((s) => s.role === fgName);
            const sf = q.tokens.semantics.find((s) => s.role === sName);
            if (!fg || !sf) continue;
            const d = deltaEOK(fg.values[mode].oklch, sf.values[mode].oklch);
            expect(d, `${id} ${seed} ${mode}: ${fgName} on ${sName}`).toBeGreaterThanOrEqual(0.02);
          }
        }
      }
    }
  });

  it('borders may still share a step with a foreground — a border is beside content, not behind it', () => {
    // The exclusion is deliberately narrow: over-applying it to borders pushed
    // content/disabled four steps past where its own rule put it.
    const q = palette({ seed: SEED, reference: 'radix-light' });
    const dis = q.tokens.semantics.find((s) => s.role === 'content/disabled')!;
    const active = q.tokens.semantics.find((s) => s.role === 'surface/active')!;
    // one step past the surface it must clear, not four
    const iD = q.pair.light.steps.findIndex((s) => s.key === dis.evidence.light!.stepKey);
    const iA = q.pair.light.steps.findIndex((s) => s.key === active.evidence.light!.stepKey);
    expect(iD).toBeGreaterThan(iA);
    expect(iD - iA).toBeLessThanOrEqual(2);
  });

  it('names the step to pin when even spacing costs a short ramp its text hierarchy', () => {
    // Open Color's seed ranks one step higher on an even ramp than on its own,
    // and on a ten-step ramp that one step is the difference between having a
    // bright step left for dark-mode text and spending it on the fill's hover.
    const even = palette({ seed: SEED, reference: 'opencolor' });
    expect(even.pair.light.warnings.join(' ')).toMatch(/even spacing moved the seed from step 7.*seedStep: '7'/);
    // and the remedy it names actually works
    const pinned = palette({ seed: SEED, reference: 'opencolor', seedStep: '7' });
    expect(pinned.lint.counts.error).toBeLessThan(even.lint.counts.error);
  });
});
