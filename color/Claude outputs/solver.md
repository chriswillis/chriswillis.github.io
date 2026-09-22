# Phase 2 — Solver

`solveRamp(input)` turns a reference DNA plus a seed color (or a target hue) into a
ramp in the reference's own numbering, gamut-mapped, quantized, verified.

```ts
import { solveRamp, parseDNA } from 'palette-dna';
const dna = parseDNA(fs.readFileSync('dna/tailwind-v4.json', 'utf8'));

// seed-priority: the brand color is exact at the step it belongs to
const brand = solveRamp({ dna, seed: '#7c3aed' });                       // P3 canonical + sRGB sibling
// hue only
const teal = solveRamp({ dna, hue: 185, gamut: 'srgb' });
// contrast-faithful against a tinted page
const warm = solveRamp({ dna, hue: 30, background: '#efe9dc', mode: 1 });
```

## Inputs

| Option | Meaning | Default |
|---|---|---|
| `seed` | Any CSS color. Takes priority over `hue`; the seed is reproduced exactly at its step | — |
| `hue` | Target peak hue in degrees when there is no seed | — |
| `family` | Force a reference family (`'blue'`) instead of nearest-two selection | auto |
| `gamut` | Output gamut, `'p3'` or `'srgb'` | `'p3'` |
| `background` | Page background the ramp sits on (contrast promises are made against it) | white |
| `mode` | 0 curve-faithful · 1 contrast-faithful · in between blends the two lightness solutions | 0 |
| `seedStep` | Pin the seed to a step key instead of the lightness-nearest step | auto |
| `extendToP3` | Apply relative chroma against the P3 shell (fills P3) rather than the reference's native shell | false |
| `renumber` | Step count or explicit keys. Drops detached steps; renaming steps throws away kinship, so it is an override | reference numbering |
| `gainClamp` | Bounds on the seed chroma gain | `[0.5, 1.2]` |
| `sibling` | Emit the sRGB sibling when `gamut` is `'p3'` | true |
| `spacing` | `'even'` re-places the spine steps at equal ΔEOK along the same curve; `'reference'` keeps the reference's own placement; `'auto'` picks (below) | `'auto'` |

## Step spacing

**Even is the default.** `spacing: 'auto'` resolves to `'even'` unless the reference
numbers its steps by contrast, in which case it keeps the reference's placement.
`SolvedRamp.spacing.rule` records which of the three applied: `'even-by-default'`,
`'contrast-bearing-numbering'`, or `'asked'`.

The case for even spacing is that an unevenly spaced ramp is uneven for a reason that
belongs to its own system and not to yours. The case against it was never that even
spacing looks worse — it is that respacing moves what a numbered step *means*. Five of
the thirteen references number by contrast rather than by convention: at each step,
every hue lands on the same contrast, so `carbon-60` is a promise and not a label.
Re-placing those steps at equal perceptual distance would break the promise while
keeping the number.

That is a measurable claim, so `spike/phase5-spacing.ts` measures it — solve every
family of every system under both spacings and recompute the metric that classified the
numbering in the first place (SD across hues of log WCAG contrast per step; under 0.05 is
contrast-bearing):

```
2 of 5 contrast-bearing systems lose the property under even spacing: polaris, carbon
Spacing CV, all systems:     reference mean 0.359 → even mean 0.032
Smallest step, worst system: reference 0.0082  → even 0.0245
```

Polaris goes 0.035 → 0.121 and Carbon 0.007 → 0.055, both crossing the threshold;
Spectrum, Primer and Web Awesome degrade by an order of magnitude but stay inside it.
So the compelling reason is real but narrow, and `'auto'` is narrow with it: even
everywhere, except where the numbering is load-bearing.

Two things worth knowing before taking the default:

- **The seed's step number can move** (below), and on a short ramp that can cost a role.
  Open Color has ten steps; a violet seed ranks at index 8 on an even ramp against 7 on
  Open Color's own, and the one remaining bright step is then spent on the fill's hover,
  leaving dark-mode text without one. The solver warns and names the remedy
  (`seedStep: '7'`), which recovers it.
- **The reference's own unevenness is still available.** `spacing: 'reference'` is what
  replication wants, and the replication tests use it.

### What even spacing does

Several references number their steps by **role**, not by even perceptual spacing, and
the DNA now measures this as `steps.spacing` (coefficient of variation of consecutive
step ΔEOK, spine steps only, averaged over families):

| Even (CV < 0.25) | Uneven (0.25–0.5) | Role-indexed (CV > 0.5) |
|---|---|---|
| Carbon 0.14 · Spectrum 0.15 · Primer 0.19 · Open Color 0.23 · Web Awesome 0.22 · Atlassian 0.24 | Open Props 0.26 · Tailwind 0.34 · Tailwind v4 0.34 · Material 0.37 | Polaris 0.61 · Radix dark 0.64 · **Radix light 0.90** |

Radix spends eight of twelve steps above L 0.70 on backgrounds and borders, then drops
0.17 L into the solid; Polaris packs ten tints into L 0.99–0.80. Replicating those
systems faithfully therefore *reproduces their unevenness*, which is correct for
replication and wrong for generating a brand ramp.

Even spacing fixes the placement without touching the DNA. The reference's curve is
sampled densely, cumulative ΔEOK along it gives an arc length, and the spine steps are
re-placed at equal arc-length intervals. The chroma policy `w(n)`, the relative-chroma
shape, the hue drift and both endpoints are unchanged — only *where the steps sit on the
curve* moves, and the mean step size is preserved because arc length is redistributed
rather than rescaled. Measured on one seed across systems: Radix 0.95 → 0.08,
Polaris 0.72 → 0.02, Material 0.29 → 0.11, Tailwind v4 0.39 → 0.06, Carbon 0.15 → 0.01.

Three details:

- **The seed stays exact.** Its step is pinned at its own lightness and each side of it is
  evenly spaced, so the two halves can differ slightly; `spacing.segments` reports both
  and a warning fires when they differ by more than 1.4×.
- **The seed's step number can move**, because even spacing puts the seed where its
  lightness ranks rather than where the reference's own placement put it (Radix 9 → 8,
  Polaris 13 → 10). `seed.referenceStepKey` records the original and a warning names it.
  To keep a role-bearing number, pass `seedStep: '9'` — the ramp then holds the role at
  the cost of uneven halves (Radix CV 0.08 → 0.16, Polaris 0.02 → 0.51).
- **A seed outside the reference's lightness range stretches the ramp to reach it**: the
  far endpoint is held and the lightness axis is scaled so the near end lands on the seed,
  then spacing is computed on the stretched path. Without this the pinned end step would
  sit far past its neighbour and the ramp would end in a cliff.

A seed whose chroma lies outside what the reference's curve allows is still clamped by
`gainClamp`, and that leaves exactly one perceptual bump at the seed — the tests assert
CV < 0.12 when the gain is not clamped and < 0.5 when it is, and the warning says so.

Detached steps (Radix's bright solids) are off the spine by definition and so sit outside
the even spacing; they keep their authored offset from the preceding spine step.

## Pipeline

1. **Reference selection** (`selectReference`). Families are ranked by angular distance
   between the target peak hue and each family's peak-chroma hue. The two nearest are
   blended by inverse distance when they bracket the target; when the target lies beyond
   the system's hue coverage by more than 2σ of the nearest family (σ floored at 10°,
   because a sparsely published family like Radix violet has σ 2°), all families are
   averaged (`aggregate`). Hue *drift* is what is mixed, never absolute hue — mixing
   absolute hues would smear unrelated families into the target. Curves are read at the
   base family's own steps; detached steps keep their authored lightness.

2. **Seed placement** (`placeSeed`). Lightness decides which steps are candidates — those
   within 0.03 L of the nearest step, or the end step when the seed is darker or lighter
   than the whole spine. Among candidates, the family and step whose reference color,
   transferred to the seed's hue, is nearest the seed (ΔEOK) wins, with a penalty for how
   far the implied peak hue (seed hue minus that family's drift at that step) sits from the
   family's own peak. Detached steps are candidates: Radix yellow-9 beats step 5 on chroma.
   The implied peak hue then drives reference selection, so a system seeded with one of
   its own key colors selects that family at weight 1 and reproduces it (see tests).

3. **Spine warp** (reference spacing) **or even respacing** (`spacing: 'even'`, above). The spine's PCHIP is inverted at the seed's L to find n*, and the seed
   knot is moved there with a tent-shaped shift of the other spine knots toward the ends.
   Because the shift is in n and n* lies inside the spine's domain, the warped knots stay
   in order and the re-sampled lightness stays monotone by construction. Detached steps
   move with their nearest preceding spine step. The seed step's L is then set exactly.
   Hue drift is offset so the seed's hue is exact at its step.

4. **Chroma**. Per step, `C = gain · (w·relC·cusp(L, h) + (1−w)·C_abs)` with `w(n)` from
   the DNA and the cusp from the native shell (or P3 with `extendToP3`). The gain is the
   ratio of the seed's chroma to the ungained prediction at its step, clamped to
   `gainClamp`. When clamped, the seed step is still exact and its neighbours follow the
   clamped curve; the ramp reports `gainClamped`.

5. **Lightness mode**. Curve-faithful uses the (warped) spine L. Contrast-faithful bisects
   L so that |APCA| of the step as text on the actual background equals the reference
   step's |APCA| against the reference's canonical surface — white for light scales, its
   own step 0 for dark scales. APCA is clamped to 0 below Lc ≈ 7.5 and cannot be inverted
   there, so steps whose target is under 8 are solved on WCAG 2.1 instead. Chroma perturbs
   luminance, so chroma is recomputed and L re-solved three times. A target that cannot be
   reached on the given background (a reference Lc of 101 on a page darker than white) is
   clamped and reported in `warnings`. `mode` between 0 and 1 blends the two lightness
   solutions; chroma is recomputed at the blended L. The seed step is never moved.

6. **Gamut mapping**. Color.js `toGamut({ method: 'css' })` — the CSS Color 4 binary
   search in OKLCh that accepts a clipped estimate once it is within the JND. Applied once,
   last, per step. Every step reports `mappingDeltaE` (0 when already in gamut).

7. **Quantization**. 8-bit per channel in the output space; the emitted `oklch()` is the
   exact color those channels produce. The seed step is emitted unquantized (it is
   displayable by definition). `quantizationDeltaE` is reported.

8. **Promises**. The WCAG 2.1 thresholds (3, 4.5, 7) that the pre-quantization color met
   against the background are the step's promises. After quantization each is re-checked;
   if one broke, L is nudged away from the background by ¼, ½, ¾ then 1 JND (0.02 L),
   re-mapped and re-quantized, and the first nudge that restores every promise is kept.
   Deterministic; no global headroom. The seed step is never nudged.

9. **sRGB sibling** (P3 output). Each P3 step is mapped into sRGB with the same CSS method
   and quantized to hex; identical where the P3 color fits, mapped where it does not
   (decision #6: pin absolute, expand per role — role expansion arrives with Phase 3.5).
   `sibling.deltaEFromP3` reports the difference.

## What comes back

`SolvedRamp` carries the DNA's kinship and numbering class, the reference selection
(families and weights), the seed record (step, n-shift, raw and applied gain, achieved
ΔEOK), the contrast surface used, warnings, and per step: intended color, mapped and
quantized ΔEOK, the final color as `oklch()`, hex or `color(display-p3 …)`, the sibling,
WCAG and APCA against the background and against the ramp's own step 0, the promises and
whether they held, any nudge, the transferred reference values, and the curve/contrast
lightness pair with the method used.

## Tests (`test/solver.test.ts`)

- **Identity**: for all 13 systems and every family, seeding with the family's key color
  selects that family at weight 1, places the seed on its key step, and reproduces every
  step within ΔEOK 0.006 (hex-identical at the seed for sRGB systems).
- **Tailwind v3 from one seed**: `#3b82f6` + Tailwind v4 DNA reproduces the v3 blue ramp
  with max ΔEOK 0.009.
- **Properties** (200 random seeds × light systems × both gamuts × three modes): seed
  exact (hex-identical in sRGB, ΔE 0 in P3); every promise holds (verified with Color.js);
  every output and sibling in gamut (Color.js); intended lightness strictly monotone along
  the spine in curve mode, final within 8-bit tolerance; deterministic.
- **Hue sweep**: every 3° × two systems × two gamuts, promises and monotonicity.
- Options: renumbering, forced family, contrast-faithful on a tinted page, gain clamp.

## Known limits

- APCA is reported, not promised; Lc targets under 8 are solved on WCAG.
- Contrast-faithful mode can run out of range on backgrounds darker than white; the
  step is clamped and the warning names the unreachable target. Phase 3 handles dark
  mode properly with the reference's own dark DNA where it exists.
- Blending two families that disagree on detachment (Radix amber ↔ orange) inherits
  the base (nearest) family's detached set; the other family contributes its spine value
  at those steps.
- Renumbering drops detached steps.
- Even spacing is measured on the spine only; a ramp whose detached steps carry roles
  (Radix 9–10) still has those steps sitting off the even rhythm, by design.
