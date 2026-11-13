// Run: node --test tests/palette-dna-layout.test.cjs
// Ramp shapes (assets/palette-dna/layout.js) and their wiring into Palette DNA Ramp.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '../assets/palette-dna');
const c = { console };
vm.createContext(c);
for (const f of ['palettes', 'engine', 'builder', 'layout']) vm.runInContext(fs.readFileSync(path.join(dir, f + '.js'), 'utf8'), c);
const { Engine: E, PaletteBuilder: B, RampLayout: L, PALETTES } = vm.runInContext('({Engine,PaletteBuilder,RampLayout,PALETTES})', c);
const pal = id => PALETTES.find(p => p.id === id);
const brand = (p, color) => {
  const M = E.build(p, p.neutral, p.gamut), lab = E.parse(color), g = M.genAnchors([{ lab, map: M.seedMap(lab) }], {});
  return { name: 'brand', steps: g.map(x => String(x.step)), labs: g.map(x => [x.L, x.a, x.b]), gamut: p.gamut, anchors: g.flatMap((x, i) => x.anchor ? [{ index: i }] : []) };
};
const shape = (o = {}) => ({ count: 11, dark: null, light: null, spacing: 'reference', lock: true, ...o });
const Ls = o => o.labs.map(p => p[0]);
const ordered = o => Ls(o).every((v, i, a) => !i || v <= a[i - 1] + 1e-9);

test('no shape returns the source ramp and its anchors', () => {
  const b = brand(pal('tailwind4'), '#4F6EF7'), o = L.apply(b, null);
  assert.equal(o.shaped, false);
  assert.deepEqual(JSON.parse(JSON.stringify(o.labs)), JSON.parse(JSON.stringify(b.labs)));
  assert.equal(o.anchors[0].index, b.anchors[0].index);
});

test('a custom shape at its starting values is the reference ramp, for every ordered ramp', () => {
  for (const p of PALETTES) for (const col of [brand(p, '#4F6EF7'), ...B.inventory(p)]) {
    if (!col.labs.every((q, i) => !i || q[0] <= col.labs[i - 1][0] + 1e-9)) continue;
    const o = L.apply(col, shape({ count: col.steps.length }));
    o.labs.forEach((q, i) => assert.ok(E.dE(q, col.labs[i]) < 1e-9, p.id + ' ' + col.name + ' ' + col.steps[i]));
    assert.deepEqual([...o.steps], [...col.steps]);
  }
});

test('every shape gives ordered, finite, in-gamut stops and keeps the input color exactly', () => {
  for (const p of PALETTES) for (const col of [brand(p, '#D9480F'), ...B.inventory(p)])
    for (const count of [3, 7, 12, 32]) for (const spacing of ['reference', 'even']) for (const [dark, light] of [[null, null], [18, 98], [60, 70]]) {
      const o = L.apply(col, shape({ count, spacing, dark, light })), tag = [p.id, col.name, count, spacing, dark].join(' ');
      assert.equal(o.labs.length, count, tag);
      assert.ok(o.labs.every(q => q.every(Number.isFinite)), tag);
      assert.ok(ordered(o), tag);
      o.labs.forEach(q => assert.ok(Math.hypot(q[1], q[2]) <= E.maxC(q[0], Math.atan2(q[2], q[1]), col.gamut) + 1e-4 || col.labs.some(s => E.dE(s, q) < 1e-9), tag));
      if (col.anchors && col.anchors.length) {
        assert.equal(o.anchors.length, 1, tag);
        assert.ok(E.dE(o.labs[o.anchors[0].index], col.labs[col.anchors[0].index]) < 1e-9, tag);
      }
    }
});

test('each ramp keeps its own lightness range unless one is set', () => {
  const slate = B.inventory(pal('tailwind4')).find(x => x.name === 'slate');
  const own = L.apply(slate, shape({ count: 7 }));
  assert.ok(Math.abs(own.labs[0][0] - slate.labs[0][0]) < 1e-9 && Math.abs(own.labs[6][0] - slate.labs.at(-1)[0]) < 1e-9);
  const set = L.apply(slate, shape({ count: 7, dark: 20, light: 95, spacing: 'even' }));
  Ls(set).forEach((v, i) => assert.ok(Math.abs(v - (0.95 - i * 0.125)) < 1e-9));
  assert.deepEqual([...set.steps], ['01', '02', '03', '04', '05', '06', '07']);
});

test('a range that excludes the kept color is widened and reported; unlocking uses the range as given', () => {
  const b = brand(pal('tailwind4'), '#4F6EF7');
  const kept = L.apply(b, shape({ count: 9, dark: 62, light: 70 }));
  assert.match(kept.notes.join(' '), /widened/);
  assert.ok(E.dE(kept.labs[kept.anchors[0].index], b.labs[b.anchors[0].index]) < 1e-9);
  const free = L.apply(b, shape({ count: 9, dark: 62, light: 70, lock: false }));
  assert.equal(free.anchors.length, 0); assert.equal(free.notes.length, 0);
  assert.ok(Math.abs(free.labs[0][0] - 0.70) < 1e-9 && Math.abs(free.labs[8][0] - 0.62) < 1e-9);
});

test('ramps not ordered by lightness (Radix amber) are sorted, reported and stay ordered', () => {
  const amber = B.inventory(pal('radix')).find(x => x.name === 'amber');
  const o = L.apply(amber, shape({ count: 7, dark: 20, light: 95 }));
  assert.ok(ordered(o)); assert.match(o.notes.join(' '), /not ordered by lightness/);
  assert.equal(new Set(Ls(o).map(v => v.toFixed(4))).size, 7);
});

test('a dark-to-light ramp keeps its direction', () => {
  const b = brand(pal('tailwind4'), '#4F6EF7'), n = b.labs.length;
  const rev = { ...b, steps: b.steps.slice().reverse(), labs: b.labs.slice().reverse(), anchors: [{ index: n - 1 - b.anchors[0].index }] };
  const o = L.apply(rev, shape({ count: 5 }));
  assert.ok(o.labs[0][0] < o.labs[4][0]);
  assert.ok(E.dE(o.labs[o.anchors[0].index], b.labs[b.anchors[0].index]) < 1e-9);
});

test('normalize rejects junk and clamps', () => {
  assert.equal(L.normalize(null), null); assert.equal(L.normalize({ count: 'x' }), null);
  const n = L.normalize({ count: 99, dark: 50, light: 40, spacing: 'zz', lock: 0 });
  assert.equal(n.count, 32); assert.equal(n.dark, null); assert.equal(n.spacing, 'reference'); assert.equal(n.lock, true);
});
