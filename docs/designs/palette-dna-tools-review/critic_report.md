# Goldfish Review Report: Stage 7 (Critic Review)

**Target:** `docs/designs/palette-dna-tools.md`, FeatureRange lines 1–356
**Reviewers:** `egm-design` (Feature Spec Standard), `egm-structural` (Feature Spec Standard), `egm-style` (persona rules). Each ran in a fresh context.
**Raw verdicts:**

*   Design: 6 Major, 9 Nits.
*   Structural: 1 Blocker, 7 Major, 9 Nits.
*   Style: 9 Major, 15 Nits.

**After deduplication:** 1 Blocker, 9 Major, 12 Nits. Several findings repeat Stages 5 and 6; the traceability table at the end shows where.

## Elephant verification (run against `results.json`, 2026-11-04)

The reviewers disagreed with each other, or could not check numbers themselves, so the Elephant recomputed the figures below from `results.json`.

| Statistic (topology, Through, 125 ramps) | Value | Where the doc uses it |
|---|---|---|
| Median error per step, all ramps | **1.26** | Non-Goals, Alt A, D4 context |
| Median error per step, ramps where the seed landed on the designers' step | **1.07** | not in doc |
| Median error per step, ramps where the seed landed elsewhere | **2.46** | doc says 2.92 |
| Median of per-ramp *mean* error, unshifted / shifted | 1.26 / 2.92 | P2 line 39, G2 line 57 |
| Within 1 JND, excluding Material 3 (113 ramps) | **67%** (baseline 55%) | doc says 68% / 56% including it |

**Conclusion:** the reviewers are right about M2 below. Line 39 compares two medians of per-ramp means, while G2 and Non-Goals use the per-step median. At the per-step level the figures are 1.07 against 2.46. Taking out the generated control palette changes the headline by only one point.

## Prioritized Findings

### B1. There is no Risks & Mitigations section. Severity: Blocker

*   **Reviewer Lens:** `egm-structural` (Blocker), `egm-design` (Major)
*   **Affected Scope:** the whole FeatureRange.
*   **Discrepancy:** The Feature Spec Standard requires failure modes, security implications, limits and mitigations. Some mitigations are scattered in the text (cache, URL hash, storage, stale evidence, feed GUIDs). These risks are never stated:
    *   The pages can no longer be saved and used offline as single files. This appears only as a Pro of rejected Alternative C.
    *   Plotly, about 3.5 MB from cdnjs, loads on the map page for mostly mobile social traffic.
    *   Review and design files are currently public on cewillis.com.
    *   Experts may push back on the claims.
    *   Renaming the tools after release if Q1 resolves late.
    *   The evidence script's own logic is not covered by the staleness check.
    *   A user pin can distort a ramp (see M3).
    *   A cached old page fetches a new `engine.js`. GitHub Pages ignores query strings, so `?v=` protects only one direction.
    *   The redirect pages only work with JavaScript.
*   **Recommendation:** Add an H2 "Risks & Mitigations" table (Risk, Impact, Mitigation and where it lives, Accepted residual) between the Technical Plan and Alternatives.

### M1. "Topology" and "palette-dna" are each used for two things. Severity: Major

*   **Reviewer Lens:** `egm-style` M1, M2, M3; `egm-structural` 15 (overlaps Stage 5 M1, Stage 6 M10)
*   **Affected Scope:** lines 16, 25, 41, 74, 84, 155, 164, 192, 240, 252, 270, 274–284.
*   **Discrepancy:**
    *   D1 says "topology" is dropped everywhere. The doc still uses it, and so do the published run names and the `data-evidence` keys.
    *   "palette-dna" names both the rejected library and the new site family. On the evidence page, "Palette DNA" tools would be measured against "palette-dna" and appear to beat it.
    *   The Overview says palette-dna "supplies features", but line 270 says nothing in the release reads it.
*   **Recommendation:**
    *   Define the terms once in the Overview: "Palette DNA (the site tools and their engine)" and "the palette-dna library (`color/`)". Consider renaming the library.
    *   Scope D1 to visitor-facing text, and rename the published run names and keys.
    *   Reword line 25 to say "later releases may adopt its features".

### M2. 1.26 is used for two statistics, and G2's bar is miscalibrated. Severity: Major

*   **Reviewer Lens:** all three reviewers (overlaps Stage 5 N4, Stage 6 M16)
*   **Affected Scope:** lines 39, 56–57, 74, 192, 278.
*   **Discrepancy:**
    *   Line 39 uses medians of per-ramp means (1.26 against 2.92). G2 uses the pooled per-step median.
    *   The per-step median for correctly placed seeds is 1.07, so "≤ 1.26" is a loose bar.
    *   "100% on the designers' step" is true by construction, because the run pins the true step with a single seed.
    *   Line 56 has a dangling modifier ("Pinned to the designers' step, the seeded hold-out…").
*   **Recommendation:**
    *   Use one statistic throughout: the per-step median.
    *   Restate line 39 as "1.07 when the seed lands on the designers' step, 2.46 when it does not".
    *   Set G2's bar at ≤ 1.07, or within a stated tolerance of it.
    *   Make the 100% criterion a regression test.
    *   Say what happens if the bar is missed, given that tuning the engine is a non-goal.

### M3. A pin can silently produce a degenerate ramp. Severity: Major

*   **Reviewer Lens:** `egm-design` 3, 9
*   **Affected Scope:** lines 174–188; Alternative H (331–335).
*   **Discrepancy:**
    *   Alternative H rejects automatic key-step pinning because a pale color forced to 500 distorts the ramp, yet a manual pin can do the same.
    *   With a single seed, the order rule never fires. A pale seed pinned to 900 squeezes steps 50–800 into a narrow lightness band, and the verdict still says "preserved".
    *   The near-duplicate filter (line 857) can drop the pinned seed with no `pinRejected`.
*   **Recommendation:**
    *   Define a guard: warn, or reject, when the seed's lightness is far from the palette's lightness for that step, or when adjacent steps fall below a minimum separation.
    *   Make the duplicate filter keep the pinned seed.
    *   Add a test for a pale seed pinned dark. Optionally, measure the cost of pinning to k±2.

### M4. Excluding `reviews/` breaks the evidence trail the design relies on. Severity: Major

*   **Reviewer Lens:** `egm-design` 4; `egm-structural` 5 (overlaps Stage 5 N6)
*   **Affected Scope:** lines 25, 214, 252; Alternatives A and B; item 12.
*   **Discrepancy:**
    *   Once `reviews/` is excluded, the evidence page's link to the engine comparison returns 404, and CUJ 3's expert loses the "why this engine" evidence.
    *   The exclusion itself traces to no goal; it is filed under G3.
*   **Recommendation:**
    *   Choose one option and say which: link to GitHub (and confirm the repository is public), publish a frozen `palette-dna/engine-comparison.html`, or drop the link.
    *   Anchor the exclusion as a Risk, or as its own goal.

### M5. The premise depends on "hand-tuned" labels that are not yet verified. Severity: Major

*   **Reviewer Lens:** `egm-design` 5 (overlaps Stage 6 M12, Stage 5 N9)
*   **Affected Scope:** lines 34, 69, 86, 242–247.
*   **Discrepancy:** The doc already calls Flexoki and Atlassian hand-tuned, and D3 makes Flexoki the example. G5 forbids that label until it is verified, and the verification is deferred to implementation.
*   **Recommendation:** Verify Flexoki and Atlassian before approving the design and record the result, or state the fallback example and wording.

### M6. The headline claim includes the generated control palette. Severity: Major

*   **Reviewer Lens:** `egm-design` 6
*   **Affected Scope:** lines 38, 54, 69, 87.
*   **Discrepancy:** "68% within one JND of what designers shipped" counts Material 3, which designers did not shape.
*   **Elephant check:** excluding it gives 67% against a 55% baseline.
*   **Recommendation:** Exclude `generated` palettes from the headline and state the inclusion rule on the evidence page. Update D4 and G1.

### M7. Measurement terms and UI terms are undefined. Severity: Major

*   **Reviewer Lens:** all three reviewers (overlaps Stage 6 M8, N10)
*   **Affected Scope:** lines 31, 34, 38–39, 57, 75, 101, 108, 192, 267, 288.
*   **Discrepancy:**
    *   **Measurement terms:** ΔE OK ×100, the fact that 1 JND ≈ 2, the meaning of "within" (strict `< 2`), the seeded hold-out against the surface hold-out, and the metric behind "0.36 → 0.03".
    *   **UI terms:** verdict, shift note, family panel, Fit and Through, classic scripts.
*   **Recommendation:** Add a short "Terms and measurement" section after the Overview, and define each term where it first appears.

### M8. CUJ coverage is uneven, and CUJ 2 contradicts P1. Severity: Major

*   **Reviewer Lens:** `egm-structural` 3, 4 (overlaps Stage 6 M13)
*   **Affected Scope:** lines 94–117.
*   **Discrepancy:**
    *   No CUJ covers a returning visitor following an old link with imported palettes (G3).
    *   No CUJ covers a first-time designer arriving from a shared link (G4).
    *   No CUJ covers the map page.
    *   CUJ 2 treats the surface hold-out as a trust measure, which P1 and Alternative J reject.
*   **Recommendation:** Add the two CUJs. Retarget or reword CUJ 2. Tag each CUJ with the goals it covers.

### M9. Names and placement of the explainer sections are inconsistent. Severity: Major

*   **Reviewer Lens:** `egm-style` M7; `egm-structural` 14, 15, 17 (overlaps Stage 6 M11, N1)
*   **Affected Scope:** lines 23, 61–68, 116, 218–236.
*   **Discrepancy:**
    *   The doc calls the same content an "About section", "benefit explainers", "Why hand-tuned shapes" and "Why borrow a palette's shape".
    *   G4 places it "above or beside" the tool, while §4 places it "under" the tool.
    *   G4's list of competitors does not match the table.
    *   The map page gets a reduced set of sections, despite "each page gains the same four-part structure".
*   **Recommendation:** Use one set of section names everywhere and settle the placement once. Align the competitor lists. Either give the map page the full set, or narrow G4.

## Nits

*   **N1. The evidence check and G1 disagree.** G1 says "fresh run", but the check only compares hashes. "Release check", "evidence check" and "release checklist" are used interchangeably, and the checklist itself is undefined. (`egm-style` M8, `egm-structural` 11; overlaps Stage 5 M2, Stage 6 M17)
*   **N2. Q1 has no decision point.** It also understates the impact of a rename. (`egm-structural` 8; overlaps Stage 5 M3)
*   **N3. The architecture diagram's connectors contradict the text.** `palettes.js` appears to feed only the ramp page, and `evidence.html` is unconnected. (`egm-structural` 6, rated Major there; kept as a Nit here because the text is unambiguous)
*   **N4. The redirect snippet at line 204 omits `location.search`,** which item 20 includes. (all three reviewers)
*   **N5. A leftover revision note sits at line 205.** (`egm-style`, `egm-structural`)
*   **N6. The test harness must skip external `<script src>` such as Plotly.** (`egm-design` 12)
*   **N7. The default-palette change misses fallbacks** at `color-ramp.html` 1545 and 1550. (`egm-design` 14; overlaps Stage 6 N3)
*   **N8. The Overview lists four things, but there are six goals and D3.** G6 and D3 have no anchoring problem, and there are no alternatives for the family name or the default palette. (`egm-structural` 9, 10)
*   **N9. Sources are missing.** There are no inline citations for the measured figures, the web search behind D1, or the competitor tools. (`egm-structural` 16)
*   **N10. The baseline is told the true step.** This asymmetry is conservative but undisclosed. (`egm-design` 7)
*   **N11. Wording fixes:**
    *   "predicts well" (line 86) should be "is easy to predict".
    *   The Overview's "share one engine… embedded separately".
    *   The ambiguous "which" in Overview item 2.
    *   The self-contradicting provenance rule at line 247.
    *   "best at" against "no quality claims" at line 231.
    *   Even-spacing figures with no engine named.
    *   Three names for Radix's tool.
    *   The unexplained "four ramps" threshold.
    *   Promotional or subjective phrases at lines 31, 36, 50, 69, 76, 86, 299, 340 and 352.

    (`egm-style` N1–N15)
*   **N12. UI copy should say "Your color", not "Input 1".** The reset and rejection copy is missing. Alternative A's size comparison leaves out Plotly. (`egm-style` N2, `egm-design` 15)

## Traceability

| Consolidated | Raw findings | Earlier stages |
|---|---|---|
| B1 | structural 1; design 1, 13 | — |
| M1 | style M1, M2, M3 | S5 M1; S6 M10 |
| M2 | design 2; structural 2; style M6 | S5 N4; S6 M16 |
| M3 | design 3, 9, 8, 10 | S5 N1; S6 M1–M4 |
| M4 | design 4; structural 5 | S5 N6 |
| M5 | design 5 | S5 N9; S6 M12 |
| M6 | design 6 | — |
| M7 | structural 7; style M4, M5, N10 | S6 M8, N10 |
| M8 | structural 3, 4 | S6 M13 |
| M9 | style M7; structural 14, 15, 17 | S6 M11, N1 |
| N1 | style M8; structural 11 | S5 M2; S6 M17 |
| N2 | structural 8 | S5 M3 |
| N3–N12 | as listed | S6 N2, N3 |
