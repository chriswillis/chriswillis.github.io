# Neutrals

Every reference system ships gray ramps, and they carry DNA as much as the hue
families do — but not the same kind, so they are extracted and solved separately.

## Why not the same math

Relative chroma is the transferable quantity for a hue family. It is unusable for a
neutral: the sRGB cusp at L 0.985, h 257° is about 0.004, so Tailwind slate-50's
chroma of 0.003 reads as relC 0.75, and a just-noticeable amount of noise moves it by
half. What actually distinguishes one neutral from another is a **tint** — a hue that
holds roughly constant down the ramp, plus an absolute chroma envelope one to two
orders of magnitude smaller than a hue family's.

So a neutral's DNA is: the lightness spine (fit exactly as for any ramp), an absolute
chroma envelope, and one tint hue with its stability. `w(n)` does not apply; chroma is
always absolute.

## What each system offers

| System | Neutrals |
|---|---|
| Tailwind v4 (4.3.3) | slate 259°/0.046 · mauve 323°/0.034 · gray 261°/0.034 · olive 107°/0.031 · mist 215°/0.021 · taupe 40°/0.021 · zinc 286°/0.017 · stone 58°/0.013 · **neutral** (pure) |
| Radix | mauve 299°/0.019 · slate 275°/0.016 · sage 169°/0.012 · olive 141°/0.012 · sand 100°/0.010 · **gray** (pure) |
| Carbon | coolGray 247°/0.015 · warmGray 22°/0.007 · **gray** (pure) |
| Open Props | sand 91°/0.037 · gray 249°/0.015 · stone 192°/0.007 |
| Web Awesome | gray 275°/0.026 |
| Primer | neutral 251°/0.020 |
| Open Color | gray 248°/0.015 |
| Atlassian | neutral 269°/0.014 |
| Material · Spectrum · Polaris | a single pure gray |

Tailwind 4.3.3 has nine, not the five most people know — mauve, mist, olive and taupe
were added alongside slate, gray, zinc, neutral and stone.

Within a system the neutral families share one lightness spine (RMS deviation of L
across families: Tailwind 0.0063, Radix 0.0013, Carbon 0.0009). They differ only in
tint hue and tint strength, which is why `neutralMetrics.byStrength` orders them as a
dial from pure gray to strongly tinted.

## Solving

```ts
import { solveNeutralRamp } from 'palette-dna';

// the reference's own gray, reproduced
solveNeutralRamp({ dna, family: 'slate' });
// tie the grays to the brand — what slate is to blue, for any hue
solveNeutralRamp({ dna, tintFrom: '#7c3aed' });
// pick the tint strength: 0 is a pure gray, 1 the reference's own
solveNeutralRamp({ dna, tintFrom: '#7c3aed', tintStrength: 0.5 });
```

| Option | Meaning | Default |
|---|---|---|
| `family` | Which neutral to use as reference | the one whose tint is nearest the target |
| `tintHue` | Target tint hue in degrees | the reference's own |
| `tintFrom` | Take the tint hue from a brand color | — |
| `tintStrength` | Multiplier on the chroma envelope; 0 gives a pure gray | 1 |
| `gamut`, `background`, `spacing`, `sibling` | As for `solveRamp` | |

The reference's own slight hue drift is carried across: Tailwind slate runs 248° at
step 50 to 265° at 950, and a ramp tinted to 30° reproduces that ±8° movement around
30° rather than pinning every step to one hue.

Three honest behaviours: asking a pure gray to carry a tint changes nothing and warns,
naming the tinted neutrals available instead; an achromatic `tintFrom` is rejected with
a warning rather than silently becoming hue 0; and `spacing: 'even'` works here too —
Radix slate's own placement has CV 1.07, evenly spaced it is 0.02.

## Tests

`test/neutrals.test.ts` — every neutral of every system round-trips to its authored
ramp within ΔEOK 0.004; tint transfer preserves lightness and chroma while moving hue;
`tintStrength` scales the envelope exactly; pure grays and achromatic tint sources warn;
and 150 random tint/system/gamut/spacing/strength combinations hold gamut, contrast
promises and spine monotonicity.
