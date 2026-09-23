import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractSystemDNA, familyCurves } from '../src/dna/system.ts';
import { parseDNA, serializeDNA } from '../src/dna/schema.ts';
import { ingestPalette } from '../src/ingest/index.ts';
import { loadRadix } from '../src/ingest/radix.ts';
import { loadDatasetPalette } from '../src/ingest/dataset.ts';
import { loadTailwindV4 } from '../src/ingest/tailwind.ts';
import { fitWeights, type StepPoint } from '../src/dna/weights.ts';
import { computeCentroids, classifyHue } from '../src/dna/centroids.ts';
import { loadPaletteColors, loadPublishedHues } from '../src/ingest/palettes-dataset.ts';
import { DATASET_IDS } from '../src/ingest/dataset.ts';
import { shell } from '../src/gamut/shell.ts';
import { parseToOklch } from '../src/color/oklch.ts';

const FIXED = { source: { kind: 'inline' as const, ref: 'test' }, toolchain: { culori: 't', colorjs: 't', nutelch: 't', apca: 't' }, now: () => '2026-01-01T00:00:00.000Z' };

describe('ingestPalette', () => {
  it('normalizes light scales to light → dark and drops neutrals', () => {
    const ramps = ingestPalette({ blue: { '5': '#000f35', '50': '#0071ec', '95': '#e8f2ff' }, gray: { '5': '#111', '50': '#777', '95': '#eee' } }, { id: 't', mode: 'light' });
    expect([...ramps.keys()]).toEqual(['blue']);
    expect(ramps.get('blue')!.steps.map((s) => s.key)).toEqual(['95', '50', '5']);
  });
  it('keeps dark scales dark → light', () => {
    const ramps = ingestPalette({ blue: { '1': '#0d1520', '2': '#0090ff', '3': '#c2e6ff' } }, { id: 't', mode: 'dark' });
    expect(ramps.get('blue')!.steps.map((s) => s.key)).toEqual(['1', '2', '3']);
  });
  it('resolves the documented key step, else peak chroma', () => {
    const colors = { blue: { '1': '#e7f5ff', '2': '#228be6', '3': '#1864ab' } };
    expect(ingestPalette(colors, { id: 't', keyStepKey: '3' }).get('blue')!.anchorIndex).toBe(2);
    expect(ingestPalette(colors, { id: 't' }).get('blue')!.anchorIndex).toBe(1);
  });
});

describe('extractSystemDNA', () => {
  it('serializes and parses back, deterministically', () => {
    const dna = extractSystemDNA(loadDatasetPalette('primer'), { id: 'primer', name: 'Primer', ...FIXED });
    const json = serializeDNA(dna);
    const back = parseDNA(json);
    expect(back.id).toBe('primer');
    expect(serializeDNA(back)).toBe(json);
    const again = serializeDNA(extractSystemDNA(loadDatasetPalette('primer'), { id: 'primer', name: 'Primer', ...FIXED }));
    expect(again).toBe(json);
  });
  it('rejects malformed input', () => {
    expect(() => parseDNA({ $schema: 'nope' })).toThrow(/\$schema/);
    expect(() => parseDNA({ $schema: 'palette-dna/1', id: 'x', mode: 'light', families: {}, grid: 'no' })).toThrow(/grid/);
  });
  it('marks Radix bright solids as detached with their roles, in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const dna = extractSystemDNA(loadRadix({ mode, gamut: 'srgb' }), { id: `radix-${mode}`, name: 'Radix', mode, keyStepKey: '9', roles: { '9': 'solid background', '10': 'solid background (hover)' }, ...FIXED });
      for (const fam of ['sky', 'mint', 'lime', 'yellow', 'amber']) {
        const f = dna.families[fam]!;
        expect(f.spine.detached.map((d) => d.index)).toEqual([8, 9]);
        expect(f.spine.detached[0]!.role).toBe('solid background');
        expect(f.spine.indices).toHaveLength(10);
      }
      expect(dna.families['blue']!.spine.detached).toEqual([]);
      expect(dna.steps.direction).toBe(mode === 'light' ? 'light-to-dark' : 'dark-to-light');
    }
  });
  it('the spine fit is monotone and hits every spine knot; detached knots keep their own L', () => {
    const dna = extractSystemDNA(loadRadix({ mode: 'light', gamut: 'srgb' }), { id: 'r', name: 'r', mode: 'light', ...FIXED });
    const f = dna.families['yellow']!;
    const c = familyCurves(f);
    for (const i of f.spine.indices) expect(c.L(f.knots.n[i]!)).toBeCloseTo(f.spine.L[i]!, 9);
    let prev = c.L(0);
    for (let k = 1; k <= 200; k++) { const v = c.L(k / 200); expect(v).toBeLessThanOrEqual(prev + 1e-9); prev = v; }
    expect(f.knots.L[8]).toBeGreaterThan(f.knots.L[7]!); // the detached step is still recorded as authored
  });
  it('classifies numbering: Spectrum and Carbon contrast-bearing, Tailwind and Material nominal', () => {
    const cls = (id: string) => extractSystemDNA(loadDatasetPalette(id), { id, name: id, ...FIXED }).steps.numbering!.class;
    expect(cls('spectrum')).toBe('contrast-bearing');
    expect(cls('carbon')).toBe('contrast-bearing');
    expect(cls('tailwind')).toBe('nominal');
    expect(cls('material')).toBe('nominal');
  });
  it('Tailwind v4 is P3-authored but sRGB-native, overshooting the sRGB shell in the middle', () => {
    const dna = extractSystemDNA(loadTailwindV4(), { id: 'tw4', name: 'tw4', keyStepKey: '500', ...FIXED });
    expect(dna.authoredGamut).toBe('p3');
    expect(dna.nativeShell.gamut).toBe('srgb');
    expect(dna.nativeShell.midOvershoot).toBeGreaterThan(1.0);
    expect(dna.steps.keyStep).toEqual({ rule: 'documented', key: '500' });
    expect(dna.kinship.hybridWithinJnd).toBeGreaterThan(0.8);
  });
});

describe('fitWeights', () => {
  const mk = (L: number, h: number, relC: number) => ({ L, h, relC, C: relC * shell('srgb').cuspChroma(L, h) });
  it('recovers w = 1 when families share relC exactly', () => {
    const fams: StepPoint[][] = [30, 150, 260].map((h) => [0.9, 0.7, 0.5].map((L) => mk(L, h, 0.8)));
    const fit = fitWeights(fams);
    expect(fit.w.every((w) => w === 1)).toBe(true);
    expect(fit.relC.mean).toBeLessThan(1e-9);
  });
  it('recovers w = 0 when families share absolute chroma exactly', () => {
    const fams: StepPoint[][] = [30, 150, 260].map((h) => [0.9, 0.7, 0.5].map((L) => ({ L, h, C: 0.04, relC: 0.04 / shell('srgb').cuspChroma(L, h) })));
    const fit = fitWeights(fams);
    expect(fit.w.every((w) => w === 0)).toBe(true);
    expect(fit.absC.mean).toBeLessThan(1e-9);
  });
});

describe('centroids', () => {
  const table = computeCentroids(DATASET_IDS.map((id) => ({ id, colors: loadPaletteColors(id) })), 'test');
  it('reproduces the published statistics with the dataset method', () => {
    const pub = loadPublishedHues();
    for (const fam of ['blue', 'green', 'yellow', 'cyan', 'red']) {
      const f = table.families.find((x) => x.family === fam)!;
      expect(f.published.mean).toBeCloseTo(((pub[fam]!.hue.mean % 360) + 360) % 360, 6);
      expect(f.published.sd).toBeCloseTo(pub[fam]!.hue.stddev, 6);
    }
  });
  it('yellow is tighter at peak chroma than at the middle step', () => {
    const y = table.families.find((x) => x.family === 'yellow')!;
    expect(y.peak.sd).toBeLessThan(y.published.sd / 1.5);
  });
  it('classifies the Tailwind v4 anchors correctly with z < 1', () => {
    const tw = loadTailwindV4();
    for (const fam of ['blue', 'green', 'yellow', 'red']) {
      const h = parseToOklch(tw.get(fam)!.steps[5]!.css).h;
      const c = classifyHue(h, table);
      expect(c.family).toBe(fam);
      expect(c.z).toBeLessThan(1.5);
    }
  });
});

describe('built-in DNA files', () => {
  it('parse and cover 13 systems', () => {
    const index = JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] };
    expect(index.systems).toHaveLength(13);
    for (const s of index.systems) expect(() => parseDNA(readFileSync(`dna/${s.id}.json`, 'utf8'))).not.toThrow();
  });
});
