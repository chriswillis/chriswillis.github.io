# Lightness, chroma and hue-drift curves for all 13 systems

Extends the Phase 0 extraction to every palette in the Color.js dataset (Open Color, Open
Props, Tailwind CSS, Tailwind CSS v4, Material Design, Adobe Spectrum, GitHub Primer, Shopify
Polaris, IBM Carbon, Atlassian Design System, Web Awesome) plus Radix Colors light and dark.
Same pipeline, same oracle checks. Chromatic families only (the dataset's own hue/neutral
classification). Every ramp is normalized to light → dark (Web Awesome's 95…5 numbering is
reversed; Radix dark is kept dark → light and its monotonicity is checked in that direction).
Δh is measured from each ramp's peak-chroma step so systems are comparable; the documented
key step (Tailwind/Material 500, Carbon 60, Primer 5, Radix 9) is recorded where one exists.

Files: `out/dna/<system>.json` (per-family, per-step extraction — the serialized DNA the
Phase 1 fitter will consume), `out/all-systems.json` (curves on a common n grid plus the
metrics below), `out/all-systems-report.txt`, figures `fig6a`, `fig6b`, `fig7`, `fig8`.
Reproduce: `npx tsx spike/all-systems.ts && python3 spike/plot_all.py`.

## Summary

| System | Hues | Steps | L monotone | absC ≤JND | relC ≤JND | hybrid ≤JND | w̄ | Numbering (σ log CR) | First step ≥4.5:1 ∀ hues | Δh range mean / max |
|---|---|---|---|---|---|---|---|---|---|---|
| Open Color | 12 | 10 (0–9) | yes | 47% | 62% | 80% | 0.60 mixed | nominal (0.22) | none | 15° / 43° (yellow) |
| Open Props | 16 | 13 (0–12) | yes | 35% | 59% | 68% | 0.71 relative | nominal (0.22) | 10 | 17° / 45° (choco) |
| Tailwind CSS | 17 | 11 (50–950) | yes | 42% | 80% | 89% | 0.81 relative | nominal (0.14) | 700 | 18° / 50° (amber) |
| Tailwind CSS v4 | 17 | 11 (50–950) | yes | 40% | 78% | 87% | 0.80 relative | nominal (0.15) | 700 | 18° / 50° (amber) |
| Material Design | 13 | 10 (50–900) | yes | 39% | 45% | 58% | 0.49 mixed | nominal (0.42) | none | 22° / 49° (yellow) |
| Adobe Spectrum | 13 | 14 (100–1400) | yes | 28% | 72% | 78% | 0.84 relative | contrast-bearing (0.00) | 900 | 13° / 38° (cyan) |
| GitHub Primer | 8 | 10 (0–9) | yes | 44% | 67% | 83% | 0.69 mixed | contrast-bearing (0.02) | 5 | 17° / 33° (yellow) |
| Shopify Polaris | 12 | 16 (1–16) | yes | 38% | 86% | 87% | 0.98 relative | contrast-bearing (0.04) | 12 | 14° / 35° (green) |
| IBM Carbon | 9 | 10 (10–100) | yes | 37% | 84% | 85% | 0.84 relative | contrast-bearing (0.01) | 60 | 13° / 22° (cyan) |
| Atlassian Design System | 9 | 12 (100–1000) | yes | 39% | 60% | 68% | 0.67 mixed | nominal (0.09) | 700 | 11° / 38° (orange) |
| Web Awesome | 9 | 11 (95–5) | yes | 45% | 69% | 80% | 0.64 mixed | contrast-bearing (0.00) | 50 | 13° / 40° (yellow) |
| Radix Colors (light) | 25 | 12 (1–12) | 6 exceptions | 56% | 53% | 61% | 0.37 mixed | nominal (0.12) | 11 | 19° / 46° (amber) |
| Radix Colors (dark) | 25 | 12 (1–12) | 5 exceptions | 50% | 49% | 64% | 0.50 mixed | nominal (0.14) | 11 (vs own step 1) | 18° / 45° (sky) |

"≤JND" is the share of cross-hue transfers (apply hue A's curve at hue B's L and h, all
ordered pairs, all steps) that land within ΔEOK 0.02 of the system's real color. w̄ is the mean
of the per-step blend weight w(n) that minimizes that error (1 = relative chroma vs the sRGB
cusp, 0 = absolute chroma). σ(log CR) is the SD across hues of log WCAG contrast vs white at
each interior step, averaged; below 0.05 the step number carries a contrast promise.

## What the dataset says

**Numbering is contrast-bearing, by measurement, in five systems.** Adobe Spectrum's band
in Fig 8 is a single line: at step 900 all 13 hues sit at 5.38–5.44:1 on white. Web Awesome
(whose numbers are lightness) is the same; Carbon 60 is 4.99–5.03, Primer 5 is 4.87–5.35,
Polaris 12 is 4.56–6.00 with the band widening toward the dark end. This recovers what those
systems say about themselves without reading their docs — the "derive, don't declare" rule
works. Everything else is nominal: Atlassian is closest (0.09), Radix 0.12–0.14, Tailwind
0.14–0.15, Open Color and Open Props 0.22, Material 0.42 (at Material 500, contrast vs white
ranges roughly 1.6 to 7). For the docs a generated palette may truthfully claim a per-step
contrast only when its reference is in the first group.

**The lightness spine has three shapes.** Spectrum, Carbon, Primer and Web Awesome have a
nearly linear L(n) with almost no spread across hues (they are indexed by lightness or
contrast, so every hue shares one L curve). Tailwind, Open Color and Open Props are
S-shaped with a wide band because yellow is held light (Open Color's yellow ends at L 0.68,
which is why Open Color and Material have no step that clears 4.5:1 on white for every hue).
Radix is convex — eight of twelve steps above L 0.7 — with the bright-scale solids sitting
off the spine. PCHIP on the spine with detached role steps handles all three.

**Chroma philosophy, read off w(n) (Fig 7).** Polaris is pure relative chroma, w̄ 0.98, and
transfers best of any system (86% within JND on relC alone). Spectrum, Carbon and Tailwind
are relative throughout (0.80–0.84). Material and Radix light are absolute in the tints and
relative in the shades (Material w = 0 for 50–200 rising to 0.95 at 900; Radix ≈ 0.1 for
1–7, 0.7–0.9 for 9–12). Open Color, Web Awesome, Primer and Atlassian dip toward absolute in
the light third and are relative elsewhere. Relative chroma beats absolute in 11 of 13
systems; in Radix they tie. The blend beats both in every system (it equals relative where
w ≈ 1). The amended premise from Phase 0 — transfer a per-step blend with the weight
extracted from the reference — holds across the whole dataset.

**Kinship is a property of the system, and it varies a lot.** With the blend, Tailwind
(87–89%), Polaris (87%), Carbon (85%) and Primer (83%) transfer within a JND most of the
time; Open Color and Web Awesome 80%, Spectrum 78%, Open Props and Atlassian 68%, Radix
61–64%, Material 58%. Material's hues were picked by hand in 2014 and share little
structure; a Material-DNA palette will carry the widest variance, and the generator should
say so. For Radix and Material the per-family curves are load-bearing; for Polaris, Carbon
and Spectrum the aggregate alone would nearly suffice.

**Hue drift is universal and largest in the yellows.** Mean per-family Δh range is 11–22°
in every system; the largest family range is 33–50° and it is yellow, amber, orange or
brown in nine of thirteen systems (Spectrum and Carbon: cyan; Polaris: green). Carbon holds
hue tightest (max 22°). A ±5° linear correction is an order of magnitude short everywhere.

**Only Tailwind v4 leaves sRGB** (50% of its steps). Every other system is sRGB-authored;
with the tolerant gamut test all of them read 0% outside sRGB.

## Consequences for Phase 1

The serialized DNA per system needs, beyond what Phase 0 specified: `w(n)` per step,
`numbering` as a measured classification with its σ(log CR) value, the lightness-spine shape
class (or simply the PCHIP), the per-step contrast band (min–max across hues vs white and vs
the ramp's own step 0), and a `kinship` figure (hybrid within-JND share) that the generator
surfaces as the expected fidelity of a transferred palette. Δh should be stored against the
peak-chroma step with the documented key step as metadata, so systems remain comparable.
