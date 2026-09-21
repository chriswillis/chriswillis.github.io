# Validation — Phase 4

Everything the generator claims, measured on the emitted 8-bit colour rather
than the intended one, and reported against 185 shipping ramps rather than
against a threshold of mine.

```ts
import { solvePair, buildTokens, audit, lint, renderAudit, reportAudit } from 'palette-dna';

const pair = solvePair({ light: radixLight, dark: radixDark, seed: '#7c3aed', neutrals: true });
const set  = buildTokens(pair);
const a    = audit(set, { reference: radixLight, families: { success, danger }, ramps: { light: pair.light, dark: pair.dark } });
const l    = lint(set, a);

console.log(reportAudit(set, a, l));   // text, for CI
writeFileSync('audit.html', renderAudit(set, a, l));  // the same numbers on real components
process.exit(l.clean ? 0 : 1);
```

Nothing here repairs anything. A harness that fixes what it finds is a generator
with extra steps, and the repair — move the fill, or move the text — is a
decision that belongs to whoever owns the brand.

## The corpus, and why the thresholds come from it

An audit that invents its own pass marks reports its author's opinion. So every
band in `baseline.ts` is measured: 185 chromatic ramps across the 13 reference
systems in `dna/`, run through the same checks the harness runs
(`npx tsx spike/phase4.ts` regenerates them). A result is a position in that
distribution, not a badge.

Two corpus findings are worth having before trusting any number here.

**Sub-JND steps are normal.** 37 of the 185 shipping ramps have an adjacent pair
closer than one JND. The corpus median smallest step is ΔEOK 0.035, the p10 is
0.014, and Radix's light scales go down to 0.008. So a generated ramp that holds
every pair above 0.02 is at the better end of the corpus, not merely adequate —
and a warning about a 0.014 gap is a warning about something a fifth of shipping
systems also do.

**Within-ramp colour-vision deficiency is nearly free. Between families it is
not.** This is the finding that changed the harness. A single-hue ramp is mostly
a lightness ramp, and CVD preserves lightness, so simulating a ramp barely moves
its separation: the corpus median smallest adjacent pair is 0.035 unsimulated and
0.029 under protanopia. Every reference system looks clean on that check.

Telling one *family* from another at the same step is where it bites:

| system | family pairs lost under deuteranopia | worst pair |
|---|---|---|
| Tailwind v4 | 8.8% | violet/purple, ΔEOK 0.056 → 0.004 |
| Tailwind v3 | 4.4% | blue/purple, 0.163 → 0.004 |
| Material | 2.6% | purple/indigo, 0.170 → 0.014 |
| Radix | 2.0% | grass/brown, 0.163 → 0.009 |
| Open Props | 1.7% | indigo/violet, 0.080 → 0.011 |
| Open Color | 1.5% | violet/indigo, 0.080 → 0.011 |
| Spectrum | 1.3% | indigo/purple, 0.096 → 0.008 |
| Primer, Polaris, Carbon, Atlassian, Web Awesome | 0% | — |

Tailwind v3's blue and purple are ΔEOK 0.163 apart — eight JNDs, unmistakable —
and 0.004 apart to a deuteranope. A harness that only checked within a ramp would
have called that clean. So the between-family check runs whenever more than one
family is supplied, and a set with a single family says plainly that it could not
run the check that matters.

## What the audit measures

**The contrast matrix.** Every ordered pair of steps, in WCAG 2.1 and APCA, per
mode. WCAG is symmetric and APCA is not — polarity is the point of it — so the
matrix stores both and the page shows both. Pairs where the two measures disagree
about whether something is body text are listed rather than averaged away; on
this corpus that runs from 0.2% of pairs (Material) to 13.2% (Carbon).

**Step uniformity.** Consecutive ΔEOK, its coefficient of variation, and the same
numbers for the reference the ramp came from — so a ramp is compared with its own
parent as well as with the corpus. A Radix-derived ramp comes out at CV 0.95
against a corpus median of 0.335, which is not a defect in the generator: Radix
numbers by role, and the ramp faithfully reproduces that. `spacing: 'even'` takes
it to 0.08.

**Colour-vision deficiency.** Machado, Oliveira & Fernandes (2009) at full
severity, via culori. A simulation models what a dichromat's display would have
to show a trichromat to convey the same information — not what they see, which
nobody has — so it answers "can these two be told apart" and not "is this the
right colour". Within each ramp, and between families at the same step.

**Gamut headroom.** Per step: the chroma the shell allows at that lightness and
hue in sRGB and P3, what the step actually carries, what is left, and what the
solver gave up getting there — the gamut-mapping ΔEOK and the quantization ΔEOK,
separately, because they have different causes.

**Promises.** Every WCAG threshold the solver promised, re-measured on the
emitted 8-bit colour. This is the one check that should never fire: the solver
nudges lightness by up to a JND until each promise survives quantization, and a
failure here is a solver defect, not a palette one.

It did fire, twice in 1216 fuzz cases, and the claim that it never had was the
thing at fault. Both were the seed step — exempt from the nudge by design, since
the seed being exact is the premise of the library, and so recording a promise it
had no way to keep. The seed now promises what it delivers. Against the property
tests and three fuzz campaigns since, it has not fired.

## The linter

Fifteen rules, each carrying what it checked, what it found and what would fix
it. Severity means something specific:

- **error** — a promise the set makes and does not keep, or a WCAG criterion it
  claims and misses.
- **warning** — a defect a user would notice: a state that does not read as a
  state, two tokens that are one colour, a pair that collapses under CVD.
- **info** — true and worth knowing but not a defect: the ramp sitting on the
  gamut shell, the two contrast measures disagreeing, one step carrying roles
  from several categories.

A few are worth calling out.

`state-indistinguishable` is the one that catches the real cost of pinning. On a
violet seed through Radix, `content/subtle` and `content/normal` both land on
step 12 in dark mode — the text hierarchy has one level, not two — because the
dark ramp's step 11 does not clear 4.5:1 and Lc 60 together on that background.
The remedy is not a nudge; it is a longer ramp or a fill further along.

`foreground-on-surface` came out of the audit page rather than out of a spec, and
the way it was narrowed is the point. The rendered page showed a light-mode
"Disabled" button with no visible label: `content/disabled` and `surface/active`
had resolved to the same step, so the text was its own background. The obvious
generalisation — hold every foreground to its threshold against every surface,
not just against the page — was measured first (`spike/phase5-surfaces.ts`) and
fails **42.5%** of the corpus, which says the framing is wrong rather than that
twelve shipping systems are. `surface/active` is a tinted brand field; body text
was never claimed to compose onto it, and a rule that red-flags half the corpus
teaches people to ignore it.

What survives measurement is the part with no judgment in it: a foreground and
the surface it sits on being the *same colour*. Across 12 references × 6 seeds ×
2 modes, the only sub-JND foreground/surface pairs in the whole corpus were
`content/disabled` on `surface/active` — 30 of 2304, in 8 of the 12 references.
So the rule is a JND floor on the six pairs the components actually compose, and
the assignment was fixed to stop producing them: a step spent on a surface is no
longer available to the `content` and `icon` categories. Borders are exempt, and
that exemption is load-bearing — applying the exclusion to them as well (they
share the same separation rule) pushed `content/disabled` four steps past where
its own criterion put it, turning disabled text into ordinary text. Same-step
pairs across the corpus: 30 → 0.

`apparent-spacing-differs` is the one rule that does not claim anything is wrong,
and that is deliberate. ΔEOK has no Helmholtz–Kohlrausch term, so a ramp made
even by it can be markedly uneven in apparent lightness — 7.45× on average across
the corpus, worst on magentas and pinks. But equalising the other way costs
measured evenness at almost exactly 1:1, so neither ruler is the right one. The
rule reports the gap at `info`, names the dial, and says in its remedy that it is
a trade rather than a fix. See [perception.md](perception.md).

`cvd-steps-collapse` reports one finding per deficiency rather than one per pair,
and drops to `info` when every collapsed pair lands within a tenth of the JND —
a pair at 0.019 is at the threshold, not over it, and a dozen identical warnings
about threshold cases would bury the one that matters.

`requirement-unmet` carries the remedy from the assignment, which for a
foreground on a fill is the lightness the fill would need for that colour to
clear both measures. That is the actionable number.

## The page

`renderAudit` writes one self-contained HTML file: no scripts, no external
references, nothing fetched. The demo components — buttons with their states,
inputs, cards, tables, badges, links, text at 14 and 16px — are styled **only**
from the semantic tokens, so the page fails the same way the palette does. If
`surface/hover` is indistinguishable from `surface/normal`, the button on the
page does not appear to respond.

Below the components: both contrast matrices, the ramp shown as a trichromat
would see it and then simulated three ways, the palette's position in each corpus
band, and every finding with its remedy.

The Radix-violet example ships as `out/audit/radix-violet.html`, and a P3
Tailwind one as `out/audit/tailwind-p3-orange.html`.

## What it found on its own output

Running the harness on a violet seed through Radix, with five families:

- 0 errors. Every contrast promise held after quantization, in both modes.
- 2 warnings. `content/subtle` and `content/normal` collapse onto step 12 in dark
  mode; the closest consecutive steps in light mode are 0.014 apart, which is the
  corpus p10 and is Radix's own spacing faithfully reproduced.
- 0 of 10 family pairs collapse under deuteranopia — lower than 8 of the 13
  reference systems, level with 5.
- The light ramp spends 42% of its steps on the sRGB shell and has a mean
  relative chroma of 0.871, close to the corpus median of 0.873.

The two warnings are both true, both traceable to a decision the pipeline made on
purpose, and neither is something the harness should have quietly fixed.
