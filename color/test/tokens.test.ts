import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solveRamp } from '../src/solver/index.ts';
import { solvePair } from '../src/solver/pair.ts';
import { ROLES, roleByName } from '../src/tokens/roles.ts';
import { assignRoles, solidStep, lightnessForForeground } from '../src/tokens/assign.ts';
import { buildTokens, stableId } from '../src/tokens/build.ts';
import { toDTCG, walkDTCG, resolveDTCG } from '../src/tokens/dtcg.ts';
import { toCSS, toTailwind, toFigma, toReport } from '../src/tokens/emit.ts';
import { wcag21Fast, apcaFast } from '../src/contrast/fast.ts';
import { deltaEOK, type Oklch } from '../src/color/oklch.ts';

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const DNA: Record<string, SystemDNA> = Object.fromEntries(ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]));
const lightIds = ids.filter((id) => DNA[id]!.mode === 'light');
const radixLight = DNA['radix-light']!;
const radixDark = DNA['radix-dark']!;

/** A family's own step 1 is the background Radix's role table assumes. */
function ownPage(dna: SystemDNA, fam: string): Oklch {
  const k = dna.families[fam]!.knots;
  return { l: k.L[0]!, c: k.C[0]!, h: k.h[0]! };
}
function assignFamily(dna: SystemDNA, fam: string) {
  const page = ownPage(dna, fam);
  const ramp = solveRamp({ dna, family: fam, hue: dna.families[fam]!.hueAtPeak, gamut: 'srgb', background: page, sibling: false, spacing: 'reference' });
  return { ramp, a: assignRoles(ramp, { family: fam }) };
}

describe('the role table', () => {
  it('is well-formed: every name parses, every chain reference resolves earlier, every requirement has a source', () => {
    const seen = new Set<string>();
    for (const r of ROLES) {
      expect(r.name.split('/').length, r.name).toBeGreaterThanOrEqual(2);
      expect(r.source.length, r.name).toBeGreaterThan(10);
      expect(r.description.length, r.name).toBeGreaterThan(10);
      if (r.against.kind === 'role') expect(seen, `${r.name} is measured against ${r.against.role}`).toContain(r.against.role);
      if (r.rule.kind === 'foreground') for (const c of r.rule.candidates) {
        if (c !== 'white' && c !== 'black') expect(seen, `${r.name} candidate ${c}`).toContain(c);
      }
      expect(seen.has(r.name), `duplicate role ${r.name}`).toBe(false);
      seen.add(r.name);
    }
    expect(roleByName('content/normal')).toBeDefined();
    expect(roleByName('nope')).toBeUndefined();
  });
  it('uses the brief\'s categories and states, and invents no others', () => {
    const cats = new Set(ROLES.map((r) => r.category));
    for (const c of cats) expect(['background', 'surface', 'border', 'content', 'icon', 'indicator']).toContain(c);
    const states = new Set(ROLES.map((r) => r.state));
    for (const s of states) expect(['normal', 'subtle', 'strong', 'hover', 'active', 'focus', 'selected', 'disabled']).toContain(s);
  });
  it('names exactly one calibrated requirement; the rest cite a published criterion', () => {
    const calibrated = ROLES.filter((r) => r.source.startsWith('calibrated:'));
    expect(calibrated.map((r) => r.name)).toEqual(['background/subtle']);
  });
});

describe('recovering Radix\'s documented roles from the contrast matrix', () => {
  const tally = (dna: SystemDNA) => {
    const out: Record<string, Record<string, number>> = {};
    for (const fam of Object.keys(dna.families)) {
      const { a } = assignFamily(dna, fam);
      for (const [name, r] of Object.entries(a.roles)) {
        out[name] ??= {};
        const k = r.stepKey ?? r.chosenFrom ?? r.literal ?? '—';
        out[name]![k] = (out[name]![k] ?? 0) + 1;
      }
    }
    return out;
  };
  const light = tally(radixLight);
  const dark = tally(radixDark);

  it('puts the surface and border chain on Radix\'s own steps 2–7, in all 25 families, in both modes', () => {
    const chain: [string, string][] = [
      ['background/subtle', '2'], ['surface/normal', '3'], ['surface/hover', '4'],
      ['surface/active', '5'], ['border/subtle', '6'], ['border/normal', '7'],
    ];
    for (const [role, step] of chain) {
      expect(light[role], `light ${role}`).toEqual({ [step]: 25 });
      expect(dark[role], `dark ${role}`).toEqual({ [step]: 25 });
    }
  });
  it('puts the solid and its hover on steps 9 and 10, and the text steps on 11 and 12', () => {
    expect(light['background/solid']).toEqual({ '9': 25 });
    expect(dark['background/solid']).toEqual({ '9': 25 });
    expect(light['background/solid/hover']).toEqual({ '10': 25 });
    expect(dark['background/solid/hover']).toEqual({ '10': 25 });
    expect(light['content/normal']).toEqual({ '12': 25 });
    expect(dark['content/normal']).toEqual({ '12': 25 });
    expect(dark['content/subtle']).toEqual({ '11': 25 });
    // in light mode step 11 misses 4.5:1 and Lc 60 together in three of the 25
    expect(light['content/subtle']!['11']).toBe(22);
    expect(light['content/subtle']!['12']).toBe(3);
  });
  it('disagrees with Radix about step 8, because step 8 does not meet SC 1.4.11 on a light background', () => {
    // the disagreement is the point: measure it rather than assume it
    for (const fam of Object.keys(radixLight.families)) {
      const k = radixLight.families[fam]!.knots;
      const cr = wcag21Fast({ l: k.L[7]!, c: k.C[7]!, h: k.h[7]! }, ownPage(radixLight, fam));
      expect(cr, `${fam} step 8`).toBeLessThan(3);
    }
    expect(Object.keys(light['border/strong']!)).not.toContain('8');
    for (const [step, n] of Object.entries(light['border/strong']!)) {
      expect(Number(step), `border/strong landed on ${step} ×${n}`).toBeGreaterThan(8);
    }
  });
  it('holds every requirement it reports as met', () => {
    for (const dna of [radixLight, radixDark]) {
      for (const fam of Object.keys(dna.families)) {
        const { a } = assignFamily(dna, fam);
        for (const r of Object.values(a.roles)) {
          const spec = roleByName(r.role)!;
          if (!r.met) continue;
          if (spec.rule.kind === 'contrast') {
            if (spec.rule.wcag !== undefined) expect(r.measured.wcag, `${fam} ${r.role}`).toBeGreaterThanOrEqual(spec.rule.wcag - 1e-9);
            if (spec.rule.apca !== undefined) expect(r.measured.apca, `${fam} ${r.role}`).toBeGreaterThanOrEqual(spec.rule.apca - 1e-9);
          }
          if (spec.rule.kind === 'separation') expect(r.measured.deltaE, `${fam} ${r.role}`).toBeGreaterThanOrEqual(spec.rule.minDeltaE - 1e-9);
          if (spec.rule.kind === 'foreground') {
            expect(r.measured.wcag, `${fam} ${r.role}`).toBeGreaterThanOrEqual(spec.rule.wcag - 1e-9);
            expect(r.measured.apca, `${fam} ${r.role}`).toBeGreaterThanOrEqual(spec.rule.apca - 1e-9);
          }
        }
      }
    }
  });
  it('never gives a fill step to text', () => {
    for (const dna of [radixLight, radixDark]) {
      for (const fam of Object.keys(dna.families)) {
        const { a } = assignFamily(dna, fam);
        const fills = new Set([a.roles['background/solid']!.stepKey, a.roles['background/solid/hover']!.stepKey]);
        for (const name of ['content/subtle', 'content/normal', 'content/disabled']) {
          expect(fills.has(a.roles[name]!.stepKey), `${fam} ${name} took a fill step`).toBe(false);
        }
      }
    }
  });
});

describe('the foreground on a fill, where the two contrast models part company', () => {
  it('reports the disagreement on Radix blue-9 with both numbers', () => {
    const { a } = assignFamily(radixLight, 'blue');
    const r = a.roles['content/on-solid']!;
    expect(r.met).toBe(false);
    expect(r.disagreement).toBeDefined();
    expect(r.disagreement!.wcag.candidate).toBe('black');
    expect(r.disagreement!.apca.candidate).toBe('white');
    expect(r.disagreement!.wcag.value).toBeGreaterThan(4.5);
    expect(r.disagreement!.apca.value).toBeGreaterThan(60);
    // and neither satisfies both
    const solid = a.roles['background/solid']!.color;
    for (const c of [{ l: 1, c: 0, h: 0 }, { l: 0, c: 0, h: 0 }] as Oklch[]) {
      expect(wcag21Fast(c, solid) >= 4.5 && Math.abs(apcaFast(c, solid)) >= 60).toBe(false);
    }
  });
  it('says how far the fill would have to move, and the answer works', () => {
    const { a } = assignFamily(radixLight, 'blue');
    const r = a.roles['content/on-solid']!;
    const solid = a.roles['background/solid']!.color;
    expect(r.fillWould).not.toBeNull();
    const moved: Oklch = { ...solid, l: r.fillWould! };
    expect(wcag21Fast(r.color, moved)).toBeGreaterThanOrEqual(4.5 - 1e-6);
    expect(Math.abs(apcaFast(r.color, moved))).toBeGreaterThanOrEqual(60 - 1e-6);
  });
  it('lightnessForForeground returns the nearer solution, or null when there is none', () => {
    const fill: Oklch = { l: 0.6, c: 0.15, h: 250 };
    const L = lightnessForForeground({ l: 1, c: 0, h: 0 }, fill, 4.5, 60);
    expect(L).not.toBeNull();
    expect(L!).toBeLessThan(fill.l); // white needs a darker fill
    expect(lightnessForForeground({ l: 0.6, c: 0, h: 0 }, fill, 21, 106)).toBeNull();
  });
  it('takes white on a dark brand solid without complaint', () => {
    const p = solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', gamut: 'srgb' });
    const a = assignRoles(p.light);
    expect(a.roles['content/on-solid']!.chosenFrom).toBe('white');
    expect(a.roles['content/on-solid']!.met).toBe(true);
  });
});

describe('the brand fill', () => {
  it('is the seed when there is one, the documented key step when there is not, and the chroma peak otherwise', () => {
    const seeded = solveRamp({ dna: radixLight, seed: '#7c3aed', gamut: 'srgb' });
    expect(solidStep(seeded).rule).toBe('seed');
    const keyed = solveRamp({ dna: DNA['carbon']!, family: 'blue', hue: DNA['carbon']!.families['blue']!.hueAtPeak, gamut: 'srgb' });
    expect(solidStep(keyed).rule).toBe('key-step');
    expect(keyed.steps[solidStep(keyed).stepIndex]!.key).toBe(DNA['carbon']!.steps.keyStep.key);
    const unkeyed = solveRamp({ dna: DNA['spectrum']!, family: 'blue', hue: DNA['spectrum']!.families['blue']!.hueAtPeak, gamut: 'srgb' });
    expect(solidStep(unkeyed).rule).toBe('peak-chroma');
  });
});

describe('stable IDs', () => {
  it('are deterministic, mode-independent and distinct', () => {
    expect(stableId('primitive', 'brand', '9')).toBe(stableId('primitive', 'brand', '9'));
    expect(stableId('primitive', 'brand', '9')).not.toBe(stableId('primitive', 'brand', '10'));
    expect(stableId('semantic', 'content/normal')).not.toBe(stableId('primitive', 'content/normal'));
    expect(stableId('x')).toHaveLength(13);
  });
  it('do not collide across a whole token set', () => {
    const p = solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', gamut: 'srgb', neutrals: true });
    const set = buildTokens(p, { now: () => 'T' });
    const all = [...set.primitives.map((t) => t.id), ...set.semantics.map((t) => t.id)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('the token set and its outputs', () => {
  const pair = solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', gamut: 'srgb', neutrals: true });
  const set = buildTokens(pair, { name: 'Test', now: () => '2026-01-01T00:00:00.000Z' });

  it('gives every token a value in both modes, and the seed the same value in both', () => {
    for (const t of [...set.primitives, ...set.semantics]) {
      for (const m of set.modes) expect(t.values[m], `${'role' in t ? t.role : `${t.family}/${t.step}`} ${m}`).toBeDefined();
    }
    const seed = set.primitives.find((p) => p.evidence['light']?.isSeed)!;
    expect(seed.values['light'].hex).toBe(seed.values['dark'].hex);
  });

  it('is deterministic', () => {
    const again = buildTokens(solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', gamut: 'srgb', neutrals: true }), { name: 'Test', now: () => '2026-01-01T00:00:00.000Z' });
    expect(JSON.stringify(toDTCG(again))).toBe(JSON.stringify(toDTCG(set)));
  });

  it('emits DTCG whose every alias resolves and whose hex matches the emitted colour', () => {
    const doc = toDTCG(set);
    const resolved = resolveDTCG(doc);
    expect(resolved.size).toBeGreaterThan(0);
    const tokens = walkDTCG(doc);
    // aliases only point at primitives of the same mode
    for (const { path, token } of tokens) {
      if (typeof token.$value !== 'string') continue;
      const target = token.$value.replace(/^\{|\}$/g, '');
      expect(target.startsWith(`color.${path[1]}.`), `${path.join('.')} → ${target}`).toBe(true);
      expect(resolved.has(target)).toBe(true);
    }
    // the canonical value round-trips as OKLCH and carries an sRGB hex
    for (const v of resolved.values()) {
      expect(v.colorSpace).toBe('oklch');
      expect(v.components).toHaveLength(3);
      expect(v.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });

  it('keys the DTCG primitives by the reference\'s own step numbering', () => {
    const doc = toDTCG(set) as unknown as { color: { light: { brand: Record<string, unknown> } } };
    expect(Object.keys(doc.color.light.brand)).toEqual(radixLight.steps.keys);
  });

  it('emits CSS whose every semantic var points at a var it also defines', () => {
    const css = toCSS(set);
    const defined = new Set([...css.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]!));
    for (const m of css.matchAll(/var\((--[\w-]+)\)/g)) expect(defined, `${m[1]} used but not defined`).toContain(m[1]!);
    expect(css).toContain(':root {');
    expect(css).toContain('.dark, [data-theme="dark"] {');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('oklch(');
  });

  it('puts the sRGB sibling first and the wide values behind a gamut query for a P3 set', () => {
    const p3 = buildTokens(solvePair({ light: DNA['tailwind-v4']!, seed: '#7c3aed', gamut: 'p3' }), { now: () => 'T' });
    const css = toCSS(p3);
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    expect(root).toMatch(/#[0-9a-f]{6}/);
    expect(css).toContain('@supports (color: color(display-p3 0 0 0))');
    expect(css).toContain('(color-gamut: p3)');
  });

  it('emits a Tailwind v4 theme with a dark override of the same properties', () => {
    const tw = toTailwind(set);
    expect(tw).toContain('@theme {');
    const props = [...tw.matchAll(/^\s*(--color-[\w-]+):/gm)].map((m) => m[1]!);
    const themeProps = new Set(props.slice(0, tw.slice(0, tw.indexOf('}')).split('\n').length));
    expect(themeProps.size).toBeGreaterThan(0);
    expect(tw).toContain('.dark, [data-theme="dark"] {');
    for (const s of set.semantics) expect(tw).toContain(`--color-${s.path.join('-')}:`);
  });

  it('emits Figma variables in sRGB, keyed by id, with a value per mode and sensible scopes', () => {
    const fig = toFigma(set);
    expect(fig.collections).toHaveLength(2);
    for (const col of fig.collections) {
      expect(col.modes).toEqual(['Light', 'Dark']);
      for (const v of col.variables) {
        expect(v.resolvedType).toBe('COLOR');
        expect(v.id).toHaveLength(13);
        expect(Object.keys(v.valuesByMode)).toEqual(['Light', 'Dark']);
        for (const c of Object.values(v.valuesByMode)) {
          for (const ch of [c.r, c.g, c.b, c.a]) { expect(ch).toBeGreaterThanOrEqual(0); expect(ch).toBeLessThanOrEqual(1); }
        }
      }
    }
    const semantic = fig.collections[1]!;
    expect(semantic.variables.find((v) => v.name === 'content/normal')!.scopes).toEqual(['TEXT_FILL']);
    expect(semantic.variables.find((v) => v.name === 'border/normal')!.scopes).toEqual(['STROKE_COLOR']);
    // ids match the token set, so a plugin can follow a rename
    const byId = new Map(set.semantics.map((s) => [s.id, s.role]));
    for (const v of semantic.variables) expect(byId.get(v.id)).toBe(v.name);
  });

  it('carries the wide-gamut value and its ΔEOK into Figma for a P3 set', () => {
    const p3 = buildTokens(solvePair({ light: DNA['tailwind-v4']!, seed: '#7c3aed', gamut: 'p3' }), { now: () => 'T' });
    const fig = toFigma(p3);
    const v = fig.collections[0]!.variables.find((x) => x.wideGamut)!;
    expect(v.wideGamut!['Light']!.value).toContain('display-p3');
    expect(v.wideGamut!['Light']!.deltaEOK).toBeGreaterThanOrEqual(0);
    expect(fig.note).toContain('sRGB siblings');
  });

  it('writes a report that names every role and every unmet requirement', () => {
    const r = toReport(set);
    for (const s of set.semantics) expect(r).toContain(s.role);
    for (const s of set.semantics) {
      for (const m of set.modes) if (s.evidence[m] && !s.evidence[m]!.met) expect(r).toContain(s.evidence[m]!.shortfall!);
    }
  });
});

describe('across systems and seeds', () => {
  it('builds a complete, self-consistent token set for any seed on any reference', () => {
    fc.assert(
      fc.property(
        fc.record({ l: fc.double({ min: 0.25, max: 0.8, noNaN: true }), c: fc.double({ min: 0.03, max: 0.2, noNaN: true }), h: fc.double({ min: 0, max: 360, noNaN: true }) }),
        fc.constantFrom(...lightIds),
        fc.constantFrom('srgb', 'p3'),
        (seed, id, gamut) => {
          const set = buildTokens(solvePair({ light: DNA[id]!, seed, gamut: gamut as 'srgb' | 'p3', neutrals: true }), { now: () => 'T' });
          expect(set.semantics).toHaveLength(ROLES.length);
          const doc = toDTCG(set);
          const resolved = resolveDTCG(doc); // throws on a dangling or circular alias
          expect(resolved.size).toBeGreaterThan(set.primitives.length);
          // every met requirement really holds
          for (const s of set.semantics) {
            const spec = roleByName(s.role)!;
            for (const m of set.modes) {
              const e = s.evidence[m];
              if (!e?.met) continue;
              if (spec.rule.kind === 'contrast') {
                if (spec.rule.wcag !== undefined) expect(e.against.wcag).toBeGreaterThanOrEqual(spec.rule.wcag - 1e-9);
                if (spec.rule.apca !== undefined) expect(e.against.apca).toBeGreaterThanOrEqual(spec.rule.apca - 1e-9);
              }
              if (spec.rule.kind === 'separation') expect(e.against.deltaE).toBeGreaterThanOrEqual(spec.rule.minDeltaE - 1e-9);
            }
          }
          // the surface chain never runs backwards
          const chain = ['background/page', 'background/subtle', 'surface/normal', 'surface/hover', 'surface/active', 'border/subtle', 'border/normal'];
          for (const m of set.modes) {
            const bg = set.backgrounds[m]!;
            let prev = 0;
            for (const name of chain) {
              const t = set.semantics.find((s) => s.role === name)!;
              const d = deltaEOK(t.values[m].oklch, bg);
              expect(d, `${id} ${m} ${name}`).toBeGreaterThanOrEqual(prev - 1e-9);
              prev = d;
            }
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
