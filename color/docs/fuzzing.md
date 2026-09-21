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

## Open defects

A 1216-case campaign (`--seed 42`) leaves these, and they are not yet fixed:

| rule | cases | notes |
|---|---|---|
| `duplicate-steps` | 122 (10.0%) | Adjacent steps quantizing to the same 8-bit colour. Concentrated in low-chroma seeds where the ramp differs almost only in lightness, and in compressed ramps. Affects the default path, not only `lightness: 'hk'`. |
| `non-monotone` | 16 (1.3%) | Spine lightness turning around by more than one LSB. Mostly `lightness: 'hk'`. |
| `out-of-gamut` | 8 (0.7%) | Real overshoot, not LUT error — `#0000ff` through Open Color at `lightness: 'hk'` carries C 0.313 where sRGB holds 0.266. |
| `seed-inexact` | 4 (0.3%) | Remaining cases after the mapped-seed fix. |

The concentration is informative: most of the non-`duplicate-steps` breaks sit on
the `lightness: 'hk'` path added in the perception work, which is opt-in and was
never fuzzed before it shipped. `duplicate-steps` is the one that reaches the
default path and is the first thing to fix.

The solver has a nudge mechanism that already protects contrast promises through
quantization; extending it to protect step distinctness is the obvious fix, and
is a change to the solver rather than to the harness.

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
