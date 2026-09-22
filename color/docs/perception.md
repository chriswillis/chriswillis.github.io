# Perception: viewing conditions and the Helmholtz–Kohlrausch effect

Every lightness number in this library is OKLab L, which is a correlate of
*luminance*. Appearance is not luminance. A saturated colour looks brighter than
a grey of the same luminance, by an amount that depends on its saturation, its
hue, and how light-adapted the eye is — the Helmholtz–Kohlrausch effect, which
OKLab does not model.

This phase asked what can be done about that, measured the answer, and shipped
only the part that survived measurement. One of the two obvious applications did
not survive, and the negative result is recorded here because it is the more
useful of the two findings.

## What the corpus can and cannot teach

Before any modelling, it is worth being clear about what the thirteen references
are evidence *of*. The dark mirror learns from Radix because Radix is the only
one that ships both modes of the same palette; whatever its designers
compensated for by hand is in those numbers. That makes the corpus a good
teacher for effects designers actually compensate for, and no teacher at all for
effects they do not.

Measured on Radix (`spike/phase6-hk.ts`), the chroma ratio between its dark and
light scales runs 4.4× at step 0, through 1.3× at step 4, to exactly 1.00 at the
pinned solid, then 0.96 / 0.93 / 0.77 at the bright end. The dark end taking more
chroma is the Hunt direction — colourfulness falls with luminance, so a dark
background needs more chroma to read as tinted at all — and the mirror already
captures it empirically. The bright end *looks* like deliberate desaturation of
text, but in relative-to-shell terms those same steps are 0.98 / 1.03 / 1.00,
flat: the absolute drop at step 11 is entirely the gamut shell narrowing at
L 0.915. Radix is not compensating for anything up there.

That matters for scope. **Halation** — the bloom of light text on a dark ground,
which is the thing dark mode is actually hard for, and which affects the large
fraction of adults with astigmatism — is not encoded anywhere in this corpus.
Nothing here can be fitted to it, so nothing here claims to address it.

## The measurement

Regressing the residual between the derived dark scale and Radix's authored one
against chroma, within each step across the 25 families (which removes the step
number as a confound, since the calibration already has a free parameter per
step):

| predictor | r | R² | direction |
|---|---|---|---|
| raw chroma | +0.088 | 0.8% | wrong |
| Nayatani VAC, object | −0.268 | 7.2% | as predicted |
| Nayatani VCC, object | **−0.367** | **13.5%** | as predicted |
| Nayatani VAC, luminous | −0.276 | 7.6% | as predicted |

The discrimination is the result. Chroma alone explains nothing and has the
wrong sign; chroma *weighted by Nayatani's hue function* explains 13.5% in the
predicted direction, and a spurious correlation would not select that particular
hue weighting.

Two things the folk version of dark mode gets backwards, both visible in the
model itself:

`K_Br` rises with adapting luminance, so **H–K is weaker in a dark surround, not
stronger**. It is largest in a bright room on a light UI.

And Nayatani's **"luminous" form is not the one to reach for** on a display,
despite a screen being emissive. That form is expressed in the *luminance*
domain — the object Γ pushed through `0.4462(Γ + 0.3086)³`, where the cube is
what carries a lightness-domain factor into a luminance-domain one. Multiplying
OKLab L by it double-counts the cube root and produces a mid violet that appears
lighter than white. The object form is the dimensionally consistent one, and
against Radix the two are indistinguishable anyway.

## The negative result: the dark mirror

Correlation is not improvement. Applying the correction to the mirror — treating
its output as an apparent-lightness target and solving for the measured L that
appears there — and sweeping the strength (`spike/phase6-fit.ts`):

```
naive      best at strength 0.20:  RMS 0.0520 → 0.0493  (−5.1%)
recentred  best at strength 0.15:  RMS 0.0520 → 0.0514  (−1.1%)
```

The naive figure is the misleading one. The existing calibration has a free
parameter per step that was fitted without H–K and is already absorbing whatever
mean shift the correction introduces, so most of that 5.1% is the term
re-parameterising a shift rather than adding information. Removing the per-step
mean first leaves **1.1%, or 0.03 of a JND**.

So the dark-mode application is dead, and it is worth saying why the
13.5%-of-residual figure did not translate. Total RMS ΔEOK is dominated by
chroma and hue error; the lightness residual is a minority of it, and 13.5% of a
minority is nothing. **This is not shipped**, and the spike is kept so the
question does not get re-opened on the strength of the correlation alone.

## The positive result: even spacing

Even spacing is a different question, and it was never tested against Radix
because Radix never made the claim. The dark mirror is judged by how close it
lands to a scale someone already authored — imitation. Even spacing is an
assertion: that the steps are equally far apart. ΔEOK measures that assertion in
a space with no H–K term, while a ramp sweeps chroma from near zero at its ends
to a peak in the middle — precisely the axis being equalised.

Measured across the corpus (`spike/phase6-spacing.ts`), at full model strength:

```
All 160 ramps: CV 0.035 by ΔEOK  →  0.263 by ΔE_HK   (7.45×)

Worst:  carbon/magenta   0.0048 → 0.4241  (88×)
        opencolor/grape  0.0060 → 0.3609  (60×)
        tailwind/pink    0.0082 → 0.4304  (52×)
        carbon/purple    0.0101 → 0.4866  (48×)
```

For scale: even spacing was introduced to fix a reference CV of 0.359 → 0.032.
Remeasured in apparent terms, those "even" ramps sit at 0.263 — nearly back where
they started. And the worst offenders are the magentas, pinks and purples the
effect predicts, not a random scatter, which is the hue signature again.

## But it is a trade, not a fix

Equalising apparent distance instead of measured distance works, and it costs
almost exactly what it buys, at every strength (160 ramps, mean CV):

| strength | measured, today | apparent, today | measured, opted in | apparent, opted in |
|---|---|---|---|---|
| 0.15 | 0.0215 | 0.0488 | 0.0472 | 0.0221 |
| 0.25 | 0.0215 | 0.0734 | 0.0713 | 0.0235 |
| 0.50 | 0.0215 | 0.1370 | 0.1329 | 0.0229 |
| 1.00 | 0.0215 | 0.2514 | 0.2476 | 0.0384 |

There is no setting that dominates. The strength is a dial between two
definitions of "even", not a correction that improves things — and contrast
requirements are stated in measured terms, not apparent ones, so the measured
side is not merely aesthetic.

That is why this is opt-in and why the audit reports both rulers regardless. The
cost is real and concrete: on a pink seed through Tailwind v4, opting in takes
the apparent CV from 0.178 to 0.029 and the measured CV from 0.061 to 0.145 —
and bunches the light end tightly enough that `border/subtle` and `border/normal`
collapse onto one step, which the linter then reports on its own. Nothing had to
anticipate that; the harness found it.

## Using it

```ts
import { palette } from 'palette-dna';

// default: spaced by ΔEOK, with the apparent figures reported
const p = palette({ seed: '#db2777' });
p.audit.uniformity.light.cv;             // 0.061  measured
p.audit.uniformity.light.apparent.cv;    // 0.178  apparent
p.audit.uniformity.light.apparent.ratio; // 2.94 — and the linter says so, at info

// opt in to spacing by apparent distance
const q = palette({ seed: '#db2777', lightness: 'hk' });
q.pair.light.spacing.lightness;          // 'hk'
```

`viewing` and `hk` override the assumptions:

```ts
palette({ seed: '#db2777', lightness: 'hk',
  viewing: { surround: 'dark', adaptingLuminance: 5 },
  hk: { strength: 0.4, method: 'vac' } });
```

## The numbers that are judgement calls

`DEFAULT_STRENGTH` is 0.25, and it is a judgement call sitting between two
measurements rather than a result. Fitted against Radix, the compensation its
designers actually applied comes out at 0.15–0.20, but that optimum is shallow
(1.1%) and so pins the number only loosely. The spacing trade is symmetric at
every strength and therefore picks out no value at all. 0.25 sits between them.

The viewing conditions — 40 cd/m² adapting for a light UI, 8 for a dark one —
are assumptions too. They are the assumptions every other number in this library
was already making silently; naming them is most of the point, and both are
overridable.

## What is deliberately not here

**Halation and ocular straylight.** The real dark-mode failure mode, and not
addressable from this corpus for the reason given above. It would have to be
modelled from vision science (the CIE disability-glare and Vos–van den Berg
straylight functions) and validated against practitioner reports rather than
against the references — a different kind of claim, which belongs in the audit as
a report and not in the generator.

**The Stevens and Hunt effects as explicit terms.** Both are real and both point
at dark mode, but the mirror already absorbs whatever Radix's designers did about
them, and there is no second authored dark scale to separate the model from the
imitation.

**Chromatic aberration on fine blue text.** A plausible lint rule; no measurement
behind it yet.
