# Dark mode — Phase 3

A dark ramp is not a light ramp upside down. This phase derives one by mirroring
the light ramp's **contrast against its surface** onto the dark surface, with the
parameters measured on the only reference here that ships both modes.

```ts
import { solvePair, deriveDarkDNA, parseDNA } from 'palette-dna';

// one seed, two modes, the seed exact and on the same step in both
const pair = solvePair({ light: tailwind, seed: '#7c3aed', neutrals: true });
pair.light.steps.map((s) => s.color.native);
pair.dark.steps.map((s) => s.color.native);
pair.pin;            // the shared color, and what it costs in each mode
pair.darkSource;     // 'derived', plus everything the derivation could not do

// when the reference ships its own dark scale, use it — it is the authored article
solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed' });

// the dark reference on its own: an ordinary SystemDNA the whole library accepts
const dark = deriveDarkDNA(tailwind, { surface: '#0b0b0f' });
```

## What Radix's two scales actually say

Radix is the only reference in `dna/` that ships a light and a dark scale of the
same palette, so it is the only place the light → dark relationship can be
measured rather than asserted. 25 families × 12 steps, reproduced by
`npx tsx spike/phase3.ts` and `npx tsx spike/phase3b.ts`.

**The key step is pinned.** Step 9 — the brand solid — is byte-identical between
the two scales in all 25 families: ΔEOK exactly 0. Nothing else is; the next
closest step is 10, at ΔEOK 0.072. The grays are not pinned at all, their closest
step being 0.023 apart, so Radix re-authors them per mode.

**The pinned step gives up its place in the contrast ladder to stay one color.**
Blue-9 is 3.18:1 on the light surface and 5.78:1 on the dark one; yellow-9 is
1.23:1 and 14.93:1. Its contrast *gain* between modes therefore has a coefficient
of variation of 1.11 across hues — it is not a contrast step at all, and any
mirror applied to it is wrong by construction. Every other step's gain has cv
0.01–0.22.

**WCAG under-corrects for polarity and APCA over-corrects.** To reach Radix's
dark scale by mirroring WCAG 2.1 contrast exactly, you need a per-step gain
running 1.0 → 1.9. To reach it by mirroring APCA Lc exactly, you need 0.44 →
0.93. The two bracket the answer from opposite sides, which is a tidier result
than either one being right: WCAG is polarity-blind by design, APCA's polarity
term is tuned for text and overshoots on surfaces.

## The model

Per step, in the source's own step order (so key `50` means the same role in both
modes — relabelling for the `dark:bg-blue-950` convention is an emitter's job):

1. **The key step is held at its light-mode color.** Only where the system
   *documents* a key step, because a documented key step is the declared brand
   solid. Where the "key" is merely wherever chroma peaks — Spectrum, Polaris,
   Atlassian, Open Color, Open Props, Web Awesome — nothing is designated, and
   nothing is pinned.
2. **Every other spine step is mirrored**: solve its lightness so its contrast
   against the dark surface matches what it had against the light one, λ of the
   way from the WCAG 2.1 solution to the APCA one. Chroma perturbs luminance, so
   the solve iterates three times.
3. **The step just past the pin hangs off the pin**, not off the background. It
   is the solid's hover, and pinning has already displaced the ladder there:
   mirrored against the background, Radix's blue 9→10 comes out ΔEOK 0.003 apart.
   Detached steps (Radix's bright solids) hang off their anchor the same way.
4. **Chroma** is the usual blend — `w·relC·cusp(L, h) + (1−w)·C` — times a
   per-step factor, then capped at the gamut shell.
5. **A separation pass** pushes any adjacent pair the pin squeezed below one JND
   apart, and pulls back any step the pin overran.
6. Gamut-map, quantize to 8 bits, and run the result back through
   `extractSystemDNA`, so the derived dark DNA is structurally identical to an
   extracted one.

### λ — one number between two contrast models

`lambda` is 0 for a pure WCAG mirror, 1 for a pure APCA mirror, and 0.5 by
default. Fitting that single number to Radix gives **0.486 ± 0.242** over the 166
steps where APCA can be inverted at all. Per step it rises from 0.27 near the
surface to 0.80 near the far end, and `lambda: 'radix'` uses that curve instead —
worth about 25% more accuracy on Radix, at the cost of ten more parameters taken
from one system.

### Below |Lc| 8, APCA cannot be inverted

It clamps toward the background, so there is no APCA solution to blend with and
the subtle steps fall back to a bare WCAG mirror — which lands them about 0.04 L
too close to the surface, WCAG being exactly the polarity-blind measure λ exists
to correct. The measured WCAG gain there (1.010, 1.040, 1.116) is the
best-determined number in the calibration, cv 0.01–0.05 across 25 hues, and it
applies in full. `nearSurfaceGain: false` turns it off.

### The chroma transfer needs its own blend weight

A system's own `w(n)` was fit for transfer *between hues at one lightness*. A mode
flip moves a step the length of the lightness axis, where the shell is a different
width, so a relative transfer there multiplies chroma instead of preserving it:
Tailwind's `blue-50`, a barely tinted white at C 0.013, comes out at C 0.09 — a
saturated indigo where a whisper was meant. The fitted transfer weights are
near-absolute at the subtle end (0.05) and relative only around the solid (0.60,
0.65), with a per-step factor above 1 at the background end — a tinted surface at
L 0.18 needs about 2.8× the chroma of its light-mode counterpart at L 0.99 to read
as tinted at all. Both were predicted by Phase 0. `chromaPolicy: 'source'` uses
the source system's w(n) instead; it is about 2% worse on Radix and much worse on
Tailwind.

### Some hues cannot hold the DNA at the other end of the axis

Tailwind's `yellow-300` carries C 0.16 at L 0.90. At the L 0.34 the mirror sends
it to, no color of that hue holds half of it. The transfer caps such steps at the
gamut shell and lists every one in `derivedFrom.shellLimited` with what it wanted
and what it got, rather than asking for the impossible and letting the gamut
mapper take it away quietly. On Tailwind v4 that is 85 steps; the worst,
`lime-400`, wants C 0.224 and holds 0.112. No parameter recovers it — the gamut
is simply narrower down there.

## How well it works

Derived from Radix's light scale and compared with Radix's own dark scale, with
the whole pipeline in place — mirror, pin, separation pass, gamut map, 8-bit
quantization — over 25 families × 12 steps. Every calibration number is fit
leave-one-family-out, so nothing in a hue's own dark scale set the numbers used to
predict it. Reproduce with `npx tsx spike/check-dark.ts`.

| setting | RMS ΔEOK | median | within 2 JND |
|---|---|---|---|
| **balanced λ = 0.5 (default)** | **0.0381** | 0.0199 | 73% |
| λ(n) fit to Radix | 0.0294 | 0.0214 | 86% |
| no near-surface gain | 0.0418 | 0.0232 | 66% |
| source system's own w(n) | 0.0390 | 0.0215 | 72% |
| no chroma factor | 0.0383 | 0.0211 | 73% |
| λ = 0 — bare WCAG mirror | 0.0752 | 0.0526 | 43% |
| λ = 1 — bare APCA mirror | 0.0768 | 0.0526 | 43% |
| **no pin** | **0.1196** | 0.0292 | 59% |

The pin is worth more than every other parameter put together. The balanced
mirror halves the error of either pure one. The residue concentrates in Radix's
bright scales — yellow 0.069, amber 0.059, lime 0.058 — whose dark ramps are hand
authored around a solid that takes dark text; the best-fitting families (iris,
indigo, violet) come in at 0.020, one JND.

The separation pass is the one place the derivation puts legibility above the
mirror. Without it, 23 of 25 families come out with an adjacent pair under a JND
(worst: blue 9→10 at ΔEOK 0.003 — a hover state nobody could see); with it the
floor is 0.018, which is exactly where Radix's own dark scale sits.

**The honest limit**: every number here comes from one system. Radix is the only
reference in `dna/` that ships both modes, so cross-validation is across hues, not
across systems. When a reference ships its own dark scale, extract it and pass it
as `dark` — this is an approximation of that, not a replacement for it.

## Choosing the dark surface

`surface` defaults to the light system's own darkest neutral step, which is right
for the systems whose scales run to near-black — Tailwind's `neutral-950` at
L 0.129 is what people already use as a dark background. It is wrong for the
systems whose darkest neutral is a *text* color: Radix's `gray-12` is L 0.240, and
Radix sits its actual dark surface at L 0.178. The derivation warns when the
default lands above L 0.22.

There is no clever rule hiding here. Fitting the surface so the whole mirrored
ladder stays reachable gives L 0.144 for Radix — close to its real 0.178 — but
returns black for Tailwind, Open Props, Spectrum and Polaris, whose light scales
already run to 19:1 against white and cannot be out-contrasted on any surface.
Steps that cannot reach their mirrored contrast are clamped and listed in
`derivedFrom.unreachable`.

## What pinning costs, and what `solvePair` tells you about it

`solvePair` reports it rather than hiding it:

- `pin` — the shared color, its step key, and its WCAG and APCA contrast against
  each background. A warning fires when the two differ by more than 2×.
- `correspondence` — every step's ΔEOK between modes and its contrast in each.
- a warning naming the steps that carry body text in one mode and are solids in
  the other. These are always the steps nearest the pin, and they are the reason
  a semantic token like `content/accent` cannot simply be "step 600" in both
  modes: the contrast matrix has to decide, which is Phase 3.5's job.

On Radix with `#7c3aed`, the seed lands on step 9 and reads 5.60:1 on white and
3.32:1 on the dark surface. On Tailwind it lands on 600 and reads 5.51:1 and
3.54:1. In both, steps 8–10 carry body text in light mode and are solids in dark
mode.

## Neutrals

Derived the same way with no pin, since Radix does not pin its grays either. They
agree with Radix's own dark grays to RMS ΔL 0.042 — the loosest fit in this phase,
and honestly so: Radix's dark gray ramp is re-authored, not mirrored. Pass
`neutrals: true` to `solvePair` and both modes' grays come back tinted from the
seed.

## Options

| option | default | what it does |
|---|---|---|
| `lambda` | `0.5` | 0 mirrors WCAG, 1 mirrors APCA, `'radix'` uses the per-step curve |
| `chroma` | `'radix'` | per-step chroma factor; a number for a flat one, `'none'` for 1 |
| `chromaPolicy` | `'transfer'` | `'source'` reuses the system's own w(n) |
| `nearSurfaceGain` | `true` | the measured correction where APCA cannot be inverted |
| `surface` | darkest neutral | the dark surface |
| `lightSurface` | lightest neutral | the surface the source's contrast is measured against |
| `pinKeyStep` | `'auto'` | pin only where the system documents a key step |
| `minStepDeltaE` | `0.02` | floor on adjacent step separation; 0 disables |
| `gamut` | the source's | output gamut |

`lambda: 0, nearSurfaceGain: false, chroma: 'none', chromaPolicy: 'source',
pinKeyStep: false, minStepDeltaE: 0` is the bare contrast mirror with no
calibration in it at all.
