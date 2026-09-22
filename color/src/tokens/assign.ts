/**
 * Phase 3.5 — assign semantic roles to steps from the contrast matrix.
 *
 * Nothing here declares that step 11 is text. It asks which step first clears
 * 4.5:1 and Lc 60 against the background this ramp was solved on, and answers
 * with the measurement and the evidence. When no step clears a requirement, the
 * role still resolves — to the best available step — and says what it is short
 * by, because a palette that cannot hold a role is a fact about the palette and
 * not a reason to fail.
 *
 * Two rules are structural rather than threshold-based, and both are earned:
 *
 *  - **The fill is decided first.** The brand solid is chroma-anchored (the seed's
 *    step, or where chroma peaks), and a step that holds a fill is not also a
 *    foreground. So the scan for text, icons and strong borders starts past the
 *    solid. Without this, `content/subtle` lands on the solid for every family
 *    whose solid happens to be dark — legal by WCAG, wrong by hierarchy, and the
 *    reason every reference numbers its solids below its text.
 *
 *  - **The surface chain is anchored on separation**, each link at least a JND
 *    from the one before, because no published criterion says how far apart a
 *    hover state should be.
 */
import type { SolvedRamp, SolvedStep } from '../solver/index.ts';
import { deltaEOK, type Oklch } from '../color/oklch.ts';
import { wcag21Fast, apcaFast } from '../contrast/fast.ts';
import { ROLES, type RoleSpec } from './roles.ts';

export interface RoleAssignment {
  role: string;
  /** The step that fills the role, or null when the role resolves to a color outside the ramp. */
  stepKey: string | null;
  stepIndex: number | null;
  color: Oklch;
  /** Set when the color is not a ramp step. */
  literal?: 'white' | 'black' | 'page';
  /** What the requirement was measured against. */
  against: { role: string; color: Oklch };
  measured: { wcag: number; apca: number; deltaE: number };
  /** Whether the rule's requirement held. */
  met: boolean;
  /** What it is short by, when it did not. */
  shortfall?: string;
  /** Which candidate won, for a foreground role. */
  chosenFrom?: string;
  /** Set when WCAG and APCA prefer different foregrounds — the mid-lightness fill problem. */
  disagreement?: { wcag: { candidate: string; value: number }; apca: { candidate: string; value: number } };
  /** The lightness the fill would need for the chosen foreground to clear both thresholds, or null if none would. */
  fillWould?: number | null;
}

/**
 * The lightness a fill would have to take, keeping its chroma and hue, for `fg`
 * to clear both thresholds on it. Contrast is monotone in the fill's lightness on
 * each side of the foreground, so each side bisects; the nearer solution wins.
 * Returns null when neither side has one — a fully saturated fill can run out of
 * room before it gets there.
 */
export function lightnessForForeground(fg: Oklch, fill: Oklch, wcag: number, apca: number): number | null {
  const ok = (L: number) => { const m = measure(fg, { ...fill, l: L }); return m.wcag >= wcag && m.apca >= apca; };
  const solve = (lo: number, hi: number): number | null => {
    if (!ok(hi)) return null;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
    return hi;
  };
  const darker = solve(fill.l, 0);
  const lighter = solve(fill.l, 1);
  if (darker === null) return lighter;
  if (lighter === null) return darker;
  return Math.abs(darker - fill.l) <= Math.abs(lighter - fill.l) ? darker : lighter;
}

export interface RoleAssignments {
  family: string;
  mode: 'light' | 'dark';
  page: Oklch;
  /** The step treated as the brand fill, and why. */
  solid: { stepKey: string; stepIndex: number; rule: 'seed' | 'key-step' | 'peak-chroma' };
  roles: Record<string, RoleAssignment>;
  /** Steps no role uses — spare capacity, not a defect. */
  unused: string[];
  warnings: string[];
}

export interface AssignOptions {
  /** Override the role table. */
  roles?: RoleSpec[];
  /** Name for the report; defaults to the ramp's selected family. */
  family?: string;
}

const WHITE: Oklch = { l: 1, c: 0, h: 0 };
const BLACK: Oklch = { l: 0, c: 0, h: 0 };

const measure = (fg: Oklch, bg: Oklch) => ({ wcag: wcag21Fast(fg, bg), apca: Math.abs(apcaFast(fg, bg)), deltaE: deltaEOK(fg, bg) });

/**
 * The step that carries the brand fill. In order: the seed's step, because a
 * seeded palette's brand color is the brand color and that is the premise of the
 * whole library; then the system's documented key step, because a documented key
 * step is a declared solid; then where chroma peaks, which is a measurement.
 */
export function solidStep(ramp: SolvedRamp): { stepIndex: number; rule: 'seed' | 'key-step' | 'peak-chroma' } {
  const seeded = ramp.steps.findIndex((s) => s.isSeed);
  if (seeded >= 0) return { stepIndex: seeded, rule: 'seed' };
  if (ramp.keyStep && ramp.keyStep.index >= 0 && ramp.keyStep.index < ramp.steps.length) return { stepIndex: ramp.keyStep.index, rule: 'key-step' };
  let best = 0;
  ramp.steps.forEach((s, i) => { if (s.color.oklch.c > ramp.steps[best]!.color.oklch.c) best = i; });
  return { stepIndex: best, rule: 'peak-chroma' };
}

export function assignRoles(ramp: SolvedRamp, opts: AssignOptions = {}): RoleAssignments {
  const specs = opts.roles ?? ROLES;
  const steps = ramp.steps;
  const page = ramp.background;
  const warnings: string[] = [];
  const roles: Record<string, RoleAssignment> = {};

  const solid = solidStep(ramp);
  const solidKey = steps[solid.stepIndex]!.key;

  const colorOf = (name: string): Oklch | null => {
    if (name === 'white') return WHITE;
    if (name === 'black') return BLACK;
    return roles[name]?.color ?? null;
  };

  const resolveAgainst = (spec: RoleSpec): { role: string; color: Oklch } => {
    if (spec.against.kind === 'page') return { role: 'page', color: page };
    const c = colorOf(spec.against.role);
    if (!c) throw new Error(`assignRoles: ${spec.name} is measured against ${spec.against.role}, which has not resolved yet — check ROLE order`);
    return { role: spec.against.role, color: c };
  };

  /**
   * Steps already spent on a fill. A fill is not a foreground, so the scan for
   * text skips these rather than starting past them — the difference matters,
   * because "start past the fill" would also rule out every step below it, and
   * a quiet role like disabled text legitimately lives down there.
   */
  const fills = new Set<number>();

  /**
   * Steps already spent on a surface. A foreground is painted *on* a surface, so
   * the two being the same colour is not a shared step — it is invisible text.
   * Measured before this rule existed (`spike/phase5-surfaces.ts`): across 12
   * references × 6 seeds × 2 modes, the only sub-JND foreground/surface pairs in
   * the whole corpus were `content/disabled` landing on `surface/active`, 30 of
   * 2304, in 8 of the 12 references — the light-mode disabled button with no
   * visible label. `content/disabled` picks the *least* contrasting step that
   * still clears its floor, so the next step along clears it too: skipping a
   * surface step costs the role nothing it was promised.
   */
  const surfaces = new Set<number>();

  for (const spec of specs) {
    if (spec.name === 'background/page') {
      roles[spec.name] = { role: spec.name, stepKey: null, stepIndex: null, color: page, literal: 'page', against: { role: 'page', color: page }, measured: measure(page, page), met: true };
      continue;
    }
    const against = resolveAgainst(spec);
    const put = (i: number | null, color: Oklch, met: boolean, extra: Partial<RoleAssignment> = {}) => {
      roles[spec.name] = {
        role: spec.name,
        stepKey: i === null ? null : steps[i]!.key,
        stepIndex: i,
        color,
        against,
        measured: measure(color, against.color),
        met,
        ...extra,
      };
    };

    if (spec.rule.kind === 'peak-chroma') {
      const i = Math.min(steps.length - 1, Math.max(0, solid.stepIndex + spec.rule.offset));
      const met = spec.rule.offset === 0 || deltaEOK(steps[i]!.color.oklch, steps[solid.stepIndex]!.color.oklch) >= 0.02;
      fills.add(i);
      put(i, steps[i]!.color.oklch, met);
      if (!met) {
        roles[spec.name]!.shortfall = `the step past the solid is only ΔEOK ${deltaEOK(steps[i]!.color.oklch, steps[solid.stepIndex]!.color.oklch).toFixed(4)} from it, under one JND — the hover state will not read as a change`;
      }
      continue;
    }

    if (spec.rule.kind === 'separation') {
      const min = spec.rule.minDeltaE;
      // Borders use the same ladder but are not surfaces: a border is a line beside
      // content, not a field behind it, so a foreground may share its step.
      const isSurface = spec.category === 'surface' || spec.name === 'background/subtle';
      const from = roles[spec.against.kind === 'role' ? spec.against.role : '']?.stepIndex;
      const start = from === null || from === undefined ? 0 : from + 1;
      // A step must be `min` from its predecessor *and* further from the page than the
      // predecessor was. ΔEOK is a distance, not a direction: a step can sit a JND from
      // the one before it by moving in chroma while moving back toward the background,
      // which is how Carbon's dark surface/active came out closer to the page than its
      // hover. The ladder has to go one way.
      const fromPage = spec.against.kind === 'role' && roles[spec.against.role] ? deltaEOK(roles[spec.against.role]!.color, page) : 0;
      let chosen = -1;
      for (let i = start; i < steps.length; i++) {
        if (steps[i]!.detached) continue; // a detached step is a solid's state, not a surface
        if (i >= solid.stepIndex) break;  // never take the fill or anything past it for a surface
        if (deltaEOK(steps[i]!.color.oklch, against.color) >= min && deltaEOK(steps[i]!.color.oklch, page) >= fromPage) { chosen = i; break; }
      }
      if (chosen < 0) {
        // Nothing before the solid is both far enough from the predecessor and further
        // from the page than it. Take the step that is furthest from the page — which
        // keeps the ladder going one way even when it has run out of rungs — and say so.
        let i = -1;
        for (let j = start; j < Math.min(steps.length, solid.stepIndex); j++) {
          if (steps[j]!.detached) continue;
          if (i < 0 || deltaEOK(steps[j]!.color.oklch, page) > deltaEOK(steps[i]!.color.oklch, page)) i = j;
        }
        // If even the furthest remaining step is closer to the page than the predecessor,
        // the ladder has run out: repeat the predecessor rather than step backwards. Two
        // tokens with one colour is a defect the caller can see; a state that moves the
        // wrong way is one they cannot.
        const prevIdx = spec.against.kind === 'role' ? roles[spec.against.role]?.stepIndex ?? null : null;
        const stalled = i < 0 || (prevIdx !== null && deltaEOK(steps[i]!.color.oklch, page) < fromPage);
        if (stalled && prevIdx !== null) i = prevIdx;
        if (i < 0) i = Math.max(0, Math.min(start, solid.stepIndex - 1));
        if (isSurface) surfaces.add(i);
        put(i, steps[i]!.color.oklch, false);
        roles[spec.name]!.shortfall = stalled
          ? `the ramp has no step past ${against.role} that is further from the page, so this repeats it`
          : `no step before the brand fill sits ΔEOK ${min} from ${against.role}; ${steps[i]!.key} is the furthest available, at ${deltaEOK(steps[i]!.color.oklch, against.color).toFixed(4)}`;
        warnings.push(`${spec.name}: the ramp runs out of surface steps before the brand fill — ${roles[spec.name]!.shortfall}. A ramp with more steps below its solid, or a solid further along, would hold this.`);
      } else {
        if (isSurface) surfaces.add(chosen);
        put(chosen, steps[chosen]!.color.oklch, true);
      }
      continue;
    }

    if (spec.rule.kind === 'contrast') {
      const ok = (s: SolvedStep) => {
        const m = measure(s.color.oklch, against.color);
        return (spec.rule.kind === 'contrast' && (spec.rule.wcag === undefined || m.wcag >= spec.rule.wcag) && (spec.rule.apca === undefined || m.apca >= spec.rule.apca));
      };
      // A step spent on a fill is not available as a foreground. Borders, icons and
      // indicators may use it — a focus ring in the brand color is ordinary.
      // A step spent on a *surface* is not available to anything painted on one:
      // text the colour of its own background is not quiet, it is absent. Borders
      // and indicators sit beside surfaces rather than on them, so they are free
      // to share; only the content and icon categories are held to this.
      const onASurface = spec.category === 'content' || spec.category === 'icon';
      const avail = [...steps.keys()].filter((i) =>
        (spec.allowFill || !fills.has(i)) && !(onASurface && surfaces.has(i)));
      const order = spec.rule.pick === 'least' ? avail : avail.slice().reverse();
      const chosen = order.find((i) => ok(steps[i]!));
      if (chosen === undefined) {
        // nothing available clears it: take the most contrasting step and report the gap
        let best = avail[avail.length - 1] ?? steps.length - 1;
        for (const i of avail) if (measure(steps[i]!.color.oklch, against.color).apca > measure(steps[best]!.color.oklch, against.color).apca) best = i;
        const m = measure(steps[best]!.color.oklch, against.color);
        put(best, steps[best]!.color.oklch, false);
        const want: string[] = [];
        if (spec.rule.wcag !== undefined && m.wcag < spec.rule.wcag) want.push(`${spec.rule.wcag}:1 (best ${m.wcag.toFixed(2)})`);
        if (spec.rule.apca !== undefined && m.apca < spec.rule.apca) want.push(`Lc ${spec.rule.apca} (best ${m.apca.toFixed(0)})`);
        roles[spec.name]!.shortfall = `no step reaches ${want.join(' or ')} against ${against.role}`;
        warnings.push(`${spec.name}: this ramp cannot hold it on this background — ${roles[spec.name]!.shortfall}. ${spec.source}`);
      } else {
        put(chosen, steps[chosen]!.color.oklch, true);
      }
      continue;
    }

    // ── foreground on a fill ─────────────────────────────────────────────────
    // This is where palettes actually break, and where the two contrast models stop
    // agreeing. Radix's blue-9 takes white at 3.26:1 / Lc 65 and black at 6.43:1 /
    // Lc 45: white passes APCA's body-text level and fails WCAG AA, black does the
    // reverse. Either measure alone is satisfiable on all 25 of Radix's solids; both
    // at once are not, on 15 of them. So the assignment reports which candidate each
    // measure prefers, and how far the fill would have to move for one colour to
    // satisfy both — which is the decision a designer actually has to make.
    const { candidates, wcag, apca, prefer = 'wcag' } = spec.rule;
    const scored = candidates
      .map((name) => ({ name, color: colorOf(name) }))
      .filter((c): c is { name: string; color: Oklch } => c.color !== null)
      .map((c) => ({ ...c, index: c.name === 'white' || c.name === 'black' ? null : roles[c.name]?.stepIndex ?? null, m: measure(c.color, against.color) }));
    const lit = (n: string) => (n === 'white' || n === 'black' ? { literal: n as 'white' | 'black' } : roles[n]?.literal ? { literal: roles[n]!.literal! } : {});
    if (scored.length) {
      const both = scored.find((c) => c.m.wcag >= wcag && c.m.apca >= apca);
      const byWcag = scored.reduce((a, b) => (b.m.wcag > a.m.wcag ? b : a));
      const byApca = scored.reduce((a, b) => (b.m.apca > a.m.apca ? b : a));
      const pick = both ?? (prefer === 'wcag' ? byWcag : byApca);
      put(pick.index, pick.color, !!both, { chosenFrom: pick.name, ...lit(pick.name) });
      const r = roles[spec.name]!;
      if (byWcag.name !== byApca.name) {
        r.disagreement = { wcag: { candidate: byWcag.name, value: byWcag.m.wcag }, apca: { candidate: byApca.name, value: byApca.m.apca } };
      }
      if (!both) {
        // how far the fill would have to move for `pick` to clear both
        const need = lightnessForForeground(pick.color, against.color, wcag, apca);
        r.fillWould = need;
        r.shortfall = `nothing clears ${wcag}:1 and Lc ${apca} on ${against.role}: ${pick.name} reaches ${pick.m.wcag.toFixed(2)}:1 / Lc ${pick.m.apca.toFixed(0)}`;
        const dis = r.disagreement
          ? ` WCAG prefers ${byWcag.name} (${byWcag.m.wcag.toFixed(2)}:1) and APCA prefers ${byApca.name} (Lc ${byApca.m.apca.toFixed(0)}) — the two measures disagree about which way to go, which is what a mid-lightness fill does to them.`
          : '';
        const move = need === null ? ' No lightness of this fill carries it.' : ` ${pick.name} would clear both with the fill at L ${need.toFixed(3)}, against its ${against.color.l.toFixed(3)}.`;
        warnings.push(`${spec.name}: ${r.shortfall}.${dis}${move}`);
      }
    }
  }

  // Two tokens that are meant to differ and do not. A state nobody can see is a
  // defect in the palette, not in the assignment, so it is reported rather than
  // repaired — moving one of them would break the requirement that put it there.
  const pairs: [string, string, string][] = [
    ['surface/normal', 'surface/hover', 'the hover state will not read as a change'],
    ['surface/hover', 'surface/active', 'pressed will look the same as hovered'],
    ['border/subtle', 'border/normal', 'the two border weights are one border weight'],
    ['background/solid', 'background/solid/hover', 'the solid will not appear to respond to the pointer'],
    ['content/subtle', 'content/disabled', 'disabled text will look like ordinary secondary text'],
    ['content/subtle', 'content/normal', 'the text hierarchy has one level, not two'],
  ];
  for (const [a, b, why] of pairs) {
    const x = roles[a], y = roles[b];
    if (!x || !y) continue;
    const de = deltaEOK(x.color, y.color);
    if (de < 0.02) warnings.push(`${a} and ${b} are ΔEOK ${de.toFixed(4)} apart, under one JND${x.stepKey && x.stepKey === y.stepKey ? ` (both on step ${x.stepKey})` : ''} — ${why}`);
  }

  const used = new Set(Object.values(roles).map((r) => r.stepKey).filter((k): k is string => k !== null));
  return {
    family: opts.family ?? ramp.selection.families[0]?.family ?? 'unknown',
    mode: ramp.dna.mode,
    page,
    solid: { stepKey: solidKey, stepIndex: solid.stepIndex, rule: solid.rule },
    roles,
    unused: steps.map((s) => s.key).filter((k) => !used.has(k)),
    warnings,
  };
}

/** How far an assignment sits from a system's own documented step roles. */
export function roleAgreement(a: RoleAssignments, documented: Record<string, number>, specs: RoleSpec[] = ROLES): {
  rows: { role: string; got: string | null; want: number | null; delta: number | null }[];
  exact: number;
  withinOne: number;
  of: number;
} {
  const rows: { role: string; got: string | null; want: number | null; delta: number | null }[] = [];
  for (const spec of specs) {
    if (spec.radixStep === undefined) continue;
    const got = a.roles[spec.name];
    const gotStep = got?.stepKey === null || got === undefined ? null : Number(got.stepKey);
    const want = spec.radixStep;
    rows.push({ role: spec.name, got: got?.stepKey ?? null, want, delta: gotStep === null || Number.isNaN(gotStep) ? null : gotStep - want });
    void documented;
  }
  const deltas = rows.map((r) => r.delta).filter((d): d is number => d !== null);
  return { rows, exact: deltas.filter((d) => d === 0).length, withinOne: deltas.filter((d) => Math.abs(d) <= 1).length, of: deltas.length };
}
