# Goldfish Review Report: Stage 6 (Comprehension Test)

**Target:** `docs/designs/palette-dna-tools.md` (FeatureRange 1–356, DetailedRange 357–655)
**Reviewer:** `egm-comprehension`, fresh context, Re-implementation Standard
**Verdict:** Needs revision. A newcomer can explain what is being built and why. The document does not yet pass the re-implementation standard. 1 Blocker, 17 Major, 12 Nits.

**Spot-checks by the Elephant:**

*   B1 and M2 are confirmed against the text.
*   On M16, the two figures happen to be the same number:
    *   the pooled step median for topology is 1.26;
    *   the median of per-ramp mean error over the unshifted ramps is also 1.26.

    They are different statistics, so the finding stands: the document must name which one G2 uses.

## Prioritized Findings

### B1. The gates between changes cannot run in the order given. Severity: Blocker

*   **Affected Scope:** lines 359–364, 406, 628–630; item 14 (495–500).
*   **Discrepancy:**
    *   The verification plan says change 1 is confirmed with `scripts/palette-dna-evidence.cjs`, but that script is only created in change 3 (item 11).
    *   Line 406 gives a different change 1 gate: the old harness.
    *   G2 is checked "after change 2" with a pinned run that only exists in change 3.
    *   Item 14 (change 3) reads `palette-dna/*.html`, which only exist after change 4.
*   **Recommendation:** Move the evidence script into change 1 (or 2), or rewrite the change 1 and change 2 gates so they can run. In change 3, have the check read the current page paths.

### M1. The pin rejection API is stated two ways. Severity: Major

*   **Affected Scope:** line 178 compared with 422–425.
*   **Discrepancy:** One place says the engine returns `pinRejected: true`. The other sets `result.pin = {requested, applied, reason}`. The document also does not say:
    *   whether `result.pin` exists when no pin was asked for;
    *   what happens when `genAnchors` returns `null` (all seeds neutral).
*   **Recommendation:** Choose one contract and define both cases.

### M2. The order rule example contradicts the pseudocode. Severity: Major

*   **Affected Scope:** line 177 compared with 418–419 and 452.
*   **Discrepancy:** In the example, a pale seed is pinned to 900 while a darker seed sits at 500. Under the pseudocode that is not rejected, because the darker seed can still take 950. The test at line 452 matches the pseudocode. "Must" and "between its neighbours' indices" are undefined.
*   **Recommendation:** Define rejection as "no valid index remains for some other seed". Fix the example, and spell out the bounds for seeds lighter and darker than the pin.

### M3. The `"range"` reason has no behavior. Severity: Major

*   **Affected Scope:** lines 416, 422, 632.
*   **Discrepancy:** The pseudocode silently filters out-of-range steps and never sets `"range"`, yet a test for it is required and no wording exists for it.
*   **Recommendation:** Define the behavior, or drop `"range"`, since the menu can only offer valid steps.

### M4. Pinned-seed edge cases are not defined. Severity: Major

*   **Affected Scope:** lines 174–180 and 433; `color-ramp.html` 854, 857, 1322–1340.
*   **Discrepancy:** The plan does not say what happens when the pinned input is gray, or is dropped as a near-duplicate of input 2. It also does not say whether pinning applies in Fit mode.
*   **Recommendation:** Specify the pin outcome and the verdict wording for each case.

### M5. Verdict and hint copy is incomplete. Severity: Major

*   **Affected Scope:** lines 186, 431, 434–438.
*   **Discrepancy:**
    *   No wording for a pinned input that is approximated (Fit mode, clipping or `clampedL`).
    *   No wording for input 2, or for a `"range"` rejection.
    *   The `#stephint` text is never given.
    *   The plan does not say where the palette-change note appears.
*   **Recommendation:** List every string and where each appears.

### M6. Loading the step from a link or saved state has no validation rules. Severity: Major

*   **Affected Scope:** line 432; `color-ramp.html` 1472–1497.
*   **Discrepancy:** The plan does not say what happens when `s1` from a link or saved state is not a step of the loaded palette, or what type `s1` has.
*   **Recommendation:** Say that `s1` is a step-key string. When it is invalid, say whether to reset it with the note or treat the whole link as invalid.

### M7. The evidence port names the wrong source for the metrics. Severity: Major

*   **Affected Scope:** items 11–12; line 254.
*   **Discrepancy:**
    *   The pooled statistics, the "placed" step, the headline-set exclusion and the quantile definition `floor(p·n)` all live in `build-page.py`, not `run.mts`.
    *   `seedAgree`, `placed` and `colors[]` are undefined.
    *   It is unclear whether chart palettes appear in `palette.*` and `ramps[]`.
    *   The topology mode (Through, `cap: false`) is not stated.
*   **Recommendation:** Name both source files and define each field.

### M8. Core measurement terms are never defined in the document. Severity: Major

*   **Affected Scope:** lines 34, 38, 54, 472, 485.
*   **Discrepancy:** None of these are explained in the document itself:
    *   ΔE OK ×100
    *   1 JND = 2
    *   whether "within" means `< 2`
    *   `within2`
    *   "seeded hold-out"
    *   what is held out (lofted ramps)
    *   the seed choice (the most colorful monotone step)
    *   the exclusion of the seed step
*   **Recommendation:** Add a short Method paragraph in the feature range.

### M9. The check's formatting rule doesn't cover every value type. Severity: Major

*   **Affected Scope:** line 500 and lines 519–520.
*   **Discrepancy:** The check cannot tell which keys are percentages, whether `within1` is stored as 0.68 or 68, or whether `%` is compared. Counts such as `n.ramps` are not covered.
*   **Recommendation:** Add a formatting table by key suffix.

### M10. The "no topology" search will fail by design. Severity: Major

*   **Affected Scope:** line 631 compared with 240, 465, 483, 519–520.
*   **Discrepancy:** The evidence keys, the run names and the evidence-page text all contain "topology". This matches Stage 5 M1.
*   **Recommendation:** Rename them, and scope the search.

### M11. The map page does not get the structure G4 requires. Severity: Major

*   **Affected Scope:** G4 61–68; line 218; item 17 (537–541).
*   **Discrepancy:** The map page gets no "Compared with" and no "When not to use it".
*   **Recommendation:** Add both sections to item 17, or narrow G4 and section 4.

### M12. The draft copy breaks the G5 provenance rule. Severity: Major

*   **Affected Scope:** G5 69; item 15 509; item 16 518–519; D3 86; line 34.
*   **Discrepancy:** The copy calls Flexoki and Atlassian "hand-tuned" before item 15 verifies them.
*   **Recommendation:** Make the copy conditional on that verification, and give fallback wording if it fails.

### M13. The existing accuracy disclaimers are not addressed. Severity: Major

*   **Affected Scope:** items 8 and 16; `color-ramp.html` 1377 and 352; CUJ 2 (111).
*   **Discrepancy:**
    *   The verdict sentence ("hold-outs do not establish an accuracy estimate") and the "How it works" text contradict the new claim, and no item replaces them. This matches Stage 5 N3.
    *   CUJ 2 promises information about rebuilding the palette's own ramps on the ramp page, which no item implements.
*   **Recommendation:** Replace those sentences, and align CUJ 2 with the plan.

### M14. The test-harness changes don't fit the map test. Severity: Major

*   **Affected Scope:** items 6 and 10 (401–403, 456).
*   **Discrepancy:** `tests/color-intelligence.test.cjs` does not run scripts in document order. It extracts `Engine` and `Importer` by text, reads `id="palettes"` directly, and never runs the controller (which needs Plotly). A "first visit loads Tailwind v4" test therefore cannot be written there without restructuring it.
*   **Recommendation:** Describe each harness change separately.

### M15. Change 1's exit check against the old harness isn't runnable as written. Severity: Major

*   **Affected Scope:** line 406; G6 line 70.
*   **Discrepancy:** `extract-engine.py` fails once the engine leaves the page, and `run.mts` needs `color/node_modules`. G6 says the comparison harness runs against the shared file, while item 29 freezes it as a snapshot.
*   **Recommendation:** Define a runnable change 1 gate, and correct G6.

### M16. The G2 threshold uses one number for two different medians. Severity: Major

*   **Affected Scope:** lines 39, 57, 74, 192.
*   **Discrepancy:** The pooled median and the unshifted per-ramp median are different statistics. The document does not say what happens if the pinned run misses the threshold, given that tuning the engine is a non-goal.
*   **Recommendation:** Name the statistic and give the fallback.

### M17. The "release checklist" does not exist. Severity: Major

*   **Affected Scope:** lines 168 and 353; G1.
*   **Discrepancy:** Nothing in the repository defines a release checklist. G1 says the check compares against "a fresh run", but the check only compares file hashes.
*   **Recommendation:** Define the checklist (where it lives and its steps), and reword G1. This overlaps with Stage 5 M2.

## Nits

*   **N1. Labels differ between sections.** Lines 184 and 431 give two step-menu labels and two Automatic wordings. The section heading also differs: "Why hand-tuned shapes" (line 221) against "Why borrow a palette's shape" (line 517).
*   **N2. The redirect script differs between sections.** Line 204 uses `newPath + location.hash`, and item 20 adds `location.search`.
*   **N3. The default-palette fallback is only partly changed.** The ramp page still falls back to `'flexoki'` at `color-ramp.html` 1545 and 1550, after a palette is removed or storage changes.
*   **N4. The count correction is too broad.** Correcting "ten" would wrongly change "the ten palettes behind the calibration" (`color-intelligence.html` 1552), which is accurate.
*   **N5. The social image text and metadata are inconsistent or unspecified.**
    *   The map image title differs from the social title.
    *   "Twelve palettes" is hard-coded, although two of them are chart sets.
    *   The process for turning the HTML sources into PNGs is not given.
    *   The image location and the og/twitter description text are not specified.
*   **N6. The `palettes.js` layout is ambiguous.** "JSON after the first line" breaks if line 1 contains the opening `[`, or if the file ends with `;`.
*   **N7. Provenance details are underspecified.** The `source` type, the citation URLs and the `#palmeta` format are missing. Line 242 implies both pages show it, but only the ramp page is in the plan.
*   **N8. The fixture and test seeds are unspecified.** No seed colors or modes are given, and "Tailwind" does not say v3 or v4.
*   **N9. The cross-link rule is ambiguous.** Prefixing `../` would send the cross-link to the old redirect page instead of the sibling `map.html`.
*   **N10. UI terms are used without definition:** verdict, shift note, family panel, anchor ring, reference panels, seed mode, lofted, interior ramps.
*   **N11. `_config.yml` details.**
    *   The edit is listed under change 4 but lands in change 1.
    *   Its existing comment, which says the palette data is inlined in the pages, goes stale.
*   **N12. Reproduction depends on the repository.** "A single command" (CUJ 3) does not match "commands" (item 12). `scripts/` is not published, so the plan should say whether the repository is public.
