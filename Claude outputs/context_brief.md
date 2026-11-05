# Context brief: the two color tools before community release

Inputs reviewed on 4 November 2026:

- `color-ramp.html` (page title "Ramp from one color", 1,632 lines)
- `color-intelligence.html` (page title "Palette topology", 2,387 lines)
- The `color/` package in the same repository (`palette-dna`, TypeScript, phases 0–7, 233 tests)
- The earlier EGM reviews in `reviews/color-ramp/` and `reviews/color-intelligence/`, and their implementation-progress notes

The earlier reviews covered correctness, input validation, accessibility and honest wording. Most of those repairs are already in the files. This brief does not repeat them. It covers what those reviews did not: positioning, naming, the explainer gap, and whether the tools deliver the stated purpose.

## Stated purpose (author)

Color is complex. Perceptually uniform models made palette generation easier, but the most popular palettes were hand-chosen. The tool extracts the shape ("DNA") of a popular or uploaded palette and interpolates the gaps, so a designer can (a) build from an existing palette faster, or (b) enter a brand seed color and find the most harmonious hues for it.

## Findings, weakest points first

### 1. The headline promise is not measured for what users receive

The hold-out test (hide a real ramp, rebuild it from its neighbors) measures the reference surface: median error 0.84–1.94 ΔE OK ×100 across hue gaps of 25°–131°, where 2 is about one just-noticeable difference. That is a strong, publishable number.

But both tools generate a seed-anchored ramp (`genAnchors`), which changes lightness and chroma around the user's color. The ramp page now says, correctly, that "reference-surface hold-outs do not establish an accuracy estimate for this anchored ramp." So the one claim a designer cares about, "the ramp I get is as good as the designers would have made", has no number behind it.

A direct test is cheap with the existing engine: hide a real ramp, feed its own key step (for example Tailwind 500) as the seed, generate with the remaining ramps, and compare every step with the shipped ramp. That measures the exact user journey. Without it, an About section can only describe a method, not a benefit.

### 2. "Find the most harmonious hues" is not in either shipped tool

Neither page proposes sibling hues for a brand color. The ramp page turns one or two colors into one ramp. The topology page maps seeds onto one ramp and finds the nearest real palette color.

The capability exists in the unshipped library: `deriveSemanticHues` places danger, warning, success and info inside measured hue windows, maximizing separation under normal vision and three color-vision deficiencies. That defines "distinguishable", not "harmonious". The design community will ask what harmonious means here. The document needs to define it as a measurable property or drop the word.

### 3. There are three engines, and the better-tested one is not shipped

| Engine | Where | Method | Tests |
|---|---|---|---|
| Topology engine | embedded in `color-intelligence.html` | Lofts ramps into a surface in Oklab and interpolates between neighboring ramps around the hue circle | `tests/color-intelligence.test.cjs` |
| Same engine, second copy | embedded in `color-ramp.html` ("Uses Engine (src/engine.js) unchanged"; no `src/engine.js` exists in the repo) | Same | `tests/color-ramp.test.cjs` |
| `palette-dna` | `color/src/` | Per-family curves (lightness spine, relative chroma, hue drift) transferred from the nearest two reference hues; dark mode, tokens, audit, semantic hues | 233 vitest + fast-check tests, fuzzing |

The two approaches answer the same question differently and ship different palette sets (the HTML tools include Flexoki and Kendo Meridian; the library includes Spectrum, Open Props and Web Awesome but not Flexoki). "Better tools" depends on deciding which engine is canonical. Building explainers before that decision risks documenting the wrong method.

### 4. The library's default contradicts the stated thesis

The thesis is that hand-chosen palettes carry something generated ones lack. The topology engine respects that: generated ramps keep the reference's own step lightness. `palette-dna` defaults to `spacing: 'auto'`, which respaces steps evenly by ΔE OK in most systems. That discards the hand-chosen spacing, which is part of the "magic" the thesis wants to keep. One of the two needs to change, or the document must explain why even spacing is the better default.

### 5. Smoothing removes some of the hand-chosen character

The library's own Phase 0 report shows Radix's outliers (gold, bronze, brown, and its green tints) are deliberate design intent. The topology engine drops ramps whose hues cross their neighbors ("interior" ramps) before building the surface, and interpolates smoothly between the rest. A generated ramp inherits the systematic shape of a palette, not its deliberate exceptions. That is fine, but the About copy must say "inherits the shape", not "captures the magic".

### 6. Parts of the "hand-chosen" claim will not survive expert readers

- Material 3 in the list is labeled "(generated)": it comes from HCT tonal palettes, not hand selection.
- GitHub Primer's scales were built with GitHub's Prism tool (designers adjust curves, then tune), so "hand-chosen" overstates it.
- Kendo Meridian's chart colors are CSS relative-color offsets, not stored ramps.
- Flexoki and Tailwind v3 are the strongest hand-chosen examples. Confirm how Flexoki 2.0's added steps were made before citing it.

These do not break the tool; they sharpen the pitch. A generated palette in the set is a useful control: "compare a hand-tuned palette with a generated one."

### 7. Naming is inconsistent, and "Palette DNA" is already taken in your own repo

The analyzer has four names: file `color-intelligence.html`, title "Palette topology", social title "Mapping the shape of a color palette", teaser image `ColorIntelligence-teaser.png`. The ramp page's footer says "Built on the Palette topology engine". The `color/` package is already named `palette-dna`, with a different engine.

On the specific questions:

- **"Topology" is the wrong word.** Topology studies properties that survive stretching. The tool measures geometry: positions, distances, curvature, chroma reach. Color scientists and mathematicians in the audience will notice.
- **"PaletteDNA" fits the purpose better** because it names inheritance and transfer, which is what the ramp tool does. Risks: "DNA" is a common branding metaphor, and it collides with the existing library unless the library and tools become one product. A web search found no color tool named PaletteDNA; "ColorDNA" exists as a Chrome extension and a Figma project.
- **"Color Ramp" is generic.** The page title, "Ramp from one color", describes it accurately but is not a name. If DNA is the family name, the ramp tool's job is inheritance: a new ramp that belongs in an existing family. The "In the family" panel already uses that idea.

Renaming has costs: URLs (`cewillis.com/color-ramp.html`, `color-intelligence.html`), social images, and the shared `pt.user` local-storage key that holds imported palettes.

### 8. The explainer gap is real and uneven

- The ramp page has a one-sentence lede and a technical "How it works" at the bottom (Oklab, surface, ΔE OK ×100). It has no "why", no "who it is for", no "when not to use it", and no comparison with the tools readers already know.
- The topology page has no h1 and no lede. A first-time visitor lands in a 3D Plotly view with interpolation-method radios (Linear, PCHIP, Akima, Cubic) and no statement of what the page is for.
- Readers will immediately compare with Radix's custom palette generator, Evil Martians' Harmony/Harmonizer, Adobe Leonardo, Material Theme Builder, uicolors.app and dittoTones. Real differentiators exist: any reference palette including an imported one; shape interpolated from neighboring hues rather than one template curve; explicit reporting of how the input changed; and a published hold-out measurement. None of these is stated on either page.

### 9. The two tools serve different audiences

The ramp page is a production tool for designers. The topology page is an instrument for people who want to study palettes. Sharing them as equals asks a designer to understand Akima splines before getting a ramp. Lead with the ramp; present the topology page as "see how it works".

### 10. Smaller release risks

- The topology page loads Plotly (about 3.5 MB) from a CDN; social traffic is mostly mobile.
- Kendo Meridian is a public Progress theme under Apache-2.0, so including it is fine.

## Addendum: a palette-dna UI already exists

The library already has a UI: **Palette DNA Explorer** (`color/app/main.ts`, `color/app/shell.html`). Running `npm run build:app` builds it to `color/out/app/index.html`, a single 1.3 MB file. The built copy is dated 22 September and matches the last library commit (21 September, Phase 7). Its controls are seed, reference (13 systems), spacing, lightness ruler, gamut, neutrals and derived semantic families. Below them is a full audit: tokens driving real components in light and dark, contrast matrices, color-vision checks and lint findings. There is also a fuzz tab. Screenshot: `color/out/app-explore.png`.

So the gap is not a UI. The gap is a **head-to-head comparison**, and two side-by-side UIs will not settle it:

- **Different questions.** The explorer audits a complete token system in two modes. The topology tools generate one ramp and show where it sits in a palette. Comparing them by eye compares two presentations, not two engines.
- **Different palette sets.** Nine systems overlap: Tailwind v3, Tailwind v4, Radix light, Primer, Carbon, Polaris, Atlassian, Open Color and Material. Flexoki and Meridian are only in the topology tools. Spectrum, Open Props, Web Awesome and Radix dark are only in the library.
- **Different defaults.** The library respaces steps evenly by default and uses Tailwind v4 as its reference. The topology tools keep the reference's own spacing and default to Flexoki. A fair comparison sets both engines to the same reference, keeps the reference's own spacing and uses the same gamut.

A comparison that settles the engine question needs three parts, all small:

1. **One measured test run on both engines.** Use the seeded hold-out from finding 1: hide a real ramp, seed with its own key step, generate with each engine and score every step against the shipped ramp. Run it on the nine shared systems. This produces a table, not an impression.
2. **A side-by-side view for the cases where the numbers disagree.** Show the same seed and reference, one ramp per engine, the shipped ramp underneath, and the error for each step. This is a research page, not a product page.
3. **The cost of each engine's defaults.** Run the same test with the library's even spacing turned on, to measure what that default costs against the hand-chosen spacing (finding 4).

This turns "which engine is canonical" from an open question into a decision with evidence. Names, explainers and claims should wait for that result, so it becomes the first item in the plan.

## Comparison results (4 November 2026)

Harness, data and page: `reviews/color-tools/engine-comparison/` (reproduce in about 10 seconds; see its README). Both engines got the same palette data, the copy embedded in `color-ramp.html`. That covers 125 lofted ramps across 10 palettes; Kendo Meridian is reported separately because it has five chart steps per hue, not a ramp. Each test removed a ramp, seeded with its most colorful step, rebuilt it from the remaining ramps, and scored every other step against the shipped one (ΔE OK ×100; 2 ≈ 1 JND).

| Engine | Median | 90th pct | Under 1 JND | Seed on a different step |
|---|---|---|---|---|
| Topology (Through color) | 1.26 | 4.05 | 68% | 22% |
| palette-dna, `spacing: 'reference'` | 1.45 | 5.00 | 61% | 30% |
| palette-dna default (`'auto'`) | 2.40 | 12.53 | 43% | 45% |
| Baseline: nearest ramp rotated to the seed hue | 1.72 | 4.76 | 56% | n/a |

What changes in the brief:

1. **Engine choice.** The topology engine is the better ramp generator for this purpose: closer in 49 ramps, worse in 18, about equal in 58. Its lead is small at the median (0.2) and clearer in the worst steps. Keep it as the generator. Treat palette-dna as the source of features the topology tools lack (dark mode, tokens, audit, semantic hues, seed-step pinning), not as a replacement engine.
2. **Smart interpolation versus a simple copy.** Rotating the nearest ramp is only 0.46 behind at the median. The About copy must not overstate the interpolation. The defensible benefit: about two-thirds of generated steps fall within one JND of what the palette's designers shipped, and the worst steps are better than copying a neighbor.
3. **The biggest error source is the step number, not the color.** Both engines reproduce the seed exactly. But in 22% (topology) and 30% (palette-dna) of cases they put it on a different step from the designers'. Those ramps score more than twice as badly: median 2.92 against 1.26 for topology. Letting the user choose "this is my 500" (palette-dna's `seedStep` already does this) is probably the highest-value change to the ramp tool.
4. **Even spacing works against the thesis.** palette-dna's default raises the median from 1.45 to 2.40, and Radix from 1.05 to 13.2. If the pitch is "keep what designers chose", even spacing cannot be the default anywhere in these tools.
5. **Support for the thesis, with a caveat.** Material 3, which is generated, is by far the easiest to predict (0.34). Flexoki and Atlassian, which are hand-tuned, are the hardest. Radix is hand-tuned yet easy to predict, so treat this as consistent with the thesis, not proof of it.
6. **Radix amber shows the "magic" concretely.** Radix's bright amber steps 9–10 are a deliberate exception. Topology lands within 3–5 on those steps; palette-dna misses by up to 23. Exceptions like this are the hand-chosen character, and the About page can show one.

## Proposed scope for the design document

Title: **Palette DNA tools: positioning, naming, explainers and a validated ramp promise.**

0. ~~Compare the two engines head to head.~~ Done; see "Comparison results". Outcome: keep the topology engine as the generator, take palette-dna's seed-step pinning, and reject even spacing as a default.
1. Define the product: one family name, one job per tool, one audience per tool.
2. Measure the anchored result (seeded hold-out) so the About copy can state a benefit with a number.
3. Write the About, benefit and comparison explainers from that evidence.
4. Decide naming and the URL, social-image and storage migration.
5. Decide which engine is canonical, and whether brand-to-sibling-hue generation (`deriveSemanticHues`) ships in this release or later.

Out of scope: new interpolation algorithms, a visual redesign, and further work on correctness and accessibility already covered by the earlier reviews.

## Sources

- [Radix Colors: custom palettes](https://www.radix-ui.com/colors/docs/overview/custom-palettes)
- [Evil Martians: Exploring the OKLCH ecosystem and its tools](https://evilmartians.com/chronicles/exploring-the-oklch-ecosystem-and-its-tools)
- [@evilmartians/harmony](https://www.npmjs.com/package/@evilmartians/harmony)
- [GitHub blog: Accelerating GitHub theme creation with color tooling (Prism)](https://github.blog/2022-06-14-accelerating-github-theme-creation-with-color-tooling/)
- [ColorDNA Chrome extension](https://chromewebstore.google.com/detail/cmgminagjhpjopnehnchfcebepoiomml)
