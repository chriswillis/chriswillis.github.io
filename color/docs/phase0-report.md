# Phase 0 — Spike report

Extracted DNA from Tailwind v4 (17 chromatic families) and Radix Colors 3.0 (25 chromatic
families, light and dark, sRGB and P3) for blue, yellow and green, with every other family
used as supporting evidence. Pipeline: culori for conversions, vendored nutelch (pinned
915b785) for cusp math, Color.js 0.7.1 as oracle for conversions, gamut tests and contrast.
Oracle checks: culori vs Color.js OKLCH agree to 2e-13; LUT cusp vs Color.js bisection
worst 0.0037 chroma (spec ±0.009); headline transfer number reproduced end to end with
Color.js only (0.0139 vs 0.0138). Figures in `out/`, raw numbers in `out/phase0.json`
and `out/phase0-report.txt`. Reproduce with `npx tsx spike/phase0.ts && npx tsx
spike/phase0b.ts && npx tsx spike/phase0c.ts && npx tsx spike/verify.ts && python3
spike/plot.py`.

## Verdict on the premise

The premise is "relative chroma clusters within a system and diverges between systems".
It was tested two ways: raw spread of relC(n) across hue families, and, more usefully,
**transfer error** — take hue A's normalized curve, apply it at hue B's actual (L, h) for
each step, and measure |C_predicted − C_actual|, which is the ΔEOK of the miss since L and h
are held. Transfer error is what the solver will actually incur, in perceptual units, and
it is immune to the ill-conditioning of relC where the cusp is tiny (see below). JND = 0.02
ΔEOK throughout (the CSS Color 4 gamut-mapping JND).

**Tailwind v4: the premise holds, strongly.** Across all 17 hues and all 272 ordered pairs,
transferring relC (vs the sRGB cusp) gives mean error 0.014 ΔEOK, median 0.007, 78% of
transferred steps within one JND, 91% within two. Transferring absolute chroma gives 0.039
mean and 40% within JND — relC is 2.8× better. Per-step relC error is flat at ~0.015 from
200 to 950. Coefficient of variation of relC across hues is 0.04–0.06 at steps 400–700.
Plotted against L instead of step (Fig 2), Tailwind sits at relC 1.03–1.07 for L in
0.5–0.8 with SD 0.04–0.06: **Tailwind rides the sRGB shell, overshooting it by ~5% into P3,
at every hue.** That is Tailwind's DNA in one sentence.

**Radix: the premise half-holds, and the half that fails is systematic, not noise.** Across
the 20 regular hues, relC transfer (mean 0.029, 52% within JND) is no better than absolute
chroma (0.027, 62%). Per step, absolute chroma wins for steps 1–8 (errors 0.001–0.026) and
relC wins for 9–12. Fitting a per-step blend C = w·relC·cusp(L,h) + (1−w)·absC by
minimizing transfer error gives w ≈ 0.0–0.05 for steps 1–7, 0.2 at step 8, 0.7 at 9–11
and 0.85 at 12 (Fig 3): **Radix tints its backgrounds and borders by a fixed perceptual
amount, and scales its solids and text relative to the shell.** For Tailwind the same fit
gives w ≈ 0.65–0.9 throughout (mostly relative). The blend lowers Tailwind's error to 0.011
(87% within JND) and Radix's to 0.021 (65%).

The residual Radix spread is design intent. Ranked by distance from the system's median
relC curve, the outliers are gold, bronze, brown (deliberately muted earth tones), then
lime, grass, green, jade, teal (Radix holds green tints at ~0.3 of the shell where blue
tints sit at 1.0). Radix's documented "bright" scales (sky, mint, lime, yellow, amber) are
*not* the relC outliers (mean distance 0.207 vs 0.249 for regular scales) — their
peculiarity is in L, not chroma (next section). Any single aggregate curve throws this away;
the per-hue-family curves in the data model are load-bearing for Radix and optional for
Tailwind.

**Between systems**: on the L-indexed view the Tailwind and Radix means differ by 0.24–0.43
relC at every L, which is 2–3× the pooled within-system SD (0.11–0.22). The two systems are
separable at every lightness. On step-indexed curves the silhouette is 0.28 for all hues and
only 0.07 for blue/yellow/green alone — the three focus hues are among the most dissimilar
within each system, and Radix's internal spread drags the score down. The separation claim
holds; the tightness claim holds for Tailwind and needs the blend for Radix.

**Recommendation: proceed, with one amendment to a settled decision.** The transferable
chroma quantity should be a per-step blend of relative and absolute chroma with the weight
w(n) extracted from the reference, not relative chroma alone. Relative-only is the w = 1
special case and is what Tailwind's data asks for; Radix's data asks for w ≈ 0 in the
background steps. This is Ottosson's C₀/C_max intuition from OkHSL made empirical and
per-system, without inheriting OkHSL's fixed curve or its sRGB-only clamp (OkHSL saturation
failed on Tailwind's out-of-sRGB steps: mean error 0.050 with 0.10–0.15 spikes at 500–700).

## Why raw relC misleads at the ends, and why the transfer metric doesn't

relC = C / cusp(L, h). Near white the cusp for blue is 0.003 and for yellow 0.03. Radix
blue-1 (C 0.003) and green-1 (C 0.004) are both "barely tinted white", 0.005 ΔEOK apart,
yet their relC are 1.00 and 0.47. A JND-sized difference in C becomes a 100% difference in
relC. The LUT alone contributes up to ±0.02 relC uncertainty at these steps (0.0037 chroma
error on a 0.15 cusp). This is why the raw per-step CV of relC in Radix steps 1–5 is
0.4–0.5 and means nothing, and why the transfer metric is the right test: transferring
blue-1's relC = 1.0 to green gives C = 0.0085 vs actual 0.004, a 0.0045 miss, invisible.
Phase 2 must nonetheless regularize the transfer where cusp_ref is small relative to
cusp_target, otherwise a JND of reference noise is amplified by cusp_target/cusp_ref (10×
blue→yellow at L 0.99). The w(n) blend does this naturally: where w → 0 the transfer is
absolute and the amplification disappears.

The one place relC fails for Tailwind is the dark end of blue. sRGB's blue primary is dark
(L 0.45), so the shell at L 0.28 admits C ≈ 0.19; Tailwind's blue-950 is a navy at 0.09
(relC 0.48) while yellow-950 uses 0.066 of a 0.072 shell (relC 0.92). Across the three
focus hues absolute chroma transfers better than relC from step 900 down. Across all 17
hues relC still wins there (0.016 vs 0.036) because only blue/indigo/violet have fat dark
shells. Per-hue-family curves handle this; the aggregate should carry the variance.

## Lightness: PCHIP's monotonicity precondition fails for Radix bright scales

Tailwind: L strictly decreasing for all 17 families. Radix: **not monotone for 6 of 25**.
Sky, mint, lime, yellow and amber rise from step 8 to step 9 (yellow: 0.766 → 0.918); these
are the documented "bright" scales whose step 9 solid takes dark text. Iris has a
rounding-level inversion at 10→11 (0.509 → 0.511). Radix's numbering is by *role*, not
lightness, and steps 9–10 of the bright scales are a detached solid/hover pair sitting
outside the lightness spine. The extractor should model this explicitly: a monotone spine
(steps 1–8, 11, 12 for bright scales) fit with PCHIP, plus `detached` steps carrying their
role and their own (L, relC, Δh), rather than forcing monotonicity or silently sorting.
"Fit L with monotone PCHIP" stays correct for the spine.

## Hue drift is large, non-monotone, and hue-specific

Δh from the anchor step (Tailwind 500, Radix 9), degrees:

| | 50/1 → anchor → 950/12 | total range | direction changes |
|---|---|---|---|
| Tailwind blue | −5 … −8 (at 300) … 0 … +8 | 16° | 4 |
| Tailwind yellow | +16 … +17 (at 100) … 0 … −32 | 49° | 1 |
| Tailwind green | +6 … +7 … 0 … +3 | 8° | 2 |
| Radix blue | −4 … −17 (at 4) … −9 … 0 … +7 | 24° | 5 |
| Radix yellow | +6 … −11 (at 8) … 0 … −24 (at 11) … −14 | 30° | 5 |
| Radix green | 0 … −3 … 0 … +7 | 9° | 3 |

Tailwind's yellow drifts 49° toward orange as it darkens (hue 102° at 50, 54° at 950) —
an order of magnitude beyond a 5° correction and the reason the yellow ramp reads as
yellow→amber→brown rather than as dark mustard. Radix's blue tints swing 17° toward cyan at
step 4 and return by step 9; blue shades in both systems go the other way, toward violet
(+7–8°). A linear ±5° term has the wrong magnitude for blue and yellow and cannot represent
Radix's cyan excursion. Catmull-Rom (or a small basis) through the measured Δh(n) is the
right fit; the curves are smooth enough for it.

## Hue-family centroids: published statistics reproduced exactly; yellow's σ is mostly drift

Using the dataset's own method (1–2 middle steps by index, pooled over palettes, population
SD), culori reproduces the published numbers to the digit: blue 257.7° ± 6.49, green 149.9°
± 4.35, yellow 81.1° ± 12.10, cyan 216.4° ± 14.70 (n = 11, 11, 11, 9). Measured instead one
value per palette at each ramp's peak-chroma step with circular statistics: blue 256.7° ±
5.0, green 150.7° ± 5.1, **yellow 93.0° ± 5.9**, cyan 213.1° ± 17.3. Yellow's published
looseness halves because the "middle step" of a yellow ramp lands at a different point of
the ~50° within-ramp drift for each system, depending on step count and L span. Systems
agree on what yellow *is* (at peak chroma) about as well as they agree on blue; they
disagree on how far to push its shades toward orange. Cyan is loose either way (it spans
180–250°: Open Color's cyan is nearly teal, Carbon's is nearly blue).

Nearest-centroid classification of the six anchors against the published centroids, with
z = |Δh|/σ as the confidence figure: Tailwind blue → blue (z 0.32), yellow → yellow (0.41),
green → green (0.08); Radix blue → blue (0.91), yellow → yellow (1.64; lime is next at
4.64 — Radix yellow-9 #FFE629 is a greenish yellow), green → green (1.78; teal next at
1.61 — a near tie, which the σ makes visible). The classifier should use the peak-chroma
centroids and report both σ's.

## Step numbering: nominal in both, with one targeted step in Radix

Tailwind 500 vs white ranges 1.93:1 (yellow) to 4.55:1 (indigo); 700 vs white ranges
4.94–8.07, so **700 is the lowest Tailwind step that meets 4.5:1 on white across all 17
hues** — a computed fact of the DNA, not a declaration. Radix 9 vs 1 ranges 1.24 (yellow)
to 5.28 (iris). Radix 11 vs 1 ranges 4.41–6.04 with 22 of 25 above 4.5 (orange 4.41,
yellow 4.48, teal 4.49 miss); vs step 3 it is 3.99–5.51. Step 11 is *targeted* at 4.5:1
but not guaranteed. Both systems are `nominal`; the DNA should additionally record per-step
contrast invariance (SD across hues) so that a targeted step can be documented as such
without being promised.

## Radix dark is not a reflection of Radix light — in any of three domains

Dark step 1 sits at L 0.18–0.19 (not 1 − 0.99), dark step 12 at 0.90–0.94 (not 1 − 0.32):
the dark scale is compressed toward the middle. RMS(L_dark − (1 − L_light)) is 0.25–0.45.
Nor is WCAG contrast against the mode's own background preserved (blue 9: 3.20 light vs
5.62 dark; steps 3–8 are all pushed further from the background in dark mode) nor APCA.
Solving each dark step's L so that a chosen quantity matches the light step's value against
its own background, with chroma and hue held at Radix's actual dark values (Fig 5): RMS ΔL
0.26–0.45 for the lightness mirror, 0.10–0.31 for the WCAG mirror, **0.08–0.23 for the APCA
mirror**. The contrast-domain mirror is the right idea and APCA does it better than WCAG,
which bears on decision #2 — but it is still off by up to 0.13 L at individual steps, and
APCA clamps to zero below Lc ≈ 7, so steps 1–4 are not invertible in APCA at all (the solver
returned the background). Chroma: dark/light absolute ratio over steps 3–11 is 1.67 for
blue, 1.25 for green, 0.76 for yellow; in relC, dark backgrounds use *more* of the shell
than light ones (green 0.8 vs 0.3). The "dark-mode chroma compression factor" is
hue-dependent, per-step, and often > 1.

Phase 3 default, set by the data: when the reference ships a dark scale (Radix), extract it
as its own DNA and transfer it directly. The APCA-contrast mirror with a per-step chroma
factor is the generative fallback for references without one (Tailwind), with WCAG or ΔL
driving the near-background steps where APCA is not invertible.

## Radix P3 siblings are pinned to the same color, with targeted expansion

Per step, ΔEOK between Radix's sRGB value and its P3 value is < 0.004 for every step of
blue, yellow and green **except step 11 in all three (0.021–0.027) and yellow step 9
(0.027)**. Steps reported "outside sRGB" at ΔEOK 0.0006–0.0035 are rounding of a
boundary-sitting hex to three P3 decimals. Radix does not pin relC across gamuts (relC_p3
of the P3 values runs 0.6–1.0 while relC_srgb of the sRGB values runs 0.9–1.0): it pins the
color, and spends P3 headroom only on low-contrast text and on the one solid that sRGB
visibly clips. Blue-9 #0090FF is at the sRGB shell (relC 1.01) and Radix left it identical
in P3. This is the hybrid recommended for decision #3, and it is even more conservative
than "expand wherever sRGB clips": expansion is per-role, opt-in, and the brand solid is
held fixed.

## Consequences for the plan

1. **Data model.** Per step: L, absC, relC per gamut, Δh, contrast (WCAG 2.1 and APCA vs
   step-0, step-max, white, black), and a per-system blend weight w(n) fit by transfer
   error. Per ramp: `spine` (monotone step indices) and `detached` steps with roles;
   `nativeShell` (Tailwind: sRGB, overshoot ~1.05; Radix: sRGB). Per system: per-family
   curves (required for Radix), aggregate with variance, per-step contrast invariance, and
   `numbering: nominal | contrast-bearing` plus targeted steps. Dark mode as its own DNA
   when present.
2. **Solver.** Transfer chroma with w(n); pick the reference family nearest the target hue
   (nearest-centroid on peak-chroma hue) before falling back to the aggregate; regularize
   where cusp_ref ≪ cusp_target. Tailwind DNA generated in P3 lands ~5% outside sRGB in
   the middle steps by design, so the sRGB sibling of those steps is necessarily
   gamut-mapped — the CSS mapping method matters there, and the ΔEOK report is not optional.
3. **Curves.** PCHIP on the spine only; Catmull-Rom for relC, absC and Δh with the
   measured non-monotone paths.
4. **Decision #2** gains evidence: APCA-mirror is the best dark-mode predictor; APCA is
   non-invertible near the background.
5. **Decision #3** is settled by Radix's own practice: pin absolute, expand per role.

Nothing in Phase 0 disconfirms the project. One settled decision (relative chroma as *the*
transferable quantity) needs to become a blend with an extracted weight, one (monotone
PCHIP for L) needs a detached-step mechanism, and the yellow hue statistic in the brief
conflates cross-system disagreement with within-ramp drift.
