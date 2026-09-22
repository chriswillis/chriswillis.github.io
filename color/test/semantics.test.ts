import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  deriveSemanticHues, conventionBands, separation,
  SEMANTIC_ROLES, FIVE_FAMILY_SEPARATION, DEFAULT_SIGMAS,
} from '../src/tokens/semantics.ts';
import { palette, loadDNA, loadCentroids } from '../src/palette.ts';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solveRamp } from '../src/solver/index.ts';
import { hueDelta, type Oklch } from '../src/color/oklch.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));
const lightIds = ids.filter((id) => DNA[id]!.mode === 'light');
const centroids = loadCentroids();
const tw = loadDNA('tailwind-v4');

describe('the hue windows come from the corpus, not from taste', () => {
  const bands = conventionBands(centroids);

  it('is narrow where the references agree and wide where they do not', () => {
    // red: 26.1° ± 2.4 over eleven systems. warning is a union of orange, amber
    // and yellow, which genuinely disagree, so its window is many times wider.
    expect(bands['danger']!.hi - bands['danger']!.lo).toBeLessThan(15);
    expect(bands['success']!.hi - bands['success']!.lo).toBeLessThan(25);
    expect(bands['info']!.hi - bands['info']!.lo).toBeLessThan(25);
    expect(bands['warning']!.hi - bands['warning']!.lo).toBeGreaterThan(50);
  });

  it('centres each role on its best-attested family, not the middle of a union', () => {
    // warning spans orange 48.7 to yellow 93.0; its centre is orange's own mean,
    // because orange is attested on eleven systems against amber's three, and the
    // midpoint of the union lands on a hue no system actually publishes
    const w = bands['warning']!;
    const best = w.from.reduce((a, b) => (b.n > a.n ? b : a));
    expect(w.centre).toBeCloseTo(best.mean, 6);
    expect(w.centre).not.toBeCloseTo((w.lo + w.hi) / 2, 1);
  });

  it('widens with sigmas and records how many it used', () => {
    const wide = conventionBands(centroids, SEMANTIC_ROLES, 4);
    expect(wide['danger']!.hi - wide['danger']!.lo).toBeGreaterThan(bands['danger']!.hi - bands['danger']!.lo);
    expect(bands['danger']!.sigmas).toBe(DEFAULT_SIGMAS);
  });

  it('skips a role whose families the centroid table does not know', () => {
    const b = conventionBands(centroids, [{ name: 'nonsense', families: ['chartreuse'] }]);
    expect(Object.keys(b)).toEqual([]);
  });
});

describe('the derivation', () => {
  it('never lands outside the window convention allows', () => {
    for (let h = 0; h < 360; h += 45) {
      const d = deriveSemanticHues({ dna: tw, centroids, brandHue: h, gamut: 'srgb' });
      for (const [role, hue] of Object.entries(d.hues)) {
        const b = d.bands[role]!;
        const inside = Math.abs(hueDelta(hue, (b.lo + b.hi) / 2)) <= (b.hi - b.lo) / 2 + 1e-6;
        expect(inside, `${role} at ${hue} outside [${b.lo}, ${b.hi}]`).toBe(true);
      }
    }
  });

  it('never scores worse than the conventional hues it starts from', () => {
    for (let h = 0; h < 360; h += 30) {
      const d = deriveSemanticHues({ dna: tw, centroids, brandHue: h, gamut: 'srgb' });
      expect(d.gain, `brand ${h}°`).toBeGreaterThanOrEqual(-1e-9);
      expect(d.achieved.min).toBeGreaterThanOrEqual(d.baseline.min - 1e-9);
    }
  });

  it('is deterministic', () => {
    const a = deriveSemanticHues({ dna: tw, centroids, brandHue: 264, gamut: 'srgb' });
    const b = deriveSemanticHues({ dna: tw, centroids, brandHue: 264, gamut: 'srgb' });
    expect(a.hues).toEqual(b.hues);
    expect(a.achieved.min).toBe(b.achieved.min);
  });

  // Five families against five. Scoring our five against a reference's full 9–25
  // would be rigged: more families means more chances at a close pair. Each
  // reference is scored at the colours it actually publishes — its own red,
  // orange/amber/yellow, green and blue, per-family curves and all — while the
  // stand-in brand is solved from the interpolated curve, because that is what
  // `palette()` would do with a hue nobody authored.
  const stepsOf = (d: SystemDNA, hue: number, family?: string): Oklch[] => {
    const r = solveRamp({ dna: d, hue, gamut: 'srgb', sibling: false, ...(family ? { family } : {}) });
    const mid = Math.floor(r.steps.length / 2);
    return [mid - 2, mid, mid + 2].filter((i) => i >= 0 && i < r.steps.length).map((i) => r.steps[i]!.color.oklch);
  };
  const WANT = [['red'], ['orange', 'amber', 'yellow'], ['green'], ['blue']];
  const likeForLike = lightIds.flatMap((id) => {
    const d = DNA[id]!;
    const picked: Record<string, Oklch[]> = {};
    for (const alts of WANT) {
      const f = alts.map((a) => d.families[a]).find(Boolean);
      if (f) picked[f.family] = stepsOf(d, f.hueAtPeak, f.family);
    }
    if (Object.keys(picked).length < 4) return [];
    let brandHue = 300, far = -1;
    for (const f of Object.values(d.families)) {
      if (picked[f.family]) continue;
      const dd = Math.min(...Object.keys(picked).map((k) => Math.abs(hueDelta(f.hueAtPeak, d.families[k]!.hueAtPeak))));
      if (dd > far) { far = dd; brandHue = f.hueAtPeak; }
    }
    picked['brandish'] = stepsOf(d, brandHue);
    return [{ id, theirs: separation(picked).min, ours: deriveSemanticHues({ dna: d, centroids, brandHue, gamut: 'srgb' }).achieved.min }];
  });

  it('beats the references at their own game, like for like', () => {
    expect(likeForLike.length).toBeGreaterThanOrEqual(10);
    const lost = likeForLike.filter((r) => r.ours <= r.theirs);
    expect(lost.map((r) => `${r.id} ${r.ours.toFixed(4)} <= ${r.theirs.toFixed(4)}`)).toEqual([]);
  });

  it('keeps the shipped corpus band in step with what the corpus actually measures', () => {
    // FIVE_FAMILY_SEPARATION is what the warning threshold is made of, so a
    // silent drift between the constant and the corpus would quietly change how
    // often the palette complains. `spike/phase7-semantics.ts` prints the
    // literal; this fails when someone forgets to paste it back.
    const q = (x: number[], p: number) => { const s = x.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]!; };
    const theirs = likeForLike.map((r) => r.theirs);
    const measured = { p10: q(theirs, 0.1), median: q(theirs, 0.5), p90: q(theirs, 0.9), min: Math.min(...theirs), max: Math.max(...theirs) };
    for (const k of ['p10', 'median', 'p90', 'min', 'max'] as const) {
      expect(FIVE_FAMILY_SEPARATION[k], `${k}: shipped ${FIVE_FAMILY_SEPARATION[k]}, measured ${measured[k].toFixed(4)} — rerun spike/phase7-semantics.ts`).toBeCloseTo(measured[k], 4);
    }
  });

  it('gains more from the leximin tie-break than from a finer grid', () => {
    // The objective is a min over pairs, which is flat: while one pair binds,
    // moving any other family changes nothing and single-coordinate descent
    // stops. Doubling the grid does not help, because the plateau is the
    // constraint — comparing the whole sorted vector is what does.
    const coarse = deriveSemanticHues({ dna: tw, centroids, brandHue: 26, gamut: 'srgb' });
    const fine = deriveSemanticHues({ dna: tw, centroids, brandHue: 26, gamut: 'srgb', resolution: 25, sweeps: 6 });
    expect(fine.achieved.min).toBeCloseTo(coarse.achieved.min, 3);
    expect(coarse.achieved.profile[0]).toBe(coarse.achieved.min);
    expect([...coarse.achieved.profile].sort((a, b) => a - b)).toEqual(coarse.achieved.profile);
  });

  it('positions itself against the corpus rather than against a made-up threshold', () => {
    const d = deriveSemanticHues({ dna: tw, centroids, brandHue: 300, gamut: 'srgb' });
    expect(d.corpus.verdict).toBe('better than most');
    expect(d.achieved.min).toBeGreaterThan(FIVE_FAMILY_SEPARATION.median);
  });
});

describe('the warning discriminates', () => {
  it('does not fire on most brand hues', () => {
    // "the brand is in the closest pair" is true 83% of the time and says
    // nothing; the warning is about the separation being poor, not about who is
    // in the pair, and has to stay rare enough to be worth reading
    let fired = 0, n = 0;
    for (let h = 0; h < 360; h += 15) {
      const d = deriveSemanticHues({ dna: tw, centroids, brandHue: h, gamut: 'srgb' });
      n++;
      if (d.warnings.some((w) => w.includes('below the'))) fired++;
    }
    expect(n).toBeGreaterThan(20);
    expect(fired / n).toBeLessThan(0.25);
  });

  it('does fire when the brand sits on a semantic hue', () => {
    // 30° is four degrees off the corpus red. Nothing inside the danger window
    // gets clear of it, which is the case the report exists for.
    const d = deriveSemanticHues({ dna: tw, centroids, brandHue: 30, gamut: 'srgb' });
    expect(d.achieved.min).toBeLessThan(FIVE_FAMILY_SEPARATION.p10);
    expect(d.warnings.join(' ')).toMatch(/below the/);
    expect(d.brandCollision?.role).toBe('danger');
  });

  it('reports a role at its band edge as data, because that is where the optimum lives', () => {
    // A maximin optimum over a box is usually on the boundary. Measured over 144
    // cases at least one role sits there 93% of the time, 2.2 roles per case —
    // so this was a warning, and warning nine times in ten described the search
    // rather than the palette.
    let cases = 0, withEdge = 0, edgeWarnings = 0;
    for (const id of lightIds) {
      for (let h = 0; h < 360; h += 60) {
        const d = deriveSemanticHues({ dna: DNA[id]!, centroids, brandHue: h, gamut: 'srgb' });
        cases++;
        if (d.atBandEdge.length) withEdge++;
        edgeWarnings += d.warnings.filter((w) => /edge|band|window/i.test(w) && !w.includes('below the')).length;
        for (const role of d.atBandEdge) {
          const b = d.bands[role]!;
          const hue = d.hues[role]!;
          expect(Math.min(Math.abs(hueDelta(hue, b.lo)), Math.abs(hueDelta(hue, b.hi)))).toBeLessThan(0.05);
        }
      }
    }
    expect(withEdge / cases).toBeGreaterThan(0.5);
    expect(edgeWarnings).toBe(0);
  });

  it('does not offer a remedy the measurement says is worthless', () => {
    // On exactly the cases that trigger the warning, doubling the windows
    // (sigmas 2 → 4) is worth a median 0.0036 — under a fifth of a JND — and 8
    // of 19 stay below p10 anyway. Suggesting it would trade the meaning of the
    // word "danger" for nothing.
    const d = deriveSemanticHues({ dna: tw, centroids, brandHue: 30, gamut: 'srgb' });
    const wide = deriveSemanticHues({ dna: tw, centroids, brandHue: 30, gamut: 'srgb', sigmas: 4 });
    expect(wide.achieved.min - d.achieved.min).toBeLessThan(0.02);
    const w = d.warnings.join(' ');
    expect(w).not.toMatch(/`sigmas`/);                  // never named as the fix
    expect(w).toMatch(/hue has nothing left to give/i); // says why instead
    expect(w).toMatch(/step, an icon, a label/);        // and what to do instead
  });

  it('reports the brand collision as data whether or not it warns', () => {
    const clear = deriveSemanticHues({ dna: tw, centroids, brandHue: 90, gamut: 'srgb' });
    expect(clear.warnings.some((w) => w.includes('below the'))).toBe(false);
    // the field is populated or null on its own terms, independent of severity
    expect(clear.brandCollision === null || typeof clear.brandCollision.deltaHue === 'number').toBe(true);
  });
});

describe('palette({ semantics: true })', () => {
  it('emits the four semantic families as primitives', () => {
    const p = palette({ seed: '#7c3aed', semantics: true, gamut: 'srgb' });
    const fams = new Set(p.tokens.primitives.map((t) => t.family));
    for (const r of SEMANTIC_ROLES) expect(fams.has(r.name), r.name).toBe(true);
    expect(p.semantics).not.toBeNull();
  });

  it('lets a named seed win over a derived hue', () => {
    const p = palette({ seed: '#7c3aed', semantics: true, families: { danger: '#b91c1c' }, gamut: 'srgb' });
    // the named one was seeded, so the ramp carries a seed; a derived one does not
    expect(p.families['danger']!.light.seed).not.toBeNull();
    expect(p.families['success']!.light.seed).toBeNull();
  });

  it('is off by default', () => {
    const p = palette({ seed: '#7c3aed', gamut: 'srgb' });
    expect(p.semantics).toBeNull();
    expect(Object.keys(p.families)).toEqual([]);
  });

  it('still audits and lints without errors on the default reference', () => {
    const p = palette({ seed: '#7c3aed', semantics: true, gamut: 'srgb' });
    expect(p.lint.counts.error).toBe(0);
    // and the extra families make the between-family CVD check meaningful
    expect(p.audit.cvd.light?.standing).not.toBeNull();
  });
});
