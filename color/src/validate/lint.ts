/**
 * Phase 4 — the token linter.
 *
 * Every rule states what it checked, what it found, and what would fix it. None
 * of them fix anything: a linter that repairs its own findings is a generator
 * with extra steps, and the repair is usually a decision — move the fill, or
 * move the text — that belongs to whoever owns the brand.
 *
 * Severities mean something specific:
 *
 *  - `error`   — a promise the token set makes and does not keep, or an
 *                accessibility criterion it claims and misses.
 *  - `warning` — a defect a user would notice: a state that does not read as a
 *                state, two tokens that are one colour, a pair that collapses
 *                under colour-vision deficiency.
 *  - `info`    — something true and worth knowing that is not a defect: the
 *                ramp sitting on the gamut shell, the two contrast measures
 *                disagreeing, a step used for two roles.
 *
 * Thresholds come from `baseline.ts`, measured on 185 shipping ramps, except
 * where a published criterion applies — in which case the criterion wins and is
 * quoted.
 */
import type { TokenSet, Mode } from '../tokens/build.ts';
import { roleByName } from '../tokens/roles.ts';
import { deltaEOK } from '../color/oklch.ts';
import { wcag21Fast, apcaFast } from '../contrast/fast.ts';
import { JND, type Audit } from './audit.ts';
import { CORPUS } from './baseline.ts';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  mode: Mode | 'all';
  /** Token roles or primitive keys the finding is about. */
  subjects: string[];
  message: string;
  /** The numbers behind it. */
  evidence: Record<string, number | string | boolean>;
  /** What would make it go away. Never applied automatically. */
  remedy: string;
}

export interface LintResult {
  findings: Finding[];
  counts: Record<Severity, number>;
  /** True when nothing at `error` severity fired. */
  clean: boolean;
}

export interface LintOptions {
  /** Rules to skip, by name. */
  disable?: string[];
  /** Report `info` findings. Default true. */
  info?: boolean;
}

export function lint(set: TokenSet, a: Audit, opts: LintOptions = {}): LintResult {
  const off = new Set(opts.disable ?? []);
  const findings: Finding[] = [];
  const add = (f: Finding) => { if (!off.has(f.rule) && (f.severity !== 'info' || (opts.info ?? true))) findings.push(f); };

  for (const mode of set.modes) {
    // ── requirements the set claims and misses ────────────────────────────────
    for (const s of set.semantics) {
      const e = s.evidence[mode];
      if (!e || e.met) continue;
      const spec = roleByName(s.role);
      add({
        rule: 'requirement-unmet',
        severity: spec?.source.startsWith('WCAG') || spec?.source.includes('SC 1.4') ? 'error' : 'warning',
        mode,
        subjects: [s.role],
        message: `${s.role} does not meet its requirement: ${e.shortfall ?? 'unmet'}`,
        evidence: { wcag: Number(e.against.wcag.toFixed(3)), apcaLc: Number(e.against.apca.toFixed(1)), against: e.against.role, requirement: spec?.source ?? '' },
        remedy: e.fillWould !== undefined && e.fillWould !== null
          ? `move the fill to lightness ${e.fillWould.toFixed(3)}, or pick a different foreground`
          : `use a step further from ${e.against.role}, or change the requirement if this role does not carry text`,
      });
    }

    // ── the two contrast measures disagreeing on a token ──────────────────────
    for (const s of set.semantics) {
      const d = s.evidence[mode]?.disagreement;
      if (!d) continue;
      add({
        rule: 'measures-disagree',
        severity: 'info',
        mode,
        subjects: [s.role],
        message: `${s.role}: WCAG prefers ${d.wcag.candidate} (${d.wcag.value.toFixed(2)}:1), APCA prefers ${d.apca.candidate} (Lc ${d.apca.value.toFixed(0)}). A mid-lightness fill does this to them.`,
        evidence: { wcagCandidate: d.wcag.candidate, wcagValue: Number(d.wcag.value.toFixed(3)), apcaCandidate: d.apca.candidate, apcaLc: Number(d.apca.value.toFixed(1)) },
        remedy: 'pick the measure you are held to, or move the fill until one colour satisfies both',
      });
    }

    // ── states that do not read as states ─────────────────────────────────────
    const pairs: [string, string, string][] = [
      ['surface/normal', 'surface/hover', 'the hover state will not register'],
      ['surface/hover', 'surface/active', 'pressed will look the same as hovered'],
      ['border/subtle', 'border/normal', 'the two border weights are one border weight'],
      ['background/solid', 'background/solid/hover', 'the solid will not appear to respond'],
      ['content/subtle', 'content/normal', 'the text hierarchy has one level, not two'],
      ['content/subtle', 'content/disabled', 'disabled text will look like ordinary secondary text'],
    ];
    for (const [x, y, why] of pairs) {
      const a1 = set.semantics.find((s) => s.role === x), b1 = set.semantics.find((s) => s.role === y);
      if (!a1?.values[mode] || !b1?.values[mode]) continue;
      const d = deltaEOK(a1.values[mode].oklch, b1.values[mode].oklch);
      if (d >= JND) continue;
      const same = a1.evidence[mode]?.stepKey && a1.evidence[mode]!.stepKey === b1.evidence[mode]?.stepKey;
      add({
        rule: 'state-indistinguishable',
        severity: 'warning',
        mode,
        subjects: [x, y],
        message: `${x} and ${y} are ΔEOK ${d.toFixed(4)} apart${same ? ` (both on step ${a1.evidence[mode]!.stepKey})` : ''} — ${why}`,
        // six decimals, not four: 0.019996 rounds to 0.0200 at four and reads as
        // being at the threshold it is actually under
        evidence: { deltaE: Number(d.toFixed(6)), jnd: JND, sameStep: !!same },
        remedy: same
          ? 'the ramp has no spare step between these roles; add steps, or move the brand fill so the surface chain has more room'
          : 'widen the ramp between these two steps',
      });
    }

    // ── a foreground the colour of what it sits on ────────────────────────────
    // Not a threshold check. Measuring every foreground against every surface at
    // the threshold it is held to against the *page* fails 42.5% of the corpus
    // (`spike/phase5-surfaces.ts`), which says the framing is wrong rather than
    // that the palettes are: `surface/active` is a tinted brand field, and body
    // text was never claimed to compose onto it. What is not a judgment call is
    // a foreground and its own surface being the same colour. Across 12
    // references × 6 seeds × 2 modes the only sub-JND foreground/surface pairs in
    // the corpus were `content/disabled` on `surface/active` — 30 of 2304, in 8
    // of the 12 references. The assignment now avoids them; this catches a token
    // set that was not built by it.
    const onSurface: [string, string][] = [
      ['content/normal', 'surface/normal'],
      ['content/subtle', 'surface/normal'],
      ['content/normal', 'surface/hover'],
      ['content/subtle', 'surface/hover'],
      ['content/disabled', 'surface/active'],
      ['icon/normal', 'surface/normal'],
    ];
    for (const [fgName, sName] of onSurface) {
      const fg = set.semantics.find((s) => s.role === fgName), sf = set.semantics.find((s) => s.role === sName);
      if (!fg?.values[mode] || !sf?.values[mode]) continue;
      const d = deltaEOK(fg.values[mode].oklch, sf.values[mode].oklch);
      if (d >= JND) continue;
      const same = fg.evidence[mode]?.stepKey && fg.evidence[mode]!.stepKey === sf.evidence[mode]?.stepKey;
      add({
        rule: 'foreground-on-surface',
        severity: 'warning',
        mode,
        subjects: [fgName, sName],
        message: `${fgName} is ΔEOK ${d.toFixed(4)} from ${sName}${same ? ` (both on step ${fg.evidence[mode]!.stepKey})` : ''} — text this colour is not quiet on that surface, it is absent`,
        evidence: {
          deltaE: Number(d.toFixed(6)), jnd: JND, sameStep: !!same,
          wcag: Number(wcag21Fast(fg.values[mode].oklch, sf.values[mode].oklch).toFixed(3)),
          apca: Number(Math.abs(apcaFast(fg.values[mode].oklch, sf.values[mode].oklch)).toFixed(1)),
        },
        remedy: `move ${fgName} one step further from the page; it is selected as the least-contrasting step that clears its floor, so the next one clears it too`,
      });
    }

    // ── colour-vision deficiency ──────────────────────────────────────────────
    const cvd = a.cvd[mode];
    if (cvd) {
      // One finding per deficiency rather than one per pair: a twelve-step ramp can
      // produce a dozen of these and they all have the same remedy. A pair that lands
      // within a tenth of the JND is at the threshold rather than over it, so it is
      // reported but not raised.
      for (const [kind, r] of Object.entries(cvd.within)) {
        if (!r.collapsedPairs.length) continue;
        const worst = r.collapsedPairs.slice().sort((x, y) => x.after - y.after)[0]!;
        const clear = r.collapsedPairs.filter((c) => c.after < JND * 0.9);
        add({
          rule: 'cvd-steps-collapse',
          severity: clear.length ? 'warning' : 'info',
          mode,
          subjects: r.collapsedPairs.flatMap((c) => [c.a, c.b]),
          message: `${r.collapsedPairs.length} step pair${r.collapsedPairs.length > 1 ? 's' : ''} that a trichromat can tell apart become${r.collapsedPairs.length > 1 ? '' : 's'} indistinguishable under ${kind}opia — worst is ${worst.a}/${worst.b}, ΔEOK ${worst.before.toFixed(3)} → ${worst.after.toFixed(3)}${clear.length ? '' : ' (all of them within a tenth of the JND, so at the threshold rather than over it)'}`,
          evidence: { pairs: r.collapsedPairs.length, worstBefore: Number(worst.before.toFixed(6)), worstAfter: Number(worst.after.toFixed(6)), deficiency: kind, minAdjacent: Number(r.minAdjacent.toFixed(6)) },
          remedy: 'separate them in lightness rather than in hue; colour-vision deficiency preserves lightness and flattens hue',
        });
      }
      for (const [kind, r] of Object.entries(cvd.betweenFamilies)) {
        for (const c of r.collapsed) {
          add({
            rule: 'cvd-families-collapse',
            severity: 'warning',
            mode,
            subjects: [c.a, c.b],
            message: `${c.a} and ${c.b} are ΔEOK ${c.before.toFixed(3)} apart at step ${c.step} but ${c.after.toFixed(3)} under ${kind}opia — two categories that read as one`,
            evidence: { before: Number(c.before.toFixed(6)), after: Number(c.after.toFixed(6)), deficiency: kind, step: c.step },
            remedy: 'give the two families different lightnesses at this step, or drop one of them from any set a reader has to tell apart',
          });
        }
      }
      if (cvd.standing && cvd.betweenFamilies.deutan.pairs > 0) {
        add({
          rule: 'cvd-standing',
          severity: 'info',
          mode,
          subjects: [],
          message: `${cvd.betweenFamilies.deutan.collapsed.length} of ${cvd.betweenFamilies.deutan.pairs} family pairs collapse under deuteranopia (${(cvd.betweenFamilies.deutan.rate * 100).toFixed(1)}%) — lower than ${cvd.standing.beats} of the ${cvd.standing.of} reference systems${cvd.standing.ties ? `, level with ${cvd.standing.ties}` : ''}`,
          evidence: { rate: Number(cvd.betweenFamilies.deutan.rate.toFixed(4)), beats: cvd.standing.beats, ties: cvd.standing.ties, of: cvd.standing.of },
          remedy: '',
        });
      }
    }

    // ── uniformity ────────────────────────────────────────────────────────────
    const u = a.uniformity[mode];
    if (u) {
      if (u.min < JND) {
        add({
          rule: 'step-under-jnd',
          severity: 'warning',
          mode,
          subjects: [],
          message: `the closest consecutive steps are ΔEOK ${u.min.toFixed(4)} apart, under one JND`,
          evidence: { min: Number(u.min.toFixed(6)), corpusMedian: CORPUS.smallestStep.median, verdict: u.corpus.min.verdict },
          remedy: 'respace the ramp (`spacing: "even"`), or accept that two of its steps are one colour',
        });
      }
      if (u.corpus.cv.verdict === 'worse than most') {
        add({
          rule: 'uneven-spacing',
          severity: 'info',
          mode,
          subjects: [],
          message: `step spacing varies by CV ${u.cv.toFixed(2)}, against a corpus median of ${CORPUS.stepUniformityCv.median} — the reference numbers by role, not by even perceptual distance`,
          evidence: { cv: Number(u.cv.toFixed(3)), referenceCv: u.reference ? Number(u.reference.cv.toFixed(3)) : '', corpusMedian: CORPUS.stepUniformityCv.median },
          remedy: 'pass `spacing: "even"` to re-place the steps at equal ΔEOK on the same curve',
        });
      }
    }

    // ── gamut ─────────────────────────────────────────────────────────────────
    const h = a.headroom[mode];
    if (h) {
      const clipped = h.steps.filter((s) => s.gaveUp.mapping > JND);
      if (clipped.length) {
        add({
          rule: 'gamut-mapped',
          severity: 'warning',
          mode,
          subjects: clipped.map((s) => s.key),
          message: `${clipped.length} step${clipped.length > 1 ? 's' : ''} moved more than a JND in gamut mapping (worst ${Math.max(...clipped.map((s) => s.gaveUp.mapping)).toFixed(4)}) — the intended colour is not the emitted one`,
          evidence: { steps: clipped.length, worst: Number(Math.max(...clipped.map((s) => s.gaveUp.mapping)).toFixed(4)) },
          remedy: 'this hue cannot hold that chroma at that lightness; lower the chroma or accept the mapped colour',
        });
      }
      const drifted = h.steps.filter((s) => s.siblingDeltaE > JND);
      if (drifted.length && set.gamut === 'p3') {
        add({
          rule: 'srgb-sibling-drift',
          severity: 'info',
          mode,
          subjects: drifted.map((s) => s.key),
          message: `${drifted.length} step${drifted.length > 1 ? 's' : ''} differ visibly between P3 and their sRGB sibling (worst ΔEOK ${Math.max(...drifted.map((s) => s.siblingDeltaE)).toFixed(4)}) — an sRGB display shows a different colour`,
          evidence: { steps: drifted.length, worst: Number(Math.max(...drifted.map((s) => s.siblingDeltaE)).toFixed(4)) },
          remedy: 'generate in sRGB if the two must match, or accept that the wide-gamut palette is wider',
        });
      }
      if (h.onShellSrgb > CORPUS.atShellSrgb.p90) {
        add({
          rule: 'on-the-shell',
          severity: 'info',
          mode,
          subjects: [],
          message: `${(h.onShellSrgb * 100).toFixed(0)}% of steps sit on the sRGB gamut shell, above the corpus p90 of ${(CORPUS.atShellSrgb.p90 * 100).toFixed(0)}% — the ramp has no chroma left to give`,
          evidence: { onShell: Number(h.onShellSrgb.toFixed(3)), corpusP90: CORPUS.atShellSrgb.p90 },
          remedy: 'nothing is wrong; but a future tweak toward more chroma will have no effect on these steps',
        });
      }
    }

    // ── promises ──────────────────────────────────────────────────────────────
    const pr = a.promises[mode];
    if (pr) {
      for (const c of pr.checked.filter((x) => !x.held)) {
        add({
          rule: 'promise-broken',
          severity: 'error',
          mode,
          subjects: [c.step],
          message: `step ${c.step} was promised ${c.threshold}:1 against the background and measures ${c.measured.toFixed(3)}:1 after quantization`,
          evidence: { threshold: c.threshold, measured: Number(c.measured.toFixed(4)) },
          remedy: 'this is a solver defect, not a palette one — the nudge pass should have caught it',
        });
      }
    }

    // ── a step doing two jobs ─────────────────────────────────────────────────
    const byStep: Record<string, string[]> = {};
    for (const s of set.semantics) {
      const k = s.evidence[mode]?.stepKey;
      if (k) (byStep[k] ??= []).push(s.role);
    }
    for (const [step, roles] of Object.entries(byStep)) {
      if (roles.length < 2) continue;
      const cats = new Set(roles.map((r) => r.split('/')[0]));
      if (cats.size < 2) continue; // border/strong and border/focus sharing a step is fine
      add({
        rule: 'step-shared-across-categories',
        severity: 'info',
        mode,
        subjects: roles,
        message: `step ${step} carries ${roles.join(', ')} — roles from ${cats.size} categories on one colour`,
        evidence: { step, roles: roles.join(', ') },
        remedy: 'a longer ramp would separate them; with this one they are the same colour used for different things',
      });
    }
  }

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  const order: Severity[] = ['error', 'warning', 'info'];
  findings.sort((x, y) => order.indexOf(x.severity) - order.indexOf(y.severity) || x.rule.localeCompare(y.rule));
  return { findings, counts, clean: counts.error === 0 };
}

/** All rule names, so `disable` can be checked against something. */
export const RULES = [
  'requirement-unmet', 'measures-disagree', 'state-indistinguishable', 'foreground-on-surface', 'cvd-steps-collapse',
  'cvd-families-collapse', 'cvd-standing', 'step-under-jnd', 'uneven-spacing', 'gamut-mapped',
  'srgb-sibling-drift', 'on-the-shell', 'promise-broken', 'step-shared-across-categories',
] as const;
export type RuleName = (typeof RULES)[number];
