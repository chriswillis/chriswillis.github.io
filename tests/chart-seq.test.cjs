// Run: node --test tests/chart-seq.test.cjs
// Chart colors for Color Ramp v2: categorical sequences, and sequential and diverging scales.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const c = vm.createContext({});
for (const f of ['palettes', 'engine', 'builder', 'chart-seq']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/palette-dna', f + '.js'), 'utf8'), c);
vm.runInContext('this.P = PALETTES; this.E = Engine; this.CS = ChartSeq.make(Engine, PaletteBuilder); this.K = ChartSeq;', c);
const { P, E, CS, K } = c;
const HEX = /^#[0-9A-F]{6}$/;

function setup(palId, hex, dark) {
  const pal = P.find(p => p.id === palId), M = E.build(pal, pal.neutral, pal.gamut), lab = E.parse(hex), seed = M.seedMap(lab);
  const g = M.genAnchors([{ lab, map: seed }], {});
  const brand = { id: 'brand', name: 'brand', brand: true, steps: g.map(x => String(x.step)), labs: g.map(x => [x.L, x.a, x.b]), anchor: Math.max(0, g.findIndex(x => x.anchor)) };
  return { brand, pal, M, seed, bg: E.parse(dark ? pal.poles.dark : pal.poles.light), dark, tone: Math.min(1, seed.s || 1) };
}
const names = r => r.seq.map(x => x.c.name);

test('categorical: the brand leads, every color is a valid hex, and the count is honored', () => {
  for (const id of ['tailwind4', 'flexoki', 'radix', 'meridian-light']) {
    const r = CS.plan({ ...setup(id, '#9D58BA', false), mark: 'bars', n: 6, order: 'far', even: true, sigma: 0.45 });
    assert.equal(r.seq.length, 6, id); assert.equal(r.seq[0].c.brand, true, id);
    assert.ok(r.seq.every(x => HEX.test(x.hex)), id); assert.ok(r.cap >= 1 && r.cap <= 12, id);
  }
});

test('categorical: reference hues that collide with the brand are left out', () => {
  const tw = CS.plan({ ...setup('tailwind4', '#99CCEE', false), mark: 'bars', n: 8, order: 'far' });
  assert.deepEqual([...tw.dropped].sort(), ['blue', 'sky']);
  assert.ok(!names(tw).includes('sky') && !names(tw).includes('blue'));
  const fx = CS.plan({ ...setup('flexoki', '#99CCEE', false), mark: 'bars', n: 8, order: 'far' });
  assert.deepEqual([...fx.dropped], ['blue']);
});

test('categorical: each series keeps its hue across backgrounds and mark sizes', () => {
  for (const order of ['far', 'cvd', 'tol', 't12']) {
    const runs = [[false, 'bars'], [false, 'lines'], [true, 'bars'], [true, 'lines']].map(([dark, mark]) => names(CS.plan({ ...setup('tailwind4', '#9D58BA', dark), mark, n: 8, order })).join());
    assert.equal(new Set(runs).size, 1, order);
  }
});

test('categorical: template orders start at the brand and follow the published sequence', () => {
  // Tol bright is blue, red, green, yellow, cyan, purple. A yellow brand takes the yellow slot, so cyan and purple hues follow.
  const r = CS.plan({ ...setup('tailwind4', '#EAB308', false), mark: 'lines', n: 4, order: 'tol', tone: 1 });
  assert.equal(r.hues[0], 'brand');
  assert.ok(['cyan', 'sky'].includes(r.hues[1]), r.hues[1]);
  assert.ok(['purple', 'fuchsia', 'pink'].includes(r.hues[2]), r.hues[2]);
});

test('categorical: matching the brand narrows visual weight compared with free', () => {
  const s = setup('tailwind4', '#99CCEE', false);
  const free = CS.plan({ ...s, mark: 'bars', n: 6, order: 'far', tone: 1 });
  const match = CS.plan({ ...s, mark: 'bars', n: 6, order: 'far', even: true, sigma: 0.45 });
  assert.ok(match.spread < free.spread, `${match.spread} < ${free.spread}`);
  assert.ok(match.seq.slice(1).every(x => x.c.tone && x.c.tone < 1), 'companions are toned to the brand');
});

test('categorical: on a light background, lines avoid the dark end of each ramp', () => {
  for (const id of ['tailwind4', 'flexoki', 'carbon']) for (const hex of ['#9D58BA', '#99CCEE', '#EAB308']) {
    const r = CS.plan({ ...setup(id, hex, false), mark: 'lines', n: 6, order: 'far', even: true, sigma: 0.45 });
    assert.ok(r.seq.every(x => x.lab[0] >= 0.5 - 1e-9), `${id} ${hex}: ` + r.seq.map(x => x.c.name + ' ' + x.c.steps[x.k]).join(', '));
    assert.ok(r.seq.every(x => x.r >= 2), 'and none is fainter than 2:1');
  }
  const tw = CS.plan({ ...setup('tailwind4', '#9D58BA', false), mark: 'lines', n: 6, order: 'far', even: true, sigma: 0.45 });
  assert.ok(tw.seq.every(x => ['400', '500', '600', '700'].includes(x.c.steps[x.k])), tw.seq.map(x => x.c.steps[x.k]).join());
});

test('categorical: dark steps that have lost their color are skipped', () => {
  // In Tailwind, yellows and greens past 700 read as dull brown or olive, so bars on dark never use them.
  const dullSide = ['yellow', 'green', 'lime', 'emerald', 'teal', 'cyan'];
  for (const opt of [{ tone: 1 }, { even: true, sigma: 0.45 }, { fish: true, sigma: 0.35 }]) {
    const r = CS.plan({ ...setup('tailwind4', '#9D58BA', true), mark: 'bars', n: 12, order: 'far', ...opt });
    for (const x of r.seq) if (dullSide.includes(x.c.name)) assert.ok(Number(x.c.steps[x.k]) <= 700, x.c.name + ' ' + x.c.steps[x.k]);
    assert.ok(r.seq.every(x => x.c.steps[x.k] !== '950'), 'no 950 at all');
  }
});

test('sequential: classes run one way in lightness, from the background outward', () => {
  for (const dark of [false, true]) for (const variant of ['single', 'shift']) {
    const r = CS.scale({ ...setup('tailwind4', '#9D58BA', dark), kind: 'seq', n: 7, variant, partner: 'auto' });
    assert.equal(r.cols.length, 7); assert.equal(r.adj.mono, true, variant);
    assert.ok(r.cols[0].r < r.cols[6].r, 'low end sits nearest the background');
    assert.ok(r.cols[0].r >= 1.14, 'low end stays visible');
    assert.ok(r.adj.even < 1.25, 'steps are even');
  }
});

test('diverging: neutral middle, brand on the right, sides matched in lightness and far apart in hue', () => {
  const r = CS.scale({ ...setup('tailwind4', '#3B82F6', false), kind: 'div', n: 9, variant: 'auto', partner: 'auto' });
  assert.equal(r.cols.length, 9);
  const mid = r.cols[4].lab; assert.ok(Math.hypot(mid[1], mid[2]) < 0.02, 'middle is neutral');
  for (let j = 1; j <= 4; j++) assert.ok(Math.abs(r.cols[4 - j].lab[0] - r.cols[4 + j].lab[0]) < 0.02, 'mirrored classes share lightness');
  assert.ok(['yellow', 'amber', 'lime', 'orange'].includes(r.used), r.used);
  assert.ok(r.gap.d >= K.DISTINCT, 'the two sides stay distinct under color-blind simulation');
  const even = CS.scale({ ...setup('tailwind4', '#3B82F6', false), kind: 'div', n: 6, variant: 'auto', partner: 'auto' });
  assert.equal(even.cols.length, 6);
});

test('every built-in palette produces all three schemes', () => {
  for (const pal of P) {
    const s = setup(pal.id, '#9D58BA', false);
    assert.ok(CS.plan({ ...s, mark: 'bars', n: 4, order: 'far' }).seq.length >= 1, pal.id);
    assert.equal(CS.scale({ ...s, kind: 'seq', n: 5, variant: 'auto', partner: 'auto' }).cols.length, 5, pal.id);
    const d = CS.scale({ ...s, kind: 'div', n: 5, variant: 'auto', partner: 'auto' });
    if (d) assert.equal(d.cols.length, 5, pal.id);
  }
});

test('color-ramp-v2.html loads the shared files in order and its inline scripts compile', () => {
  const html = fs.readFileSync(path.join(__dirname, '../color-ramp-v2.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
  assert.deepEqual(srcs, ['palettes', 'engine', 'builder', 'chart-seq'].map(f => 'assets/palette-dna/' + f + '.js'));
  for (const [, body] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(body);
});
