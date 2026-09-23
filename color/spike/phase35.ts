/**
 * Phase 3.5 measurement: can semantic roles be *derived* from the contrast
 * matrix, or do they have to be declared?
 *
 * Radix is the alignment target: it documents what each of its twelve steps is
 * for, in both modes, and it is the only system here that does. If a table of
 * contrast requirements — written from WCAG 2.1 and APCA, not from Radix —
 * recovers Radix's own role assignment, then semantic assignment is a measurable
 * property of a ramp rather than a convention to be copied.
 *
 * This part measures the contrast signature of each documented role, so the
 * requirement table can be written against published criteria and checked.
 *
 * Run: npx tsx spike/phase35.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { wcag21Fast, apcaFast } from '../src/contrast/fast.ts';
import { deltaEOK, type Oklch } from '../src/color/oklch.ts';
import { RADIX_ROLES } from '../src/ingest/radix.ts';

const light = parseDNA(readFileSync('dna/radix-light.json', 'utf8'));
const dark = parseDNA(readFileSync('dna/radix-dark.json', 'utf8'));
const N = 12;

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(mean(x.map((v) => (v - m) ** 2))); };
const q = (x: number[], p: number) => { const s = x.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };

/** Every step of every family, plus the neutrals, as colors. */
function steps(dna: SystemDNA): { family: string; neutral: boolean; colors: Oklch[] }[] {
  const out: { family: string; neutral: boolean; colors: Oklch[] }[] = [];
  for (const f of Object.values(dna.families)) out.push({ family: f.family, neutral: false, colors: f.knots.L.map((_, i) => ({ l: f.knots.L[i]!, c: f.knots.C[i]!, h: f.knots.h[i]! })) });
  for (const n of Object.values(dna.neutrals)) out.push({ family: n.family, neutral: true, colors: n.knots.L.map((_, i) => ({ l: n.knots.L[i]!, c: n.knots.C[i]!, h: Number.isFinite(n.knots.h[i]!) ? n.knots.h[i]! : 0 })) });
  return out;
}

// ── 1. the contrast signature of each documented role ─────────────────────────
console.log('## 1. What each documented Radix step actually measures, against its own step 1');
console.log('       (25 chromatic families + 6 neutrals, both modes; the band is p10–p90 across all of them)\n');
console.log('step  role                              mode   WCAG vs step 1        APCA |Lc| vs step 1     ΔEOK vs step 1');
type Row = { step: number; mode: string; wcag: number[]; apca: number[]; de: number[] };
const rows: Row[] = [];
for (const [modeName, dna] of [['light', light], ['dark', dark]] as const) {
  const all = steps(dna);
  for (let i = 0; i < N; i++) {
    const r: Row = { step: i + 1, mode: modeName, wcag: [], apca: [], de: [] };
    for (const f of all) {
      const bg = f.colors[0]!;
      r.wcag.push(wcag21Fast(f.colors[i]!, bg));
      r.apca.push(Math.abs(apcaFast(f.colors[i]!, bg)));
      r.de.push(deltaEOK(f.colors[i]!, bg));
    }
    rows.push(r);
  }
}
for (let i = 0; i < N; i++) {
  for (const m of ['light', 'dark']) {
    const r = rows.find((x) => x.step === i + 1 && x.mode === m)!;
    const band = (v: number[], d = 2) => `${q(v, 0.1).toFixed(d)}–${q(v, 0.9).toFixed(d)}`.padEnd(14);
    console.log(`${String(i + 1).padStart(4)}  ${(RADIX_ROLES[String(i + 1)] ?? '').padEnd(32)}  ${m.padEnd(5)}  ${band(r.wcag)}        ${band(r.apca, 0)}          ${band(r.de, 3)}`);
  }
  console.log('');
}

// ── 2. the same against the *page* background, which is what a token sits on ──
console.log('## 2. The page background is step 1 of the system\'s gray, not of the family — the number a token is judged by');
console.log('step  mode   WCAG vs the gray app background   APCA |Lc|      first step over 3:1 / 4.5:1 / Lc 45 / Lc 60');
for (const [modeName, dna] of [['light', light], ['dark', dark]] as const) {
  const g = dna.neutrals['gray']!;
  const page: Oklch = { l: g.knots.L[0]!, c: g.knots.C[0]!, h: Number.isFinite(g.knots.h[0]!) ? g.knots.h[0]! : 0 };
  const all = steps(dna);
  const firsts: Record<string, number[]> = { '3:1': [], '4.5:1': [], 'Lc45': [], 'Lc60': [] };
  for (let i = 0; i < N; i++) {
    const w = all.map((f) => wcag21Fast(f.colors[i]!, page));
    const a = all.map((f) => Math.abs(apcaFast(f.colors[i]!, page)));
    console.log(`${String(i + 1).padStart(4)}  ${modeName.padEnd(5)}  ${`${q(w, 0.1).toFixed(2)}–${q(w, 0.9).toFixed(2)}`.padEnd(30)} ${`${q(a, 0.1).toFixed(0)}–${q(a, 0.9).toFixed(0)}`.padEnd(14)}`);
  }
  for (const f of all) {
    const w = f.colors.map((c) => wcag21Fast(c, page));
    const a = f.colors.map((c) => Math.abs(apcaFast(c, page)));
    const first = (arr: number[], t: number) => { const i = arr.findIndex((v) => v >= t); return i < 0 ? NaN : i + 1; };
    firsts['3:1']!.push(first(w, 3)); firsts['4.5:1']!.push(first(w, 4.5));
    firsts['Lc45']!.push(first(a, 45)); firsts['Lc60']!.push(first(a, 60));
  }
  const fmt = (v: number[]) => { const ok = v.filter(Number.isFinite); return `${Math.min(...ok)}–${Math.max(...ok)} (median ${q(ok, 0.5)})${ok.length < v.length ? `, ${v.length - ok.length} never reach it` : ''}`; };
  console.log(`  ${modeName}: first step over 3:1 ${fmt(firsts['3:1']!)};  4.5:1 ${fmt(firsts['4.5:1']!)};  Lc 45 ${fmt(firsts['Lc45']!)};  Lc 60 ${fmt(firsts['Lc60']!)}\n`);
}

// ── 3. the pairs Radix's roles imply ──────────────────────────────────────────
console.log('## 3. The pairs the roles imply: text on a component background, and text on the solid');
console.log('pair                                  mode   WCAG                 APCA |Lc|            meets 4.5:1 / Lc 60');
const pairs: [string, number, number][] = [
  ['step 11 (low-contrast text) on step 1', 10, 0],
  ['step 11 on step 3 (component bg)', 10, 2],
  ['step 12 (high-contrast text) on step 1', 11, 0],
  ['step 12 on step 3', 11, 2],
  ['white on step 9 (the solid)', -1, 8],
  ['step 12 on step 9', 11, 8],
  ['step 1 on step 9', 0, 8],
];
for (const [label, fg, bg] of pairs) {
  for (const [modeName, dna] of [['light', light], ['dark', dark]] as const) {
    const all = steps(dna).filter((f) => !f.neutral);
    const w: number[] = [], a: number[] = [];
    for (const f of all) {
      const f0: Oklch = fg < 0 ? { l: 1, c: 0, h: 0 } : f.colors[fg]!;
      w.push(wcag21Fast(f0, f.colors[bg]!));
      a.push(Math.abs(apcaFast(f0, f.colors[bg]!)));
    }
    console.log(`${label.padEnd(38)}${modeName.padEnd(7)}${`${Math.min(...w).toFixed(2)}–${Math.max(...w).toFixed(2)}`.padEnd(21)}${`${Math.min(...a).toFixed(0)}–${Math.max(...a).toFixed(0)}`.padEnd(21)}${w.filter((v) => v >= 4.5).length}/${w.length}  ${a.filter((v) => v >= 60).length}/${a.length}`);
  }
}

// ── 4. do the bands separate the roles? ───────────────────────────────────────
console.log('\n## 4. Do the bands separate? Overlap between consecutive steps\' WCAG bands vs the app background');
for (const [modeName] of [['light'], ['dark']] as const) {
  const seq = rows.filter((r) => r.mode === modeName).sort((a, b) => a.step - b.step);
  const over: string[] = [];
  for (let i = 1; i < seq.length; i++) {
    const lo = q(seq[i]!.wcag, 0.1), prevHi = q(seq[i - 1]!.wcag, 0.9);
    if (lo < prevHi) over.push(`${seq[i - 1]!.step}/${seq[i]!.step}`);
  }
  console.log(`  ${modeName}: ${over.length} of 11 consecutive pairs overlap at p10/p90 — ${over.join(' ') || 'none'}`);
}

mkdirSync('out', { recursive: true });
writeFileSync('out/phase35.json', JSON.stringify({
  roles: RADIX_ROLES,
  signature: rows.map((r) => ({ step: r.step, mode: r.mode, wcag: { p10: q(r.wcag, 0.1), median: q(r.wcag, 0.5), p90: q(r.wcag, 0.9) }, apca: { p10: q(r.apca, 0.1), median: q(r.apca, 0.5), p90: q(r.apca, 0.9) }, deltaE: { p10: q(r.de, 0.1), median: q(r.de, 0.5), p90: q(r.de, 0.9) } })),
}, null, 1));
console.log('\nwrote out/phase35.json');

// ── 5. does the requirement table recover Radix's documented roles? ───────────
import { solveRamp } from '../src/solver/index.ts';
import { assignRoles } from '../src/tokens/assign.ts';
import { ROLES } from '../src/tokens/roles.ts';

console.log('\n## 5. Assignment from the contrast matrix, against Radix\'s documented roles');
for (const [modeName, dna] of [['light', light], ['dark', dark]] as const) {
  const tally: Record<string, Record<string, number>> = {};
  const warn: Record<string, number> = {};
  for (const fam of Object.keys(dna.families)) {
    // Radix's role table assumes the family's own step 1 is the app background, so that is
    // the background the alignment is measured on.
    const k = dna.families[fam]!.knots;
    const page: Oklch = { l: k.L[0]!, c: k.C[0]!, h: k.h[0]! };
    const ramp = solveRamp({ dna, family: fam, hue: dna.families[fam]!.hueAtPeak, gamut: 'srgb', background: page, sibling: false, spacing: 'reference' });
    const a = assignRoles(ramp, { family: fam });
    for (const [name, r] of Object.entries(a.roles)) {
      tally[name] ??= {};
      const k = r.stepKey ?? r.chosenFrom ?? r.literal ?? '—';
      tally[name]![k] = (tally[name]![k] ?? 0) + 1;
    }
    for (const w of a.warnings) { const key = w.split(':')[0]!; warn[key] = (warn[key] ?? 0) + 1; }
  }
  console.log(`\n  ${modeName} — 25 families, step chosen (count)          Radix documents`);
  for (const spec of ROLES) {
    const t = tally[spec.name] ?? {};
    const got = Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' ');
    const want = spec.radixStep === undefined ? '' : `step ${spec.radixStep} — ${RADIX_ROLES[String(spec.radixStep)]}`;
    const hit = spec.radixStep !== undefined && (t[String(spec.radixStep)] ?? 0) === 25 ? '✓' : spec.radixStep !== undefined ? ' ' : ' ';
    console.log(`  ${hit} ${spec.name.padEnd(26)} ${got.padEnd(34)} ${want}`);
  }
  if (Object.keys(warn).length) console.log(`    warnings: ${Object.entries(warn).map(([k, v]) => `${k}×${v}`).join(', ')}`);
  const documented = ROLES.filter((r) => r.radixStep !== undefined);
  const exact = documented.filter((r) => (tally[r.name]?.[String(r.radixStep)] ?? 0) === Object.keys(dna.families).length).length;
  console.log(`    → ${exact} of ${documented.length} documented roles recovered on the same step in all ${Object.keys(dna.families).length} families`);
}
console.log(`
The one systematic disagreement is border/strong. SC 1.4.11 asks 3:1 of a boundary that is
the only thing identifying a control; Radix's step 8 measures 1.88–2.38:1 against its light
app background, so the requirement lands past it. That is the difference between deriving a
role and copying one, and it is reported rather than reconciled.`);
