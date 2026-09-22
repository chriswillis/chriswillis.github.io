import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fuzz, reproduce, EDGE_SEEDS, type FuzzCase } from '../src/validate/fuzz.ts';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { palette } from '../src/palette.ts';
import { parseToOklch } from '../src/color/oklch.ts';
import { exactCuspChroma } from '../src/gamut/shell.ts';
import { gamutMap } from '../src/solver/index.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const references: Record<string, SystemDNA> = Object.fromEntries(
  ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]),
);
const small = { references, cases: 12, seed: 99 };

describe('the fuzz harness', () => {
  it('is reproducible — the same campaign seed replays the same cases', () => {
    const a = fuzz(small);
    const b = fuzz(small);
    expect(a.campaign.cases).toBe(b.campaign.cases);
    expect(a.crashes.length).toBe(b.crashes.length);
    expect(a.invariants.map((v) => `${v.rule}|${v.case.seed}|${v.case.reference}`))
      .toEqual(b.invariants.map((v) => `${v.rule}|${v.case.seed}|${v.case.reference}`));
  });

  it('a different campaign seed explores different cases', () => {
    const a = fuzz({ ...small, seed: 1 });
    const b = fuzz({ ...small, seed: 2 });
    // the edge seeds are shared by construction; the random ones should not be
    const randA = a.byRule, randB = b.byRule;
    expect(JSON.stringify(randA)).not.toBe(JSON.stringify(randB));
  });

  it('always runs the edge cases, whatever the campaign seed', () => {
    const r = fuzz({ ...small, cases: 0 });
    expect(r.campaign.cases).toBe(EDGE_SEEDS.length);
  });

  it('separates library defects from palette findings', () => {
    const r = fuzz(small);
    for (const v of r.invariants) expect(v.kind).toBe('invariant');
    for (const v of r.crashes) expect(v.kind).toBe('crash');
    // every invariant is an error; a palette cannot be "a bit" out of gamut
    for (const v of r.invariants) expect(v.severity).toBe('error');
  });

  it('rates are a share of cases, never above 1', () => {
    // one case can produce a dozen findings of one rule; a dozen of one problem
    // is still one case, and conflating them gave rates of 540%
    const r = fuzz({ ...small, cases: 30 });
    for (const [rule, e] of Object.entries(r.byRule)) {
      expect(e.rate, rule).toBeGreaterThan(0);
      expect(e.rate, rule).toBeLessThanOrEqual(1);
      expect(e.count).toBeGreaterThanOrEqual(1);
    }
  });

  it('catches a crash rather than letting it escape', () => {
    // a reference with no families cannot be solved; the harness must record it
    const broken = { ...references['tailwind-v4']!, families: {} } as SystemDNA;
    const r = fuzz({ references: { broken }, cases: 0, seed: 1 });
    expect(r.crashes.length).toBeGreaterThan(0);
    expect(r.crashes[0]!.kind).toBe('crash');
    expect(r.crashes[0]!.message.length).toBeGreaterThan(0);
  });

  it('gives every violation a case that reproduces it', () => {
    const r = fuzz(small);
    for (const v of [...r.crashes, ...r.invariants]) {
      expect(v.case.seed).toBeTruthy();
      expect(references[v.case.reference]).toBeDefined();
      expect(reproduce(v.case)).toContain(v.case.seed);
      expect(reproduce(v.case)).toContain(v.case.reference);
    }
  });

  it('honours a restricted settings matrix', () => {
    const r = fuzz({ ...small, spacing: ['even'], lightness: ['oklab'], gamut: ['srgb'] });
    const seen = new Set<string>();
    for (const v of [...r.crashes, ...r.invariants]) seen.add(`${v.case.spacing}|${v.case.lightness}|${v.case.gamut}`);
    for (const k of seen) expect(k).toBe('even|oklab|srgb');
  });

  it('reports progress', () => {
    const seen: number[] = [];
    fuzz({ ...small, cases: 3, onProgress: (d) => seen.push(d) });
    expect(seen.length).toBe(EDGE_SEEDS.length + 3);
    expect(seen[seen.length - 1]).toBe(EDGE_SEEDS.length + 3);
  });

  it('comes back with no library defects, on campaigns it was not tuned against', () => {
    // The bar this harness exists to hold. Two campaign seeds rather than one, so
    // it cannot be passing by having been tuned against the run that found the
    // bugs. `npm run fuzz -- --cases 10000` is the fuller version; this is the
    // part that belongs in a test suite.
    for (const seed of [42, 7]) {
      const r = fuzz({ references, cases: 400, seed });
      expect(r.crashes.map((c) => `${c.case.seed}: ${c.message}`), `campaign ${seed}`).toEqual([]);
      expect(r.invariants.map((v) => `${v.rule} ${v.case.reference} ${v.case.seed}`), `campaign ${seed}`).toEqual([]);
    }
  }, 60_000);

  it('does not crash on any of the edge seeds, on any reference', () => {
    // the ends of the lightness axis, zero chroma, and chroma past every gamut —
    // these are where a solver falls over, and none of them may throw
    const r = fuzz({ references, cases: 0, seed: 1 });
    expect(r.crashes.map((c) => `${c.case.seed}: ${c.message}`)).toEqual([]);
  });
});

describe('regressions the harness found', () => {
  it('the seed does not promise contrast the emitted colour cannot keep', () => {
    // The solver records promises from the pre-quantization colour and defends
    // them with a nudge — but it exempts the seed from the nudge, because the
    // seed being exact is the premise of the library. So the seed must promise
    // what it delivers. Both cases were out-of-gamut seeds whose mapped colour
    // cleared a threshold and whose emitted colour landed a hundredth short.
    for (const [ref, seed] of [
      ['carbon', 'oklch(0.5395 0.1428 243.18)'],
      ['tailwind', 'oklch(0.4387 0.1981 214.08)'],
    ] as const) {
      const p = palette({ seed, reference: ref, gamut: 'srgb' });
      for (const mode of p.tokens.modes) {
        const broken = p.audit.promises[mode]?.checked.filter((c) => !c.held) ?? [];
        expect(broken.map((b) => `${b.step}: ${b.threshold} vs ${b.measured.toFixed(3)}`), `${ref}/${mode}`).toEqual([]);
      }
    }
  });

  it('the gamut boundary agrees with the mapper about the sRGB primaries', () => {
    // exactCuspChroma tested membership exactly while gamutMap allows Color.js's
    // epsilon, leaving the library with two answers to one question.
    for (const css of ['#0000ff', '#ff0000', '#00ff00', '#ffff00', '#00ffff', '#ff00ff']) {
      const o = parseToOklch(css);
      expect(gamutMap(o, 'srgb').deltaE, css).toBe(0);
    }
  });

  it('knows a cusp is not the same question as membership', () => {
    // #0000ff sits beyond its own cusp: along its radius red dips to −0.009 near
    // C 0.29 and returns to −0.00001 at C 0.313. Both facts are true and the
    // invariant has to ask the right one.
    const o = parseToOklch('#0000ff');
    expect(exactCuspChroma('srgb', o.l, o.h)).toBeLessThan(o.c);
    expect(gamutMap(o, 'srgb').deltaE).toBe(0);
  });
});
