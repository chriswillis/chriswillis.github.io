# Derived semantic hues

`palette({ seed, families: { danger: '#dc2626' } })` makes you choose the red. That was
the honest interface while the library had nothing to say about where danger should sit,
but the corpus does have something to say, and it is measurable: across the eleven shipping
systems that publish them, the hue each of these names occupies is tightly agreed, and
inside that agreement there is room to place the families so they stay apart from each
other and from the brand — including under colour-vision deficiency, which is exactly where the corpus
says real systems fail.

```ts
const p = palette({ seed: '#7c3aed', semantics: true });

p.families.danger.light.steps;   // a full ramp, solved from the same DNA as the brand
p.semantics.hues;                // { danger: 30.9, warning: 104.8, success: 160.8, info: 261.7 }
p.semantics.conventional;        // { danger: 26.1, warning: 48.7, success: 150.7, info: 256.7 }
p.semantics.achieved.min;        // 0.0199 — the closest any two of the five families come
p.semantics.gain;                // +0.0096 against the conventional hues
p.semantics.corpus.verdict;      // 'better than most'
p.semantics.warnings;            // empty unless hue has run out of room
```

It is off by default, and anything in `families` wins over a derived hue of the same name:
a named seed is a decision, and the derivation fills the roles you left open.

```ts
palette({ seed: '#7c3aed', semantics: true, families: { danger: '#b91c1c' } });
// danger is yours; warning, success and info are derived around it
```

## Where the windows come from

`dna/centroids.json`, the measured hue centroid of every family name across the corpus.
Two standard deviations either side of the mean is the window — "still that colour" by the
only standard available, which is what everyone else already shipped.

| role | centre | window (±2σ) | width | attested on |
|---|---|---|---|---|
| danger | 26.1° | 21.2 – 30.9 | 9.7° | red — 11 systems, σ 2.4 |
| warning | 48.7° | 24.8 – 104.8 | 80.0° | orange 11 (σ 12.0), amber 3 (σ 15.7), yellow 11 (σ 5.9) |
| success | 150.7° | 140.5 – 160.8 | 20.2° | green — 11 systems, σ 5.1 |
| info | 256.7° | 246.7 – 266.8 | 20.1° | blue — 11 systems, σ 5.0 |

Warning is a union of three families because the references genuinely disagree — orange at
48.7°, amber at 67.0° and yellow at 93.0° all ship under that meaning — and collapsing
them to one number would invent a precision the data does not have. Its centre is orange's
own mean rather than the midpoint of the union, because the midpoint of a union can land
on a hue no system actually publishes.

Nothing in the search may leave these windows. A danger that is not red is not danger, and
a palette that scores well by abandoning the meaning of its own names has not solved the
problem it was given.

## The objective, and why the obvious one does not work

The score is the closest any two of the five families come — at any of the three sampled
steps, under normal vision and all three deficiencies. Worst case, because a palette is
only as distinguishable as its closest pair.

Only the middle three steps are sampled. Two families at the same step share a lightness by
construction, so the ends of the ramp are close for every pair, and including them would let
a fact about lightness dominate a measurement about hue.

Maximising that minimum directly does not work, and the reason is worth stating because it
cost a day. **The minimum is flat.** While one pair is the binding one, moving any other
family changes the score not at all, so single-coordinate descent sees a plateau and stops.
It stopped somewhere a third worse than hue sets inside the same windows. Raising the grid
resolution does not help — the plateau, not the grid, is what binds.

The repair is leximin: compare the worst pair, then the second worst, then the third. A move
that improves the second-worst pair is now accepted, which frees a later move to improve the
worst one. It is free, because the pairwise distances were computed anyway.

| | median | mean | best case |
|---|---|---|---|
| minimum only | 0.0206 | 0.0223 | — |
| leximin, same budget | 0.0225 | 0.0237 | +0.0166 (0.83 JND) |
| leximin, grid ×2 | 0.0225 | 0.0240 | +0.0003 over the above |

Measured over 12 references × 9 brand hues. `compareSeparation` in
`src/tokens/semantics.ts` is the comparator; `separation()` returns the whole sorted
profile alongside its minimum.

## Is it better than choosing by hand?

Five families against five. Scoring our five against a reference's full set of nine to
twenty-five would be rigged — more families means more chances at a close pair, and on that
comparison every reference "loses" by a mile. So each reference is scored on five of its
own, chosen the same way: its red, its orange/amber/yellow, its green, its blue, and
whichever remaining family sits furthest from those four standing in for a brand, at the
colours it actually publishes, per-family curves and all.

Derived hues win on **all twelve**, median 0.0174 → 0.0235. `spike/phase7-semantics.ts`
prints the table, and `test/semantics.test.ts` fails if a reference ever wins.

Against the conventional hues rather than against the references, the median gain is 0.0147
— about three quarters of a JND — and in the worst case it is the difference between 0.0000
and 0.0218, because a brand at 26° and a danger at 26.1° are the same colour and nothing but
moving one of them helps.

## What it will not do

**It will not tell you the brand is in the closest pair, as though that were news.** Over 18
brand hues it is true 83% of the time: a fifth family added to four fixed ones will usually
end up nearest one of them. `brandCollision` reports it as data and nothing more.

**It will not warn you that a role landed on the edge of its window.** A maximin optimum
over a box usually *is* on the boundary; measured over 144 cases at least one role sits
there 93% of the time, 2.2 roles per case. `atBandEdge` lists them; no warning fires.

**It will not suggest widening the windows.** On exactly the cases that go wrong, doubling
them (`sigmas: 2` → `4`) is worth a median 0.0036 — under a fifth of a JND — and eight of
nineteen stay poor anyway. It would trade the meaning of the word "danger" for nothing.

What it will do is warn when the separation is genuinely poor: below the 0.0104 that nine
in ten reference systems reach on the same measure. That fires on one brand hue in
twenty-four, and every time it fires the brand is sitting on a semantic hue — around 30°,
where it collides with danger, or 240–300°, where it collides with info. The remedy is not
a colour: distinguish them by step, by icon, by label, or pick a different brand hue.

```
brand    nearest role   Δhue   separation   corpus
    0°   danger           26°       0.0180   better than most
   30°   danger            4°       0.0075   worse than most     ← warns
   45°   warning           4°       0.0331   better than most
   90°   warning          41°       0.0316   better than most
  135°   success          16°       0.0324   better than most
  180°   success          29°       0.0396   better than most
  225°   info             32°       0.0344   better than most
  270°   info             13°       0.0108   worse than most
  315°   info             58°       0.0287   better than most
```

## Cost and tuning

One derivation is about 80 ms: four hue bands × 13 positions × 3 sweeps, with one ramp
solve per distinct hue and a cache keyed on it. The whole rest of `palette()` is 5 ms, so
`semantics: true` takes the call from 5 ms to 86 ms and the derivation is essentially all
of it — the four extra family ramps are nearly free, because the dark derivation they share
is memoised. The explorer memoises on reference, gamut and brand hue, which are the only
inputs the derivation depends on, so dragging a colour picker through lightness and chroma
costs nothing.

```ts
palette({ seed, semantics: { sigmas: 3 } });                     // wider windows, measured above as a poor trade
palette({ seed, semantics: { roles: [                            // your own taxonomy
  { name: 'critical', families: ['red'] },
  { name: 'stable',   families: ['green', 'teal'] },
] } });
```

A role whose families are not in the centroid table is skipped rather than guessed at. All
four roles being unknown returns an empty derivation with a warning, not an exception.

## Why `info` is in the list

It has the weakest claim of the four — plenty of systems have no `info` — and it is
included for two measured reasons. Blue is tied for the most attested family in the corpus
and the second tightest after red, 256.7° ± 5.0 across eleven systems, so the window is
real whether or not the name is. And
leaving it out would free the search to place the other three on top of a colour nearly
every system already ships, which is the opposite of what the search is for.
