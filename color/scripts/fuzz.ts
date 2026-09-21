/**
 * Run a fuzz campaign and report it.
 *
 * Exit code is 1 if anything at `crash` or `invariant` level came back — those
 * are library defects. Lint findings never fail the run: a palette that cannot
 * hold a role is a fact about that palette, and a CI gate that fires on it would
 * be reporting the corpus.
 *
 *   npx tsx scripts/fuzz.ts                    # 200 random seeds + the edge cases
 *   npx tsx scripts/fuzz.ts --cases 5000       # a real campaign
 *   npx tsx scripts/fuzz.ts --seed 7           # replay campaign 7 exactly
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { fuzz, reproduce, type Violation } from '../src/validate/fuzz.ts';

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const references: Record<string, SystemDNA> = Object.fromEntries(
  ids.map((id) => [id, parseDNA(readFileSync(`dna/${id}.json`, 'utf8'))]),
);

const cases = arg('cases', 200);
const seed = arg('seed', 1);

process.stdout.write(`fuzzing: ${cases} random seeds + edge cases, campaign seed ${seed}\n`);
let lastPct = -1;
const res = fuzz({
  references, cases, seed,
  onProgress: (done, total) => {
    const pct = Math.floor((100 * done) / total);
    if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; process.stdout.write(`  ${pct}%\r`); }
  },
});

const show = (v: Violation, indent = '   ') => {
  console.log(`${indent}${v.message}`);
  console.log(`${indent}  ${reproduce(v.case)}`);
};

console.log(`\n${res.campaign.cases} cases in ${(res.campaign.elapsedMs / 1000).toFixed(1)}s (${res.campaign.perCaseMs.toFixed(1)} ms each)`);
console.log(`${res.clean} came back with nothing at warning or above.\n`);

if (res.crashes.length) {
  console.log(`## ${res.crashes.length} CRASHES\n`);
  for (const v of res.crashes.slice(0, 10)) show(v);
} else {
  console.log('## No crashes.\n');
}

if (res.invariants.length) {
  console.log(`\n## ${res.invariants.length} INVARIANT BREAKS — these are library defects\n`);
  const byRule = new Map<string, Violation[]>();
  for (const v of res.invariants) byRule.set(v.rule, [...(byRule.get(v.rule) ?? []), v]);
  for (const [rule, vs] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`   ${rule} — ${vs.length} of ${res.campaign.cases}`);
    show(vs[0]!, '      ');
  }
} else {
  console.log('## No invariant breaks.\n');
}

console.log('\n## Lint rules, by how often they fired');
console.log('   (rare is interesting; common is the corpus describing itself)\n');
console.log('rule                            severity   fired    rate');
for (const [rule, e] of Object.entries(res.byRule).filter(([, e]) => e.kind === 'finding').sort((a, b) => a[1].rate - b[1].rate)) {
  console.log(`${rule.padEnd(32)}${e.severity.padEnd(11)}${String(e.count).padStart(5)}  ${(100 * e.rate).toFixed(1).padStart(6)}%`);
}

const rare = Object.entries(res.byRule)
  .filter(([, e]) => e.kind === 'finding' && e.severity !== 'info' && e.rate < 0.05)
  .sort((a, b) => a[1].rate - b[1].rate);
if (rare.length) {
  console.log('\n## The rarest non-info findings, with a case that produces each\n');
  for (const [rule, e] of rare.slice(0, 8)) {
    console.log(`   ${rule}  (${(100 * e.rate).toFixed(1)}%)`);
    show(e.worst, '      ');
  }
}

mkdirSync('out', { recursive: true });
writeFileSync('out/fuzz.json', JSON.stringify(res, null, 1));
console.log('\nwrote out/fuzz.json');

const defects = res.crashes.length + res.invariants.length;
if (defects > 0) { console.log(`\nFAIL: ${defects} library defects.`); process.exit(1); }
console.log('\nPASS: no crashes, no invariant breaks.');
