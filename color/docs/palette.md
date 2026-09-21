# `palette()` — the one-call path

Every stage of this library is usable on its own, and the phase documents describe
them that way. `palette()` is the path that picks defaults for all of them: solve the
seed into a light ramp and a dark one, assign the semantic roles from the contrast
matrix, audit the result against the corpus, lint it, and hand back all four.

```ts
import { palette } from 'palette-dna';

const p = palette({ seed: '#7c3aed', neutrals: true, families: { danger: '#dc2626' } });

p.tokens;     // TokenSet: primitives + semantics, both modes, stable IDs
p.audit;      // contrast matrices, uniformity, CVD, headroom, promises
p.lint;       // findings, each with its evidence and its remedy
p.pair;       // the solved ramps, the pin, the correspondence
p.families;   // the extra families, solved on the same reference
p.semantics;  // where derived semantic hues came from, when they were derived
p.reference;  // which reference supplied the curves, and where the dark scale came from
```

It composes `solvePair → buildTokens → audit → lint` and adds nothing of its own, so
anything it produces can be reproduced stage by stage. Options not listed below are
passed through to `solvePair` unchanged.

| Option | Meaning | Default |
|---|---|---|
| `seed` | The brand colour. Exact at its step, in both modes | — |
| `reference` | A built-in id or a `SystemDNA` | `'tailwind-v4'` |
| `dark` | The reference's own dark scale | its `pairedWith`, else derived |
| `families` | Further seeds to solve on the same reference, keyed by name | none |
| `semantics` | Derive danger/warning/success/info instead of naming them (`docs/semantics.md`) | false |
| `neutrals` | Also solve a gray ramp, tinted from the seed | false |
| `build` | Passed to `buildTokens` | — |
| `lint` | Passed to `lint` | — |

## Why Tailwind v4 is the default

It is the most used of the thirteen references, which is the first reason and not the
only one. It documents a key step (500), so a seeded brand fill has a declared solid
to pin to rather than a measured chroma peak. It is authored for Display P3, which
makes P3 the natural output gamut and gives the emitted sRGB sibling something to be a
sibling of. Its numbering is nominal rather than contrast-bearing, so the default
spacing (`'auto'` → even, see [solver.md](solver.md)) applies without breaking a
promise its step numbers were making.

What the reference supplies is the **curves**: the lightness spine, the relative-chroma
shape, the hue drift, the chroma blend policy `w(n)`. Naming a different reference
swaps all of them together.

## What cannot default to it

The light-to-dark calibration. `dark/mirror.ts` carries measured values for λ, the
chroma compression factor, the transfer weights and the near-surface gain, and all of
them come from Radix — because Radix is the only reference here that ships a light
*and* a dark scale of the same palette. Tailwind has no dark scale, so there is
nothing in it to measure.

This is not a gap to be filled later by better fitting. It is a property of the
inputs: twelve of the thirteen references publish one scale, and a relationship
between two modes cannot be measured from one of them. So the two questions are
answered separately and by different systems. The reference supplies the curves; Radix
supplies the relationship between the modes. Only the first of them has thirteen
possible answers.

Where the reference *does* ship its own dark scale, that scale wins over the
derivation — `palette({ reference: 'radix-light' })` reports
`reference.dark.kind === 'authored'`. An authored dark scale beats a derived one, and
the derivation exists for the twelve references that do not have one.

## Loading a reference

```ts
import { loadDNA, builtinDNAIds, DEFAULT_REFERENCE } from 'palette-dna';

builtinDNAIds();            // the thirteen ids, as dna/index.json lists them
loadDNA();                  // the default: tailwind-v4
loadDNA('radix-light');     // parsed once and cached
DEFAULT_REFERENCE;          // 'tailwind-v4'
```

`loadDNA` reads from `dna/`, parses through `parseDNA` (so the schema version is
checked), and caches. An unknown id throws with the remedy in the message.

## What a clean run looks like

On the default reference, and on Radix, a violet seed produces no errors and no
warnings. That is the bar those two are held to in the tests, and it is deliberately
only those two: the other references are held to *completing and explaining
themselves*, not to being clean, because some of them genuinely cannot hold some
roles. Open Color is a ten-step pastel scale whose darkest chromatic step is L 0.55,
so nothing in it reaches 4.5:1 on white at any spacing. Reporting that is the job;
hiding it would not be.
