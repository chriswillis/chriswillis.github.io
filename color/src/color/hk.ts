/**
 * The Helmholtz–Kohlrausch effect, and the viewing conditions it depends on.
 *
 * Every lightness number elsewhere in this library is OKLab L, which is a
 * correlate of *luminance*. Appearance is not luminance: a saturated colour
 * looks brighter than a grey of the same luminance, by an amount that depends on
 * how saturated it is, what hue it is, and how light-adapted the eye is. That is
 * the Helmholtz–Kohlrausch effect, and OKLab does not model it.
 *
 * Measured on Radix's two authored scales (`spike/phase6-hk.ts`): the residual
 * left over after the contrast mirror correlates with Nayatani's H–K prediction
 * at r = −0.37, in the direction the effect predicts, while it correlates with
 * raw chroma at r = +0.09 in the wrong direction. The discrimination is the
 * evidence — chroma alone explains nothing, chroma *weighted by the H–K hue
 * function* explains 13.5%, and a spurious correlation would not pick out that
 * particular hue weighting.
 *
 * Two things worth stating plainly, because the folk version of dark mode gets
 * both backwards:
 *
 *  - **H–K is weaker in a dark surround, not stronger.** `K_Br` rises with
 *    adapting luminance, so the effect is largest in a bright room on a light
 *    UI. What makes dark mode hard is ocular straylight, which is a spatial
 *    effect no colour-pair metric can see, and which nothing in this corpus
 *    compensates for — so this module does not claim to address it.
 *  - **Nayatani's "luminous" form is not the one to reach for here**, despite a
 *    screen being emissive. That form is expressed in the *luminance* domain —
 *    it is the object Γ pushed through `0.4462(Γ + 0.3086)³`, and the cube is
 *    what carries a lightness-domain factor into a luminance-domain one. OKLab L
 *    is a lightness correlate, so multiplying it by the luminous Γ double-counts
 *    the cube root and produces a mid violet that appears lighter than white.
 *    The object form is the dimensionally consistent one, and against Radix the
 *    two are indistinguishable anyway (r = −0.367 against −0.366).
 *
 * Nayatani, "Simple estimation methods for the Helmholtz–Kohlrausch effect",
 * Color Research & Application 22(6), 1997.
 */
import { converter } from 'culori';
import type { Oklch } from './oklch.ts';

const toLchuv = converter('lchuv');

/**
 * What the eye is adapted to. These are assumptions, not measurements, and they
 * are the assumptions every other number in this library was already making
 * silently — naming them is most of the point.
 */
export interface ViewingConditions {
  /** The field around the display. Affects how much of the eye is adapted to it. */
  surround: 'average' | 'dim' | 'dark';
  /**
   * Adapting luminance in cd/m². Roughly a fifth of the luminance of the field
   * the eye is adapted to, which for a UI is dominated by the page itself.
   */
  adaptingLuminance: number;
}

/**
 * A light UI in a normally lit room. sRGB's reference white is 80 cd/m² and real
 * displays run brighter; a light page fills most of the visual field, so the eye
 * adapts to roughly a fifth of that.
 */
export const AVERAGE_SURROUND: ViewingConditions = { surround: 'average', adaptingLuminance: 40 };

/**
 * A dark UI. The page emits far less light, so the eye adapts much lower — which
 * is why the same measured contrast reads flatter here (the Stevens effect), and
 * why H–K is *smaller* in dark mode rather than larger.
 */
export const DARK_SURROUND: ViewingConditions = { surround: 'dark', adaptingLuminance: 8 };

/** The default viewing condition assumed for each mode. */
export function defaultViewing(mode: 'light' | 'dark'): ViewingConditions {
  return mode === 'dark' ? DARK_SURROUND : AVERAGE_SURROUND;
}

/**
 * Which of Nayatani's two estimation methods. They differ in which member of the
 * matched pair the observer adjusts, and VCC reports a substantially larger
 * effect than VAC. Fitted against Radix, VCC wins (r = −0.367 against −0.268),
 * so it is the default — but the choice is exposed because it is a choice.
 */
export type HKMethod = 'vac' | 'vcc';
const METHOD_COEFFICIENT: Record<HKMethod, number> = { vac: -0.1340, vcc: -0.8660 };

export interface HKOptions {
  method?: HKMethod;
  /**
   * 0 applies nothing, 1 applies Nayatani in full. Blends linearly in Γ − 1.
   *
   * The default is not 1, and that is the most important number in this file.
   * The full model is a statement about matched-brightness judgements in a
   * controlled experiment; a design system is a series of decisions by people
   * who compensate for the effect partially and by eye. `DEFAULT_STRENGTH` is
   * what Radix's two authored scales say that partial compensation amounts to,
   * fitted in `spike/phase6-fit.ts`. Applying the model at full strength would
   * move steps far further than any shipping system moves them.
   */
  strength?: number;
}

/** Nayatani's hue term: a four-harmonic Fourier series on the CIELUV hue angle. */
export function coefficientQ(theta: number): number {
  return -0.01585
    - 0.03017 * Math.cos(theta) - 0.04556 * Math.cos(2 * theta)
    - 0.02667 * Math.cos(3 * theta) - 0.00295 * Math.cos(4 * theta)
    + 0.14592 * Math.sin(theta) + 0.05084 * Math.sin(2 * theta)
    - 0.01900 * Math.sin(3 * theta) - 0.00764 * Math.sin(4 * theta);
}

/** Nayatani's adapting-luminance term. Rises with L_a: brighter adaptation, larger effect. */
export function coefficientKBr(adaptingLuminance: number): number {
  const la = Math.max(0, adaptingLuminance);
  return 0.2717 * (6.469 + 6.362 * la ** 0.4495) / (6.469 + la ** 0.4495);
}

/** CIELUV saturation and hue angle, which is the domain Nayatani's model is defined on. */
export function suvTheta(color: Oklch): { suv: number; theta: number } {
  const h = Number.isFinite(color.h) ? color.h : 0;
  if (!(color.c > 0) || !(color.l > 0)) return { suv: 0, theta: 0 };
  const p = toLchuv({ mode: 'oklch', l: color.l, c: color.c, h });
  const L = p.l ?? 0, C = p.c ?? 0, H = p.h ?? 0;
  // S_uv = 13·|(u'−u'n, v'−v'n)| is exactly C*uv / L*uv, so no white point is needed here
  return { suv: L > 1e-6 ? C / L : 0, theta: (H * Math.PI) / 180 };
}

/**
 * How much of Nayatani's full effect to apply by default. This is a judgement
 * call sitting between two measurements, and it is labelled as one rather than
 * dressed up as a result.
 *
 * The first anchor is behavioural: fitted against Radix's two authored scales
 * (`spike/phase6-fit.ts`), the compensation its designers actually applied comes
 * out at 0.15–0.20. That optimum is shallow — the best fit improves RMS by only
 * 1.1% — so it pins the number loosely at best.
 *
 * The second is the spacing trade (`spike/phase6-spacing.ts`): equalising
 * apparent distance instead of measured distance costs measured evenness at
 * almost exactly 1:1, at every strength. There is no value that dominates; the
 * strength only sets how much of one you spend on the other.
 *
 * 0.25 sits between the two. Nothing downstream should depend on the exact
 * figure, which is why the audit reports both rulers whichever is in use.
 */
export const DEFAULT_STRENGTH = 0.25;

/**
 * S_uv is C*uv / L*uv, so it diverges as lightness approaches zero while chroma
 * does not — a near-black violet has unbounded CIELUV saturation. Nayatani's
 * data does not extend there, and letting Γ follow it makes apparent lightness
 * non-monotone in L. Cap it at the largest value the sRGB and P3 gamuts actually
 * reach in the range a UI uses.
 */
const MAX_SUV = 4;

/**
 * Γ: the factor by which a colour's apparent lightness exceeds its measured
 * lightness. Exactly 1 for an achromatic colour, and greater than 1 otherwise.
 */
export function hkGamma(color: Oklch, viewing: ViewingConditions, opts: HKOptions = {}): number {
  const strength = opts.strength ?? DEFAULT_STRENGTH;
  if (strength === 0) return 1;
  const { suv, theta } = suvTheta(color);
  if (suv <= 0) return 1;
  const method = METHOD_COEFFICIENT[opts.method ?? 'vcc'];
  const gamma = 1 + (method * coefficientQ(theta) + 0.0872 * coefficientKBr(viewing.adaptingLuminance)) * Math.min(MAX_SUV, suv);
  // Γ below 1 would mean a chromatic colour looking *darker* than its luminance,
  // which the effect does not predict; clamp rather than propagate a sign flip.
  return 1 + strength * (Math.max(1, gamma) - 1);
}

/**
 * Apparent lightness: the OKLab L an achromatic colour would need to look as
 * bright as this one. Always ≥ the colour's own L.
 */
export function apparentL(color: Oklch, viewing: ViewingConditions, opts: HKOptions = {}): number {
  return color.l * hkGamma(color, viewing, opts);
}

/**
 * The inverse: the measured L a colour of this chroma and hue needs in order to
 * *appear* at `target`. Γ depends on L, so this bisects. Returns a value in
 * [0, 1]; when no L reaches the target (a chromatic colour can appear lighter
 * than L = 1 allows) it returns 1.
 */
export function lForApparent(target: number, c: number, h: number, viewing: ViewingConditions, opts: HKOptions = {}): number {
  if (!(c > 0)) return Math.min(1, Math.max(0, target));
  const f = (l: number) => apparentL({ l, c, h }, viewing, opts) - target;
  if (f(1) < 0) return 1;
  // Apparent lightness is *not* guaranteed monotone in L: S_uv grows as L falls,
  // so Γ rises while L falls and the product can turn over near black. Scan for
  // the bracketing interval closest to the top and bisect inside it, which picks
  // the root a caller asking "what L looks like `target`" means — the one near
  // the target, not the near-black one on the far side of the turn.
  const N = 128;
  let lo = 0, hi = 1, found = false;
  let prevX = 1, prevY = f(1);
  for (let i = N - 1; i >= 0; i--) {
    const x = i / N, y = f(x);
    if (y === 0) return x;
    if ((y < 0) !== (prevY < 0)) { lo = x; hi = prevX; found = true; break; }
    prevX = x; prevY = y;
  }
  if (!found) return 0;
  for (let k = 0; k < 60 && hi - lo > 1e-9; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * ΔE in OKLab with the lightness axis replaced by apparent lightness. Two steps
 * an equal ΔEOK apart can be visibly unequal when their chroma differs; this is
 * the distance that says so.
 */
export function deltaEHK(a: Oklch, b: Oklch, viewing: ViewingConditions, opts: HKOptions = {}): number {
  const ah = Number.isFinite(a.h) ? (a.h * Math.PI) / 180 : 0;
  const bh = Number.isFinite(b.h) ? (b.h * Math.PI) / 180 : 0;
  const da = a.c * Math.cos(ah) - b.c * Math.cos(bh);
  const db = a.c * Math.sin(ah) - b.c * Math.sin(bh);
  const dl = apparentL(a, viewing, opts) - apparentL(b, viewing, opts);
  return Math.sqrt(dl * dl + da * da + db * db);
}
