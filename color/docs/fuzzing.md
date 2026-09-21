# The fuzz harness

```
npm run fuzz                    # 200 random seeds + the edge cases
npm run fuzz -- --cases 5000    # a real campaign
npm run fuzz -- --seed 42       # replay campaign 42 exactly
```

The audit asks whether *a palette* is any good. This asks whether *the library*
is. That distinction is the whole design, and it decides what counts as a
failure: the harness exits non-zero on crashes and invariant breaks, and never
on lint findings, because a palette that cannot hold a role is a fact about that
palette and a CI gate firing on it would just be reporting the corpus back.

## Three kinds of result

**Crashes.** A solve threw. Always a library defect, always ranked first, always
reproducible from the case alone.

**Invariant breaks.** The library broke a promise it makes in its own
documentation — the seed is exact, output is in gamut, spine lightness is
monotone, adjacent steps are distinct, the same input gives the same output,
every contrast promise survives quantization. A palette cannot be "imperfect" in
these ways. Only the code can be wrong.

**Lint findings.** Ranked by *rarity*, not by count. A rule firing on 84% of
cases is describing the corpus; one firing on 5% is pointing at something. The
report sorts ascending by rate for exactly this reason.

## Reproducibility

Deterministic by construction: the campaign seed drives a mulberry32 PRNG, and
the same seed replays the same cases in the same order. Every violation carries
the case that produced it and prints a one-line `palette({...})` call that
reproduces it. A fuzz finding you cannot reproduce is an anecdote.

Seeds are sampled in OKLCH rather than hex. Uniform hex clusters in the middle
of the lightness axis and almost never produces a highly chromatic colour, which
is precisely where the interesting behaviour lives. A quarter of samples are
deliberately near-achromatic.

`EDGE_SEEDS` runs on every campaign whatever the seed: both ends of the
lightness axis, one step in from each end, zero chroma where hue is undefined,
chroma well past what any gamut holds, and the sRGB primaries and secondaries.

## What the first campaigns found

Two of the four original invariants were mis-specified, and finding that out
first mattered more than any of the results:

- **seed-inexact fired 82 times in 216 cases** because it compared against the
  raw seed. A seed outside the output gamut cannot be reproduced and is not
  meant to be — the promise is exactness against the *mapped* seed. Comparing
  against the input reports every out-of-gamut seed as a defect, which is a bug
  in the check and not in the solver. 82 → 4.
- **out-of-gamut fired 34 times** because it checked against the nutelch LUT
  while the solver maps with Color.js. The LUT is an interpolation and disagrees
  with the true boundary by a few thousandths, which is enough to report a step
  the solver mapped correctly. Switched to the exact bisection oracle. 34 → 2.

A third was too strict rather than wrong: **non-monotone** asserted exact
monotonicity on quantized 8-bit output, where one least-significant bit moves
OKLab L by about 0.002 near white. Three of its six hits were one LSB of blue.

After that, 133 reported defects came down to 19 real ones, and the real ones
led somewhere:

**A near-achromatic seed at an extreme of lightness collapses the other mode's
ramp.** A seed at L 0.204 ranks at Spectrum's *darkest* step in light mode;
pinning that same step key in dark mode puts a dark colour where the ramp's
brightest step belongs, and the whole ramp has to fit into the 0.005 of lightness
left underneath. The solver now says so directly rather than leaving the caller
to infer it from the linter:

> steps 1300 and 1400 are only ΔEOK 0.0000 apart, under the 0.02 just-noticeable
> difference — the whole ramp spans just 0.005 in lightness, so the seed's step
> leaves nowhere for the others to go. They will read as one colour.

## What it found and what was fixed

`duplicate-steps` fired on 122 instances, the only class reaching the default
path, and chasing it was instructive because the first two diagnoses were wrong.

It looked like quantization — adjacent steps rounding to the same 8-bit colour.
Splitting the cases by how much lightness the ramp actually spanned showed 22
where the ramp was genuinely collapsed (span under 0.05, so no ten distinct
8-bit colours exist to be had) and **12 where the ramp spanned as much as 0.75
and still emitted duplicates**. Those twelve were the bug.

The second wrong diagnosis was the metric. A Tailwind dark ramp put nine
consecutive steps on L 0.90864 to five decimal places, which suggested ΔE_HK
going locally flat and breaking the arc-length inversion. Two fixes along those
lines — a strictly-increasing baseline on the arc length, and a guard for a
starved side — changed the count by exactly zero, and were reverted. Measuring
the fix rather than reasoning about it is what caught that.

The cause was the pin. A seed's *step* is decided in light mode and reused in
dark mode, which is what Radix does and what makes a brand colour the same colour
in both. But a seed's *lightness* ranks differently in the two: a pale blue at
L 0.91 is near the top of a dark ramp and near the bottom of a light one. Pinned
to the light ramp's step 100, the nine dark steps above it had to be brighter
than the brightest lightness the curve reaches, and every one of them piled onto
the same colour.

Three premises collide there and they are not equal. The seed being exact is the
premise of the library. Distinct steps are the difference between a palette and a
swatch. Sharing a step key across modes is a convenience measured off one
reference. So the last yields: when pinning collapses steps that solving freely
would not, the dark ramp is solved on its own terms and the warning says the two
modes no longer correspond step for step. Ordinary seeds are untouched — they
still share a step at ΔEOK 0.00000.

Result on the same campaign: `duplicate-steps` 122 → **0**, total invariant
breaks 152 → 29, and the campaign runs in 13.6s instead of 25s because there are
far fewer degenerate ramps to grind through.

## Open defects

A 1216-case campaign (`--seed 42`) still leaves these:

| rule | cases | notes |
|---|---|---|
| `non-monotone` | 15 (1.2%) | Spine lightness turning around by more than one 8-bit step. Mostly `lightness: 'hk'`. |
| `out-of-gamut` | 8 (0.7%) | Real overshoot, not LUT error — `#0000ff` through Open Color at `lightness: 'hk'` carries C 0.313 where sRGB holds 0.266. |
| `seed-inexact` | 4 (0.3%) | Seeds at extreme lightness where the mapped seed still is not reproduced. |
| `promise-broken` | 2 (0.2%) | The solver's quantization nudge landing a hundredth short: promised 4.5:1, measured 4.49:1. |

Eighteen of the 29 are on the `lightness: 'hk'` path added in the perception
work, which is opt-in and was never fuzzed before it shipped — a fair indictment
of the order those two things were done in. The default path is down to 11 of
1216, or 0.9%.

## Using it as a library

```ts
import { fuzz, reproduce } from 'palette-dna';

const r = fuzz({ references, cases: 5000, seed: 42 });
r.crashes;      // library defects, worst first
r.invariants;   // promises the library broke
r.byRule;       // per rule: count, share of cases, and the worst instance
r.worst;        // crashes, then invariants, then the rarest non-info findings

for (const v of r.worst) console.log(v.message, '\n  ', reproduce(v.case));
```

`onProgress` makes a long campaign watchable, and the whole thing is synchronous
and dependency-light so it runs in a web worker as readily as in CI.
