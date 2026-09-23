# DNA format — `palette-dna/1`

A DNA file is one reference system in one mode (light or dark). It is what the
extractor emits and what the solver consumes. Curves are stored as **knots plus a
fit method**, never as sampled arrays alone, so a DNA file can be re-knotted: the
seed-color solver warps the lightness spine so a step lands exactly on the seed and
applies a chroma gain around it by editing knots. `sampled` arrays are included for
plotting and aggregation only.

Built-ins live in `dna/<id>.json` (13 systems, `dna/index.json` lists them) with
`dna/centroids.json` for hue-family classification. Rebuild with `npm run build:dna`.

## Top level

| Field | Meaning |
|---|---|
| `$schema` | `"palette-dna/1"` |
| `id`, `name`, `mode` | System id, display name, `light` or `dark` |
| `pairedWith` | id of the other mode's DNA when the reference ships both (Radix) |
| `source` | `{ kind: dataset \| npm \| inline \| derived, ref, version?, commit?, license? }` — `derived` marks a DNA computed from another, not extracted from published values |
| `extractedAt`, `toolchain` | ISO time; culori, colorjs.io, nutelch (version@commit) and APCA version strings |
| `authoredGamut` | `srgb` or `p3` — what the source values were written for (Tailwind v4 is `p3`) |
| `steps.keys` | Step labels when every family has the same count (`["50","100",…]`), else `null` |
| `steps.counts` | Distinct step counts across families |
| `steps.direction` | `light-to-dark` (light scales are normalized to this) or `dark-to-light` (dark scales, as authored) |
| `steps.keyStep` | `{ rule: documented, key }` when the system documents a key step (Tailwind 500, Radix 9, Carbon 60, Primer 5, Material 500); otherwise `{ rule: peak-chroma, key: null }` and each family's key is its peak-chroma step |
| `steps.numbering` | Measured, not declared. `class` is `contrast-bearing` when the SD across hues of log WCAG contrast at each interior step averages below 0.05, else `nominal`; carries the per-step min/max band, the surface used (`white`, or `own-step-0` for dark scales) and the first step at which every hue clears 4.5:1 and 3:1. `null` when step counts differ across families |
| `steps.spacing` | How evenly the reference places its own steps: mean and CV of consecutive spine-step ΔEOK, min/max, and a class (`even` < 0.25, `uneven` < 0.5, `role-indexed` above). Carbon 0.14, Tailwind 0.34, Polaris 0.61, Radix light 0.90. The solver's `spacing: 'even'` mode uses this to explain itself |
| `nativeShell` | Which gamut's cusp the system's relative chroma is defined against (the one whose blended transfer error is lower), the mean relC over the middle third of the ramp (`midOvershoot`; Tailwind v4 is 1.06 — 6% past the sRGB shell), and the evidence |
| `chroma.w` | Blend weight per step: `C = w·relC·cusp(L,h) + (1−w)·C_abs`. 1 = pure relative, 0 = pure absolute. `basis` is `steps` (one value per step) or `grid` (Spectrum-style variable step counts) |
| `chroma.wMean`, `chroma.label` | Mean weight and `relative` / `absolute` / `mixed` |
| `kinship` | How well one family's curve predicts another's within the system: share of cross-hue transfers within ΔEOK 0.02 for the blend, pure relative and pure absolute, plus the blend's mean error. A generated palette should surface this as its expected fidelity |
| `hueDrift` | Mean and max per-family Δh range (degrees) and which family has the max |
| `fit` | Fit method per curve: `L: pchip` (monotone, on the spine), `C`/`relC`/`dh: catmull-rom`, `w: linear` |
| `grid` | The n values `sampled` and `aggregate` are evaluated on (21 points by default) |
| `aggregate` | Mean and SD across families of the sampled `L`, `C`, `relC`, `dh` |
| `families` | One `FamilyDNA` per chromatic hue family, keyed by the system's own family name |
| `neutrals` | One `NeutralDNA` per gray ramp: `tintHue` (chroma-weighted circular mean, `null` for a pure gray), `tintSd`, `tintStrength` (peak absolute chroma), `pure`, the lightness spine and the knots. Relative chroma does not apply — see `docs/neutrals.md` |
| `neutralMetrics` | `byStrength` (families ordered pure → most tinted), `spineAgreement` (RMS deviation of L across the neutral families; near zero means one shared spine), `tintHues`, `hasPureGray` |
| `derivedFrom` | Present only on a dark DNA produced by `deriveDarkDNA`: which light DNA it came from, the two surfaces, λ and the chroma settings, the pinned step key, and what the derivation could not do — `shellLimited` (steps whose hue cannot hold the transferred chroma at the lightness the mirror sent them to), `unreachable` (steps whose reference contrast the dark surface has no room for), `separated` (steps the pin squeezed together and the separation pass pushed apart), `mapping` (gamut-mapping counts and ΔEOK) and `warnings`. See `docs/dark-mode.md` |

## FamilyDNA

| Field | Meaning |
|---|---|
| `family` | The system's own key (`blue`, `sky`, `choco`…) — never an automatic color name |
| `hueAtPeak`, `peakIndex` | OKLCH hue and index of the peak-chroma step (the anchor for `dh`) |
| `keyIndex` | Index of the documented key step, or the peak step |
| `classification` | Nearest published hue-family centroid: `{ family, deltaDeg, z, sigma, runnerUp, estimator }`. `z = |Δh|/σ`; below 1 is well inside the family, above 2 is a poor fit. The default estimator is `peak` (one value per palette at its peak-chroma step, circular statistics); `published` reproduces palettes.colorjs.io |
| `spine.indices` | Steps the monotone L curve is fit through |
| `spine.detached` | Steps off the spine: `{ index, delta, role? }`. Radix's bright scales (sky, mint, lime, yellow, amber) detach steps 9–10 in both modes with role `solid background` / `solid background (hover)` |
| `spine.flattened` | Tiny inversions (≤ 0.01 L) nudged onto the spine, with before/after values |
| `spine.fallback` | Present and `true` only if the ramp had more inversions than the bounded search allows |
| `spine.L` | The L values the spine is fit through (after flattening) |
| `knots` | Per step, as authored: `key`, `n` (index-based, `i/(N−1)`), `L`, `C`, `h`, `Y` (relative luminance), `relC` and `cuspC` per gamut, `dh` (from the peak step, signed), `inGamut` per gamut, and `contrast` (WCAG 2.1 and APCA Lc against the ramp's step 0, step max, white and black) |
| `sampled` | `L` (spine PCHIP), `C`, `relC` (native shell), `dh` on `grid` |

## Reconstructing curves

```ts
import { familyCurves, parseDNA } from 'palette-dna';
const dna = parseDNA(fs.readFileSync('dna/tailwind-v4.json', 'utf8'));
const c = familyCurves(dna.families.blue);
c.L(0.5); c.C(0.5); c.relC('srgb')(0.5); c.dh(0.5);
```

`L` is PCHIP through the spine knots only; a detached step's own `knots.L[i]` is the
value to use at that step. `invertMonotone(c.L, targetL)` returns the n at which the
spine reaches a lightness — the primitive the seed-color solver uses to find which
step a seed belongs to.

## How the numbers were chosen

- Spine detection: a ramp that is monotone after flattening is its own spine, so
  legitimate sharp bends (Radix 11→12, Tailwind 900→950, Polaris' dense tints) are
  never touched. Only ramps with a real inversion lose steps; among removal sets that
  restore monotonicity (minimal size to +2), the one whose removed steps all sit far
  from the spine bridged across them wins. This finds Radix's bright 9–10 in dark mode
  too, where they are consistent with the direction but jump 0.38 L and step 11 dips.
- `w(n)`: grid search in 0.05 steps minimizing mean cross-hue transfer error at each
  step; tested to return exactly 1 when families share relC and exactly 0 when they
  share absolute chroma.
- Contrast-bearing threshold 0.05 on σ(log CR): Spectrum 0.00, Web Awesome 0.00,
  Carbon 0.01, Primer 0.02, Polaris 0.04 are in; Atlassian 0.09 is the nearest out.
- JND 0.02 ΔEOK throughout (the CSS Color 4 gamut-mapping JND).
