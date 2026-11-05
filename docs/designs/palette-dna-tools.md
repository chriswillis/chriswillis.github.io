# Palette DNA tools: a measured ramp promise, one set of names, and explainers

*   **Author:** Chris Willis
*   **Status:** Draft
*   **Date:** 2026-11-04

--------------------------------------------------------------------------------

## Overview

cewillis.com has two color pages that share one engine. The engine is embedded separately in each page:

*   `color-ramp.html` ("Ramp from one color") turns a brand color into a full ramp shaped like a reference palette.
*   `color-intelligence.html` ("Palette topology") maps a palette's ramps as a surface in Oklab and lets you study it.

The repository also holds `color/` (`palette-dna`), a tested TypeScript library with a different generator plus dark mode, tokens, an audit and semantic hues. None of it ships on the site.

This design prepares the next release of the two pages for sharing with the design community. It does four things:

1.  States one claim about the generated ramp, measured and reproducible.
2.  Lets people choose which step their color becomes, which is the largest measured source of error.
3.  Gives the tools one consistent set of names.
4.  Adds About and benefit explainers built on that evidence.

The engine decision is settled by measurement. The topology engine stays as the generator. palette-dna supplies features, not the engine (see `reviews/color-tools/engine-comparison/`).

## The Problem

Designers rarely start from nothing. They start from a brand color, or from a palette they already trust and need to extend. Two kinds of tools serve them today:

*   **Formula generators** (Material's HCT tonal palettes, Adobe Leonardo, Evil Martians' Harmony, even-OKLCH generators) produce consistent ramps from rules. The rules are the same at every hue, so they smooth away the per-hue decisions that make palettes such as Tailwind v3, Flexoki and Radix feel deliberate.
*   **Template generators** (Radix's custom palette tool, uicolors.app and similar Tailwind generators) copy the shape of one specific palette. You get that palette's shape or nothing, and they do not say how they changed your color.

Our measurement supports the premise that hand-tuning adds something formulas lack, with a caveat. In the hold-out test, Material 3 (generated) is by far the easiest palette to predict: median 0.34 ΔE OK ×100. Hand-tuned Flexoki and Atlassian are the hardest (1.75–2.27). Radix is hand-tuned but still easy to predict (0.82), so this is consistent with the premise, not proof of it.

The two pages already do something neither kind of tool does: borrow the shape of any palette, including one you import, interpolate between that palette's neighboring hues, and report how your color was changed. Five problems keep that from landing with an expert audience:

1.  **The promise is unmeasured where it matters.** The pages measure how well the surface rebuilds a hidden ramp, but the result people export is a seed-anchored ramp, and the ramp page itself says the hold-outs "do not establish an accuracy estimate" for it. The seeded hold-out now gives that number: 68% of generated steps fall within one just-noticeable difference (JND) of what designers shipped, across 125 ramps in 10 palettes. Copying the nearest ramp gets 56%. Neither number appears on either page.
2.  **People cannot control the largest error.** Both engines keep the seed color exactly. In 22% of cases, the topology engine puts it on a different step from the one the designers used. When that happens, every other step shifts, and median error rises from 1.26 to 2.92. People have no way to say "this is my 500".
3.  **The names are inconsistent and partly inaccurate.**
    *   The analyzer has four names: `color-intelligence.html`, "Palette topology", "Mapping the shape of a color palette" and `ColorIntelligence-teaser.png`. "Topology" is the wrong word, because the page measures geometry: positions, distances and reach.
    *   "Ramp from one color" describes the ramp page but is not a name, and the `color-ramp.html` URL is generic.
    *   The library is already called `palette-dna`.
4.  **There is no explanation of why.**
    *   The analyzer has no headline or intro text.
    *   The ramp page has a one-sentence intro and a technical "How it works" at the bottom.
    *   Neither page says who the tool is for, why hand-tuned shapes matter, how it differs from the tools readers already use, or when not to use it.
5.  **The pitch overreaches in places.**
    *   "Find the most harmonious hues" for a brand color is not in either page. The nearest capability is `deriveSemanticHues` in palette-dna, and it measures distinguishability, not harmony.
    *   Primer was built with GitHub's Prism tool, and Material 3 is generated. Citing either as hand-chosen will be corrected in public.

## Goals

*   **G1. One measured claim for the generated ramp, kept current.** Both pages state the seeded hold-out result in plain language, next to the copy-the-nearest-ramp baseline, with a link to the evidence page. The numbers come from a script in the repository, rerun whenever the engine or palette data changes; the release check fails if the published numbers differ from a fresh run.
*   **G2. People choose which step their color becomes.** The ramp page accepts an optional step for your color. The automatic choice stays the default. The map page gets pinning later (Future Improvements).
    *   Pinned to the designers' step, the seeded hold-out puts the seed on that step in 100% of cases.
    *   The median error with pinning is no worse than the median of the unshifted cases today (1.26).
*   **G3. One set of names, used everywhere.** One family name and one name per tool, used the same way in the page title, top heading, URL, social title and image, navigation and footer.
    *   Every current URL keeps working, including the saved state in the URL hash.
    *   Local-storage keys stay unchanged and are documented, so palettes already imported under `pt.user` carry over without the person doing anything.
*   **G4. Each page explains itself.** Each page answers five questions above or beside the tool:
    1.  What does it do?
    2.  Who is it for?
    3.  Why do hand-tuned shapes matter (with the measured evidence)?
    4.  How does it differ from Radix's generator, Harmony, Leonardo and Material Theme Builder?
    5.  When should you not use it?

    Every number in these explainers comes from the reproducible evidence in G1.
*   **G5. Accurate claims about the palettes.** Palettes are described as hand-tuned only where the authors have documented it. Material 3 is presented as the generated control that it is. Kendo Meridian is marked as chart colors (five steps per hue), not a ramp system, and is excluded from the headline numbers.
*   **G6. One copy of the engine.** Both pages load the engine from one source file instead of two embedded copies. The existing tests (`tests/color-ramp.test.cjs`, `tests/color-intelligence.test.cjs`) and the comparison harness all run against that one file. G2 changes the engine, so this has to happen first, or the change must be made twice by hand.

## Non-Goals

*   **Replacing the topology engine with palette-dna.** palette-dna was measured and lost on fidelity: median 1.45 against 1.26, and 90th percentile 5.00 against 4.05.
*   **Even step spacing as a default anywhere.** It raises the median error from 1.45 to 2.40, and Radix's from 1.05 to 13.2. It contradicts the premise that designers' spacing is worth keeping.
*   **Porting palette-dna's dark mode, tokens, audit or lint into the pages.** These are valuable and may come later, but they are not needed to make the current promise honest and understandable.
*   **New interpolation methods or tuning the engine for accuracy.** The release states what the engine does; it does not try to improve the number.
*   **A visual redesign.** Layout changes are limited to adding the explainers and the step control.
*   **Correctness, input validation and accessibility work.** The October reviews covered these and the repairs are implemented (`reviews/color-ramp/`, `reviews/color-intelligence/`). Only regressions caused by this work are in scope.
*   **New reference palettes.**

## Decisions (resolved 2026-11-04)

*   **D1. Family name: Palette DNA.** It names inheritance, which is what the ramp page does. A web search found no color tool with that name; "ColorDNA" exists as a Chrome extension. The library already uses `palette-dna`, which is now consistent, since the library becomes the family's feature source. "Topology" is dropped everywhere.
*   **D2. "Harmonious" is removed from the pitch for this release.** Brand-to-sibling-hue suggestions are recorded under Future Improvements. Bringing back "harmonious" will require a measurable definition.
*   **D3. Tailwind v4 is the default palette in both pages.** It is the most familiar to the audience and predicts well (median 1.33). Flexoki stays in the list and is the example of a hard, hand-tuned case in the explainer.
*   **D4. The explainer leads with the share of steps within one JND (68%).** The baseline comparison (56% when copying the nearest ramp) follows in the same paragraph, as G1 requires.
*   **D5. Automatic step placement stays the default.** It is right in 78% of cases. Pinning a step is optional.

## Open Questions

*   **Q1. Tool names within the family.** This draft uses "Palette DNA Ramp" (`palette-dna/ramp.html`) and "Palette DNA Map" (`palette-dna/map.html`) as working names. Alternatives for the ramp page are "Inherit" and "Kin". The criteria: the name says what the tool does to a first-time visitor, reads well as a URL, and claims no more than the measurement supports. Changing the names later changes only file names and copy.

## Critical User Journeys (CUJs)

### CUJ 1: Brand color to an exported ramp, on the step the designer intends

*   **Given**: A designer has a brand color they use as their "500" and wants a ramp shaped like Tailwind v4.
*   **When**: They enter the color, choose Tailwind v4, and set the step to 500.
*   **Then**:
    *   The ramp shows their color exactly at 500, with no shift note.
    *   The verdict says whether any step was approximated and by how much.
    *   The exported CSS, Tailwind and token values match the displayed steps.

### CUJ 2: Extend an imported palette with a missing hue

*   **Given**: A team has eight hand-tuned ramps in a tokens file and needs a teal they never designed.
*   **When**: They import the file, pick a teal seed, and view the result in the family panel.
*   **Then**:
    *   The teal ramp sits between the team's green and blue with matching step lightness.
    *   The page states how well this palette's own ramps can be rebuilt from their neighbors, so the team knows how far to trust the shape.

### CUJ 3: A skeptical expert checks the claim

*   **Given**: A color-science-literate reader sees the share post and doubts "within one JND".
*   **When**: They read the About section and follow the evidence link.
*   **Then**: They find the method, the baseline, the per-palette results and a single command that reproduces every number on the page.

## Technical Plan (Architecture)

The site is plain HTML on GitHub Pages: Jekyll copies files unchanged, and there is no build step or server. `color/` and `scripts/` are excluded from publishing. The plan keeps that model. No bundler, no framework, and nothing in a page depends on Node.

### Current state

The two pages contain byte-identical copies of three things:

*   the engine (`var Engine`, 719 lines)
*   the importer (`var Importer`, 156 lines)
*   the palette data (12 palettes, 34 KB of inline JSON, under `id="pals"` in one page and `id="palettes"` in the other)

Only the controller code differs. Both page tests (`tests/*.test.cjs`) run the pages' inline scripts in a Node `vm` context with small stand-ins for the DOM. The tests pick scripts out of the HTML with a regular expression.

### Target structure

```text
                    assets/palette-dna/
            ┌──────────────┬──────────────┬───────────────┐
            │ palettes.js  │  engine.js   │  importer.js  │   classic scripts, global names
            │ var PALETTES │  var Engine  │  var Importer │   unchanged; loaded with ?v=<release>
            └──────┬───────┴──────┬───────┴───────┬───────┘
                   │              │               │
        ┌──────────┴─────┐  ┌─────┴──────────┐    │
        │  ramp page     │  │  map page      │◄───┘
        │  (controller + │  │  (controller + │
        │   explainers)  │  │   explainers)  │
        └───────┬────────┘  └───────┬────────┘
                │ data-evidence="…" numbers in the markup
                ▼                   ▼
        ┌─────────────────────────────────────────────┐
        │ evidence check (Node, local)                │
        │ reads the numbers from both pages and fails │
        │ if they differ from evidence.json           │
        └──────────────────────▲──────────────────────┘
                               │
        scripts/palette-dna-evidence.cjs  ──► assets/palette-dna/evidence.json
        (plain Node, no dependencies;         palette-dna/evidence.html
         loads engine.js + palettes.js)       (published method + results)
```

Paths use the family name from D1 and the working tool names from Q1.

### 1. One shared engine (G6, done first)

The engine, importer and palette data move out of the pages into three classic scripts under `assets/palette-dna/`.

*   **Global names stay the same.** `Engine` and `Importer` keep their names, so controller code keeps working.
*   **Palette data loads as a script, not a JSON element.** `palettes.js` assigns `var PALETTES = [...]`. Each controller replaces its one `JSON.parse(document.getElementById(...).textContent)` with `PALETTES.slice()`. A script tag avoids a `fetch`, which would make start-up asynchronous and break the synchronous test harness.
*   **Script URLs carry a version.** Pages load each file as `<script src="assets/palette-dna/engine.js?v=2026-11-15">`, with one release date shared by all three files. GitHub Pages caches assets for about ten minutes, and the version string stops a fresh page from running against a stale engine during that window. The release checklist updates the date. Stale measurements are caught separately, by the input hashes in `evidence.json` (section 5).
*   **The tests load the shared files.** The harnesses in both tests learn to resolve `<script src>` to the local file and run it in the same `vm` context. The rest of each test is unchanged. One new test asserts that both pages load the same three files.
*   **Order matters.** Every later change to the engine (step pinning) is made once, in `engine.js`. The extraction lands as its own change with no behavior change, verified by the existing 21 tests before anything else moves.

### 2. Step pinning (G2)

**Engine.** `genAnchors(seeds, opts)` already assigns each seed to the nearest free step by lightness, then rescales the other steps proportionally between those anchor points. Pinning replaces only the assignment for one seed:

*   A seed may carry `step` (an index into the palette's steps). When present, that seed takes that index, and any other seeds take the nearest free index on the correct side of it.
*   **The order rule.** Seeds are sorted light to dark before assignment. A pin is accepted only if the pinned indices keep that order. Example: a pale seed pinned to 900 while a darker seed sits at 500 is rejected.
*   **On rejection.** The engine falls back to automatic placement and returns `pinRejected: true` with the reason. It does not produce a ramp whose lightness runs backwards.
*   **Pins beat authored ramps.** If the color matches a real palette step exactly but the person pinned a different step, the pin wins. The "palette's own ramp" shortcut applies only when there is no pin, or the pin matches the authored step.
*   **What stays the same.** The proportional lightness rescaling and the chroma interpolation along the step index are unchanged. With no `step` given, output is identical to today's, and a test asserts this across all palettes.

**Ramp page.**

*   A "Step" menu sits beside "Your color": "Automatic (nearest in lightness)" plus the palette's steps.
*   When the palette changes and the chosen step does not exist in the new palette, the menu returns to Automatic and the verdict says so.
*   The verdict always names the step and how it was chosen. Pinned: "Input 1 is preserved at step 500, the step you chose." Automatic: "Input 1 is preserved at step 600, the closest step in lightness. Choose a step to change this."
*   The pin is saved in the existing versioned `#r2=` state as an optional `s1` field. Older links without it still load.
*   Only the first color can be pinned. The second color stays automatic, which keeps the order rule simple and the interface to one control.

**Map page.** No step control in this release. The engine supports pinning, so adding it later needs only interface work (Future Improvements).

**Measurement.** The seeded hold-out adds a "topology, pinned to the designers' step" run. G2 is met when that run places every seed on the designers' step and its median is 1.26 or lower.

### 3. Names, URLs and migration (G3)

Family name per D1; tool names are the Q1 working names:

| Today | After |
|---|---|
| `color-ramp.html`, "Ramp from one color" | `palette-dna/ramp.html` (final name per Q1) |
| `color-intelligence.html`, "Palette topology" | `palette-dna/map.html` (final name per Q1) |
| no evidence page | `palette-dna/evidence.html` |

*   **Old addresses keep working.** GitHub Pages cannot send server redirects, so each old file becomes a small redirect page with a canonical link, a `noscript` link, and one line of script that keeps the URL hash: `location.replace(newPath + location.hash)`. The hash matters because ramp state (`#r2=`) lives in it. A `meta refresh` alone would drop it.
*   **Saved data carries over.** Local storage belongs to the domain (cewillis.com), not the path, so imported palettes (`pt.user`) and saved state (`pt.state`, `rk.state`) are still there after the move. The keys keep their current names. Renaming them gives visitors nothing and risks losing imports. (G3 now says "unchanged and documented" instead of renaming the key.)
*   **Everything else that names the tools** is updated:
    *   page titles, top headings, social titles and descriptions
    *   the cross-links between the two pages, and the ramp page's footer
    *   the teaser links and card text in `index.html`, `lab/index.html`, `measles.html` and `godzilla-el-nino.html`
    *   `sitemap.xml` and `feed.xml`

    Both social preview images show the old names. "Palette topology" also says "Ten design-system palettes", and there are now twelve. Both images are rebuilt.
*   **Feed entries are not duplicated.** In `feed.xml`, each item's `<link>` moves to the new URL, but its `<guid>` stays the old URL, so feed readers do not show the tools as new items.
*   **Working folders stop being public.** `reviews/`, `tests/` and the new `docs/` are not in `_config.yml`'s exclude list, so the October review reports, this comparison and this design document would be served on cewillis.com. All three are added to `exclude`. The method a reader needs is published on the evidence page.

### 4. Explainers (G4, G5)

Each page gains the same four-part structure, using the existing type styles (`h1`, `.lede`, `h2` labels, `.notes`).

1.  **Top of page: name and one-sentence lede.** What it does and for whom. The map page gets the `h1` and lede it lacks today.
2.  **"Why hand-tuned shapes", directly under the tool.** Three short paragraphs:
    *   the premise
    *   the evidence (Material 3 against the hand-tuned palettes)
    *   the measured promise, leading with the share of steps within one JND and followed by the baseline (D4), with numbers marked as below and a link to the evidence page
3.  **"Compared with", a table of four rows:**
    *   Radix custom palettes (one template shape)
    *   Harmony and Leonardo (formula and contrast based)
    *   Material Theme Builder (generated tonal palettes)
    *   uicolors-style Tailwind generators

    One sentence for what each does best and one for what this tool adds. No claims about another tool's quality.
4.  **"When not to use it":**
    *   you need every step to meet a contrast target (use Leonardo or Harmony)
    *   you need dark-mode tokens (not yet supported)
    *   your palette has fewer than four colored ramps
    *   you are working with chart colors rather than ramps

The existing "How it works" text stays below, edited only where it repeats the new sections.

**Numbers are bound to evidence.** Every number in the explainers is wrapped as `<span data-evidence="pooled.topology.within1">68%</span>`. The page shows the literal text, so nothing depends on script loading. The evidence check (section 5) reads every `data-evidence` attribute and compares it with `evidence.json`.

**Each palette gets a provenance field.** Values are `designer-tuned`, `tool-assisted`, `generated` or `chart`, each with a source link. The palette menu shows it as the meta line under the menu, which already shows version and license, and the headline numbers exclude `chart`.

*   Material 3 is marked `generated`.
*   Primer is marked `tool-assisted`, citing GitHub's Prism article.
*   Kendo Meridian is marked `chart`.
*   A palette whose author has not published how it was made is marked `designer-tuned` only if its documentation says so. Otherwise it gets no label. The value is never guessed.

### 5. Evidence script, page and check (G1)

*   **The harness becomes a maintained script.** `reviews/color-tools/engine-comparison/run.mts` becomes `scripts/palette-dna-evidence.cjs`, a plain Node script with no dependencies. It loads `assets/palette-dna/engine.js` and `palettes.js` directly; no more extracting from HTML.
*   **Runs.** Topology (automatic), topology (pinned), and the nearest-ramp baseline. The palette-dna runs are not part of the release evidence; they stay as the dated comparison in `reviews/color-tools/engine-comparison/`, which Alternatives A and B cite.
*   **Outputs.**
    *   `assets/palette-dna/evidence.json`: pooled and per-palette medians, 90th percentiles, share within 1 JND, seed-step agreement, the run date, and the hashes of the inputs it measured.
    *   `palette-dna/evidence.html`: the method, the results, the ramp-by-ramp viewer from the comparison page, and the command to reproduce it.
*   **The check.** `scripts/check-palette-dna-evidence.cjs` fails, listing every mismatch, when:
    *   a `data-evidence` number in either page differs from `evidence.json`
    *   the input hashes recorded in `evidence.json` do not match the current `engine.js` or `palettes.js`, meaning the evidence is stale
*   **When it runs.** Before every release, by hand, as `node scripts/check-palette-dna-evidence.cjs`. There is no CI for these pages today. Adding a workflow is listed under Future Improvements, not required for this release.

### 6. Default palette (D3)

Both controllers change their default palette from `flexoki` to `tailwind4`. This applies only when there is no saved state and no link state, so returning visitors keep their last palette. The ramp page's example color (`#9D58BA`) stays; on Tailwind v4 it falls between purple and fuchsia, so the first thing a visitor sees is a generated ramp, not a copy of an existing one.

### What is deliberately not changing

*   The interpolation methods, the surface construction, the seed-to-surface mapping, and the Fit and Through modes.
*   The importer's formats and rules.
*   The visual design of the tools. The new sections reuse existing styles.
*   palette-dna. Nothing in the release reads it.

## Alternatives Considered

### Alternative A: Make palette-dna the generator for both pages

*   **Pros**: 233 tests and a fuzzer. It already supports step pinning (`seedStep`), dark mode, tokens, an audit and semantic hues. It is one codebase instead of two.
*   **Cons**: It measured worse on the job the pages do:
    *   median 1.45 against 1.26
    *   90th percentile 5.00 against 4.05
    *   seed on the wrong step in 30% of cases against 22%
    *   On deliberate exceptions such as Radix amber's bright steps 9–10, it misses by up to 23 where topology misses by 3–5.

    Its explorer is a 1.3 MB bundle, against the pages' current size of about 150–220 KB.
*   **Reason for Rejection**: The pages' promise is fidelity to a palette's own shape, and topology does that better. palette-dna remains the source for features the pages may adopt later.

### Alternative B: Offer even step spacing, or make it the default

*   **Pros**: Even spacing gives a more regular ramp: palette-dna measures spacing variation falling from 0.36 to 0.03 across its 13 references. Some designers want that.
*   **Cons**: It moves steps away from where designers put them. The median error rises from 1.45 to 2.40, and Radix's from 1.05 to 13.2. That contradicts the premise the pages are built on.
*   **Reason for Rejection**: Not as a default (Non-Goals). An opt-in toggle is not needed to deliver this release's goals, so it is not added now.

### Alternative C: Keep the engine embedded in each page

*   **Pros**: Each page stays a single file that works offline and can be saved. There is no cache mismatch between a page and its engine.
*   **Cons**:
    *   Step pinning would have to be written twice, by hand, in identical 719-line blocks.
    *   The evidence script would keep extracting code from HTML with a regular expression.
    *   Nothing stops the two copies drifting apart.
*   **Reason for Rejection**: G2 changes the engine, and two hand-synced copies are where the next defect would come from. The release version on each script URL handles the cache concern.

### Alternative D: A build step that inlines one source into both pages

*   **Pros**: One source, and each published page is still a single file.
*   **Cons**:
    *   It adds a build to a site that has none.
    *   Built pages must be committed, because GitHub Pages runs Jekyll, not Node.
    *   Forgetting to rebuild ships a stale engine without any warning.
*   **Reason for Rejection**: Shared classic scripts get one source with no build, and the evidence check catches measurements that no longer match the engine.

### Alternative E: Load palette data with `fetch` from a JSON file

*   **Pros**: Plain JSON is easier for other tools to read than a script that assigns a variable.
*   **Cons**:
    *   Start-up becomes asynchronous.
    *   Both controllers and both test harnesses would need restructuring.
    *   Opening the page from disk (`file://`) stops working in most browsers.
*   **Reason for Rejection**: Too much churn for no visitor benefit. `palettes.js` stays readable as JSON after its first line.

### Alternative F: Keep the current filenames and change only titles

*   **Pros**: No redirects and no risk to existing links.
*   **Cons**: The shared link is the first thing the audience sees, and `color-intelligence.html` and `color-ramp.html` would carry the old identity into every post. The evidence page would have no shared home with the tools.
*   **Reason for Rejection**: The redirect pages cost a few lines each and keep every existing link, including the state in the URL hash, working.

### Alternative G: A family landing page as the link to share

*   **Pros**: One place for the story, with both tools and the evidence one click away.
*   **Cons**: One more page to maintain, and an extra click between the reader and the tool. Visitors from a shared link want to try the tool first.
*   **Reason for Rejection**: The ramp page is the lead and carries its own explainer (G4). The map and evidence pages are linked from it.

### Alternative H: Pin the seed to the documented key step automatically, or always ask for a step

*   **Pros**: Errors from the seed landing on the wrong step would disappear for palettes that document a key step (Tailwind 500, Radix 9, Carbon 60, Primer 5).
*   **Cons**: A brand color is not always a palette's key step. A pale brand color forced to 500 would distort the ramp. Always asking adds a decision for everyone, when automatic placement is right 78% of the time.
*   **Reason for Rejection**: D5. Automatic stays the default, and pinning is one optional control.

### Alternative I: Put the explainers on a separate About page

*   **Pros**: The tool pages stay uncluttered.
*   **Cons**: Visitors arrive on the tool from a shared link and never open a separate page. The current lack of explanation is exactly this problem.
*   **Reason for Rejection**: The explanation sits where the reader is. The full method lives on the evidence page.

### Alternative J: Keep citing the existing surface hold-out as the accuracy claim

*   **Pros**: No new measurement work, and the numbers already exist.
*   **Cons**: It measures rebuilding a palette's own ramps at full saturation, not the seed-anchored ramp people export. The ramp page already says so. An expert reader would catch the gap.
*   **Reason for Rejection**: G1 requires a claim measured on the output people get.

### Alternative K: Run the evidence check automatically on every push

*   **Pros**: Stale numbers could not ship without someone noticing.
*   **Cons**: There is no CI for the pages today, and a new workflow is one more thing to maintain on a site where most pushes are data refreshes.
*   **Reason for Rejection**: For a one-person site with a release checklist, running `node scripts/check-palette-dna-evidence.cjs` by hand is enough. The check has no dependencies, so automating it later is cheap (Future Improvements).

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Work happens in four changes, each verified before the next starts:

1.  Extract the shared engine, with no behavior change.
2.  Add step pinning and change the default palette.
3.  Add the evidence script, page and check, the explainers, and provenance.
4.  Move to the new URLs, add the redirect pages, and update links and images.

Paths are relative to the repository root.

### Target Files to Create/Modify

#### Change 1: extract the shared engine (G6)

##### 1. `assets/palette-dna/engine.js` (Create)

*   **Type / Scope**: Browser script (classic, no modules), shared by both pages.
*   **Proposed Changes**: Move the `var Engine = (function () { … })();` block verbatim from `color-ramp.html` (lines 374–1093; identical in `color-intelligence.html`). Replace the stale header comment ("Uses Engine (src/engine.js) unchanged", which names a file that does not exist) with one line saying both pages load this file. No logic changes in this change.

##### 2. `assets/palette-dna/importer.js` (Create)

*   **Type / Scope**: Browser script, shared.
*   **Proposed Changes**: Move the `var Importer = (function () { … })();` block verbatim (156 lines; identical in both pages).

##### 3. `assets/palette-dna/palettes.js` (Create)

*   **Type / Scope**: Browser script containing data.
*   **Proposed Changes**: `var PALETTES = [ … ];` holding the 12-palette JSON now inlined as `id="pals"` (ramp page) and `id="palettes"` (analyzer). The two copies are byte-identical today. Keep it formatted as JSON after the first line so other tools can read it by stripping that line.

##### 4. `color-ramp.html` (Modify)

*   **Type / Scope**: Page.
*   **Proposed Changes**: Delete the inline engine, importer and palette-JSON scripts. Add three `<script src>` tags, all with the same `?v=<release date>`, before the controller script. In the controller, replace `JSON.parse($('pals').textContent)` with `PALETTES.slice()`.

##### 5. `color-intelligence.html` (Modify)

*   **Type / Scope**: Page.
*   **Proposed Changes**: Same as item 4, for the `id="palettes"` element and its `JSON.parse` call.

##### 6. `tests/color-ramp.test.cjs` and `tests/color-intelligence.test.cjs` (Modify)

*   **Type / Scope**: Node tests (`node:test`, `vm`).
*   **Proposed Changes**:
    *   The script collector resolves `<script src="…">` (ignoring the `?v=` query) to the local file and runs it in the same context, in document order.
    *   The ramp harness reads palette data from `PALETTES` instead of the `pals` element's text.
    *   New test in each file: the page loads exactly `palettes.js`, `engine.js` and `importer.js` from `assets/palette-dna/`, in that order, and all three carry the same `?v=` value.
    *   Record a fixture, `tests/fixtures/gen-anchors.json`: for every built-in palette and three seeds (light, mid, dark), save the `genAnchors` output from the extracted engine. Change 2 tests against it.

**Exit check for change 1:** all 21 existing tests pass, and the comparison harness gives identical `results.json` numbers when pointed at the extracted `engine.js`.

#### Change 2: step pinning (G2) and the default palette (D3)

##### 7. `assets/palette-dna/engine.js` (Modify)

*   **Type / Scope**: Engine.
*   **Proposed Changes**: Inside `M.genAnchors(seeds, opts)`, keep the existing filter and the light-to-dark sort. Replace the "each seed claims the nearest free step" loop with:

    ```text
    pinned = seeds with a finite integer s.step in [0, n-1]   (at most one is expected)
    for each pinned seed p, in sorted order:
        if any lighter seed must take an index >= p.step, or any darker seed an index <= p.step:
            reject: drop p.step, record reason "order"
    assign: pinned seeds take p.step; every other seed takes the nearest free index
            between its neighbours' indices (existing nearest-by-lightness rule, bounded)
    result.pin = { requested: step|null, applied: step|null, reason: null|"order"|"range" }
    ```

    `result.pin` is a property on the returned array, so current callers that only iterate are unaffected. Lightness rescaling and chroma interpolation are unchanged. With no `step` on any seed, the output is identical to before, which item 10 tests.

##### 8. `color-ramp.html` (Modify)

*   **Type / Scope**: Page controller and markup.
*   **Proposed Changes**:
    *   **Markup.** After the "Your color" field, add `<label for="step">Step for your color</label>` with `<select id="step">`. The first option is "Automatic (closest in lightness)" with value `""`, followed by the current palette's steps. Below it goes a hint `<p class="hint" id="stephint">`.
    *   **State.** Add `st.s1` (a step key or `null`) and include it in `hashOf()` (`#r2=` JSON) and in the `rk.state` save and load. When it is missing, it is `null`, so old links and saved state still load.
    *   **Generation.** In `generate()`, set `seeds[0].step = pal.steps.indexOf(st.s1)` when `st.s1` is set. Skip the authored-ramp branch (`kind: 'exact'`) when `st.s1` is set and differs from the authored step.
    *   **Palette change.** If `st.s1` is not in the new palette's steps, set it to `null` and add a note: "Step {s} doesn't exist in {palette}, so the step is automatic again."
    *   **Verdict wording.**
        *   Pinned and applied: "Input 1 is preserved at step {s}, the step you chose."
        *   Automatic: "Input 1 is preserved at step {s}, the closest step in lightness. Choose a step to change this."
        *   Rejected: "Step {s} would put a lighter color below a darker one, so the step was chosen automatically."
    *   **Default palette.** Change `pal: 'flexoki'` to `pal: 'tailwind4'` in the initial `st`. Saved and linked state still take precedence.

##### 9. `color-intelligence.html` (Modify)

*   **Type / Scope**: Page controller.
*   **Proposed Changes**: Default palette only. Replace both `loadPalette('flexoki')` calls (lines 2351 and 2380) with `'tailwind4'`. No step control in this release (G2).

##### 10. `tests/color-ramp.test.cjs` and `tests/color-intelligence.test.cjs` (Modify)

*   **Type / Scope**: Node tests.
*   **Proposed Changes**: Add tests (all in the ramp test, except the map page's first-visit test) for:
    *   **No pin, no change.** Across all palettes, unpinned `genAnchors` output equals the output recorded before change 2 (a fixture written in change 1).
    *   **The pin is applied.** A Tailwind v4 seed pinned to `500` lands at index 5 exactly.
    *   **Order conflicts are rejected.** A pale seed pinned to `950` with a second, darker seed returns `pin.reason === 'order'` and falls back to automatic placement.
    *   **The pin beats the authored ramp.** Tailwind `blue-500` pinned to `600` does not return the authored ramp.
    *   **A palette change resets the pin.** It shows the reset note.
    *   **Links and saved state.** `s1` round-trips through `#r2=`, and old `#r2=` links without `s1` still load.
    *   **First visit.** With no state, each page loads Tailwind v4.

#### Change 3: evidence, explainers and provenance (G1, G4, G5)

##### 11. `scripts/palette-dna-evidence.cjs` (Create)

*   **Type / Scope**: Plain Node script, CommonJS, no dependencies. Not published (`scripts/` is excluded).
*   **Proposed Changes**: Port the topology and baseline parts of `reviews/color-tools/engine-comparison/run.mts`. The palette-dna parts are dropped.
    *   **Inputs.** Load `assets/palette-dna/engine.js` and `palettes.js` with `vm` (no extraction from HTML).
    *   **Runs.** `topology` (automatic), `topology-pinned` (seed `step` set to the designers' step), and `nearest-ramp`.
    *   **Headline set.** Every palette whose `provenance` is not `chart`.
    *   **Output.** Write `assets/palette-dna/evidence.json`, structured as:

        ```text
        { generated: ISO date, inputs: { engine: sha256, palettes: sha256 },
          n: { ramps, palettes },
          pooled:  { <engine>: { median, p90, within1, within2, seedAgree } },
          palette: { <id>: { <engine>: { median, within1 } } },
          ramps:   [ { pal, ramp, seedStep, truth[], <engine>: { colors[], err[], placed } } ] }
        ```

    *   **Page.** Render `palette-dna/evidence.html` from `scripts/palette-dna-evidence-template.html`.

##### 12. `scripts/palette-dna-evidence-template.html` (Create)

*   **Type / Scope**: HTML template for the published evidence page.
*   **Proposed Changes**: Start from `reviews/color-tools/engine-comparison/page-template.html`.
    *   Show the topology runs (automatic and pinned) and the baseline. Drop the palette-dna columns.
    *   Add one line linking to the dated engine comparison for readers who ask why this engine.
    *   Add a "Method" section: what is held out, the seed choice (most colorful step), what is scored, and why the seed step is excluded.
    *   Add a "Reproduce" section with the exact commands.
    *   Add the site's top bar and theme toggle so the page matches the tools.
    *   The ramp-by-ramp viewer stays as it is.

##### 13. `palette-dna/evidence.html` and `assets/palette-dna/evidence.json` (Create, generated)

*   **Type / Scope**: Generated and committed. Published.
*   **Proposed Changes**: Output of item 11. Never edited by hand.

##### 14. `scripts/check-palette-dna-evidence.cjs` (Create)

*   **Type / Scope**: Plain Node script, no dependencies; the release check.
*   **Proposed Changes**: Exit 1 and list every problem if any of these holds:
    *   `evidence.json`'s input hashes do not match the current `engine.js` or `palettes.js`
    *   any `data-evidence="<path>"` element in `palette-dna/ramp.html` or `palette-dna/map.html` has text that differs from the formatted value at that path in `evidence.json` (percentages with no decimals, ΔE values with two)

##### 15. `assets/palette-dna/palettes.js` (Modify)

*   **Type / Scope**: Data.
*   **Proposed Changes**: Add `provenance: { kind, source }` to each palette.
    *   `material3`: `generated`, citing material-color-utilities.
    *   `primer`: `tool-assisted`, citing GitHub's Prism article.
    *   `meridian-light` and `meridian-dark`: `chart`, citing the Kendo theme.
    *   **The rest: verify before labeling.** Flexoki, Tailwind v3/v4, Radix, Open Color, Carbon, Polaris and Atlassian get `designer-tuned` only with a source link to the author's own description of how the palette was made. Otherwise they get no `provenance` field. The checking is a task within this item, done before the item is complete. The value is never guessed.
    *   Imported palettes get no `provenance`.

##### 16. `color-ramp.html` → becomes `palette-dna/ramp.html` in change 4 (Modify)

*   **Type / Scope**: Page copy and markup.
*   **Proposed Changes**: Rename the `h1` and `<title>` to "Palette DNA Ramp". Replace the lede, and add three sections between the reference panels and "How it works", using the existing `.notes` styling. Draft copy, written into the page as follows:
    *   **Lede:** "Turn one color into a full ramp shaped like a palette you trust: Tailwind, Radix, Flexoki or your own. For designers extending a brand or a design system."
    *   **"Why borrow a palette's shape"**:
        *   "The best-known palettes were tuned by hand, hue by hue. Formula generators apply the same rule at every hue, which is consistent but smooths those decisions away."
        *   "In our tests, a generated palette (Material 3) is far easier to predict than hand-tuned ones like Flexoki (median error <span data-evidence="palette.material3.topology.median">0.34</span> against <span data-evidence="palette.flexoki.topology.median">2.27</span>)."
        *   "This tool reads a palette's shape and fills in the hue you need. We hid each of <span data-evidence="n.ramps">125</span> real ramps and rebuilt it from a single color: <span data-evidence="pooled.topology.within1">68%</span> of the rebuilt steps were within one just-noticeable difference of what the designers shipped, against <span data-evidence="pooled.nearest-ramp.within1">56%</span> for copying the nearest ramp. [How we measured]"
    *   **"Compared with"** (a table with three columns: Tool, Best at, This adds):
        *   Radix custom palettes: best at a Radix-shaped scale from a brand color. This adds: any reference palette, including your own.
        *   Harmony and Leonardo: best at steps that meet contrast targets. This adds: the shape of a hand-tuned palette.
        *   Material Theme Builder: best at a full Material theme. This adds: non-Material shapes.
        *   Tailwind-style generators: best at a Tailwind-like scale. This adds: reporting how your color was changed.
    *   **"When not to use it"**:
        *   You need every step to meet a contrast target: use Harmony or Leonardo.
        *   You need dark-mode tokens: not supported yet.
        *   Your palette has fewer than four colored ramps.
        *   You are working with chart colors.

    In "How it works", remove the sentences these sections now repeat. Add the provenance kind to `#palmeta` when present.

##### 17. `color-intelligence.html` → becomes `palette-dna/map.html` in change 4 (Modify)

*   **Type / Scope**: Page copy and markup.
*   **Proposed Changes**:
    *   **Rename.** The `<title>` and the visible name in the top bar become "Palette DNA Map". The social title is "Palette DNA Map: the shape of a color palette".
    *   **Top of the page.** Add an `h1` and a lede before the 3D view: "See a palette's shape: where it has real colors, where the model is filling in, and how well each hue can be rebuilt from its neighbors. For people who want to study a palette before borrowing it. To make a ramp, use [Palette DNA Ramp]."
    *   **Shared sections.** Add the same "Why borrow a palette's shape" paragraph (sharing `data-evidence` keys) and a link to the evidence page.
    *   **Wording.** Replace every visible "topology", and correct "twelve" or "ten" counts to come from `PALETTES.length` where they are computed, or to the literal current count where they are static text.

##### 18. `tests/color-ramp.test.cjs` and `tests/color-intelligence.test.cjs` (Modify)

*   **Type / Scope**: Node tests.
*   **Proposed Changes**: Add one test per page: every `data-evidence` element exists, and its key is present in `evidence.json`. The value comparison is item 14's job.

#### Change 4: names, URLs, redirects and links (G3)

##### 19. `palette-dna/ramp.html` and `palette-dna/map.html` (Create via `git mv`)

*   **Type / Scope**: Pages.
*   **Proposed Changes**:
    *   `git mv color-ramp.html palette-dna/ramp.html` and `git mv color-intelligence.html palette-dna/map.html`, to keep history.
    *   Prefix every relative URL with `../`: `assets/…`, `./` and the cross-links. The script `src` values become `../assets/palette-dna/…`.
    *   Update `canonical`, `og:url`, `og:image` and `twitter:image` to the new URLs.
    *   Cross-links: the ramp page's nav links to "Palette DNA Map", and the footer says "Built on the Palette DNA engine. Palettes belong to their authors; see each one's license."

##### 20. `color-ramp.html` and `color-intelligence.html` (Create as redirect pages)

*   **Type / Scope**: Static redirect pages, recreated at the old paths after the move.
*   **Proposed Changes**: Each page contains only:
    *   a `<link rel="canonical">` to the new URL
    *   `<meta name="robots" content="noindex">`
    *   one inline script: `location.replace('palette-dna/ramp.html' + location.search + location.hash)` (`map.html` for the analyzer)
    *   a `<noscript>` link, and the same link as visible text, for browsers without JavaScript

    There is no `meta refresh`, because it would fire before the script and drop the hash.

##### 21. `og-palette-dna-ramp.png` and `og-palette-dna-map.png` (Create), plus their sources `reviews/color-tools/social/ramp.html` and `map.html` (Create)

*   **Type / Scope**: Social preview images, 1200×630, and their HTML sources.
*   **Proposed Changes**:
    *   **Ramp image.** Rebuild from `reviews/color-ramp/social-preview.html`. Change the name to "Palette DNA Ramp" and the shaping palette to Tailwind v4. Keep the tagline "Your color. A full ramp. Shaped by a palette you trust."
    *   **Map image.** Rebuild with the same layout as `og-palette-topology.png`, using a screenshot of the Tailwind v4 surface. Kicker "PALETTE DNA MAP"; the title stays "Mapping the shape of a color palette"; the subtitle says "Twelve design-system palettes as surfaces in Oklab…".
    *   **Old images stay.** The old images are not deleted, because posts already shared still point to them.

##### 22. `index.html`, `lab/index.html`, `measles.html`, `godzilla-el-nino.html` (Modify)

*   **Type / Scope**: Site pages that link to the tools.
*   **Proposed Changes**:
    *   Update `href`s to the new paths (`../palette-dna/…` in `lab/`).
    *   Update the card titles and descriptions to the new names.
    *   Leave the teaser images and their alt text, which still describe the images accurately.

##### 23. `sitemap.xml` (Modify)

*   **Type / Scope**: Site metadata.
*   **Proposed Changes**: Replace the two old URLs with `palette-dna/ramp.html` and `palette-dna/map.html`, and add `palette-dna/evidence.html`. Set `lastmod` to the release date.

##### 24. `feed.xml` (Modify)

*   **Type / Scope**: Site metadata.
*   **Proposed Changes**: Point each item's `<link>` to the new URL and update its title. Leave `<guid>` unchanged, so feed readers do not show the items again as new.

##### 25. `_config.yml` (Modify)

*   **Type / Scope**: Publishing configuration.
*   **Proposed Changes**: Add `docs/`, `reviews/` and `tests/` to `exclude`, with a comment saying they are working files. This lands in change 1, not change 4, so this design document is never published.

##### 26. `tests/color-ramp.test.cjs`, `tests/color-intelligence.test.cjs`, `tests/color-intelligence-mobile.html` (Modify)

*   **Type / Scope**: Tests.
*   **Proposed Changes**: Point each file at the new path. The test filenames stay, to keep history; update their header comments.

##### 27. `tests/redirects.test.cjs` (Create)

*   **Type / Scope**: Node test.
*   **Proposed Changes**: For each old page, run its inline script in a `vm` context with a stand-in `location` whose `hash` is `#r2=…` and whose `search` is `?x=1`. Assert that `replace` is called with the new path plus both. Also assert the canonical link and `noindex` are present.

##### 28. `color/README.md` (Modify)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: Add a short section "Relationship to the site". The pages use the topology engine in `assets/palette-dna/engine.js`, chosen by the seeded hold-out. This library was compared against it on 2026-11-04 (see `reviews/color-tools/engine-comparison/`) and supplies future features (Future Improvements). Note the local-storage keys (`pt.user`, `pt.state`, `rk.state`, `theme`) and that they are deliberately unchanged.

##### 29. `reviews/color-tools/engine-comparison/README.md` (Modify)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: Add a first line saying this folder is a snapshot from 2026-11-04, superseded for the release evidence by `scripts/palette-dna-evidence.cjs` and the published `palette-dna/evidence.html`. It remains the only place where palette-dna is compared.

### Verification Plan

*   **Compilation/Build**: None. The site has no build, and the evidence scripts are plain Node.
*   **Unit Tests**:
    *   `node --test tests/*.test.cjs` passes after each of the four changes: all 21 existing tests plus the new ones in items 6, 10, 18 and 27.
    *   `cd color && npm test` still passes 233 tests; the library is not modified.
*   **Evidence**:
    *   After change 1: `node scripts/palette-dna-evidence.cjs` reproduces the 2026-11-04 topology and baseline numbers exactly. That run confirms the extraction changed nothing.
    *   After change 2: the pinned run places 100% of seeds on the designers' step, with a median of 1.26 or lower (G2).
    *   Before release: `node scripts/check-palette-dna-evidence.cjs` exits 0.
*   **Static Analysis & Linting**: `git diff --check`. Search the published pages for the words "topology", "harmonious" and "Ramp from one color"; none may remain.
*   **Test Coverage Requirement**: Every new branch in `genAnchors` (no pin, pin applied, order rejection, out-of-range) and every new verdict wording is exercised by a test.
*   **E2E/Integration** (Playwright, against a local static server):
    *   Both pages at 320, 390 and 1280 px in light and dark, with no horizontal scroll.
    *   A first visit loads Tailwind v4.
    *   Pinning 500 on the ramp page moves the anchor ring to 500, and the CSS export matches the displayed swatches.
    *   An old `color-ramp.html#r2=…` link lands on `palette-dna/ramp.html` with the same colors, step and palette.
    *   An imported palette created before the move is still listed after it.
*   **Manual before sharing**:
    *   Check both new social images in a link-preview tool.
    *   Read the explainer copy once on a phone.

--------------------------------------------------------------------------------

## Future Improvements

*   **Sibling hue suggestions for a brand color.** Bring in palette-dna's `deriveSemanticHues`, describing it as what it measures (distance between hues for people with and without color-vision deficiencies), not as "harmony" (D2).
*   **Dark mode and tokens.** Generate a matching dark ramp and semantic tokens using palette-dna's `solvePair` and `buildTokens`.
*   **Step pinning on the map page.** Add the same step menu for the primary seed in the map page's seed mode. The engine already supports it.
*   **Pin the second color.** Extend step pinning to the second input once single-color pinning has real use.
*   **CI for the color pages.** Run both page tests and the evidence check in a GitHub Actions workflow on changes to `assets/palette-dna/` or `palette-dna/`.

--------------------------------------------------------------------------------

*Drafted with EGM*
