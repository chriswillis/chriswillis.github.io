# Goldfish Review Report: Stage 5 (Initial Zoom Out)

**Target:** `docs/designs/palette-dna-tools.md` (lines 1–655)
**Reviewer:** `egm-zoom-out`, fresh context, Zoom-Out Standard
**Goldfish context:** `docs/designs/palette-dna-tools-context.md`
**Verdict:** Passes with changes. 0 Blockers, 3 Major, 9 Nits.

## What survived scrutiny

*   **The design targets causes, not symptoms.** It addresses the four problems the brief names: an unmeasured claim, step placement, naming and the missing explanation.
*   **One shared engine (G6) matches earlier advice.** The October review recommended it ("share a static asset", `reviews/color-intelligence/consolidated_review_report.md` A13), and the design keeps the site's no-build model.
*   **Existing work is reused.** The plan reuses `run.mts`, `page-template.html` and the viewer, and keeps palette-dna out of the release.
*   **Low-cost choices are proportionate:** loading palette data as a script instead of `fetch`, keeping the storage keys unchanged, and moving to a subfolder (`lab/` already uses `../` paths).

## Prioritized Findings

### M1. "Palette DNA" collides with the `palette-dna` library, and "topology" is not fully dropped. Severity: Major

*   **Reviewer Lens:** `egm-zoom-out`
*   **Affected Scope:**
    *   Overview line 25; D1 line 84; §5 line 252
    *   items 12 (lines 483–484), 17 (line 540), 19 (line 557), 28–29 (lines 614, 619)
    *   verification line 631
*   **Discrepancy Description:**
    *   The family takes the library's name, but the library is not the shipped engine, and the comparison measured it as the weaker of the two.
    *   An expert following CUJ 3 sees "Built on the Palette DNA engine" in the footer, then finds "palette-dna" listed as the engine that lost.
    *   "Topology" survives in run names (`topology`, `topology-pinned`), `data-evidence` keys and the evidence page text. The line 631 search for "topology" would therefore fail on the design's own output.
*   **Rationale & Recommendation:** Decide the engine vocabulary once, as part of D1. For example, call the shipped engine "the Palette DNA engine" and the library "palette-dna (research solver)", or rename the library. Apply that vocabulary to the evidence keys and run names, the evidence page, the footer and both READMEs. Say exactly which files and attributes the line 631 search covers.

### M2. The staleness-check machinery is heavier than G1 needs. Severity: Major

*   **Reviewer Lens:** `egm-zoom-out`
*   **Affected Scope:**
    *   G1 line 54; architecture diagram lines 147–157
    *   §1 line 168; §4 line 240; §5 lines 249–259
    *   items 11, 14 and 18
*   **Discrepancy Description:** G1 says only that the release check fails when the published numbers differ from a fresh run. The design meets that indirectly, with four parts:
    *   a published `evidence.json`
    *   input SHA-256 hashes stored in it
    *   a second script that compares the pages with the JSON and the hashes with the files
    *   a test (item 18) that partly duplicates that script

    A whitespace edit to `engine.js` would fail the release even though the numbers have not changed. `evidence.json` also has nothing that reads it at run time: the pages show literal text, and the comparison page already embeds its data inline.
*   **Rationale & Recommendation:** The run takes about 10 seconds and has no dependencies, so make the check the fresh run itself: `palette-dna-evidence.cjs --check` recomputes the results and compares every `data-evidence` span. Drop the hashes, the second script, item 18 and the published `evidence.json`, and embed the data in `evidence.html`.

### M3. Change 4 publishes URLs built from names Q1 has not decided. Severity: Major

*   **Reviewer Lens:** `egm-zoom-out`
*   **Affected Scope:** Q1 line 92; line 160; §3 table lines 198–202; items 19–24.
*   **Discrepancy Description:** Line 92 says "Changing the names later changes only file names and copy." Once links are shared, a rename means another round of redirect pages, sitemap and feed edits, four pages of link updates, a new social image, and split link history.
*   **Rationale & Recommendation:** Make Q1 a stated gate on Change 4. Alternatively, serve the ramp tool at `palette-dna/` (`index.html`), so the URL people share does not depend on the tool's name. This adds no page.

### N1. The engine's pin interface is described two ways and is more general than needed. Severity: Nit

*   **Affected Scope:** §2 lines 174–180; item 7 lines 413–425; line 632.
*   **Discrepancy Description:** §2 says the engine returns `pinRejected: true`. Item 7 defines `result.pin = {requested, applied, reason: "order"|"range"}`, and §2 never mentions "range". The pseudocode loops over several pinned seeds, but only one can ever be pinned.
*   **Rationale & Recommendation:** Define one result shape for a single pin. Consider using the step key, as palette-dna's `seedStep` does (`color/docs/solver.md:28`).

### N2. Verdict wording appears twice and already differs. Severity: Nit

*   **Affected Scope:** §2 lines 184–186; item 8 lines 431–438.
*   **Discrepancy Description:** §2 says "nearest in lightness" and item 8 says "closest in lightness".
*   **Rationale & Recommendation:** Keep the user-facing strings in item 8 only. §2 describes behavior.

### N3. An existing verdict sentence will contradict the new claim. Severity: Nit

*   **Affected Scope:** items 8 and 16; `color-ramp.html:1377`.
*   **Discrepancy Description:** Every generated ramp currently shows "Reference-surface hold-outs do not establish an accuracy estimate for this anchored ramp". After G1, that contradicts the page's own explainer.
*   **Rationale & Recommendation:** Replace the sentence in item 8 or 16 with one that points to the seeded hold-out result.

### N4. The G2 acceptance bar is weaker than it looks. Severity: Nit

*   **Affected Scope:** lines 39, 56–57, 192, 629.
*   **Discrepancy Description:** "100% of seeds on the designers' step" is true by construction, because a single-seed pin taken from the palette's own steps can never be rejected. The reviewer also questions whether 1.26 is the pooled median or the median of the unshifted cases.
*   **Rationale & Recommendation:** Drop the 100% criterion and say which population 1.26 describes.
*   **Note:** The two figures happen to be the same number, and the reviewer could not tell them apart from the documents. The pooled step median for topology is 1.26, and the median of per-ramp mean error over unshifted ramps is also 1.26 (comparison run, 2026-11-04). The fix is to name the population.

### N5. The evidence page template contains hard-coded numbers. Severity: Nit

*   **Affected Scope:** item 12; item 14; `page-template.html` lines 50 and 66–68.
*   **Discrepancy Description:** The prose contains hard-coded numbers, such as "eleven palettes", "4.05 against 4.76" and "13.2", that no check covers.
*   **Rationale & Recommendation:** Keep the evidence page's prose free of numbers, or generate them from the run.

### N6. Two links point into folders that will not be published. Severity: Nit

*   **Affected Scope:** line 214; item 12 lines 484 and 486; item 25.
*   **Discrepancy Description:** The "dated engine comparison" link points into `reviews/`, and the "Reproduce" commands point into `scripts/`. Both folders are excluded from publishing.
*   **Rationale & Recommendation:** State that both links go to the GitHub repository.

### N7. A Change 3 item depends on files created in Change 4. Severity: Nit

*   **Affected Scope:** lines 359–364; item 14 line 500; item 19.
*   **Discrepancy Description:** The check in item 14 (Change 3) reads `palette-dna/ramp.html` and `palette-dna/map.html`, which only exist after Change 4.
*   **Rationale & Recommendation:** Have the check read the current paths until the move, or move the check into Change 4.

### N8. Some test coverage is duplicated. Severity: Nit

*   **Affected Scope:** item 27 against E2E line 637; item 18 against item 14.
*   **Discrepancy Description:** The redirect script is tested by both a `vm` test and Playwright. Item 18 repeats part of item 14.
*   **Rationale & Recommendation:** Keep one test of each pair. If M2 is adopted, item 18 goes entirely.

### N9. The provenance field is broader than the copy needs. Severity: Nit

*   **Affected Scope:** §4 lines 242–247; item 15.
*   **Discrepancy Description:** The design adds a four-value enum with source links and research into seven palettes, only to fill a meta line.
*   **Rationale & Recommendation:** Mark the three known exceptions (Material 3 generated, Primer tool-assisted, Meridian chart). Verify only the palettes the copy calls hand-tuned: Flexoki and Atlassian, including how Flexoki 2.0's added steps were made. The `designer-tuned` label can wait until it has a use.
