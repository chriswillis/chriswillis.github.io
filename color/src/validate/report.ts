/**
 * Phase 4 — the audit as text, for a terminal or a CI log.
 *
 * Same numbers as the HTML page, ordered so the first screen answers the only
 * question that has a yes-or-no answer: did anything the palette promised turn
 * out to be false?
 */
import type { TokenSet, Mode } from '../tokens/build.ts';
import type { Audit } from './audit.ts';
import type { LintResult } from './lint.ts';

const pad = (s: string, n: number) => s.padEnd(n);

export function reportAudit(set: TokenSet, a: Audit, l: LintResult): string {
  const out: string[] = [];
  out.push(`${set.name}`);
  out.push(`  ${set.primitives.length} primitives, ${set.semantics.length} semantic tokens, ${set.gamut}, from ${set.provenance.referenceName}${set.provenance.seedStep ? ` seeded at step ${set.provenance.seedStep}` : ''}`);
  out.push(`  ${l.counts.error} error(s), ${l.counts.warning} warning(s), ${l.counts.info} note(s)${l.clean ? ' — nothing it promised is false' : ''}`);
  out.push('');

  for (const mode of set.modes) {
    const m = a.matrix[mode], u = a.uniformity[mode], c = a.cvd[mode], h = a.headroom[mode], p = a.promises[mode];
    out.push(`  ${mode}`);
    if (m) out.push(`    contrast matrix: ${(m.usable.wcag * 100).toFixed(1)}% of ordered pairs clear 4.5:1, ${(m.usable.apca * 100).toFixed(1)}% clear Lc 60, the two disagree on ${(m.usable.disagree * 100).toFixed(1)}%`);
    if (u) {
      out.push(`    step spacing:    mean ΔEOK ${u.mean.toFixed(4)}, CV ${u.cv.toFixed(3)} (${u.corpus.cv.verdict}), smallest ${u.min.toFixed(4)} (${u.corpus.min.verdict})${u.reference ? `; the reference's own CV is ${u.reference.cv.toFixed(3)}` : ''}`);
    }
    if (c) {
      const w = (k: 'protan' | 'deutan' | 'tritan') => `${k} ${c.within[k].minAdjacent.toFixed(4)}`;
      out.push(`    CVD within:      smallest adjacent gap ${w('protan')}, ${w('deutan')}, ${w('tritan')} (deutan ${c.within.deutan.corpus.verdict})`);
      const bf = c.betweenFamilies.deutan;
      if (bf.pairs) out.push(`    CVD families:    ${bf.collapsed.length}/${bf.pairs} pairs collapse under deuteranopia${c.standing ? ` — lower than ${c.standing.beats} of ${c.standing.of} reference systems${c.standing.ties ? `, level with ${c.standing.ties}` : ''}` : ''}`);
      for (const x of bf.collapsed) out.push(`                     ${x.a}/${x.b} at step ${x.step}: ΔEOK ${x.before.toFixed(3)} → ${x.after.toFixed(3)}`);
    }
    if (h) out.push(`    gamut:           mean relC ${h.meanRelCSrgb.toFixed(3)} against the sRGB shell (${h.corpus.relC.verdict}), ${(h.onShellSrgb * 100).toFixed(0)}% of steps on it`);
    if (p) out.push(`    promises:        ${p.held} held, ${p.broken} broken`);
    out.push('');
  }

  if (l.findings.length) {
    out.push('  findings');
    for (const f of l.findings) {
      out.push(`    ${pad(f.severity, 8)} ${pad(f.rule, 30)} [${f.mode}] ${f.message}`);
      if (f.remedy) out.push(`             ${' '.repeat(30)} → ${f.remedy}`);
    }
  }
  return out.join('\n');
}

/** Just the pairs a foreground can safely sit on, for a quick lookup. */
export function usablePairs(a: Audit, mode: Mode, measure: 'wcag' | 'apca' = 'wcag'): { fg: string; bg: string[] }[] {
  const m = a.matrix[mode];
  if (!m) return [];
  return m.keys.map((fg, i) => ({
    fg,
    bg: m.keys.filter((_, j) => i !== j && (measure === 'wcag' ? m.cells[i]![j]!.bodyWcag : m.cells[i]![j]!.bodyApca)),
  }));
}
