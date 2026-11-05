# Palette DNA tools: a measured ramp claim, one set of names, and explainers

*   **Author:** Chris Willis
*   **Status:** Proposed (revised after EGM review, 2026-11-05)
*   **Date:** 2026-11-04
*   **Review record:** `docs/designs/palette-dna-tools-review/` (five stage reports). The section "Review resolution" at the end lists what changed and why.

--------------------------------------------------------------------------------

## Overview

cewillis.com has two color pages:

*   `color-ramp.html` ("Ramp from one color") turns a brand color into a full ramp shaped like a reference palette. This document calls it **the ramp page**.
*   `color-intelligence.html` ("Palette topology") shows a palette's ramps as a surface in Oklab, so people can study the palette. This document calls it **the map page**.

The two pages run the same engine, but each page holds its own copy of it.

This document uses two similar names, and they mean different things:

*   **Palette DNA** is the new family name for the two pages and their engine. The engine was called the "topology engine" until now.
*   **The palette-dna library** is the TypeScript package in `color/`. It uses a different generator, and it also offers dark mode, tokens, an audit and semantic hues. The site does not use it, and nothing in this release reads it. Later releases may adopt some of its features.

This design prepares the next release of the two pages for sharing with the design community. It does six things:

1.  States one claim about the generated ramp, measured and reproducible (G1).
2.  Lets people choose which step their color becomes. Wrong step placement is the largest measured source of error (G2).
3.  Gives the tools one consistent set of names and new URLs (G3).
4.  Adds explanations to the ramp page and a short version to the map page (G4).
5.  Describes each palette's origin only where the origin is documented (G5).
6.  Replaces the two engine copies with one shared file (G6). Change 2 modifies the engine, so this has to happen first.

The ramp page also switches its default palette to Tailwind v4 (D3).

The engine decision comes from measurement. The Palette DNA engine stays as the generator. It was compared with the palette-dna library on 2026-11-04; the evidence is in `reviews/color-tools/engine-comparison/`, which is linked on GitHub.

## Terms and measurement

These terms apply throughout the document.

*   **Error.** The difference between two colors, measured as straight-line distance in Oklab multiplied by 100 (ΔE OK ×100). About 2 on this scale is one **just-noticeable difference (JND)**, the smallest difference most people can see. "Within one JND" means an error below 2, after rounding to two decimals.
*   **Surface hold-out.** The existing test on the map page. It hides one of a palette's ramps and rebuilds it from the neighboring ramps at full saturation. It describes the palette. It is not an accuracy figure for the ramp a person exports.
*   **Seeded hold-out.** The test behind this release's claim.
    *   For each palette, take each ramp the engine builds its surface from, hide it, and take its most colorful step as the **seed**.
    *   Generate a ramp from that seed and the palette's remaining ramps, the same way the ramp page does by default (Through color mode).
    *   Score every step except the seed step against the ramp the designers shipped.
    *   The **baseline** instead copies the nearest remaining ramp, rotated to the seed's hue and scaled to its chroma. It is told the designers' seed step. That favors the baseline, so the comparison is conservative.
*   **Headline set.** The palettes the published claim covers. It includes every built-in palette except Material 3, which is generated from a formula, and Kendo Meridian, which is chart colors rather than ramps. That leaves 113 ramps in 9 palettes.
*   **Median.** The middle error across every scored step. The quantile rule is `sorted[min(n−1, floor(p·n))]`.
*   **Seed moved.** The step whose generated color is nearest the seed differs from the step the designers used.

**Results for the headline set** (seeded hold-out, 2026-11-04):

| Run | Median | 90th percentile | Within one JND | Seed moved |
|---|---|---|---|---|
| Palette DNA engine, automatic placement | 1.33 | 4.10 | 67% | 24% |
| Baseline (copy the nearest ramp) | 1.79 | 4.71 | 54% | — |

When the seed lands on the designers' step, the median step error is **1.16**. When the engine moves it, the median is **2.46**.

## The Problem

Designers rarely start from nothing. They start from a brand color, or from a palette they already trust and need to extend. Two kinds of tools serve them today:

*   **Formula generators** (Material's HCT tonal palettes, Adobe Leonardo, Evil Martians' Harmony) apply the same rule at every hue. Their ramps are consistent, but they lose the per-hue decisions in palettes that designers author.
*   **Template generators** copy one palette's shape: Radix's custom palette generator, and Tailwind-style generators such as uicolors.app. You get that one shape, and they do not say where your color landed.

The measurement supports the premise that designer-authored palettes carry decisions a formula does not. Material 3, which is generated from a formula, is by far the easiest palette to rebuild: median 0.34. Flexoki (2.27) and Atlassian (1.75) are the hardest. Radix, also designer-authored, is easy (0.82). So the result is consistent with the premise, not proof of it.

The two pages already do something neither kind of tool does. They borrow the shape of any palette, including one you import, interpolate between that palette's neighboring hues, and report how your color was treated. Five problems keep that from landing with an expert audience:

1.  **The claim is not measured where it matters.**
    *   The pages report only the surface hold-out, and the ramp page itself says that test "does not establish an accuracy estimate" for the ramp people export.
    *   The seeded hold-out now gives that estimate: 67% of generated steps are within one JND of the shipped ramp, against 54% for copying the nearest ramp.
    *   Neither number appears on either page.
2.  **People cannot control the largest error.**
    *   The engine keeps the seed color exactly. In 24% of cases, though, it places the seed on a different step from the designers'.
    *   Every other step then shifts, and the median error rises from 1.16 to 2.46.
    *   There is no way to say "this is my 500".
3.  **The names are inconsistent and partly inaccurate.**
    *   The map page has four names: `color-intelligence.html`, "Palette topology", "Mapping the shape of a color palette" and `ColorIntelligence-teaser.png`. "Topology" is the wrong word, because the page measures geometry: positions, distances and reach.
    *   "Ramp from one color" describes the ramp page but is not a name.
4.  **Neither page explains itself.**
    *   The map page has no heading and no lede.
    *   The ramp page has a one-sentence lede and a technical "How it works" at the bottom.
    *   Neither says who the tool is for, why borrowing a palette's shape helps, how it differs from the tools readers already use, or when not to use it.
5.  **The current pitch overreaches.**
    *   "Find the most harmonious hues" describes a feature neither page has, and the home page, lab page and feed all say colors "harmoniously fit the family".
    *   Primer was built with GitHub's Prism tool, and Material 3 is generated.
    *   Flexoki's author says its colors are "derived from" Oklab and "calibrated". He does not say they were tuned by hand, and does not say how the 2.0 steps (50–950) were made ([stephango.com/flexoki](https://stephango.com/flexoki)).
    *   Calling any of these "hand-tuned" would not hold up.

A sixth problem is internal. The engine (719 lines), importer (156 lines) and palette data exist as identical copies in both pages, so every engine change has to be made twice.

## Goals

*   **G1. One measured claim for the generated ramp, checked before every release.**
    *   The ramp page states the seeded hold-out result in plain language, leading with the share of steps within one JND (D4). The baseline figure follows in the same paragraph, with a link to the evidence page.
    *   `node scripts/palette-dna-evidence.cjs --check` reruns the test and fails if any published number differs from the fresh result.
*   **G2. People choose which step their color becomes.**
    *   The ramp page adds an optional step menu, and automatic placement stays the default (D5).
    *   G2 is met when unit tests show the chosen step is applied, and conflicts are rejected with an explanation.
    *   The evidence page reports the pinned run's median as information, not as a pass/fail bar. As a sanity check, it must not be worse than the automatic run's median.
*   **G3. One set of names, used everywhere.**
    *   One family name (D1) and one name per tool, used the same way in each page's title, heading, URL, social metadata and image, navigation, footer, home and lab cards, sitemap and feed.
    *   Every current URL keeps working, including the state saved in the URL hash.
    *   Local-storage keys are unchanged, so imported palettes carry over.
*   **G4. The ramp page explains itself; the map page points to that explanation.**
    *   The ramp page answers five questions:
        1.  What does it do?
        2.  Who is it for?
        3.  Why borrow a palette's shape, with the evidence?
        4.  How does it differ from the Radix custom palette generator, Harmony, Leonardo, Material Theme Builder and Tailwind-style generators?
        5.  When should you not use it?
    *   The map page answers the first two, carries the same evidence paragraph, and links to the ramp page for the rest.
    *   Every number in either page comes from the evidence script.
*   **G5. Accurate claims about palettes.** A palette's origin is stated only where its authors document it:
    *   Material 3: generated.
    *   Primer: tool-assisted.
    *   Kendo Meridian: chart colors.

    No palette is described as hand-tuned in this release.
*   **G6. One copy of the engine.** Both pages and all tests load the engine, importer and palette data from three shared files.

## Non-Goals

*   **Replacing the Palette DNA engine with the palette-dna library.** The library measured worse on the headline set: median 1.59 against 1.33, 90th percentile 5.28 against 4.10, and the seed moved in 34% of cases against 24%.
*   **Even step spacing as a default.** In the library it raises the median from 1.59 to 2.74; Radix alone goes from 1.05 to 13.22. It discards the designers' own spacing, which is what the tool borrows.
*   **Porting the library's dark mode, tokens, audit or semantic hues.** See Future Improvements.
*   **New interpolation methods, or tuning the engine to improve the numbers.** The release reports what the engine does.
*   **A visual redesign.** Changes are limited to the new copy and one menu.
*   **Step pinning on the map page.** See Future Improvements.
*   **Correctness, validation and accessibility work beyond regressions.** The October reviews covered these, and the fixes are in.
*   **New reference palettes**, and changes to the map page's Plotly dependency.

## Decisions (resolved 2026-11-04 and 2026-11-05)

*   **D1. Family name: Palette DNA.**
    *   It names inheritance, which is what the ramp page does. A web search found no color tool with that name; "ColorDNA" exists as a [Chrome extension](https://chromewebstore.google.com/detail/cmgminagjhpjopnehnchfcebepoiomml).
    *   "Topology" is removed from every published file (`palette-dna/`, `assets/palette-dna/`, `index.html`, `lab/index.html`, `feed.xml`, `sitemap.xml`), including code comments and evidence keys.
    *   Internal documents may say "formerly the topology engine" once.
    *   The library keeps its package name, and published pages never mention it.
*   **D2. "Harmonious" is removed** from the pages, cards and feed. Suggesting sibling hues is future work and will need a measurable definition.
*   **D3. Tailwind v4 is the default palette in both pages.**
    *   It is familiar to this audience and predicts well (median 1.33).
    *   Flexoki stays in the list and appears in the explainer as a hard case.
*   **D4. The explainer leads with the share of steps within one JND (67%),** then gives the baseline (54%) in the same paragraph.
*   **D5. Automatic step placement stays the default.** It is right in 76% of cases. Pinning a step is optional and available on the ramp page only.
*   **D6. Old URLs redirect, and the review folders stop being published.** `reviews/`, `tests/` and `docs/` are excluded from GitHub Pages. Readers reach the method and the engine comparison through links to the public GitHub repository, `github.com/chriswillis/chriswillis.github.io`.

## Open Questions

*   **Q1. Tool names within the family.**
    *   This draft uses "Palette DNA Ramp" (`palette-dna/ramp.html`) and "Palette DNA Map" (`palette-dna/map.html`) as working names. Alternatives for the ramp page are "Inherit" and "Kin".
    *   **Criteria.** The name says what the tool does to a first-time visitor, reads well as a URL, and claims no more than the measurement supports.
    *   **Gate.** Q1 must be settled before Change 4 starts. Renaming after links are shared means another round of redirect pages, sitemap and feed edits, link updates on four pages, and new social images.
    *   Changes 1–3 do not depend on Q1.

## Critical User Journeys (CUJs)

### CUJ 1: A brand color becomes an exported ramp on the intended step (G2)

*   **Given**: A designer uses their brand color as "500" and wants a ramp shaped like Tailwind v4.
*   **When**: They enter the color, keep Tailwind v4, and choose step 500 in the step menu.
*   **Then**:
    *   The ramp shows their color exactly at 500.
    *   The verdict, the sentence under the ramp that explains the result, says the color is at the step they chose. If automatic placement would have used a different step, the verdict names that step too.
    *   The CSS, Tailwind and token exports match the displayed steps.

### CUJ 2: Extend an imported palette with a missing hue (G2, G6)

*   **Given**: A team has eight ramps in a tokens file and needs a teal they never designed.
*   **When**: They import the file on the ramp page and enter a teal color.
*   **Then**:
    *   The family panel, which shows the palette's ramps side by side, puts the new teal between their green and blue, with matching step lightness.
    *   The verdict says which step the teal landed on and how that step was chosen.
    *   If the team wants to study their palette, the map page's existing surface hold-out shows how evenly its hues are covered. That describes the palette, not the accuracy of the new ramp.

### CUJ 3: A skeptical expert checks the claim (G1, G5)

*   **Given**: A reader who knows color science sees the shared post and doubts "within one JND".
*   **When**: They read "Why borrow a palette's shape" on the ramp page and follow "How we measured".
*   **Then**: The evidence page shows:
    *   the method
    *   the headline-set rule
    *   the baseline, with a note that it is told the designers' step
    *   results per palette, and a ramp-by-ramp viewer
    *   a link to the GitHub repository and the single command that reproduces every number

### CUJ 4: A first-time designer arrives from a shared link (G3, G4)

*   **Given**: A designer opens the ramp page's URL from a social post on a phone.
*   **When**: They read the lede, try the example color, then scroll.
*   **Then**:
    *   The first screen says what the tool does and who it is for.
    *   The example produces a new ramp in Tailwind v4's family.
    *   The page then explains why borrowing a palette's shape helps, how the tool compares with tools they know, and when not to use it.
    *   An old `color-ramp.html` link they saved earlier lands on the same page, with its colors and palette intact.

## Technical Plan (Architecture)

The site is plain HTML on GitHub Pages. GitHub runs Jekyll only to apply the exclude list in `_config.yml`; there is no build step and no server. The plan keeps that model: no bundler, no framework, and nothing in a page depends on Node.

### Target structure

```text
   assets/palette-dna/palettes.js   (var PALETTES)  ─┐
   assets/palette-dna/engine.js     (var Engine)    ─┼──► palette-dna/ramp.html   (ramp page)
   assets/palette-dna/importer.js   (var Importer)  ─┘──► palette-dna/map.html    (map page)
         │  non-module scripts, loaded in this order with ?v=<release date>
         │
         ▼
   scripts/palette-dna-evidence.cjs   (plain Node, no dependencies; not published)
         │  loads palettes.js and engine.js, runs the seeded hold-out
         ├──► writes  palette-dna/evidence.html   (method, results, viewer; data embedded)
         └──► --check  rereads every data-evidence="…" number in ramp.html and map.html
                       and fails if one differs from the fresh run
```

The old paths, `color-ramp.html` and `color-intelligence.html`, become redirect pages in Change 4.

### 1. One shared engine (G6)

*   **The three blocks move out unchanged.** The engine, importer and palette data move out of both pages into three non-module scripts under `assets/palette-dna/`.
    *   `Engine` and `Importer` keep their global names.
    *   `palettes.js` assigns `var PALETTES = …`, and each controller reads `PALETTES.slice()` instead of parsing an inline JSON element.
    *   A script tag rather than `fetch` keeps start-up synchronous, so the tests can run without a browser.
*   **Script URLs carry a release date.** All three use the same release date, for example `?v=2026-11-15`.
    *   This stops a freshly loaded page from running against a cached old engine.
    *   It does not protect the other way round. A page cached before a release can fetch the new engine during GitHub Pages' roughly 10-minute cache window, because Pages ignores query strings. That risk is accepted (see Risks).
    *   The release checklist updates the date.
*   **Tests load the shared files directly.** Each test harness runs the three files in its `vm` context; there is no generic `<script src>` resolution. That keeps the map page's Plotly script out of the tests.
*   **Change 1 changes no behavior.** The proof is the existing tests plus the evidence script reproducing the numbers above.

### 2. Step pinning (G2, ramp page only)

**Engine rule.** `genAnchors(seeds, opts)` accepts an optional `step` on `seeds[0]` only: a step key string as it appears in `pal.steps`, such as `"500"`. With `n = pal.steps.length` and `k` the index of that key:

*   **Duplicate filter.** The existing near-duplicate filter, which keeps one seed per 0.012 of lightness, keeps the pinned seed and drops the other.
*   **Gray seeds.** If the pinned seed is gray (neutral), the pin has no effect and the reason is `"neutral"`.
*   **Capacity rule.** The pin is accepted if the number of other seeds lighter than it is at most `k`, and the number darker is at most `n − 1 − k`. Otherwise automatic placement is used, and the reason is `"order"`.
    *   Example: a pale seed pinned to 900 with one darker seed is accepted, and the darker seed goes to 950.
    *   Example: a pale seed pinned to 950 with one darker seed is rejected.
*   **Placing the other seeds.** Every other seed takes the nearest free step on its own side of `k`, using the existing nearest-by-lightness rule.
*   **Unchanged.** Lightness rescaling between anchor steps and chroma interpolation along the steps stay as they are. Fit mode works the same way, because it only limits chroma.
*   **Return value.** The returned array carries `pin = { requested, applied, auto, reason }`:
    *   `requested`: the step that was asked for.
    *   `applied`: the step actually used, or `null`.
    *   `auto`: the step automatic placement would have used.
    *   `reason`: `null`, `"order"` or `"neutral"`.

    Without a `step`, `pin` is absent and the output is identical to today's.

**Ramp page.**

*   **The menu.** A "Step for your color" menu offers "Automatic (closest in lightness)" plus the current palette's steps.
*   **Saved state.** The choice is stored as `st.s1` (a step key string, or `null`) in the versioned `#r2=` link state and in local storage. Links and saved state without it still load.
*   **Validity check.** At the start of every render, the page checks that `st.s1` is a step of the current palette.
    *   Every path that changes the palette ends in a render: choosing a palette, removing an imported palette, a change made in another tab, importing a palette, and loading a link or saved state. So one check covers all of them.
    *   If `st.s1` is invalid, it resets to Automatic and the next verdict shows one note saying so.
*   **Verdict wording.** The page uses "your color" and "your second color", not "Input 1" and "Input 2". The full wording is in Change 2.

### 3. Names, URLs and migration (G3, D6)

| Today | After Change 4 |
|---|---|
| `color-ramp.html`, "Ramp from one color" | `palette-dna/ramp.html`, "Palette DNA Ramp" (Q1 working name) |
| `color-intelligence.html`, "Palette topology" | `palette-dna/map.html`, "Palette DNA Map" (Q1 working name) |
| no evidence page | `palette-dna/evidence.html`, "How we measured" |

*   **Redirect pages.** GitHub Pages cannot send server redirects, so each old file becomes a small redirect page.
    *   It runs `location.replace(newPath + location.search + location.hash)`. The hash matters because the ramp page's saved state (`#r2=`) lives in it, and a `meta refresh` cannot carry it.
    *   It keeps the old social tags (`og:*`, `twitter:*`) so link previews of already-shared posts keep working. Preview tools do not run scripts.
    *   It has a canonical link, `noindex`, and a visible link for browsers without JavaScript.
*   **Local storage carries over.** Storage belongs to the domain, not the path, so imported palettes (`pt.user`) and saved state (`pt.state`, `rk.state`) survive the move.
*   **Everything that names the tools changes.** Exact strings are in Change 4: titles, headings, social text and images, cross-links, footer, the home and lab cards, sitemap and feed.
*   **Feed items keep their identity.** Each item's `<link>` moves to the new URL, and its `<guid>` stays the same so readers do not show it as new.

### 4. Explainers (G4, G5)

The ramp page gets four parts, using its existing styles (`h1`, `.lede`, `h2`, `.notes`):

1.  **A heading and a one-sentence lede** at the top.
2.  **"Why borrow a palette's shape"**, placed after the reference panels and before Export. Its numbers come from the evidence script.
3.  **"Compared with"**, a short table.
4.  **"When not to use it"**, a short list.

The existing "How it works" stays below, with its contradicting sentence replaced.

The map page gets a heading, a lede, the same "Why borrow a palette's shape" paragraph and a link to the ramp page. It does not get the comparison table or the limits list. It has no `.lede` or `.notes` styles today, so Change 3 copies those rules from the ramp page.

Each palette in `palettes.js` may carry `origin: { kind, url }`, where `kind` is `generated`, `tool-assisted` or `chart`. The field is named `origin` so it does not collide with the existing `source` field, which holds the data package. Where present, it is shown in the ramp page's `#palmeta` line and the map page's `#pinfo` block.

### 5. Evidence script and check (G1)

*   **The script.** `scripts/palette-dna-evidence.cjs` runs the seeded hold-out exactly as defined in Terms and measurement. It ports the generation logic from `reviews/color-tools/engine-comparison/run.mts` and the statistics from `build-page.py` in the same folder.
*   **Runs.** `auto`, `pinned` (from Change 2) and `nearest`. These key names keep engine names out of the published files.
*   **Output.** It writes `palette-dna/evidence.html` with the data embedded.
*   **The check.** With `--check`, it compares every `data-evidence="<path>"` element in the two tool pages with the fresh result.
    *   The page text is parsed as a number, with any `%` stripped.
    *   It is compared at the precision the page shows. A percentage is compared as a whole percent; any other number at the decimals shown.
    *   The check also fails if regenerating `evidence.html` would change it.
*   **Which pages it reads.** The page paths come from one constant at the top of the script: the old paths until Change 4, and the new paths after it.
*   **When it runs.** Before every release, as a step in the release checklist (`docs/palette-dna-release.md`).

### 6. Default palette (D3)

Both pages default to `tailwind4` wherever they currently fall back to `flexoki`:

*   the ramp page's initial state;
*   the ramp page's two fallbacks, after removing an imported palette and after a change in another tab;
*   the map page's two fallbacks.

Saved and linked state still take precedence. The ramp page's example color, `#9D58BA`, stays. On Tailwind v4 it falls between purple and fuchsia, so the first result a visitor sees is a newly generated ramp, not a copy of one of Tailwind's own.

### What is deliberately not changing

*   Interpolation methods, the way the surface is built, how a seed is mapped onto the surface, and Fit and Through modes.
*   The importer's formats and rules.
*   The visual design. The new sections reuse existing styles.
*   The palette-dna library.

## Risks & Mitigations

| Risk | Impact | Mitigation | Accepted residual |
|---|---|---|---|
| The pages can no longer be saved and used offline as single files | Low; few people save tool pages | None (see Alternative C) | Accepted |
| For about 10 minutes after a release, a page cached earlier can load the new engine | A page could break until reload | Each release keeps `engine.js` compatible with the previous controller | Accepted |
| A visitor pins a pale color to a dark step | The ramp's light steps squeeze together | The verdict names the step automatic placement would have used | Accepted; no threshold guard |
| The tools are renamed after links are shared | A second round of redirects and image updates | Q1 is a gate on Change 4 | Low |
| An expert disputes the claim | Credibility | Evidence page, baseline disclosure and a one-command reproduction | Accepted |
| The map page loads Plotly (about 3.5 MB) on mobile | Slow first load from social links | Lead with the ramp page in shared posts | Accepted; existed before this release |
| Review and design files are public on cewillis.com today | Internal critique is public | Change 1 excludes `reviews/`, `tests/`, `docs/` | None after Change 1 |
| A published number goes stale | A wrong claim | `--check` on every release | Low |

## Alternatives Considered

### Alternative A: Make the palette-dna library the generator for both pages

*   **Pros**: 233 tests and a fuzzer. It already supports step pinning (`seedStep`), dark mode, tokens, an audit and semantic hues.
*   **Cons**: On the headline set it measured worse:
    *   median 1.59 against 1.33
    *   90th percentile 5.28 against 4.10
    *   seed moved in 34% of cases against 24%
    *   on Radix amber's deliberately bright steps 9–10, errors of 21–23 against 3–5

    Its explorer bundle is 1.3 MB, against about 150 KB for the ramp page.
*   **Reason for Rejection**: The pages' claim is fidelity to a palette's own shape, and the Palette DNA engine is closer.

### Alternative B: Offer even step spacing, or make it the default

*   **Pros**: Steps come out more regular. The library measures spacing variation (coefficient of variation of the gaps between steps) falling from 0.36 to 0.03.
*   **Cons**: Steps move away from where designers put them. In the library, the median rises from 1.59 to 2.74, and Radix's from 1.05 to 13.22.
*   **Reason for Rejection**: It contradicts what the tool borrows. An opt-in toggle is not needed for this release.

### Alternative C: Keep the engine embedded in each page

*   **Pros**: Each page stays a single file that works offline. There is no cache mismatch.
*   **Cons**: Step pinning would be written twice, by hand, into identical 719-line blocks, and nothing stops the copies drifting apart.
*   **Reason for Rejection**: This release changes the engine. If shared files ever cause trouble, the fallback is two inline copies plus a test that they are identical.

### Alternative D: A build step that inlines one source into both pages

*   **Pros**: One source, and single-file pages.
*   **Cons**: It adds a build to a site that has none. Built pages must be committed, and forgetting to rebuild ships a stale engine.
*   **Reason for Rejection**: Shared scripts give one source with no build.

### Alternative E: Load palette data with `fetch`

*   **Pros**: Plain JSON.
*   **Cons**: Start-up becomes asynchronous, both controllers and both test harnesses need restructuring, and opening a page from disk stops working.
*   **Reason for Rejection**: Too much change for no visitor benefit.

### Alternative F: Keep the current file names and change only titles

*   **Pros**: No redirects.
*   **Cons**: Shared links would carry the old names (`color-intelligence`, `color-ramp`), and the evidence page would have no home next to the tools.
*   **Reason for Rejection**: Redirect pages are a few lines each and keep every old link working.

### Alternative G: A family landing page as the shared link

*   **Pros**: One place for the story.
*   **Cons**: One more page to maintain, and one more click before the tool.
*   **Reason for Rejection**: The ramp page leads and carries its own explanation.

### Alternative H: Pin the seed to the documented key step automatically, or always ask

*   **Pros**: Errors from misplaced seeds would disappear for palettes that document a key step: Tailwind 500, Radix 9, Carbon 60, Primer 5.
*   **Cons**: A brand color is not always a key step; a pale color forced to 500 would distort the ramp. Always asking adds a decision for everyone, when automatic placement is right 76% of the time.
*   **Reason for Rejection**: D5.

### Alternative I: Put the explanations on a separate About page

*   **Pros**: Uncluttered tool pages.
*   **Cons**: Visitors from a shared link land on the tool and rarely open another page.
*   **Reason for Rejection**: The explanation goes where the reader is.

### Alternative J: Keep citing the surface hold-out as the accuracy claim

*   **Pros**: No new work.
*   **Cons**: It does not measure the ramp people export. The ramp page already says so.
*   **Reason for Rejection**: G1.

### Alternative K: Run the evidence check automatically on every push

*   **Pros**: Stale numbers could not ship unnoticed.
*   **Cons**: There is no CI for these pages today. Most pushes to the site are data refreshes.
*   **Reason for Rejection**: For a one-person site, a release checklist is enough. The check has no dependencies, so automating it later is cheap.

### Alternative L: Rename the palette-dna library to avoid the clash with the family name

*   **Pros**: One meaning per name.
*   **Cons**: It touches a package with 233 tests, its documentation and its explorer, and visitors gain nothing.
*   **Reason for Rejection**: Published pages never mention the library (D1), so the clash only exists in internal documents, where it is spelled out.

### Alternative M: Keep Flexoki as the default palette

*   **Pros**: It is the site's own visual language, and the most distinctive palette in the list.
*   **Cons**: It is the hardest palette to predict (2.27), so first-time visitors see the weakest results, and fewer of them know it.
*   **Reason for Rejection**: D3. Flexoki stays one click away.

### Alternative N: Guard pins with a lightness-distance threshold

*   **Pros**: It would stop distorted ramps.
*   **Cons**: It adds a new number with no measurement behind it, and it overrules a deliberate choice.
*   **Reason for Rejection**: Naming the automatic step in the verdict gives people the information without adding a rule.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

There are four changes, each verified before the next starts. Paths are relative to the repository root. Line numbers refer to today's files and will shift after Change 1, so each item also names the code by its content.

### Change 1: shared engine, evidence script, publishing exclusions (G6, G1)

#### 1. `assets/palette-dna/engine.js` (Create)

*   **Type / Scope**: Non-module browser script, shared.
*   **Proposed Changes**: Move the `var Engine = (function () { … })();` block verbatim from `color-ramp.html` (today lines 375–1093; identical at `color-intelligence.html` 495–1213).

#### 2. `assets/palette-dna/importer.js` (Create)

*   **Type / Scope**: Non-module browser script, shared.
*   **Proposed Changes**: Move the `var Importer = (function () { … })();` block verbatim (today `color-ramp.html` 1097–1252; identical in the map page).

#### 3. `assets/palette-dna/palettes.js` (Create)

*   **Type / Scope**: Data.
*   **Proposed Changes**: The file has exactly three parts:
    *   line 1: `var PALETTES =`
    *   then the 12-palette JSON array exactly as it appears today in `<script type="application/json" id="pals">` (the ramp page) and `id="palettes"` (the map page)
    *   a last line containing only `;`

    Stripping the first and last lines leaves valid JSON. Before deleting the inline copies, confirm the two are byte-identical.

#### 4. `color-ramp.html` (Modify)

*   **Type / Scope**: Page.
*   **Proposed Changes**:
    *   Delete the inline palette JSON, engine and importer scripts.
    *   Before the controller script, add:

        ```html
        <script src="assets/palette-dna/palettes.js?v=2026-11-15"></script>
        <script src="assets/palette-dna/engine.js?v=2026-11-15"></script>
        <script src="assets/palette-dna/importer.js?v=2026-11-15"></script>
        ```

        The date is the planned release date, and all three use the same one.
    *   In the controller, replace `var BUILTIN = JSON.parse($('pals').textContent)` with `var BUILTIN = PALETTES.slice()`.
    *   Replace the stale comment "Uses Engine (src/engine.js) unchanged…" (today line 1257) with "Engine, Importer and PALETTES come from assets/palette-dna/."

#### 5. `color-intelligence.html` (Modify)

*   **Type / Scope**: Page.
*   **Proposed Changes**: Same as item 4. The map page's parse line (today 1377) reads the `palettes` element.

#### 6. `tests/color-ramp.test.cjs` (Modify)

*   **Type / Scope**: Node test.
*   **Proposed Changes**:
    *   In `harness()`, before running the inline scripts, run `assets/palette-dna/palettes.js`, `engine.js` and `importer.js` with `vm.runInContext` in that order.
    *   Remove the special `textContent` for the `pals` element.
    *   In test 1 ("all scripts compile and shipped palettes render"), loop over `h.c.PALETTES`.
    *   Add test "loads the shared files": the page's `<script src>` values are exactly the three files, in order, all with the same `?v=`.

#### 7. `tests/color-intelligence.test.cjs` (Modify)

*   **Type / Scope**: Node test.
*   **Proposed Changes**:
    *   `source(name)` reads `assets/palette-dna/engine.js` or `importer.js` from disk instead of searching inline scripts.
    *   `palettes` is `PALETTES` taken from a `vm` context that ran `palettes.js`.
    *   The `fn()` extraction of controller functions is unchanged.
    *   Add the same "loads the shared files" test.

#### 8. `tests/fixtures/gen-anchors.json` and `tests/make-gen-anchors-fixture.cjs` (Create)

*   **Type / Scope**: Test fixture and the script that writes it.
*   **Proposed Changes**: The script loads the three shared files in a `vm` context. For every built-in palette, both `cap` values, and each of these seed sets, it records the inputs and `[L, a, b, step, anchor, seedIndex]` for every step returned by `genAnchors`:
    *   `#FDE68A`
    *   `#D97706`
    *   `#78350F`
    *   `#FDE68A, #D97706, #78350F`
    *   `#9D58BA, #E9D5FF`

    Run it once, in Change 1, against the extracted engine: `node tests/make-gen-anchors-fixture.cjs`.

#### 9. `scripts/palette-dna-evidence.cjs` (Create)

*   **Type / Scope**: Plain Node script (CommonJS, no dependencies). Not published, because `scripts/` is excluded.
*   **Proposed Changes**:
    *   **Inputs.** Load `assets/palette-dna/palettes.js` and `engine.js` in a `vm` context.
    *   **Which ramps.** For every palette except `meridian-dark` (its steps run dark to light), and for each ramp in `M.loft`:
        1.  Build the model without that ramp: `M2 = Engine.holdOut(M, name)`.
        2.  Take as the seed the most colorful step among the ramp's in-order steps (`r.keep`).
        3.  Run:
            *   `auto`: `M2.genAnchors([{ lab, map: M2.seedMap(lab) }], { cap: false })`
            *   `nearest`: the baseline, ported from `run.mts` lines 39–52
    *   **Scoring.** Score every step except the seed step as Oklab distance ×100, rounded to two decimals. Record `placed`, the step key whose output is nearest the seed color.
    *   **Statistics.** Port these from `build-page.py`:
        *   quantile `sorted[min(n−1, floor(p·n))]`
        *   `within1` = share < 2
        *   `seedMoved` = share where `placed` ≠ the designers' step
        *   medians for the unshifted and shifted cases
    *   **Result object.**

        ```text
        { generated, n: { ramps, palettes },
          headline: { <run>: { median, p90, within1, seedMoved, medianUnshifted, medianShifted } },
          palette:  { <id>: { <run>: { median, within1 } } },          // every palette, headline or not
          ramps:    [ { pal, palName, ramp, steps[], seed, truth[], <run>: { colors[], err[], placed, mean } } ] }
        ```

        Fractions are stored from 0 to 1. Colors are stored as `oklch()` strings.
    *   **Headline set.** Palettes with no `origin`, or whose `origin.kind` is not `generated` or `chart`. Until item 20 adds `origin`, the script uses the constant list `['material3', 'meridian-light']` for exclusion.
    *   **Page output.** Writes `palette-dna/evidence.html` from item 10's template, with the result embedded as JSON.
    *   **`--check`.** Recompute, then:
        *   for each file in `const PAGES = ['color-ramp.html', 'color-intelligence.html']` (changed in item 26), compare every `data-evidence` element as described in the Technical Plan, section 5;
        *   compare a freshly rendered `evidence.html` with the committed one;
        *   exit 1 and list every mismatch.
*   **Change 1 gate.** The script reproduces the 2026-11-04 headline numbers:

    | Run | Median | 90th percentile | Within one JND | Seed moved | Median, unshifted / shifted |
    |---|---|---|---|---|---|
    | `auto` | 1.33 | 4.10 | 67% | 24% | 1.16 / 2.46 |
    | `nearest` | 1.79 | 4.71 | 54% | — | — |

    It also reproduces `n.ramps` 113, `n.palettes` 9, and per-palette `auto` medians of material3 0.34, flexoki 2.27, atlassian 1.75 and radix 0.82.

#### 10. `scripts/palette-dna-evidence-template.html` (Create)

*   **Type / Scope**: HTML template for the evidence page.
*   **Proposed Changes**: Start from `reviews/color-tools/engine-comparison/page-template.html`.
    *   **Placeholders.** `{{DATA}}` (the result JSON) is the only placeholder. Every number on the page is rendered by its script from `{{DATA}}`, and the prose contains no literal numbers.
    *   **Sections.**
        1.  Method: the "Terms and measurement" definitions above, including the baseline disclosure.
        2.  Results: the headline table, plus the per-palette table with non-headline palettes marked.
        3.  Ramp by ramp: the viewer.
        4.  Reproduce: a link to `https://github.com/chriswillis/chriswillis.github.io/tree/main/scripts` and the command `node scripts/palette-dna-evidence.cjs`.
        5.  Why this engine: one sentence and a link to `https://github.com/chriswillis/chriswillis.github.io/tree/main/reviews/color-tools/engine-comparison`.
    *   **Viewer.**
        *   Rows: Shipped, Automatic, Pinned (after Change 2), Baseline.
        *   Sort options: "Worst automatic result", "Largest gain from pinning" (after Change 2), "Palette and ramp name".
        *   Filter options: "All ramps", "Seed moved", "Any step 2 or more".
    *   **Site chrome.** Copy the top bar and theme toggle from `color-ramp.html` (today lines 243 and 247–255), including its color tokens.

#### 11. `_config.yml` (Modify)

*   **Type / Scope**: Publishing configuration.
*   **Proposed Changes**:
    *   Add `reviews/` and `tests/` to `exclude`, next to `docs/`, which is already added.
    *   Change the comment above `color/` to "The palette-dna library: source, tests and outputs. No page loads it."

#### 12. `docs/palette-dna-release.md` (Create)

*   **Type / Scope**: Release checklist, not published.
*   **Proposed Changes**:
    1.  Set the same `?v=` date on all three script tags in every page that loads them.
    2.  Run `node --test tests/*.test.cjs`.
    3.  Run `node scripts/palette-dna-evidence.cjs`, then `--check`.
    4.  Do the manual checks listed under Verification.
    5.  Commit.

    The checklist also notes that `engine.js` must stay compatible with the previous controller for one release (see Risks).

#### 13. `reviews/color-tools/engine-comparison/README.md` (Modify)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: Add a first paragraph:
    *   This folder is a snapshot from 2026-11-04 and the only comparison with the palette-dna library.
    *   Its `extract-engine.py` reads the pre-Change-1 pages, so to rerun it, check out the commit before Change 1.
    *   The release evidence lives in `scripts/palette-dna-evidence.cjs`.

**Change 1 exit** (implemented 2026-11-05: 23 tests pass, both pages pixel-identical to before, evidence numbers reproduced exactly): all 21 existing tests and the new tests pass; the evidence script reproduces the table in item 9; the pages look and behave as before.

### Change 2: step pinning (G2) and the default palette (D3)

#### 14. `assets/palette-dna/engine.js` (Modify)

*   **Type / Scope**: Engine.
*   **Proposed Changes**: In `M.genAnchors`, implement the rule in Technical Plan section 2:
    *   **Duplicate filter.** It keeps the seed that carries `step` when two seeds fall within 0.012 lightness.
    *   **Gray pinned seed.** If that seed is filtered out as neutral, set `reason: 'neutral'`.
    *   **Capacity rule.** Apply it before assigning steps.
    *   **Bounded assignment.** In the nearest-free-step loop, seeds lighter than the pin search only indices below `k`, and darker seeds only indices above `k`.
    *   **`auto`.** Compute it by running the existing assignment without the pin.
    *   **Return.** Attach `pin` to the returned array only when a `step` was given.

#### 15. `color-ramp.html` (Modify)

*   **Type / Scope**: Page controller and markup.
*   **Proposed Changes**:
    *   **Markup.** After the `#c1` field's block, and before the second-color field, add a field in the existing pattern:

        ```html
        <div class="field">
          <label class="lab" for="step"><span>Step for your color</span></label>
          <select id="step"></select>
          <p class="hint" id="stephint">Choose the step your color should be, such as 500. Automatic uses the closest step in lightness.</p>
        </div>
        ```

    *   **State.** Add `st.s1 = null`.
        *   `hashOf()` writes `s1` into the `#r2=` JSON.
        *   The `rk.state` save writes it.
        *   `load()` reads it from either source when it is a string, and otherwise `null`.
        *   Add `st.stepNote = null`.
    *   **Controls.** `renderControls()` rebuilds `#step`'s options from the current palette's steps and selects `st.s1`, or `""` for Automatic.
        *   A `change` listener sets `st.s1` to the chosen value, or `null` for `""`, and renders.
    *   **Validity.** At the top of `render()`, if `st.s1` is set and is not in `palById(st.pal).steps`, set `st.stepNote` to `'Step ' + st.s1 + ' isn\'t in ' + pal.name + ', so the step is automatic again.'`, then set `st.s1 = null`.
        *   This covers every path that changes `st.pal`: the `#pal` change handler, palette removal (today line 1545), the `storage` event (1550), import commit (1600), and `load()` (1478, 1490).
    *   **Generation.** In `generate()`:
        *   When `st.s1` is set, give `seeds[0]` `step: st.s1`.
        *   Use the authored-ramp branch (`kind: 'exact'`) only when there is no pin, or the pin equals the authored step.
        *   After `genAnchors`, copy `out.pin = gen.pin`, because `gen.map(…)` does not keep array properties.
        *   If `st.stepNote` is set, push it to `out.notes`, then clear it.
    *   **Verdict.** In `renderVerdict()`, use this wording. `{s}` is the anchor step, `{p}` the pinned step, `{a}` `pin.auto`, `{e}` the error.
        *   Replace the generated-ramp opening sentence ("Shaped from your inputs using X. Reference-surface hold-outs do not establish an accuracy estimate for this anchored ramp.") with "Shaped from your color using {palette}. How close generated ramps come to real ones is under How we measured."
        *   Your color: "Your color is kept exactly at step {s}{where}." or "Your color is approximated at step {s}{where} (ΔE OK ×100 {e}); the displayed and exported color may differ from your input." Then:
            *   automatic: `{where}` is ", the closest step in lightness", followed by " Choose a step to change this."
            *   pinned and applied: `{where}` is ", the step you chose". If `{a} ≠ {s}`, add " Automatic placement would use step {a}."
            *   pin rejected for order: `{where}` is ", the closest step in lightness", followed by " Step {p} would leave no room for your second color, so the step was chosen automatically."
            *   authored ramp (`kind: 'exact'`): no `{where}` clause.
        *   Your color, gray: the existing gray sentence. If a step was pinned, add "The step you chose doesn't apply to a gray ramp." The page does not also say the color was not kept.
        *   Your color gray but the second color live (`pin.reason === 'neutral'`): "Your color was not kept as an anchor." plus "The step you chose doesn't apply to a gray color."
        *   Authored ramp: "Your color is {palette} {ramp}-{s}, so this is the ramp its designers made."
        *   Your second color: "Your second color is kept exactly at step {s}." or "… approximated at step {s} (ΔE OK ×100 {e}); …". If it was dropped: "Your second color was not kept as an anchor."
        *   Your color dropped as a near-duplicate of the second (possible only without a pin): "Your color was not kept as an anchor, because your second color is almost the same lightness."
        *   The shared-anchor note becomes "Your two colors are almost the same lightness, so only one could be kept as an anchor."
        *   Existing notes stay, with "Input" wording replaced the same way.
    *   **Default palette.** Use `pal: 'tailwind4'` in the initial `st`, and `'tailwind4'` in place of the `'flexoki'` fallbacks in the removal handler and the `storage` handler.

#### 16. `color-intelligence.html` (Modify)

*   **Type / Scope**: Page controller.
*   **Proposed Changes**: Replace the `'flexoki'` literal in `removeUser()` (`loadPalette('flexoki')`) and in the start-up line (`loadPalette(PALS.some(…) ? saved.pal : 'flexoki')`) with `'tailwind4'`. No step control.

#### 17. `tests/palette-dna-engine.test.cjs` (Create)

*   **Type / Scope**: Node test of the shared engine.
*   **Proposed Changes**: Loads the three shared files in a `vm` context. Tests:
    *   **No pin, no change.** Every case in `tests/fixtures/gen-anchors.json` reproduces exactly.
    *   **Pin applied.** On Tailwind v4, seed `#3B82F6` pinned to `"500"` lands at index 5 with `pin.applied === '500'`.
    *   **Capacity, accepted.** A pale seed pinned to `"900"` with a darker second seed is accepted, and the second seed lands at `"950"`.
    *   **Capacity, rejected.** The same seeds pinned to `"950"` give `pin.reason === 'order'` and automatic placement.
    *   **Duplicate filter.** Two seeds within 0.012 lightness: the pinned one is kept.
    *   **Gray.** A gray pinned seed gives `pin.reason === 'neutral'`.
    *   **`auto`.** `pin.auto` equals the step automatic placement chooses.

#### 18. `tests/color-ramp.test.cjs` (Modify)

*   **Type / Scope**: Node test.
*   **Proposed Changes**:
    *   **Tests that depend on Flexoki.** Tests 4 ("result explanation discloses approximation…") and 11 ("authored samples and neutral substitution…") depend on Flexoki being the default.
        *   Begin each with `h.api.st.pal = 'flexoki'; h.api.render();`.
        *   Update their expected text: `/Input 1 was not retained/` becomes `/Your second color was not kept|Your color was not kept/` as appropriate, `/Input 1 is preserved/` becomes `/Your color is kept exactly/`, and the gray case's `/not retained/` becomes `/close to gray/`.
    *   **New tests.**
        *   A first visit with no state loads `tailwind4`.
        *   Choosing `500` shows "the step you chose".
        *   A pin that differs from automatic placement names the automatic step.
        *   Switching to Radix with `s1 = '500'` resets the step and shows the note once.
        *   `s1` round-trips through `#r2=` and `rk.state`.
        *   A link with an invalid `s1` loads with Automatic and the note.
        *   Tailwind `blue-500` pinned to `600` does not produce the authored ramp.

#### 19. `tests/color-intelligence.test.cjs` (Modify)

*   **Type / Scope**: Node test.
*   **Proposed Changes**: Add a source-level test asserting that the map page's two palette fallbacks are `'tailwind4'`. The controller cannot run without Plotly.

**Change 2 exit** (implemented 2026-11-05: 36 tests pass; pinned run median 1.25, 90th percentile 3.45, 71% within one JND; `auto` unchanged):

*   All tests pass.
*   The evidence script gains the `pinned` run, which sets `step` on the seed to the designers' step.
*   Its median is reported and is no worse than `auto`'s.
*   The headline `auto` numbers are unchanged from Change 1.

### Change 3: explainers, origin labels, evidence page (G1, G4, G5)

#### 20. `assets/palette-dna/palettes.js` (Modify)

*   **Type / Scope**: Data.
*   **Proposed Changes**: Add `origin` to four palettes:
    *   `material3`: `{ "kind": "generated", "url": "https://github.com/material-foundation/material-color-utilities" }`
    *   `primer`: `{ "kind": "tool-assisted", "url": "https://github.blog/2022-06-14-accelerating-github-theme-creation-with-color-tooling/" }`
    *   `meridian-light` and `meridian-dark`: `{ "kind": "chart", "url": "https://www.npmjs.com/package/@progress/kendo-theme-meridian" }`

    No other palette gets the field. The evidence script switches from its constant list to `origin.kind`.

#### 21. `color-ramp.html` (Modify)

*   **Type / Scope**: Page copy, markup and metadata.
*   **Proposed Changes**:
    *   **`h1` and `<title>`**: "Palette DNA Ramp".
    *   **Top-bar brand** (today line 248): `<a href="./">Chris Willis</a> / Palette DNA Ramp`.
    *   **Nav link** (today line 250): text "Palette DNA Map".
    *   **Lede**: "Turn one color into a full ramp shaped like a palette you trust: Tailwind, Radix, Flexoki or your own. For designers extending a brand color or a design system."
    *   **New section "Why borrow a palette's shape"**, between the reference panels and Export. It uses `h2` and `.notes`:
        *   "Formula generators apply the same rule at every hue. That keeps ramps consistent, but it loses the hue-by-hue decisions in palettes their designers authored. In our tests, Material 3, which is generated from a formula, was far easier to rebuild than designer-authored palettes such as Flexoki: a median error of `<span data-evidence="palette.material3.auto.median">0.34</span>` against `<span data-evidence="palette.flexoki.auto.median">2.27</span>` ΔE OK ×100, where about 2 is one just-noticeable difference. Not every authored palette is hard to predict: Radix scored `<span data-evidence="palette.radix.auto.median">0.82</span>`."
        *   "This tool reads a palette's shape and fills in the hue you need. We hid each of `<span data-evidence="n.ramps">113</span>` published ramps and rebuilt it from one of its colors and the palette's other ramps. `<span data-evidence="headline.auto.within1">67%</span>` of the rebuilt steps were within one just-noticeable difference of what the designers shipped, against `<span data-evidence="headline.nearest.within1">54%</span>` for copying the nearest ramp. `<a href="palette-dna/evidence.html">How we measured</a>` (item 24 rewrites the link after the move)"
    *   **New section "Compared with"**: a table with the columns Tool, Designed for, This tool adds.
        *   Radix custom palette generator: designed for a Radix-shaped scale from a brand color. This tool adds: the shape of any reference palette, including your own.
        *   Harmony and Leonardo: designed for steps that meet contrast targets. This tool adds: the shape of a designer-authored palette.
        *   Material Theme Builder: designed for a full Material theme. This tool adds: shapes from outside Material.
        *   Tailwind-style generators such as uicolors.app: designed for a Tailwind-like scale. This tool adds: keeping your color exact, and saying which step it landed on.
    *   **New section "When not to use it"**:
        *   You need every step to meet a contrast target: use Harmony or Leonardo.
        *   You need dark-mode tokens: not supported yet.
        *   Your palette has fewer than four colored ramps: the tool needs neighboring hues to interpolate between.
        *   You are working with chart colors: their steps are not ramps.
    *   **"How it works" paragraph** (today line 352). Replace its first two sentences ("Reference-surface hold-outs reconstruct… do not establish accuracy for the generated result.") with "The numbers above come from hiding each real ramp, rebuilding it from its most colorful step, and comparing the result with the shipped ramp." Replace the last paragraph's "Palette topology" link text with "Palette DNA Map".
    *   **`#palmeta`**: when `origin` exists, append " · generated", " · tool-assisted" or " · chart colors", built with `textContent` like the rest of the line.
    *   **Comments**: replace "Palette topology" with "Palette DNA Map" in the CSS comment (today line 30) and in the controller comments (today lines 1263, 1297, 1547).
    *   **Metadata**:
        *   `og:title` and `twitter:title`: "Palette DNA Ramp".
        *   `meta description` and `og:description`: "Turn one color into a full ramp shaped like a palette you trust: Tailwind, Radix, Flexoki or your own. Pick the step your color belongs on, check text contrast, and export CSS, Tailwind or design tokens."
        *   `twitter:description`: "One color in, a full ramp out, shaped like a palette you trust."
        *   `og:image:alt`: "A purple ramp generated from one color, shown beside Tailwind v4's color family with bars marking the new ramp."

#### 22. `color-intelligence.html` (Modify)

*   **Type / Scope**: Page copy, markup, styles and metadata.
*   **Proposed Changes**:
    *   **`<title>`, `og:title`, `twitter:title` and top-bar brand**: "Palette DNA Map".
    *   **Descriptions** (`meta description`, `og:description`, `twitter:description`): "See the shape of a design-system color palette in Oklab: where it has real colors, where the engine fills in, and how well each hue can be rebuilt from its neighbors."
    *   **New block at the top of `<main>`**:
        *   An `h1`: "Palette DNA Map".
        *   A `.lede` paragraph: "See a palette's shape: where it has published colors, where the engine fills in between them, and how well each hue can be rebuilt from its neighbors. For people who want to study a palette before borrowing it. To make a ramp, use `<a href="color-ramp.html">Palette DNA Ramp</a>`."
        *   The two "Why borrow a palette's shape" paragraphs from item 21, with the same `data-evidence` spans and a "How we measured" link, inside a collapsed `<details>` element ("Why borrow a palette's shape"). The map page is a full-height app, and open paragraphs would push the 3D view below the fold. (Implementation note, 2026-11-05.)
    *   **Styles.** Copy the ramp page's `.lede` and `.notes` rules (today `color-ramp.html` lines 93 and 200–202). Add a rule for the new `h1` so it does not use the existing 1.05rem panel `h1` style.
    *   **`#pinfo`**: when `origin` exists, append the same origin text as item 21 on its own line.
    *   **Visible text and comments.** Replace every "Palette topology" and "topology". In comments, use "Palette DNA".
    *   **Counts.** Change "twelve design-system palettes" in the title and metadata to "twelve color palettes". Leave "the ten palettes behind the calibration" (today line 1552) unchanged, because it is correct.

#### 23. `palette-dna/evidence.html` (Create, generated)

*   **Type / Scope**: Published page.
*   **Proposed Changes**: The output of item 9, first written in Change 1 (implemented 2026-11-05) and regenerated here once the tool pages carry `data-evidence` numbers. It is never edited by hand. Until Change 4, the ramp page's "How we measured" link uses `palette-dna/evidence.html`.

**Change 3 exit** (implemented 2026-11-05: 36 tests pass, `--check` passes against the 6 `data-evidence` numbers on each page, no console errors, no horizontal scroll at 375 px): all tests pass, and `node scripts/palette-dna-evidence.cjs --check` exits 0. The ramp page's footer moved to "Built on the Palette DNA engine" here rather than in Change 4, so no visible "topology" remains after this change.

### Change 4: names, URLs, redirects and links (G3). Starts only after Q1 is settled.

#### 24. `palette-dna/ramp.html` and `palette-dna/map.html` (Create via `git mv`)

*   **Type / Scope**: Pages.
*   **Proposed Changes**:
    *   Move the pages: `git mv color-ramp.html palette-dna/ramp.html` and `git mv color-intelligence.html palette-dna/map.html`.
    *   Apply these URL rewrites in both pages:
        *   `assets/` becomes `../assets/`.
        *   `href="./"` (the brand link) becomes `href="../"`.
        *   `color-intelligence.html` becomes `map.html`.
        *   `color-ramp.html` becomes `ramp.html`.
        *   `palette-dna/evidence.html` becomes `evidence.html`.
    *   Set `canonical` and `og:url` to `https://cewillis.com/palette-dna/ramp.html` and `…/map.html`.
    *   Set `og:image` and `twitter:image` to the new images (item 27).
    *   Ramp page footer: "Built on the Palette DNA engine. Palettes belong to their authors; see each one's license."

#### 25. `color-ramp.html` and `color-intelligence.html` (Create as redirect pages)

*   **Type / Scope**: Static redirect pages at the old paths.
*   **Proposed Changes**: Each page contains:
    *   `<meta charset>`
    *   a `<title>` with the new name
    *   an absolute canonical link to the new URL
    *   `<meta name="robots" content="noindex">`
    *   the old page's `og:*` and `twitter:*` tags, unchanged, so previews of existing posts keep working
    *   one inline script: `location.replace('palette-dna/ramp.html' + location.search + location.hash);` (`map.html` for the map page)
    *   one visible link to the new page, so browsers without JavaScript can follow it

    There is no `meta refresh`, because it cannot carry the hash forward.

#### 26. `scripts/palette-dna-evidence.cjs` (Modify)

*   **Type / Scope**: Script.
*   **Proposed Changes**: Set `PAGES = ['palette-dna/ramp.html', 'palette-dna/map.html']`. In `scripts/palette-dna-evidence-template.html`, change the top-bar links `../color-ramp.html` and `../color-intelligence.html` to `ramp.html` and `map.html`, then regenerate `palette-dna/evidence.html`.

#### 27. `og-palette-dna-ramp.png` and `og-palette-dna-map.png` (Create at the repository root), with sources `reviews/color-tools/social/ramp.html` and `map.html`

*   **Type / Scope**: 1200×630 social images and their HTML sources.
*   **Proposed Changes**:
    *   **Ramp image.** Copy `reviews/color-ramp/social-preview.html`.
        *   Change the iframe `src` to `../../palette-dna/ramp.html?social=1#r2=` plus the URL-encoded `{"c1":"#99CCEE","c2":null,"pal":"tailwind4","mode":"through","name":"brand","fmt":"css"}`.
        *   Change the name to "Palette DNA Ramp" and the caption to "#99CCEE · SHAPED BY TAILWIND V4".
        *   Keep the tagline "Your color. A full ramp. Shaped by a palette you trust."
    *   **Map image.** A new HTML source using the same layout as `og-palette-topology.png`:
        *   kicker "PALETTE DNA MAP"
        *   title "The shape of a color palette"
        *   subtitle "Twelve color palettes as surfaces in Oklab, and an engine that fills in the colors they leave out."
        *   a screenshot of the Tailwind v4 surface from `palette-dna/map.html`
    *   **Capture.** Use Playwright at `deviceScaleFactor: 1` and viewport 1200×630, run from `color/`, where Playwright is installed: `node -e` with a short capture snippet, recorded in each source file's header comment.
    *   **Old images.** `og-color-ramp.png` and `og-palette-topology.png` stay, for the redirect pages.

#### 28. `index.html`, `lab/index.html`, `measles.html`, `godzilla-el-nino.html` (Modify)

*   **Type / Scope**: Pages that link to the tools.
*   **Proposed Changes**:
    *   **Links.** `color-ramp.html` becomes `palette-dna/ramp.html`, and `color-intelligence.html` becomes `palette-dna/map.html`. In `lab/`, use `../palette-dna/…`.
    *   **Card titles.** "Palette DNA Ramp" and "Palette DNA Map".
    *   **Map card blurb**, replacing the text that contains "harmoniously fit the family" (today `index.html` 672, `lab/index.html` 137): "Twelve design-system palettes as shapes in Oklab: where each has published colors, where the engine fills in, and how well each hue can be rebuilt from its neighbors."
    *   **Ramp card blurb**, replacing "seven other design systems … estimates how close each step is…" (today `lab/index.html` 148): "One color in, a full ramp out, shaped like Tailwind, Radix, Flexoki or your own palette. Pick the step your color belongs on and export CSS, Tailwind or tokens."
    *   **Teaser images and alt text** are unchanged.

#### 29. `sitemap.xml` and `feed.xml` (Modify)

*   **Type / Scope**: Site metadata.
*   **Proposed Changes**:
    *   **Sitemap.** Replace the two old URLs with `https://cewillis.com/palette-dna/ramp.html` and `…/map.html`, and add `…/evidence.html`. Set `lastmod` to the release date.
    *   **Feed.** For both items:
        *   `<link>` changes to the new URL.
        *   `<title>` changes to the new name.
        *   `<description>` changes to the blurbs in item 28.
        *   `<guid>` is unchanged.

#### 30. `tests/color-ramp.test.cjs`, `tests/color-intelligence.test.cjs`, `tests/color-intelligence-mobile.html` (Modify)

*   **Type / Scope**: Tests.
*   **Proposed Changes**: Read the pages from their new paths. Load the shared files from `assets/palette-dna/` as before.

#### 31. `color/README.md` (Modify)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: Add a section, "Relationship to the site":
    *   The site's Palette DNA pages use the engine in `assets/palette-dna/engine.js` (formerly the topology engine), not this library.
    *   The two were compared on 2026-11-04 in `reviews/color-tools/engine-comparison/`.
    *   This library may supply dark mode, tokens and semantic hues later.

**Change 4 exit** (implemented 2026-11-05: 36 tests pass, `--check` passes on the new paths, the release grep finds nothing, browser checks pass): all tests pass; `--check` exits 0 with the new `PAGES`; the manual checks below pass.

Implementation notes for Change 4:

*   **Redirect pages carry the new social tags, not the old ones.** Their title, description and image are the new pages' tags, with `og:url` set to the new address. Preview tools still find tags, and re-scraped posts show the new name instead of "Palette topology". `og-color-ramp.png` and `og-palette-topology.png` stay, so cached previews keep working.
*   **Card and feed copy keeps the author's voice.** Instead of replacing the home, lab and feed blurbs with the short ones in item 28, only the sentences that broke a rule were changed. "Generate new colors that harmoniously fit the family" became "generate new colors shaped like the rest of the family". "Where it's guessing" became "where it's filling in". The ramp blurb's "seven other design systems … estimates how close each step is to what that system's designers would have picked" became "other design systems … Pick the step your color belongs on". Titles changed to the new names.
*   **Social images.** Sources and a capture script live in `reviews/color-tools/social/`: `ramp.html`, `map.html`, `capture.cjs` and `surface-tailwind4.png`. Run `node ../reviews/color-tools/social/capture.cjs http://localhost:8000` from `color/`, where Playwright is installed, while the repository root is served. The map image's title is "The shape of a color palette".

### Verification Plan

*   **Compilation/Build**: None. The site has no build, and the scripts are plain Node 18 or later.
*   **Unit tests**: `node --test tests/*.test.cjs` passes after every change. That covers the 21 existing tests, as amended in item 18, plus the tests added in items 6, 7, 17, 18 and 19.
*   **Evidence**:
    *   After Change 1, the script reproduces the item 9 table.
    *   After Change 2, the pinned median is reported, and the `auto` numbers are unchanged.
    *   After Changes 3 and 4, `node scripts/palette-dna-evidence.cjs --check` exits 0.
*   **Library**: `cd color && npm test` still passes 233 tests. The library is not modified.
*   **Static checks**:
    *   `git diff --check` passes.
    *   `grep -rniE "topology|harmonious|ramp from one color" palette-dna assets/palette-dna index.html lab/index.html feed.xml sitemap.xml` returns nothing after Change 4.
    *   The redirect pages are excluded from the search, because they deliberately keep the old social tags.
*   **Manual checks** (from the release checklist, run against `python3 -m http.server 8000` in the repository root):
    1.  Open both pages at 320, 390 and 1280 px wide, in light and dark mode. There is no horizontal scroll.
    2.  With site data cleared, the ramp page loads Tailwind v4 with the example ramp.
    3.  Choose step 500 for `#3B82F6`. The ring marking your color moves to 500, and the CSS export matches the swatches.
    4.  An old `color-ramp.html#r2=…` link lands on `palette-dna/ramp.html` with the same colors, palette and step.
    5.  A palette imported before the move is still in the menu after it.
    6.  Both new social images look right in a link-preview tool.
    7.  Read the explainer copy once on a phone.

--------------------------------------------------------------------------------

## Future Improvements

*   **Sibling hue suggestions for a brand color.** Bring in the palette-dna library's `deriveSemanticHues`. Describe it as what it measures: distance between hues, for people with and without color-vision deficiencies. Do not call it harmony (D2).
*   **Dark mode and tokens.** Generate a matching dark ramp and semantic tokens with the library's `solvePair` and `buildTokens`.
*   **Step pinning on the map page.** Add the same step menu for the primary seed in seed mode. The engine already supports it.
*   **Pinning the second color**, once single-color pinning has real use.
*   **Automating the release checks.** Run the page tests and `--check` in a GitHub Actions workflow on changes to `assets/palette-dna/` or `palette-dna/`.
*   **Origin labels for more palettes.** Add them where the authors document how their palettes were made.

--------------------------------------------------------------------------------

## Review resolution

Each row lists the finding IDs from the five reports in `docs/designs/palette-dna-tools-review/`. The prefixes are S5 (zoom-out), S6 (comprehension), S7 (critic), S8 (intermediate zoom-out) and S9 (implementation readiness).

| Finding(s) | Resolution |
|---|---|
| S9 B1, S6 B1/M15, S5 N7, S8 Z1 | The evidence script now arrives in Change 1, gains the pinned run in Change 2, and gains `--check` in Change 3. Its page paths come from one constant. |
| S5 M2, S6 M7/M9/M17, S7 N1 | The check reruns the test instead of comparing stored hashes, so the published `evidence.json` is gone. Statistics, units and quantile rules are now defined, the source files are named, and the release checklist is defined (item 12). |
| S9 B2 | Tests 4 and 11 now select Flexoki and use the new wording (item 18). |
| S9 B3, S6 M14, S8 Z7 | Each harness now loads the shared files directly. The map page's first-visit check is a source test. |
| S9 B4, S6 M1–M4, S7 M3, S5 N1, S8 Z3 | One pinning rule (capacity), a single pin, one `pin` result shape, and `out.pin` carried through. The duplicate filter keeps the pin. A threshold guard was rejected (Alternative N). |
| S7 M2, S6 M16, S5 N4, S8 Z2 | Medians are always per step. Unshifted and shifted are 1.16 / 2.46. G2 is behavior-based, and the pinned median is reported rather than used as a gate. |
| S7 M6, S8 Z8 | The headline set leaves out generated and chart palettes: 113 ramps, 67% within one JND against 54% for the baseline. |
| S7 M5, S6 M12, S9 M8 | Flexoki checked: its author does not say it was tuned by hand. "Hand-tuned" is gone from the copy. Origin labels are limited to documented cases (G5, item 20). |
| S5 M1, S6 M10, S7 M1, S9 M5, S8 Z5 | Terms are defined in the Overview. D1 is scoped to published files. Run keys are `auto`, `pinned`, `nearest`. Comments and blurbs are listed (items 21, 22, 28). |
| S5 M3, S7 N2 | Q1 is a gate on Change 4, and its impact statement is corrected. |
| S7 B1, S8 Z6 | A Risks & Mitigations section is added. |
| S7 M4, S5 N6, S9 M10 | Evidence links go to GitHub (confirmed public). D6 covers the excluded folders, and the redirect pages keep their social tags. |
| S7 M7, S6 M8/N10 | A "Terms and measurement" section is added, and UI terms are defined where they first appear. |
| S7 M8, S6 M13, S8 Z9 | CUJ 2 is reworded and CUJ 4 (first-time visitor) is added. CUJs are tagged with goals. |
| S7 M9, S6 M11, S8 Z4 | One set of section names. The map page gets the reduced set, and G4 is narrowed to match. |
| S9 M1, S6 M5/M6 | Step state, one validity check per render, the note mechanism, the hint text and the full wording are specified (item 15). |
| S9 M2, S5 N3 | The contradicting sentences on the ramp page are replaced (items 15, 21). |
| S9 M4, S5 N5 | The evidence template has no literal numbers, and its viewer, placeholder and site chrome are specified (item 10). |
| S9 M6, S9 M7 | Metadata, descriptions, brand text, map-page styles and `#pinfo` are specified (items 21, 22). |
| S9 M9, S6 N9 | The URL rewrites are listed (item 24). |
| S9 M11 | End-to-end checks are now manual steps, with a server command. |
| S9 M12 | The fixture's seeds, `cap` values, fields and command are specified (item 8). |
| S9 N1–N10, S7 N3–N12, S6 N1–N12, S5 N2/N8/N9 | Line ranges, literals, the `palettes.js` layout, the `_config.yml` comment, the counts rule, the image build, the `?v=` format, the README note and the wording fixes are applied throughout. |
| S7 N8 | Alternatives L (rename the library) and M (keep Flexoki as the default) are added. |

*Drafted with EGM*
