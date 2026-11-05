// Run: node --test tests/palette-dna-engine.test.cjs
// The shared Palette DNA engine, loaded the way the pages load it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, record } = require('./make-gen-anchors-fixture.cjs');

const c = load();
const E = c.Engine;
const model = id => { const p = c.PALETTES.find(x => x.id === id); return E.build(p, p.neutral, p.gamut); };
const seed = (M, color, step) => { const lab = E.parse(color); const s = { lab, map: M.seedMap(lab) }; if (step !== undefined) s.step = step; return s; };
const anchors = g => JSON.parse(JSON.stringify(g.filter(p => p.anchor).map(p => [p.step, p.seedIndex]))); // copy out of the vm realm

test('without a pin, output matches the recorded fixture for every palette', () => {
  const expected = fs.readFileSync(path.join(__dirname, 'fixtures/gen-anchors.json'), 'utf8');
  assert.equal(JSON.stringify(record(c)) + '\n', expected);
});

test('a pin is applied and reports the automatic step', () => {
  const M = model('tailwind4');
  const g = M.genAnchors([seed(M, '#3B82F6', '500')], {});
  assert.equal(g.findIndex(p => p.anchor), 5);
  assert.deepEqual({ ...g.pin }, { requested: '500', applied: '500', auto: '500', reason: null });
  assert.equal(M.genAnchors([seed(M, '#3B82F6')], {}).pin, undefined);
});

test('capacity rule: a pin is accepted when the other seed still fits, rejected when it cannot', () => {
  const M = model('tailwind4');
  const ok = M.genAnchors([seed(M, '#DBEAFE', '900'), seed(M, '#1E3A8A')], {});
  assert.deepEqual(anchors(ok), [['900', 0], ['950', 1]]);
  assert.equal(ok.pin.applied, '900');
  assert.equal(ok.pin.auto, '100');
  const no = M.genAnchors([seed(M, '#DBEAFE', '950'), seed(M, '#1E3A8A')], {});
  assert.equal(no.pin.reason, 'order');
  assert.equal(no.pin.applied, null);
  assert.deepEqual(anchors(no), anchors(M.genAnchors([seed(M, '#DBEAFE'), seed(M, '#1E3A8A')], {})));
});

test('the near-duplicate filter keeps the pinned seed', () => {
  const M = model('tailwind4');
  const a = 'oklch(60% 0.1 30)', b = 'oklch(60.5% 0.1 40)';
  assert.deepEqual(anchors(M.genAnchors([seed(M, a), seed(M, b)], {})).map(x => x[1]), [1]);
  const g = M.genAnchors([seed(M, a, '500'), seed(M, b)], {});
  assert.deepEqual(anchors(g), [['500', 0]]);
});

test('a gray pinned seed leaves the pin unapplied with reason neutral', () => {
  const M = model('tailwind4');
  const g = M.genAnchors([seed(M, '#808080', '500'), seed(M, '#1E3A8A')], {});
  assert.equal(g.pin.reason, 'neutral');
  assert.equal(g.pin.applied, null);
});

test('pins behave the same in Fit mode', () => {
  const M = model('tailwind4');
  assert.equal(M.genAnchors([seed(M, '#3B82F6', '600')], { cap: true }).findIndex(p => p.anchor), 6);
});
