/**
 * Does a foreground token stay legible on the surfaces it actually lands on?
 *
 * The role table measures every content and icon role against the *page*. Real
 * components do not put text on the page: a card puts it on `surface/normal`, a
 * hovered row on `surface/hover`, a disabled control on `surface/active`. Those
 * surfaces are chosen by separation from the page, and nothing so far checks
 * what a foreground reads like once it is sitting on one.
 *
 * The audit page shows what that costs: the light-mode "Disabled" button has no
 * visible label, because `content/disabled` and `surface/active` resolve to the
 * same step. So this measures how often a foreground fails on a surface, across
 * every reference and a spread of seeds, before any rule is written.
 *
 * Run: npx tsx spike/phase5-surfaces.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { palette, builtinDNAIds, loadDNA } from '../src/palette.ts';
import { roleByName } from '../src/tokens/roles.ts';
import { wcag21Fast, apcaFast } from '../src/contrast/fast.ts';
import { deltaEOK } from '../src/color/oklch.ts';
import type { Mode } from '../src/tokens/build.ts';

const SURFACES = ['background/subtle', 'surface/normal', 'surface/hover', 'surface/active'];
const FOREGROUNDS = ['content/normal', 'content/subtle', 'content/disabled', 'icon/normal'];
const SEEDS = ['#7c3aed', '#dc2626', '#0891b2', '#ca8a04', '#16a34a', '#db2777'];

const lightIds = builtinDNAIds().filter((id) => loadDNA(id).mode === 'light');

interface Row { ref: string; seed: string; mode: Mode; fg: string; surface: string; wcag: number; apca: number; deltaE: number; wantW?: number; wantA?: number; sameStep: boolean }
const rows: Row[] = [];

for (const ref of lightIds) {
  for (const seed of SEEDS) {
    const p = palette({ seed, reference: ref });
    for (const mode of p.tokens.modes) {
      const at = (role: string) => p.tokens.semantics.find((s) => s.role === role);
      for (const fgName of FOREGROUNDS) {
        const fg = at(fgName); if (!fg) continue;
        const spec = roleByName(fgName);
        const rule = spec?.rule.kind === 'contrast' ? spec.rule : undefined;
        for (const sName of SURFACES) {
          const s = at(sName); if (!s) continue;
          const a = fg.values[mode]!.oklch, b = s.values[mode]!.oklch;
          rows.push({
            ref, seed, mode, fg: fgName, surface: sName,
            wcag: wcag21Fast(a, b), apca: Math.abs(apcaFast(a, b)), deltaE: deltaEOK(a, b),
            ...(rule?.wcag !== undefined ? { wantW: rule.wcag } : {}),
            ...(rule?.apca !== undefined ? { wantA: rule.apca } : {}),
            sameStep: !!fg.evidence[mode]?.stepKey && fg.evidence[mode]!.stepKey === s.evidence[mode]?.stepKey,
          });
        }
      }
    }
  }
}

const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;

console.log(`## Foregrounds on surfaces — ${lightIds.length} references × ${SEEDS.length} seeds × 2 modes = ${rows.length} pairs\n`);

// ── 1. the invisible case: same step, so literally no contrast ────────────────
const same = rows.filter((r) => r.sameStep);
console.log(`Foreground and surface on the SAME step: ${same.length} of ${rows.length} (${pct(same.length, rows.length)})`);
const byPair: Record<string, number> = {};
for (const r of same) byPair[`${r.fg} on ${r.surface}`] = (byPair[`${r.fg} on ${r.surface}`] ?? 0) + 1;
for (const [k, n] of Object.entries(byPair).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(38)} ${String(n).padStart(4)}  ${pct(n, rows.length)}`);

// ── 2. under one JND, which is the same thing measured perceptually ──────────
const sub = rows.filter((r) => r.deltaE < 0.02);
console.log(`\nUnder one JND (ΔEOK 0.02) apart: ${sub.length} (${pct(sub.length, rows.length)})`);

// ── 3. failing the role's own threshold, as asked of the page ────────────────
console.log('\n## Failing the threshold the role is held to against the page\n');
console.log('foreground            surface              fails   of      rate    worst (wcag / |Lc|)');
for (const fg of FOREGROUNDS) {
  for (const s of SURFACES) {
    const g = rows.filter((r) => r.fg === fg && r.surface === s);
    if (!g.length) continue;
    const bad = g.filter((r) => (r.wantW !== undefined && r.wcag < r.wantW) || (r.wantA !== undefined && r.apca < r.wantA));
    if (!bad.length) { console.log(`${fg.padEnd(21)} ${s.padEnd(20)} ${'0'.padStart(5)}   ${String(g.length).padStart(4)}    —`); continue; }
    const worst = bad.reduce((x, y) => (y.apca < x.apca ? y : x));
    console.log(`${fg.padEnd(21)} ${s.padEnd(20)} ${String(bad.length).padStart(5)}   ${String(g.length).padStart(4)}    ${pct(bad.length, g.length).padStart(6)}  ${worst.wcag.toFixed(2)} / ${worst.apca.toFixed(0)}  (${worst.ref} ${worst.seed} ${worst.mode})`);
  }
}

// ── 4. how many references are affected at all ───────────────────────────────
const refsHit = new Set(rows.filter((r) => r.sameStep).map((r) => r.ref));
console.log(`\nReferences with at least one same-step foreground/surface pair: ${refsHit.size} of ${lightIds.length} — ${[...refsHit].join(', ')}`);

// ── 5. is it a body-text problem or only a disabled-text problem? ────────────
const body = rows.filter((r) => r.fg === 'content/normal' || r.fg === 'content/subtle');
const bodyBad = body.filter((r) => (r.wantW !== undefined && r.wcag < r.wantW) || (r.wantA !== undefined && r.apca < r.wantA));
console.log(`Body-text roles failing on a surface: ${bodyBad.length} of ${body.length} (${pct(bodyBad.length, body.length)})`);
const disabled = rows.filter((r) => r.fg === 'content/disabled');
const disBad = disabled.filter((r) => r.wantA !== undefined && r.apca < r.wantA);
console.log(`content/disabled failing on a surface:  ${disBad.length} of ${disabled.length} (${pct(disBad.length, disabled.length)})`);

mkdirSync('out', { recursive: true });
writeFileSync('out/phase5-surfaces.json', JSON.stringify({ surfaces: SURFACES, foregrounds: FOREGROUNDS, seeds: SEEDS, rows }, null, 1));
console.log('\nwrote out/phase5-surfaces.json');
