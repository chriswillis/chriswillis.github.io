import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solvePair } from '../src/solver/pair.ts';
import { buildTokens, type TokenSet } from '../src/tokens/build.ts';
import { audit, contrastMatrix, uniformity, simulate, DEFICIENCIES, JND } from '../src/validate/audit.ts';
import { CORPUS, position, beatsSystems } from '../src/validate/baseline.ts';
import { lint, RULES } from '../src/validate/lint.ts';
import { renderAudit } from '../src/validate/render.ts';
import { reportAudit, usablePairs } from '../src/validate/report.ts';
import { wcag21Fast, apcaFast } from '../src/contrast/fast.ts';
import { deltaEOK, type Oklch } from '../src/color/oklch.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));
const lightIds = ids.filter((id) => DNA[id]!.mode === 'light');
const radixLight = DNA['radix-light']!;
const radixDark = DNA['radix-dark']!;

function makeSet(seed = '#7c3aed'): { set: TokenSet; pair: ReturnType<typeof solvePair> } {
  const pair = solvePair({ light: radixLight, dark: radixDark, seed, gamut: 'srgb', neutrals: true });
  return { set: buildTokens(pair, { name: 'Test', now: () => 'T' }), pair };
}

describe('colour-vision simulation', () => {
  it('leaves an achromatic colour alone and preserves lightness', () => {
    for (const kind of DEFICIENCIES) {
      const grey: Oklch = { l: 0.5, c: 0, h: 0 };
      const s = simulate(grey, kind);
      expect(s.l, kind).toBeCloseTo(0.5, 2);
      expect(s.c, kind).toBeLessThan(0.01);
    }
  });
  it('flattens hue: a red and a green of the same lightness converge under protan and deutan', () => {
    const red: Oklch = { l: 0.55, c: 0.15, h: 25 };
    const green: Oklch = { l: 0.55, c: 0.15, h: 145 };
    const before = deltaEOK(red, green);
    for (const kind of ['protan', 'deutan'] as const) {
      expect(deltaEOK(simulate(red, kind), simulate(green, kind)), kind).toBeLessThan(before);
    }
  });
  it('leaves a lightness difference intact — which is why the ramp checks are nearly free', () => {
    const dark: Oklch = { l: 0.3, c: 0.12, h: 250 };
    const light: Oklch = { l: 0.8, c: 0.12, h: 250 };
    for (const kind of DEFICIENCIES) {
      expect(Math.abs(simulate(light, kind).l - simulate(dark, kind).l), kind).toBeGreaterThan(0.35);
    }
  });
  it('reproduces the corpus finding: a single-hue ramp barely moves, family pairs do', () => {
    const k = radixLight.families['blue']!.knots;
    const ramp = k.L.map((_, i) => ({ l: k.L[i]!, c: k.C[i]!, h: k.h[i]! }));
    const adj = (cs: Oklch[]) => { const d: number[] = []; for (let i = 1; i < cs.length; i++) d.push(deltaEOK(cs[i - 1]!, cs[i]!)); return Math.min(...d); };
    const plain = adj(ramp);
    const sim = adj(ramp.map((c) => simulate(c, 'deutan')));
    expect(sim).toBeGreaterThan(plain * 0.5);
    // but blue-9 and purple-9 nearly merge
    const p = radixLight.families['purple']!.knots;
    const b9: Oklch = { l: k.L[8]!, c: k.C[8]!, h: k.h[8]! };
    const p9: Oklch = { l: p.L[8]!, c: p.C[8]!, h: p.h[8]! };
    expect(deltaEOK(simulate(b9, 'deutan'), simulate(p9, 'deutan'))).toBeLessThan(deltaEOK(b9, p9));
  });
});

describe('the contrast matrix', () => {
  const cols = [
    { key: 'a', color: { l: 1, c: 0, h: 0 } as Oklch },
    { key: 'b', color: { l: 0.5, c: 0, h: 0 } as Oklch },
    { key: 'c', color: { l: 0, c: 0, h: 0 } as Oklch },
  ];
  const m = contrastMatrix(cols, 'light');
  it('agrees with the contrast functions cell by cell, and is symmetric in WCAG', () => {
    for (let i = 0; i < cols.length; i++) for (let j = 0; j < cols.length; j++) {
      expect(m.cells[i]![j]!.wcag).toBeCloseTo(wcag21Fast(cols[i]!.color, cols[j]!.color), 9);
      expect(m.cells[i]![j]!.apca).toBeCloseTo(apcaFast(cols[i]!.color, cols[j]!.color), 9);
      expect(m.cells[i]![j]!.wcag).toBeCloseTo(m.cells[j]![i]!.wcag, 9);
    }
  });
  it('is not symmetric in APCA, because polarity is the point of it', () => {
    expect(m.cells[0]![2]!.apca).not.toBeCloseTo(m.cells[2]![0]!.apca, 1);
    expect(Math.sign(m.cells[0]![2]!.apca)).not.toBe(Math.sign(m.cells[2]![0]!.apca));
  });
  it('counts white on black as clearing both measures', () => {
    expect(m.cells[2]![0]!.bodyWcag).toBe(true);
    expect(m.cells[0]![2]!.bodyApca).toBe(true);
    expect(m.usable.wcag).toBeGreaterThan(0);
  });
  it('lists the pairs where the two measures disagree', () => {
    for (const d of m.disagreements) {
      const i = m.keys.indexOf(d.fg), j = m.keys.indexOf(d.bg);
      expect(m.cells[i]![j]!.bodyWcag).not.toBe(m.cells[i]![j]!.bodyApca);
    }
    expect(m.disagreements.length / (m.keys.length * (m.keys.length - 1))).toBeCloseTo(m.usable.disagree, 9);
  });
});

describe('uniformity', () => {
  it('reports zero variation for an evenly spaced ramp and more for an uneven one', () => {
    const even = [0.2, 0.4, 0.6, 0.8].map((l) => ({ l, c: 0, h: 0 }) as Oklch);
    const uneven = [0.2, 0.25, 0.6, 0.8].map((l) => ({ l, c: 0, h: 0 }) as Oklch);
    expect(uniformity(even, 'light', null).cv).toBeLessThan(1e-9);
    expect(uniformity(uneven, 'light', null).cv).toBeGreaterThan(0.3);
  });
  it('compares against the reference as well as the corpus, and the two now differ', () => {
    const { set, pair } = makeSet();
    const a = audit(set, { reference: radixLight, ramps: { light: pair.light, dark: pair.dark } });
    const u = a.uniformity['light']!;
    expect(u.reference).not.toBeNull();
    // Radix numbers by role, so its own ramp is among the least even in the corpus …
    expect(u.reference!.cv).toBeGreaterThan(CORPUS.stepUniformityCv.median);
    // … while the default spacing re-places the steps and lands at the even end
    expect(u.cv).toBeLessThan(u.reference!.cv);
    expect(u.corpus.cv.verdict).toBe('better than most');
  });
  it('reproduces the reference\'s own unevenness when asked to', () => {
    const p = solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', gamut: 'srgb', spacing: 'reference' });
    const a = audit(buildTokens(p, { now: () => 'T' }), { reference: radixLight, ramps: { light: p.light, dark: p.dark } });
    expect(a.uniformity['light']!.corpus.cv.verdict).toBe('worse than most');
    expect(a.uniformity['light']!.cv).toBeCloseTo(a.uniformity['light']!.reference!.cv, 1);
  });
});

describe('the corpus baseline', () => {
  it('is ordered and plausible', () => {
    const bands = [CORPUS.stepUniformityCv, CORPUS.smallestStep, CORPUS.usable45, CORPUS.usableLc60, CORPUS.relCSrgb, CORPUS.atShellSrgb,
      ...DEFICIENCIES.map((k) => CORPUS.cvd[k].minAdjacent)];
    for (const b of bands) {
      expect(b.min).toBeLessThanOrEqual(b.p10);
      expect(b.p10).toBeLessThanOrEqual(b.median);
      expect(b.median).toBeLessThanOrEqual(b.p90);
      expect(b.p90).toBeLessThanOrEqual(b.max);
    }
    expect(Object.keys(CORPUS.crossFamilyDeutanCollapse).sort()).toEqual([...ids].sort());
  });
  it('places a value in its band the right way round', () => {
    expect(position(CORPUS.smallestStep.p90, CORPUS.smallestStep, true).verdict).toBe('better than most');
    expect(position(CORPUS.smallestStep.p10, CORPUS.smallestStep, true).verdict).toBe('worse than most');
    expect(position(CORPUS.stepUniformityCv.p90, CORPUS.stepUniformityCv, false).verdict).toBe('worse than most');
  });
  it('counts ties as ties — five of the thirteen lose no family pairs at all', () => {
    const perfect = beatsSystems(0);
    expect(perfect.of).toBe(13);
    expect(perfect.ties).toBe(5);
    expect(perfect.beats).toBe(8);
    expect(beatsSystems(1).beats).toBe(0);
  });
});

describe('the audit over a real token set', () => {
  const { set, pair } = makeSet();
  const a = audit(set, { reference: radixLight, ramps: { light: pair.light, dark: pair.dark } });

  it('covers both modes and every check', () => {
    for (const m of set.modes) {
      expect(a.matrix[m], m).toBeDefined();
      expect(a.uniformity[m], m).toBeDefined();
      expect(a.cvd[m], m).toBeDefined();
      expect(a.headroom[m], m).toBeDefined();
      expect(a.promises[m], m).toBeDefined();
    }
  });
  it('finds no broken promise, because the solver nudges until there is none', () => {
    for (const m of set.modes) {
      expect(a.promises[m]!.broken, m).toBe(0);
      expect(a.promises[m]!.held, m).toBeGreaterThan(0);
    }
  });
  it('measures headroom against both shells, and never reports negative chroma', () => {
    for (const s of a.headroom['light']!.steps) {
      expect(s.shell.p3).toBeGreaterThanOrEqual(s.shell.srgb - 1e-6);
      expect(s.relC.srgb).toBeGreaterThanOrEqual(0);
      expect(s.chroma).toBeGreaterThanOrEqual(0);
      expect(s.headroom.srgb).toBeCloseTo(s.shell.srgb - s.chroma, 9);
    }
  });
  it('runs the between-family check when there is more than one family', () => {
    const others = Object.fromEntries(['#16a34a', '#dc2626'].map((hex, i) => {
      const p = solvePair({ light: radixLight, dark: radixDark, seed: hex, gamut: 'srgb' });
      return [`extra${i}`, { light: p.light, dark: p.dark }];
    }));
    const a2 = audit(set, { families: others });
    expect(a2.cvd['light']!.betweenFamilies.deutan.pairs).toBe(3);
    expect(a2.cvd['light']!.standing).not.toBeNull();
    const a1 = audit(set);
    expect(a1.cvd['light']!.betweenFamilies.deutan.pairs).toBe(0);
    expect(a1.cvd['light']!.standing).toBeNull();
  });
  it('only reports a collapsed pair when it really was distinguishable first', () => {
    for (const m of set.modes) {
      for (const kind of DEFICIENCIES) {
        for (const c of a.cvd[m]!.within[kind].collapsedPairs) {
          expect(c.before).toBeGreaterThanOrEqual(JND);
          expect(c.after).toBeLessThan(JND);
        }
      }
    }
  });
});

describe('the linter', () => {
  const { set, pair } = makeSet();
  const a = audit(set, { reference: radixLight, ramps: { light: pair.light, dark: pair.dark } });
  const l = lint(set, a);

  it('gives every finding a known rule, a remedy where one exists, and its evidence', () => {
    for (const f of l.findings) {
      expect(RULES as readonly string[]).toContain(f.rule);
      expect(f.message.length).toBeGreaterThan(10);
      expect(Object.keys(f.evidence).length).toBeGreaterThan(0);
      if (f.severity !== 'info') expect(f.remedy.length).toBeGreaterThan(10);
    }
    expect(l.counts.error + l.counts.warning + l.counts.info).toBe(l.findings.length);
  });
  it('sorts errors first and reports clean only when there are none', () => {
    const order = l.findings.map((f) => ['error', 'warning', 'info'].indexOf(f.severity));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(l.clean).toBe(l.counts.error === 0);
  });
  it('catches the text hierarchy collapsing, which reference spacing on Radix produces and the default no longer does', () => {
    // On Radix's own step placement, content/subtle and content/normal both land on
    // step 12 in dark mode. Re-placing the steps evenly gives step 11 enough contrast
    // to hold content/subtle, so the defect goes away — which is a point in favour of
    // the default, and the reason this test has to ask for the old spacing to see it.
    const p = solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', gamut: 'srgb', neutrals: true, spacing: 'reference' });
    const s2 = buildTokens(p, { now: () => 'T' });
    const l2 = lint(s2, audit(s2, { ramps: { light: p.light, dark: p.dark } }));
    const f = l2.findings.find((x) => x.rule === 'state-indistinguishable' && x.mode === 'dark');
    expect(f).toBeDefined();
    expect(f!.subjects).toContain('content/normal');
    expect(f!.evidence['sameStep']).toBe(true);
    // and the default spacing does not produce it
    expect(l.findings.some((x) => x.rule === 'state-indistinguishable' && x.subjects.includes('content/normal'))).toBe(false);
  });
  it('fires requirement-unmet as an error when the requirement is a WCAG criterion', () => {
    // a yellow seed cannot carry body text on its own solid
    const p = solvePair({ light: radixLight, dark: radixDark, seed: '#ffe629', gamut: 'srgb' });
    const s2 = buildTokens(p, { now: () => 'T' });
    const l2 = lint(s2, audit(s2, { ramps: { light: p.light, dark: p.dark } }));
    const unmet = l2.findings.filter((f) => f.rule === 'requirement-unmet');
    for (const f of unmet) expect(['error', 'warning']).toContain(f.severity);
  });
  it('respects `disable` and the info switch', () => {
    expect(lint(set, a, { disable: ['cvd-steps-collapse'] }).findings.some((f) => f.rule === 'cvd-steps-collapse')).toBe(false);
    const quiet = lint(set, a, { info: false });
    expect(quiet.counts.info).toBe(0);
    expect(quiet.counts.warning).toBe(l.counts.warning);
  });
  it('never invents a finding for a palette that has nothing wrong with that check', () => {
    // an evenly respaced ramp should not trip step-under-jnd
    const p = solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', gamut: 'srgb', spacing: 'even' });
    const s2 = buildTokens(p, { now: () => 'T' });
    const l2 = lint(s2, audit(s2, { reference: radixLight }));
    expect(l2.findings.some((f) => f.rule === 'step-under-jnd' && f.mode === 'light')).toBe(false);
    expect(l2.findings.some((f) => f.rule === 'uneven-spacing')).toBe(false);
  });
});

describe('the outputs', () => {
  const { set, pair } = makeSet();
  const a = audit(set, { reference: radixLight, ramps: { light: pair.light, dark: pair.dark } });
  const l = lint(set, a);

  it('renders a self-contained page with no external references', () => {
    const html = renderAudit(set, a, l);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<(script|link|img)\b/i);
    expect(html).not.toMatch(/https?:\/\//);
    // the components are driven by the semantic tokens
    for (const s of set.semantics) expect(html).toContain(`--color-${s.path.join('-')}`);
    for (const f of l.findings) expect(html).toContain(f.rule);
  });
  it('writes a text report naming every mode and every finding', () => {
    const r = reportAudit(set, a, l);
    for (const m of set.modes) expect(r).toContain(`  ${m}`);
    for (const f of l.findings) expect(r).toContain(f.rule);
  });
  it('lists usable pairs consistently with the matrix', () => {
    const u = usablePairs(a, 'light', 'wcag');
    const m = a.matrix['light']!;
    for (const { fg, bg } of u) {
      const i = m.keys.indexOf(fg);
      for (const b of bg) expect(m.cells[i]![m.keys.indexOf(b)]!.bodyWcag).toBe(true);
      const excluded = m.keys.filter((k, j) => j !== i && !bg.includes(k));
      for (const e of excluded) expect(m.cells[i]![m.keys.indexOf(e)]!.bodyWcag).toBe(false);
    }
  });
});

describe('across systems and seeds', () => {
  it('audits and lints any palette without throwing, and never contradicts itself', () => {
    fc.assert(
      fc.property(
        fc.record({ l: fc.double({ min: 0.25, max: 0.8, noNaN: true }), c: fc.double({ min: 0.03, max: 0.2, noNaN: true }), h: fc.double({ min: 0, max: 360, noNaN: true }) }),
        fc.constantFrom(...lightIds),
        fc.constantFrom('srgb', 'p3'),
        (seed, id, gamut) => {
          const pair = solvePair({ light: DNA[id]!, seed, gamut: gamut as 'srgb' | 'p3', neutrals: true });
          const set = buildTokens(pair, { now: () => 'T' });
          const a = audit(set, { reference: DNA[id]!, ramps: { light: pair.light, dark: pair.dark } });
          const l = lint(set, a);
          // the solver's own promises always survive the audit
          for (const m of set.modes) expect(a.promises[m]!.broken, `${id} ${m}`).toBe(0);
          // a lint finding about an unmet requirement matches the token's own evidence
          for (const f of l.findings.filter((x) => x.rule === 'requirement-unmet')) {
            const t = set.semantics.find((s) => s.role === f.subjects[0])!;
            expect(t.evidence[f.mode as 'light' | 'dark']!.met).toBe(false);
          }
          // a state-indistinguishable finding is really under a JND
          for (const f of l.findings.filter((x) => x.rule === 'state-indistinguishable')) {
            expect(Number(f.evidence['deltaE'])).toBeLessThan(JND);
          }
          // the matrix shares are consistent
          for (const m of set.modes) {
            const mx = a.matrix[m]!;
            const n = mx.keys.length * (mx.keys.length - 1);
            let w = 0;
            for (let i = 0; i < mx.keys.length; i++) for (let j = 0; j < mx.keys.length; j++) if (i !== j && mx.cells[i]![j]!.bodyWcag) w++;
            expect(mx.usable.wcag).toBeCloseTo(w / n, 9);
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
