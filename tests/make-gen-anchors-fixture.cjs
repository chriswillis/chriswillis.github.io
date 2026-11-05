// Records Engine.genAnchors output for every built-in palette, so engine changes can be checked
// against it. Run once against an engine whose output is known to be right:
//   node tests/make-gen-anchors-fixture.cjs
// Writes tests/fixtures/gen-anchors.json. tests/palette-dna-engine.test.cjs compares against it.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SEED_SETS = [['#FDE68A'], ['#D97706'], ['#78350F'], ['#FDE68A', '#D97706', '#78350F'], ['#9D58BA', '#E9D5FF']];

function load() {
  const c = vm.createContext({});
  for (const f of ['palettes', 'engine', 'importer']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/palette-dna', f + '.js'), 'utf8'), c);
  }
  return c;
}

function record(c) {
  const out = [];
  for (const pal of c.PALETTES) {
    const M = c.Engine.build(pal, pal.neutral, pal.gamut);
    for (const cap of [false, true]) {
      for (const colors of SEED_SETS) {
        const seeds = colors.map(x => { const lab = c.Engine.parse(x); return { lab, map: M.seedMap(lab) }; });
        const gen = M.genAnchors(seeds, { cap });
        out.push({ pal: pal.id, cap, seeds: colors,
          steps: gen ? gen.map(p => [p.L, p.a, p.b, p.step, p.anchor, p.seedIndex]) : null });
      }
    }
  }
  return out;
}

module.exports = { load, record, SEED_SETS };

if (require.main === module) {
  const file = path.join(__dirname, 'fixtures/gen-anchors.json');
  const data = record(load());
  fs.writeFileSync(file, JSON.stringify(data) + '\n');
  console.log('wrote', path.relative(process.cwd(), file), data.length, 'cases');
}
