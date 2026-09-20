/**
 * Phase 3.5 — build a token set from solved ramps.
 *
 * One token, two values. A semantic token is one thing with a value per mode,
 * not two tokens that happen to share a name: `content/normal` is `blue-12` in
 * light and `blue-12` in dark, but `border/strong` can be `blue-9` in light and
 * `blue-10` in dark, and only a per-mode value can say that. This is also how
 * Figma Variables model modes, so the mapping out is direct.
 *
 * Token identity is a stable ID in `$extensions`, not the path. Renaming
 * `surface/hover` does not make it a different token, and a build tool that
 * tracks IDs can follow the rename; one that tracks names cannot. The ID is a
 * deterministic hash of the token's kind and its primitive coordinates, so the
 * same palette always produces the same IDs without storing any state.
 */
import { converter } from 'culori';
import type { SolvedRamp, SolvedStep } from '../solver/index.ts';
import type { SolvedPair } from '../solver/pair.ts';
import type { Gamut } from '../gamut/shell.ts';
import type { Oklch } from '../color/oklch.ts';
import { assignRoles, type RoleAssignments, type RoleAssignment } from './assign.ts';
import { ROLES, type RoleSpec } from './roles.ts';

export type Mode = 'light' | 'dark';

export interface TokenColor {
  oklch: Oklch;
  /** `oklch(l c h)` — canonical. */
  css: string;
  /** sRGB hex. For a P3 token this is the sRGB sibling, which is what Figma and any 8-bit consumer gets. */
  hex: string;
  /** The value in the output gamut: hex for sRGB, `color(display-p3 …)` for P3. */
  native: string;
  space: Gamut;
  /** ΔEOK between `native` and `hex`, when they differ. */
  siblingDeltaE: number;
}

export interface PrimitiveEvidence {
  n: number;
  isSeed: boolean;
  detached: boolean;
  role?: string;
  contrastVsBackground: { wcag: number; apca: number };
  mappingDeltaE: number;
  quantizationDeltaE: number;
}

export interface PrimitiveToken {
  id: string;
  family: string;
  step: string;
  kind: 'chromatic' | 'neutral';
  values: Record<Mode, TokenColor>;
  evidence: Record<Mode, PrimitiveEvidence>;
}

export interface SemanticEvidence {
  stepKey: string | null;
  against: { role: string; wcag: number; apca: number; deltaE: number };
  met: boolean;
  shortfall?: string;
  chosenFrom?: string;
  disagreement?: RoleAssignment['disagreement'];
  fillWould?: number | null;
}

export interface SemanticToken {
  id: string;
  role: string;
  /** `{category}/{subcategory}/{state}` split for nesting. */
  path: string[];
  family: string;
  values: Record<Mode, TokenColor>;
  /** The primitive it points at, per mode. Null where it resolves to white, black or the page. */
  alias: Record<Mode, { family: string; step: string } | null>;
  literal: Record<Mode, 'white' | 'black' | 'page' | null>;
  evidence: Record<Mode, SemanticEvidence>;
  spec: { source: string; description: string };
}

export interface TokenSet {
  name: string;
  modes: Mode[];
  gamut: Gamut;
  backgrounds: Partial<Record<Mode, Oklch>>;
  primitives: PrimitiveToken[];
  semantics: SemanticToken[];
  /** Everything needed to say where these numbers came from. */
  provenance: {
    reference: string;
    referenceName: string;
    darkReference?: { id: string; kind: 'authored' | 'derived' };
    seed: Oklch | null;
    seedStep: string | null;
    spacing: string;
    numbering: string | null;
    toolchain: string;
    generatedAt: string;
  };
  /** Per-mode role assignments, kept so a report can show the reasoning. */
  assignments: Partial<Record<Mode, RoleAssignments>>;
  warnings: string[];
}

/**
 * FNV-1a, 64-bit, in two 32-bit halves. Deterministic, dependency-free, and
 * adequate for identifying a few hundred tokens: the birthday bound on 64 bits
 * is about 5 billion tokens for a 1-in-a-billion collision.
 */
export function stableId(...parts: string[]): string {
  const s = parts.join('\u0000');
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5 ^ 0x5bf03635;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i; h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return (h1.toString(36).padStart(7, '0') + h2.toString(36).padStart(7, '0')).slice(0, 13);
}

const colorOf = (s: SolvedStep, gamut: Gamut): TokenColor => ({
  oklch: s.color.oklch,
  css: s.color.css,
  hex: gamut === 'p3' ? (s.sibling?.native ?? s.color.native) : s.color.native,
  native: s.color.native,
  space: gamut,
  siblingDeltaE: s.sibling?.deltaEFromP3 ?? 0,
});

/** A color that is not a ramp step (white, black, the page) rendered as a token value. */
function literalColor(c: Oklch, gamut: Gamut, sample: SolvedStep): TokenColor {
  // reuse the solver's own formatting by borrowing the sample's space
  const fmt = (v: number, d: number) => Number(v.toFixed(d)).toString();
  const css = `oklch(${fmt(c.l, 4)} ${fmt(c.c, 4)} ${fmt(Number.isNaN(c.h) ? 0 : c.h, 2)})`;
  void sample;
  const hex = oklchToHex(c);
  return { oklch: c, css, hex, native: gamut === 'p3' ? hex : hex, space: gamut, siblingDeltaE: 0 };
}

const toRgb = converter('rgb');
/** sRGB hex of an OKLCH color, clipped. Used only for white, black and the page colour. */
function oklchToHex(c: Oklch): string {
  const r = toRgb({ mode: 'oklch', l: c.l, c: c.c, h: Number.isNaN(c.h) ? undefined : c.h });
  const q = (v: number | undefined) => Math.min(255, Math.max(0, Math.round((v ?? 0) * 255)));
  return `#${[q(r.r), q(r.g), q(r.b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export interface BuildOptions {
  /** Name for the set. Default: the reference's name plus the seed. */
  name?: string;
  /** Extra chromatic families to emit as primitives, keyed by name. */
  families?: Record<string, { light: SolvedRamp; dark?: SolvedRamp }>;
  /** Neutral ramps to emit as primitives. */
  neutrals?: Record<string, { light: SolvedRamp; dark?: SolvedRamp }>;
  /** The family name the seed's ramp is filed under. Default `'brand'`. */
  brandName?: string;
  /** Override the role table. */
  roles?: RoleSpec[];
  now?: () => string;
}

/**
 * Build a token set from a solved light/dark pair. The pair's own ramp becomes
 * the brand family and carries the semantic roles; further families and the
 * neutrals come through `families` and `neutrals`.
 */
export function buildTokens(pair: SolvedPair, opts: BuildOptions = {}): TokenSet {
  const modes: Mode[] = ['light', 'dark'];
  const gamut = pair.light.gamut;
  const brand = opts.brandName ?? 'brand';
  const warnings: string[] = [...pair.warnings, ...pair.darkSource.warnings];

  const ramps: Record<string, { kind: 'chromatic' | 'neutral'; byMode: Partial<Record<Mode, SolvedRamp>> }> = {
    [brand]: { kind: 'chromatic', byMode: { light: pair.light, dark: pair.dark } },
  };
  for (const [name, r] of Object.entries(opts.families ?? {})) ramps[name] = { kind: 'chromatic', byMode: { light: r.light, ...(r.dark ? { dark: r.dark } : {}) } };
  if (pair.neutrals) ramps[pair.neutrals.light.neutral?.family ?? 'neutral'] = { kind: 'neutral', byMode: { light: pair.neutrals.light, dark: pair.neutrals.dark } };
  for (const [name, r] of Object.entries(opts.neutrals ?? {})) ramps[name] = { kind: 'neutral', byMode: { light: r.light, ...(r.dark ? { dark: r.dark } : {}) } };

  // ── primitives ──────────────────────────────────────────────────────────────
  const primitives: PrimitiveToken[] = [];
  for (const [family, { kind, byMode }] of Object.entries(ramps)) {
    const keys = byMode.light?.steps.map((s) => s.key) ?? byMode.dark?.steps.map((s) => s.key) ?? [];
    for (const key of keys) {
      const values = {} as Record<Mode, TokenColor>;
      const evidence = {} as Record<Mode, PrimitiveEvidence>;
      for (const m of modes) {
        const ramp = byMode[m];
        const step = ramp?.steps.find((s) => s.key === key);
        if (!ramp || !step) continue;
        values[m] = colorOf(step, gamut);
        evidence[m] = {
          n: step.n, isSeed: step.isSeed, detached: step.detached, ...(step.role ? { role: step.role } : {}),
          contrastVsBackground: { wcag: step.contrast.wcagVsBg, apca: step.contrast.apcaOnBg },
          mappingDeltaE: step.mappingDeltaE, quantizationDeltaE: step.quantizationDeltaE,
        };
      }
      if (!Object.keys(values).length) continue;
      primitives.push({ id: stableId('primitive', family, key), family, step: key, kind, values, evidence });
    }
  }

  // ── semantics ───────────────────────────────────────────────────────────────
  const specs = opts.roles ?? ROLES;
  const assignments: Partial<Record<Mode, RoleAssignments>> = {};
  for (const m of modes) {
    const ramp = m === 'light' ? pair.light : pair.dark;
    assignments[m] = assignRoles(ramp, { family: brand, roles: specs });
    for (const w of assignments[m]!.warnings) warnings.push(`[${m}] ${w}`);
  }

  const semantics: SemanticToken[] = [];
  for (const spec of specs) {
    const values = {} as Record<Mode, TokenColor>;
    const alias = {} as Record<Mode, { family: string; step: string } | null>;
    const literal = {} as Record<Mode, 'white' | 'black' | 'page' | null>;
    const evidence = {} as Record<Mode, SemanticEvidence>;
    let any = false;
    for (const m of modes) {
      const a = assignments[m]?.roles[spec.name];
      const ramp = m === 'light' ? pair.light : pair.dark;
      if (!a) continue;
      any = true;
      const step = a.stepIndex === null ? null : ramp.steps[a.stepIndex] ?? null;
      values[m] = step ? colorOf(step, gamut) : literalColor(a.color, gamut, ramp.steps[0]!);
      alias[m] = step ? { family: brand, step: step.key } : null;
      literal[m] = a.literal ?? null;
      evidence[m] = {
        stepKey: a.stepKey,
        against: { role: a.against.role, wcag: a.measured.wcag, apca: a.measured.apca, deltaE: a.measured.deltaE },
        met: a.met,
        ...(a.shortfall ? { shortfall: a.shortfall } : {}),
        ...(a.chosenFrom ? { chosenFrom: a.chosenFrom } : {}),
        ...(a.disagreement ? { disagreement: a.disagreement } : {}),
        ...(a.fillWould !== undefined ? { fillWould: a.fillWould } : {}),
      };
    }
    if (!any) continue;
    semantics.push({
      id: stableId('semantic', spec.name),
      role: spec.name,
      path: spec.name.split('/'),
      family: brand,
      values, alias, literal, evidence,
      spec: { source: spec.source, description: spec.description },
    });
  }

  const seed = pair.light.target.seed;
  return {
    name: opts.name ?? (seed ? `${pair.light.dna.name} · seeded` : pair.light.dna.name),
    modes,
    gamut,
    backgrounds: { light: pair.light.background, dark: pair.dark.background },
    primitives,
    semantics,
    provenance: {
      reference: pair.light.dna.id,
      referenceName: pair.light.dna.name,
      darkReference: { id: pair.darkSource.id, kind: pair.darkSource.kind },
      seed,
      seedStep: pair.pin?.stepKey ?? null,
      spacing: pair.light.spacing.mode,
      numbering: pair.light.dna.numbering,
      toolchain: 'palette-dna',
      generatedAt: (opts.now ?? (() => new Date().toISOString()))(),
    },
    assignments,
    warnings,
  };
}
