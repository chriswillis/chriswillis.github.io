import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fuzz, reproduce, EDGE_SEEDS, type FuzzCase } from '../src/validate/fuzz.ts';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';

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

  it('does not crash on any of the edge seeds, on any reference', () => {
    // the ends of the lightness axis, zero chroma, and chroma past every gamut —
    // these are where a solver falls over, and none of them may throw
    const r = fuzz({ references, cases: 0, seed: 1 });
    expect(r.crashes.map((c) => `${c.case.seed}: ${c.message}`)).toEqual([]);
  });
});
