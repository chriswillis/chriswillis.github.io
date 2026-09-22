/**
 * Phase 3 — dark mode. Derive a dark DNA from a light one by mirroring in the
 * contrast-to-background domain, as the brief requires, with the parameters set
 * by the only reference that ships both modes (Radix, 25 families × 12 steps).
 *
 * What the measurement found (spike/phase3.ts, spike/phase3b.ts):
 *
 *  1. **The key step is pinned, not mirrored.** Radix's step 9 — the brand
 *     solid — is byte-identical between its light and dark scales in all 25
 *     families (ΔEOK exactly 0). Its contrast gain has cv 1.11 across hues
 *     because it is not a contrast step at all: blue-9 is 3.18:1 on the light
 *     surface and 5.78:1 on the dark one, yellow-9 is 1.23:1 and 14.93:1. Any
 *     contrast mirror applied there is wrong by construction. Every other step's
 *     gain has cv 0.01–0.22. Dropping the pin costs more than every other
 *     parameter here put together: RMS ΔEOK 0.120 against 0.046.
 *
 *  2. **WCAG under-corrects for polarity and APCA over-corrects; the truth is
 *     halfway.** Mirroring WCAG 2.1 contrast exactly needs a per-step gain of
 *     1.0 → 1.9 to reach Radix's dark scale; mirroring APCA Lc exactly needs
 *     0.44 → 0.93. The two bracket the answer. Taking the lightness λ of the way
 *     from the WCAG solution to the APCA one and fitting that one number gives
 *     0.486 ± 0.242 over the 166 observable steps, and λ = 0.5 halves the error
 *     of either pure mirror. A per-step λ(n) fit to Radix does ~10% better
 *     again, at the cost of ten more parameters from a single system, so it is
 *     opt-in (`lambda: 'radix'`).
 *
 *  3. **Below |Lc| 8 APCA cannot be inverted**, so the subtle steps have nothing
 *     to blend and fall back to a bare WCAG mirror — which lands them about
 *     0.04 L too close to the surface, WCAG being exactly the polarity-blind
 *     measure λ exists to correct. The measured WCAG gain there (1.01, 1.04,
 *     1.12) is the tightest number in this file, cv 0.01–0.05 across 25 hues,
 *     and applies in full.
 *
 *  4. **The chroma transfer needs its own blend weight.** The source system's
 *     w(n) was fit for transfer between hues at one lightness; a mode flip moves
 *     a step the length of the lightness axis, where the shell is a different
 *     width, so a relative transfer multiplies chroma instead of preserving it.
 *     The fitted transfer weights are near-absolute at the subtle end and
 *     relative only around the solid, with a per-step factor above 1 at the
 *     background end — Phase 0 predicted both.
 *
 *  5. **Some hues cannot hold the DNA at the other end of the axis.** Tailwind's
 *     yellow-300 carries C 0.16 at L 0.90; at the L 0.34 the mirror sends it to,
 *     no color of that hue holds half of it. Those steps are capped at the shell
 *     and listed in `derivedFrom.shellLimited` rather than handed to the gamut
 *     mapper to take away quietly.
 *
 *  6. **Neutrals are not pinned** — Radix re-authors its grays per mode (their
 *     closest step is ΔEOK 0.023 apart) — so they mirror with no anchor, and
 *     agree with Radix's own to RMS ΔL 0.042, the loosest fit here.
 *
 * Scored end to end against Radix's authored dark scale, with the whole pipeline
 * in place (mirror, pin, separation pass, gamut map, 8-bit quantization): RMS
 * ΔEOK 0.046, median 0.023, 68% of steps within two JND, against 0.088 for the
 * bare WCAG mirror and 0.096 for the bare APCA one. Every parameter is fit
 * leave-one-family-out, so nothing in a hue's own dark scale set the numbers
 * used to predict it — but they all come from one system, which is the honest
 * limit of this: Radix is the only reference here that ships both modes. When a
 * reference ships its own dark scale, extract that instead.
 *
 * The derivation emits *colors* and runs them back through `extractSystemDNA`,
 * so a derived dark DNA is structurally identical to an extracted one — same
 * spine detection, same refit w(n), same numbering metrics — and everything
 * downstream (solveRamp, solveNeutralRamp, even spacing, siblings) works on it
 * unchanged.
 */
import type { SystemDNA, FamilyDNA, SourceInfo } from '../dna/schema.ts';
import type { NeutralDNA } from '../dna/neutrals.ts';
import type { Ramp } from '../ingest/types.ts';
import type { CentroidTable } from '../dna/centroids.ts';
import { extractSystemDNA } from '../dna/system.ts';
import { shell, type Gamut } from '../gamut/shell.ts';
import { parseToOklch, deltaEOK, wrap360, type Oklch } from '../color/oklch.ts';
import { wcag21Fast, apcaFast } from '../contrast/fast.ts';
import { linear } from '../dna/curves.ts';
import { JND } from '../dna/weights.ts';
import { gamutMap, quantize } from '../solver/index.ts';

/** Below this |Lc| APCA is not invertible (it clamps toward the background), so the WCAG solution is used alone. */
export const APCA_INVERTIBLE_LC = 8;

/** Where a dark surface stops being a surface and starts being text. */
const SURFACE_MAX_L = 0.22;

export interface DarkMirrorCalibration {
  source: string;
  /** Normalized step positions the curves are defined on. */
  n: number[];
  /** Per-position λ: 0 mirrors WCAG 2.1 contrast, 1 mirrors APCA Lc. */
  lambda: number[];
  /** Per-position multiplier on the transferred chroma. */
  chroma: number[];
  /**
   * Per-position blend weight for the light → dark chroma transfer: 1 keeps the
   * step's share of the gamut shell, 0 keeps its absolute chroma. This is *not*
   * the source system's own w(n), which was fit for transfer between hues at the
   * same lightness. A mode flip moves a step from L 0.97 to L 0.16, where the
   * shell is fifteen times wider, so a relative transfer there multiplies the
   * chroma rather than preserving it: Tailwind's `blue-50`, a barely tinted white
   * at C 0.013, comes out at C 0.09 — a saturated indigo where a whisper was
   * meant. Fit on Radix by grid search per step (mean |ΔC| 0.0129 against 0.0148
   * for the source's own w), it is near-absolute at the subtle end and relative
   * only around the solid.
   */
  transferW: number[];
  /**
   * WCAG contrast gain to apply where APCA is not invertible. Below |Lc| 8 APCA
   * clamps toward the background and cannot be solved backwards, so the two-mirror
   * blend has nothing to blend with and the subtle steps fall back to a bare WCAG
   * mirror — which comes out about 0.04 L too close to the surface, because WCAG is
   * exactly the polarity-blind measure λ exists to correct. This is the measured
   * continuation of λ into that region, and it is the best-determined number here:
   * cv 0.01–0.05 across the 25 hues — the best-determined number in this file, which
   * is why it applies in full rather than being hedged by λ. Turn it off with
   * `nearSurfaceGain: false` to get a bare mirror.
   */
  nearSurfaceGain: number[];
}

/**
 * Fit on Radix 3.0.0, light → dark, 25 families, leave-one-family-out. λ is
 * undefined at the two role steps (9 and 10: the solid and its hover) because
 * they are pinned; the values there are interpolated from their neighbours so
 * the curve stays usable for systems that pin a different step.
 */
export const RADIX_CALIBRATION: DarkMirrorCalibration = {
  source: '@radix-ui/colors 3.0.0 light → dark, 25 families × 12 steps, leave-one-family-out',
  n: [0, 1 / 11, 2 / 11, 3 / 11, 4 / 11, 5 / 11, 6 / 11, 7 / 11, 8 / 11, 9 / 11, 10 / 11, 1],
  //   the first three steps never reach |Lc| 8, so λ is unobservable there and
  //   `nearSurfaceGain` does the work instead (the value is a placeholder that never
  //   applies); 8/11 and 9/11 are interpolated across the pin.
  lambda: [0.5, 0.5, 0.5, 0.27, 0.38, 0.38, 0.40, 0.42, 0.55, 0.67, 0.80, 0.67],
  chroma: [2.77, 1.20, 1.13, 1.20, 1.14, 1.05, 0.99, 0.93, 1.00, 0.98, 1.03, 1.00],
  transferW: [0.05, 0.15, 0.35, 0.35, 0.30, 0.25, 0.25, 0.30, 0.25, 0.20, 0.60, 0.65],
  nearSurfaceGain: [1.010, 1.040, 1.116, 1.174, 1.246, 1.333, 1.442, 1.546, 1.00, 1.00, 1.930, 1.241],
};

/** The single-number default: measured λ over Radix's non-pinned steps is 0.486 ± 0.242. */
export const BALANCED_LAMBDA = 0.5;

export interface DarkMirrorOptions {
  /**
   * 0 mirrors WCAG 2.1 contrast, 1 mirrors APCA Lc, in between blends the two
   * lightness solutions. Default 0.5 — measured. `'radix'` uses the per-step
   * curve fit to Radix instead.
   */
  lambda?: number | 'radix';
  /** Chroma multiplier on the transferred blend: a flat number, `'radix'` (the measured per-step curve, default) or `'none'`. */
  chroma?: number | 'radix' | 'none';
  /**
   * Which chroma policy carries the transfer. `'transfer'` (default) uses the
   * measured light → dark weights; `'source'` reuses the source system's own
   * w(n), which is fit for hue-to-hue transfer at constant lightness and
   * over-saturates the subtle steps across a mode flip.
   */
  chromaPolicy?: 'transfer' | 'source';
  /**
   * Correct the steps too close to the surface for APCA to reach, where the blend
   * has nothing to blend with. `true` (default) applies the measured WCAG gain;
   * `false` leaves them on a bare mirror. `lambda: 0, nearSurfaceGain: false` is
   * the pure WCAG mirror, with no calibration in it at all.
   */
  nearSurfaceGain?: boolean | number[];
  /** The dark surface the ramp will sit on. Default: the light system's own darkest neutral step. */
  surface?: string | Oklch;
  /** The light surface its contrast was measured against. Default: the light system's own lightest neutral step, else white. */
  lightSurface?: string | Oklch;
  /**
   * Hold the key step at its light-mode color, as Radix does with its solids.
   * `'auto'` (default) pins only when the system *documents* a key step — Tailwind
   * 500, Radix 9, Carbon 60, Primer 5, Material 500 — because a documented key step
   * is the declared brand solid, the one color that must not change between modes.
   * Where the key step is merely wherever chroma happens to peak (Spectrum, Polaris,
   * Atlassian, Open Color, Open Props, Web Awesome) there is nothing designated to
   * pin, and pinning a step that sits near the light surface breaks the ladder above
   * it: Spectrum's yellow peaks at step 300 of 14, and pinning that at L 0.88 leaves
   * the eleven steps that must out-contrast it nothing but the top of the axis to
   * fight over. `true` forces it anyway; `false` never pins.
   */
  pinKeyStep?: boolean | 'auto';
  /**
   * Floor on the ΔEOK between adjacent steps, enforced after mirroring by pushing
   * the later step away from the surface. Default 0.02 (one JND): the pin squeezes
   * the steps above it, and without this 15 of Radix's 25 families come out with an
   * adjacent pair a user could not tell apart. 0 disables it.
   */
  minStepDeltaE?: number;
  gamut?: Gamut;
  id?: string;
  name?: string;
  centroids?: CentroidTable;
  now?: () => string;
}

export interface DarkDerivation {
  from: string;
  lambda: number | 'radix';
  chroma: number | 'radix' | 'none';
  chromaPolicy: 'transfer' | 'source';
  nearSurfaceGain: boolean;
  calibration: string;
  lightSurface: Oklch;
  darkSurface: Oklch;
  surfaceRule: 'given' | 'darkest-neutral';
  pinnedKey: string | null;
  /** Steps whose mirrored color fell outside the gamut and were mapped. */
  mapping: { steps: number; total: number; meanDeltaE: number; maxDeltaE: number };
  /** Steps whose reference contrast cannot be reached on this surface at all. */
  unreachable: { family: string; key: string; want: number; got: number }[];
  /** Steps pushed apart because the pin squeezed them below `minStepDeltaE` (see `separate`). */
  separated: { family: string; key: string; was: number; deltaL: number }[];
  /** Steps whose hue cannot hold the transferred chroma at the lightness the mirror sent them to. */
  shellLimited: { family: string; key: string; wanted: number; got: number }[];
  warnings: string[];
}

/** Serialized DNA stores a NaN hue as JSON null, so an achromatic step can arrive as either. */
const hueOf = (h: number | null | undefined): number => (Number.isFinite(h as number) ? (h as number) : 0);

const asOklch = (c: string | Oklch): Oklch => {
  const o = typeof c === 'string' ? parseToOklch(c) : c;
  return { l: o.l, c: o.c, h: Number.isNaN(o.h) ? 0 : wrap360(o.h) };
};

/** Bisect L so f(L) = target; f monotone on [lo, hi]. */
function bisectL(f: (L: number) => number, target: number, lo: number, hi: number): { L: number; reached: boolean } {
  const flo = f(lo), fhi = f(hi);
  const inc = fhi > flo;
  if ((inc && (target <= flo || target >= fhi)) || (!inc && (target >= flo || target <= fhi))) {
    return { L: Math.abs(target - flo) < Math.abs(target - fhi) ? lo : hi, reached: false };
  }
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if ((f(m) < target) === inc) lo = m; else hi = m; }
  return { L: (lo + hi) / 2, reached: true };
}

export interface MirrorStepInput {
  /** The light-mode color of this step. */
  from: Oklch;
  /** The surface its contrast is measured against (light mode). */
  lightSurface: Oklch;
  /** The surface the result will sit on (dark mode). */
  darkSurface: Oklch;
  /** Chroma of the result, as a function of its lightness (the transfer re-evaluates relC at the new L). */
  chromaAt: (L: number) => number;
  /** Hue of the result. */
  hue: number;
  lambda: number;
  /** WCAG contrast gain applied where APCA is not invertible; 1 is a bare mirror. */
  nearSurfaceGain?: number;
  /** Solve within this lightness window instead of [darkSurface.l, 1] — used for a step that hangs off an anchor. */
  window?: [number, number];
}

/**
 * The core of the mirror: one step's lightness, solved so that its contrast
 * against the dark surface matches what it had against the light one, λ of the
 * way from the WCAG 2.1 solution to the APCA one. Iterated three times because
 * chroma perturbs luminance and so moves the target.
 */
export function mirrorStep(input: MirrorStepInput): { l: number; c: number; h: number; reached: boolean; method: 'wcag' | 'apca-blend' } {
  const { from, lightSurface, darkSurface, chromaAt, hue, lambda } = input;
  const tA = Math.abs(apcaFast(from, lightSurface));
  const invertible = tA >= APCA_INVERTIBLE_LC && lambda > 0;
  // where APCA cannot be inverted, λ has nothing to blend with, so it scales the
  // measured WCAG gain instead (see RADIX_CALIBRATION.nearSurfaceGain)
  const gain = invertible ? 1 : (input.nearSurfaceGain ?? 1);
  const tW = gain * wcag21Fast(from, lightSurface);
  const [lo, hi] = input.window ?? (darkSurface.l < 0.5 ? [darkSurface.l, 1] : [0, darkSurface.l]);
  let L = from.l;
  let C = chromaAt(L);
  let reached = true;
  for (let it = 0; it < 3; it++) {
    const w = bisectL((Lv) => wcag21Fast({ l: Lv, c: C, h: hue }, darkSurface), tW, lo, hi);
    let Lx = w.L;
    reached = w.reached;
    if (invertible) {
      const a = bisectL((Lv) => Math.abs(apcaFast({ l: Lv, c: C, h: hue }, darkSurface)), tA, lo, hi);
      Lx = (1 - lambda) * w.L + lambda * a.L;
      reached = w.reached && a.reached;
    }
    L = Lx;
    C = chromaAt(L);
  }
  return { l: L, c: Math.max(0, C), h: hue, reached, method: invertible ? 'apca-blend' : 'wcag' };
}

/** The default dark surface: the light system's own darkest neutral step. */
export function defaultDarkSurface(light: SystemDNA): { surface: Oklch; family: string | null } {
  let best: { L: number; c: number; h: number; family: string } | null = null;
  for (const n of Object.values(light.neutrals)) {
    for (let i = 0; i < n.knots.L.length; i++) {
      if (!best || n.knots.L[i]! < best.L) best = { L: n.knots.L[i]!, c: n.knots.C[i]!, h: hueOf(n.knots.h[i]), family: n.family };
    }
  }
  if (!best) return { surface: { l: 0.15, c: 0, h: 0 }, family: null };
  return { surface: { l: best.L, c: best.c, h: best.h }, family: best.family };
}

function defaultLightSurface(light: SystemDNA): Oklch {
  let best: Oklch | null = null;
  for (const n of Object.values(light.neutrals)) {
    for (let i = 0; i < n.knots.L.length; i++) {
      if (!best || n.knots.L[i]! > best.l) best = { l: n.knots.L[i]!, c: n.knots.C[i]!, h: hueOf(n.knots.h[i]) };
    }
  }
  return best ?? { l: 1, c: 0, h: 0 };
}

function curveFrom(cal: number[], ns: number[]): (n: number) => number {
  const f = linear(ns, cal);
  return (n: number) => f(Math.min(1, Math.max(0, n)));
}

/** Mirror one family's steps. Exported for the validation harness. */
export function mirrorFamily(
  f: Pick<FamilyDNA, 'knots' | 'spine' | 'keyIndex'>,
  cfg: { lightSurface: Oklch; darkSurface: Oklch; lambdaAt: (n: number) => number; chromaAt: (n: number) => number; gainAt: (n: number) => number; w: (n: number) => number; shellGamut: Gamut; pin: number | null; minStepDeltaE?: number },
): { colors: Oklch[]; unreachable: number[]; separated: { index: number; deltaL: number; was: number }[]; shellLimited: { index: number; wanted: number; got: number }[] } {
  const sh = shell(cfg.shellGamut);
  const k = f.knots;
  const N = k.n.length;
  const out: Oklch[] = new Array(N);
  const unreachable: number[] = [];
  const detached = new Set(f.spine.detached.map((d) => d.index));

  // A mode flip is a long move along the lightness axis, and the gamut shell is a
  // different width at the other end of it: Tailwind's yellow-300 carries C 0.16 at
  // L 0.90, and at the L 0.34 the mirror sends it to, no color of that hue holds
  // more than about half of it. The absolute half of the transfer would ask for it
  // anyway and leave the gamut mapper to take it away, reporting a ΔEOK of 0.10
  // between intent and result. Capping at the shell instead — at the share of it the
  // source step used, or all of it, whichever is larger — says the same thing
  // honestly and up front, and `shellLimited` records every step it bit.
  const shellLimited: { index: number; wanted: number; got: number }[] = [];
  const chromaFor = (i: number) => {
    const n = k.n[i]!;
    const w = Math.min(1, Math.max(0, cfg.w(n)));
    const fac = cfg.chromaAt(n);
    const h = hueOf(k.h[i]);
    const cap = Math.max(1, k.relC[cfg.shellGamut][i]!);
    return (L: number) => {
      const want = Math.max(0, fac * (w * k.relC[cfg.shellGamut][i]! * sh.cuspChroma(L, h) + (1 - w) * k.C[i]!));
      return Math.min(want, cap * sh.cuspChroma(L, h));
    };
  };
  const chromaWanted = (i: number, L: number) => {
    const n = k.n[i]!;
    const w = Math.min(1, Math.max(0, cfg.w(n)));
    return Math.max(0, cfg.chromaAt(n) * (w * k.relC[cfg.shellGamut][i]! * sh.cuspChroma(L, hueOf(k.h[i])) + (1 - w) * k.C[i]!));
  };

  // The pin wins over everything, including detachment: Radix's key step is a detached
  // bright solid in five of its families (sky, mint, lime, yellow, amber) and is pinned
  // in all 25.
  if (cfg.pin !== null) out[cfg.pin] = { l: k.L[cfg.pin]!, c: k.C[cfg.pin]!, h: hueOf(k.h[cfg.pin]) };
  // The step just past the pin, on the far side from the surface, is the pinned
  // step's hover — Radix's step 10 is "solid background (hover)" — and pinning has
  // already displaced the ladder there, so mirroring it against the background puts
  // it almost on top of the pin (blue 9→10 comes out ΔEOK 0.003 apart) and the
  // separation pass then has to invent a position for it. Hanging it off the pin
  // instead is both the role it plays and the better fit: RMS ΔL 0.013 against
  // Radix's own, where the background mirror needs rescuing.
  const hover = cfg.pin !== null && cfg.pin + 1 < N && !detached.has(cfg.pin + 1)
    && Math.abs(k.L[cfg.pin + 1]! - cfg.lightSurface.l) > Math.abs(k.L[cfg.pin]! - cfg.lightSurface.l)
    ? cfg.pin + 1 : null;
  // spine next; detached steps and the hover then hang off the nearest step already solved
  for (let i = 0; i < N; i++) {
    if (detached.has(i) || i === cfg.pin || i === hover) continue;
    const r = mirrorStep({
      from: { l: k.L[i]!, c: k.C[i]!, h: hueOf(k.h[i]) },
      lightSurface: cfg.lightSurface, darkSurface: cfg.darkSurface,
      chromaAt: chromaFor(i), hue: hueOf(k.h[i]), lambda: cfg.lambdaAt(k.n[i]!), nearSurfaceGain: cfg.gainAt(k.n[i]!),
    });
    out[i] = { l: r.l, c: r.c, h: r.h };
    if (!r.reached) unreachable.push(i);
  }
  // A detached step is defined by its distance from the step it hangs off, not by its
  // contrast with the background — Radix's step 10 is the solid's hover, not a contrast
  // target. Mirroring it against its anchor puts it on the far side of the anchor in the
  // new mode and widens the gap by the same polarity factor as everything else
  // (measured: light ΔL −0.029, dark +0.040; predicted RMS ΔL 0.013).
  for (const i of [...new Set([...detached, ...(hover === null ? [] : [hover])])].sort((a, b) => a - b)) {
    if (i === cfg.pin) continue;
    let p = i - 1; while (p >= 0 && out[p] === undefined) p--;
    if (p < 0) { p = i + 1; while (p < N && out[p] === undefined) p++; }
    const anchorLight: Oklch = { l: k.L[p]!, c: k.C[p]!, h: hueOf(k.h[p]) };
    const anchorDark = out[p] ?? anchorLight;
    const away = k.L[i]! < k.L[p]! ? +1 : -1; // light mode: darker than the anchor → dark mode: lighter
    const win: [number, number] = away > 0 ? [anchorDark.l, 1] : [0, anchorDark.l];
    const r = mirrorStep({
      from: { l: k.L[i]!, c: k.C[i]!, h: hueOf(k.h[i]) },
      lightSurface: anchorLight, darkSurface: anchorDark,
      chromaAt: chromaFor(i), hue: hueOf(k.h[i]), lambda: cfg.lambdaAt(k.n[i]!), window: win,
    });
    out[i] = { l: r.l, c: r.c, h: r.h };
    if (!r.reached) unreachable.push(i);
  }
  const spineOrder = [...f.spine.indices].sort((a, b) => a - b);
  const separated = separate(out, cfg.darkSurface, chromaFor, cfg.minStepDeltaE ?? JND, cfg.pin, spineOrder);
  for (let i = 0; i < N; i++) {
    if (i === cfg.pin) continue;
    const want = chromaWanted(i, out[i]!.l);
    // a reduction under a quarter of the JND is rounding, not a lost color
    if (want - out[i]!.c > 0.005) shellLimited.push({ index: i, wanted: want, got: out[i]!.c });
  }
  return { colors: out, unreachable, separated, shellLimited };
}

/**
 * Pinning a step breaks the ladder on both sides of it. The pinned color sits
 * where its own contrast is not what the mirror would have chosen, so the steps
 * after it get squeezed and the steps before it can be overrun: on Radix, the
 * plain mirror leaves blue 9→10 at ΔEOK 0.003 — a hover state nobody could see —
 * and 23 of 25 families with some adjacent pair under a JND, against 5 in
 * Radix's own dark scale, all of those at 0.018. On Material, the pin overruns
 * its neighbour outright and teal-400 comes out lighter than teal-500.
 *
 * So after mirroring, a forward pass over the spine pushes each step far enough
 * from its predecessor, and a backward pass from the pin pulls its predecessors
 * back toward the surface, re-deriving chroma at each new lightness. Between them
 * the spine is monotone away from the surface with at least `min` between
 * neighbours, and the pin never moves. This is the one place the derivation puts
 * legibility above the contrast mirror, and every adjustment is reported in
 * `derivedFrom.separated`.
 *
 * Detached steps are not in `order`: they hang off an anchor by design and are
 * allowed to sit wherever that puts them (Radix's own dark yellow runs 0.918,
 * 0.971, 0.900 across steps 9–11).
 */
function separate(
  colors: Oklch[],
  surface: Oklch,
  chromaFor: (i: number) => (L: number) => number,
  min: number,
  pin: number | null,
  order: number[],
): { index: number; deltaL: number; was: number }[] {
  const moved: { index: number; deltaL: number; was: number }[] = [];
  if (min <= 0) return moved;
  const away = surface.l < 0.5 ? +1 : -1;
  const at = (i: number, L: number): Oklch => ({ l: L, c: chromaFor(i)(L), h: colors[i]!.h });
  /** b sits at least `min` further from the surface than a. */
  const clears = (a: Oklch, b: Oklch) => (b.l - a.l) * away > 0 && deltaEOK(a, b) >= min;

  /** Move step i in direction `dir` by the least amount that satisfies `ok`. */
  const relocate = (i: number, ok: (c: Oklch) => boolean, dir: number): boolean => {
    const limit = dir > 0 ? 1 : 0;
    let hi = colors[i]!.l;
    let step = 0.01;
    while (!ok(at(i, hi)) && (dir > 0 ? hi < limit : hi > limit)) { hi = Math.min(1, Math.max(0, hi + dir * step)); step *= 1.6; }
    if (!ok(at(i, hi))) return false; // no room left; the caller's warnings cover it
    let lo = colors[i]!.l;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (!ok(at(i, m))) lo = m; else hi = m; }
    const was = colors[i]!.l;
    colors[i] = at(i, hi);
    moved.push({ index: i, deltaL: hi - was, was: 0 });
    return true;
  };

  for (let p = 1; p < order.length; p++) {
    const i = order[p]!, j = order[p - 1]!;
    if (i === pin || clears(colors[j]!, colors[i]!)) continue;
    const was = deltaEOK(colors[j]!, colors[i]!);
    if (relocate(i, (c) => clears(colors[j]!, c), away)) moved[moved.length - 1]!.was = was;
  }
  const pp = pin === null ? -1 : order.indexOf(pin);
  for (let p = pp - 1; p >= 0; p--) {
    const i = order[p]!, j = order[p + 1]!;
    if (i === pin || clears(colors[i]!, colors[j]!)) continue;
    const was = deltaEOK(colors[i]!, colors[j]!);
    if (relocate(i, (c) => clears(c, colors[j]!), -away)) moved[moved.length - 1]!.was = was;
  }
  return moved;
}

/** Mirror a neutral ramp. No pin: Radix re-authors its grays per mode. */
function mirrorNeutral(n: NeutralDNA, cfg: { lightSurface: Oklch; darkSurface: Oklch; lambdaAt: (x: number) => number; chromaAt: (x: number) => number; gainAt: (x: number) => number; minStepDeltaE?: number }): { colors: Oklch[]; separated: { index: number; deltaL: number; was: number }[] } {
  const k = n.knots;
  const colors = k.n.map((x, i) => {
    const h = hueOf(k.h[i]);
    const fac = cfg.chromaAt(x);
    const r = mirrorStep({
      from: { l: k.L[i]!, c: k.C[i]!, h },
      lightSurface: cfg.lightSurface, darkSurface: cfg.darkSurface,
      chromaAt: () => Math.max(0, fac * k.C[i]!), hue: h, lambda: cfg.lambdaAt(x), nearSurfaceGain: cfg.gainAt(x),
    });
    return { l: r.l, c: r.c, h: r.h };
  });
  const chromaFor = (i: number) => { const fac = cfg.chromaAt(k.n[i]!); return () => Math.max(0, fac * k.C[i]!); };
  const separated = separate(colors, cfg.darkSurface, chromaFor, cfg.minStepDeltaE ?? JND, null, [...n.spine.indices].sort((a, b) => a - b));
  // neutrals carry so little chroma that the shell never binds
  return { colors, separated };
}

/**
 * Derive a dark DNA from a light one. The result is an ordinary SystemDNA with
 * `mode: 'dark'` and a `derivedFrom` record, so the solver, the neutral solver
 * and the emitters all work on it unchanged.
 *
 * When the reference ships its own dark scale (Radix), extract that instead —
 * it is the authored article and this is an approximation of it.
 */
export function deriveDarkDNA(light: SystemDNA, opts: DarkMirrorOptions = {}): SystemDNA {
  if (light.mode === 'dark') throw new Error(`deriveDarkDNA: ${light.id} is already a dark scale`);
  const warnings: string[] = [];
  const gamut: Gamut = opts.gamut ?? light.authoredGamut;
  const shellGamut = light.nativeShell.gamut;

  const lightSurface = opts.lightSurface !== undefined ? asOklch(opts.lightSurface) : defaultLightSurface(light);
  const auto = defaultDarkSurface(light);
  const darkSurface = opts.surface !== undefined ? asOklch(opts.surface) : auto.surface;
  const surfaceRule: DarkDerivation['surfaceRule'] = opts.surface !== undefined ? 'given' : 'darkest-neutral';
  if (surfaceRule === 'darkest-neutral' && darkSurface.l > SURFACE_MAX_L) {
    warnings.push(`the dark surface defaults to ${light.name}'s darkest neutral (${auto.family ?? '—'}, L ${darkSurface.l.toFixed(3)}), but at that lightness it is a text color rather than an app background — Radix, the one reference that ships a dark scale, sits its own at L 0.178. Pass \`surface\` explicitly.`);
  }
  if (darkSurface.l >= 0.5) warnings.push(`the dark surface is lighter than mid gray (L ${darkSurface.l.toFixed(3)}); the mirror will run toward black instead of white`);

  const lambdaOpt = opts.lambda ?? BALANCED_LAMBDA;
  const chromaOpt = opts.chroma ?? 'radix';
  const lambdaAt = lambdaOpt === 'radix'
    ? curveFrom(RADIX_CALIBRATION.lambda, RADIX_CALIBRATION.n)
    : () => Math.min(1, Math.max(0, lambdaOpt));
  const gainOpt = opts.nearSurfaceGain ?? true;
  const gainAt = gainOpt === false ? () => 1
    : curveFrom(Array.isArray(gainOpt) ? gainOpt : RADIX_CALIBRATION.nearSurfaceGain, Array.isArray(gainOpt) ? gainOpt.map((_, i, a) => (a.length > 1 ? i / (a.length - 1) : 0)) : RADIX_CALIBRATION.n);
  const chromaAt = chromaOpt === 'radix'
    ? curveFrom(RADIX_CALIBRATION.chroma, RADIX_CALIBRATION.n)
    : chromaOpt === 'none' ? () => 1 : () => chromaOpt;

  const policy = opts.chromaPolicy ?? 'transfer';
  const wCurve = policy === 'transfer'
    ? curveFrom(RADIX_CALIBRATION.transferW, RADIX_CALIBRATION.n)
    : (() => {
        const w = light.chroma.w;
        const xs = light.chroma.basis === 'grid' ? light.grid : Array.from({ length: w.length }, (_, i) => (w.length > 1 ? i / (w.length - 1) : 0));
        const f = linear(xs, w);
        return (n: number) => Math.min(1, Math.max(0, f(n)));
      })();

  // where a pin makes sense, and where it would break the ladder above it
  const pinOpt = opts.pinKeyStep ?? 'auto';
  const documented = light.steps.keyStep.rule === 'documented';
  let pinning = pinOpt === true || (pinOpt === 'auto' && documented);
  if (pinning) {
    const ns = Object.values(light.families).map((f) => f.knots.n[f.keyIndex] ?? 0);
    const nMin = Math.min(...ns);
    if (nMin < 0.35) {
      pinning = false;
      warnings.push(`the key step sits at n ${nMin.toFixed(2)}, near the light surface; pinning it would leave the ${Math.round((1 - nMin) * 100)}% of the ramp that has to out-contrast it nothing but the top of the lightness axis, so it was not pinned`);
    }
  }
  if (pinOpt === 'auto' && !documented) {
    warnings.push(`${light.name} does not document a key step (its key is wherever chroma peaks), so nothing is pinned across the two modes. Pass \`pinKeyStep: true\` to pin the peak-chroma step anyway, or seed the pair to pin a color of your own.`);
  }

  const mapDEs: number[] = [];
  const unreachable: DarkDerivation['unreachable'] = [];
  const separated: DarkDerivation['separated'] = [];
  const shellLimited: DarkDerivation['shellLimited'] = [];
  const pinnedKeys = new Set<string>();

  /**
   * colors → a Ramp of css strings, gamut-mapped and quantized. Step keys keep the
   * role they had: key "50" is the subtle surface tint in both modes, which is how
   * Radix numbers its two scales and the only numbering under which one semantic
   * token name can point at one key. Relabelling for the `dark:bg-blue-950`
   * convention is an emitter's job, not the DNA's.
   */
  const toRamp = (family: string, keys: string[], colors: Oklch[], anchorIndex: number, numbering: Ramp['numbering']): Ramp => {
    const steps = colors.map((o, i) => {
      const { mapped, deltaE } = gamutMap(o, gamut);
      mapDEs.push(deltaE);
      return { key: keys[i]!, css: quantize(mapped, gamut).native };
    });
    return { system: opts.id ?? `${light.id}-dark`, family, gamut, steps, anchorIndex, numbering };
  };

  const ramps = new Map<string, Ramp>();
  for (const f of Object.values(light.families)) {
    const pin = pinning ? f.keyIndex : null;
    if (pin !== null) pinnedKeys.add(f.knots.key[pin]!);
    const { colors, unreachable: un, separated: sep, shellLimited: lim } = mirrorFamily(f, { lightSurface, darkSurface, lambdaAt, chromaAt, gainAt, w: wCurve, shellGamut, pin, minStepDeltaE: opts.minStepDeltaE });
    for (const s of sep) separated.push({ family: f.family, key: f.knots.key[s.index]!, was: s.was, deltaL: s.deltaL });
    for (const s of lim) shellLimited.push({ family: f.family, key: f.knots.key[s.index]!, wanted: s.wanted, got: s.got });
    for (const i of un) {
      const want = wcag21Fast({ l: f.knots.L[i]!, c: f.knots.C[i]!, h: hueOf(f.knots.h[i]) }, lightSurface);
      const got = wcag21Fast(colors[i]!, darkSurface);
      // the bisect also reports "not reached" when the target sits at the edge of the
      // window, which for a near-background step means it landed on the background — not
      // a shortfall worth a warning.
      if (Math.abs(got - want) / want > 0.01) unreachable.push({ family: f.family, key: f.knots.key[i]!, want, got });
    }
    ramps.set(f.family, toRamp(f.family, f.knots.key, colors, f.keyIndex, light.steps.numbering?.class ?? 'nominal'));
  }

  const neutralRamps = new Map<string, Ramp>();
  for (const n of Object.values(light.neutrals)) {
    const { colors, separated: sep } = mirrorNeutral(n, { lightSurface, darkSurface, lambdaAt, chromaAt, gainAt, minStepDeltaE: opts.minStepDeltaE });
    for (const s of sep) separated.push({ family: n.family, key: n.knots.key[s.index]!, was: s.was, deltaL: s.deltaL });
    neutralRamps.set(n.family, toRamp(n.family, n.knots.key, colors, 0, 'nominal'));
  }

  if (unreachable.length) {
    const worst = unreachable.slice().sort((a, b) => b.want - a.want)[0]!;
    warnings.push(`${unreachable.length} step${unreachable.length > 1 ? 's' : ''} cannot reach ${light.name}'s own contrast on this surface and were clamped to the nearest reachable lightness (worst: ${worst.family} ${worst.key}, wanted ${worst.want.toFixed(2)}:1, got ${worst.got.toFixed(2)}:1). A dark surface has less contrast headroom above it than a white one has below it; lower the surface or accept the clamp.`);
  }
  if (shellLimited.length) {
    const worst = shellLimited.slice().sort((a, b) => (b.wanted - b.got) - (a.wanted - a.got))[0]!;
    warnings.push(`${shellLimited.length} step${shellLimited.length > 1 ? 's' : ''} could not hold ${light.name}'s chroma at the lightness the mirror sends them to and were capped at the gamut shell (worst: ${worst.family} ${worst.key}, wanted C ${worst.wanted.toFixed(3)}, holds ${worst.got.toFixed(3)}). That hue is simply narrower down there; no parameter recovers it.`);
  }
  if (separated.length) {
    const worst = separated.slice().sort((a, b) => a.was - b.was)[0]!;
    warnings.push(`${separated.length} step${separated.length > 1 ? 's were' : ' was'} pushed apart to keep adjacent steps at least ${(opts.minStepDeltaE ?? JND).toFixed(3)} ΔEOK apart, which the pinned key step squeezed below (worst: ${worst.family} ${worst.key} at ${worst.was.toFixed(4)}). Their contrast is no longer exactly mirrored.`);
  }
  const mapped = mapDEs.filter((d) => d > 0);
  if (mapped.length) {
    const mx = Math.max(...mapped);
    if (mx > 0.02) warnings.push(`${mapped.length} mirrored step${mapped.length > 1 ? 's' : ''} fell outside ${gamut} and were gamut-mapped (max ΔEOK ${mx.toFixed(4)})`);
  }

  const source: SourceInfo = {
    kind: 'derived',
    ref: `deriveDarkDNA(${light.id})`,
    version: light.source.version,
    commit: light.source.commit,
    license: light.source.license,
  };

  const dna = extractSystemDNA(ramps, {
    id: opts.id ?? `${light.id}-dark`,
    name: opts.name ?? `${light.name} (dark, derived)`,
    mode: 'dark',
    pairedWith: light.id,
    source,
    keyStepKey: light.steps.keyStep.key ?? undefined,
    roles: Object.fromEntries(Object.values(light.families).flatMap((f) => f.spine.detached.filter((d) => d.role).map((d) => [f.knots.key[d.index]!, d.role!]))),
    centroids: opts.centroids,
    neutralRamps,
    gridSize: light.grid.length,
    toolchain: light.toolchain,
    ...(opts.now ? { now: opts.now } : {}),
  });

  dna.derivedFrom = {
    from: light.id,
    lambda: lambdaOpt,
    chroma: chromaOpt,
    chromaPolicy: policy,
    nearSurfaceGain: gainOpt !== false,
    calibration: RADIX_CALIBRATION.source,
    lightSurface,
    darkSurface,
    surfaceRule,
    pinnedKey: pinnedKeys.size === 1 ? [...pinnedKeys][0]! : pinnedKeys.size ? `${pinnedKeys.size} per-family key steps` : null,
    mapping: {
      steps: mapped.length, total: mapDEs.length,
      meanDeltaE: mapped.length ? mapped.reduce((a, b) => a + b, 0) / mapped.length : 0,
      maxDeltaE: mapped.length ? Math.max(...mapped) : 0,
    },
    unreachable,
    separated,
    shellLimited,
    warnings,
  };
  return dna;
}

/** ΔEOK between a derived dark DNA and an authored one, step by step. Used by the tests and the report. */
export function compareDNA(a: SystemDNA, b: SystemDNA): { perFamily: Record<string, number[]>; all: number[] } {
  const perFamily: Record<string, number[]> = {};
  const all: number[] = [];
  for (const [name, fa] of Object.entries(a.families)) {
    const fb = b.families[name];
    if (!fb || fb.knots.n.length !== fa.knots.n.length) continue;
    const row = fa.knots.L.map((_, i) => deltaEOK(
      { l: fa.knots.L[i]!, c: fa.knots.C[i]!, h: hueOf(fa.knots.h[i]) },
      { l: fb.knots.L[i]!, c: fb.knots.C[i]!, h: hueOf(fb.knots.h[i]) },
    ));
    perFamily[name] = row;
    all.push(...row);
  }
  return { perFamily, all };
}
