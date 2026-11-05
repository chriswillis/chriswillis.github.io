# Goldfish Review Report: Stage 8 (Intermediate Zoom Out)

**Target:** `docs/designs/palette-dna-tools.md` (lines 1–655, unchanged)
**Reviewer:** `egm-zoom-out`, fresh context, Zoom-Out Standard. It read the Stage 5–7 reports.
**Verdict:** Passes with changes. 0 Blockers, 6 Major, 6 Nits.

The design still targets the root problem: an honest measured claim, a fix for the largest error source, consistent names, and an explanation where readers land. It needs no build step, no framework and no library. The risk now comes from the review fixes rather than the design. Taken together, Stages 5–7 ask for more machinery than the release needs. Several single fixes clear three or four findings each, and two recommended fixes conflict with other fixes or with a Non-Goal.

## Prioritized Findings

### Z1. Make the single evidence script, created in Change 1, the central fix. Severity: Major

*   **Affected Scope:**
    *   Stage 5: M2, N7, N8
    *   Stage 6: B1, M7, M9, M15, M17
    *   Stage 7: N1, plus the B1 row "script logic not covered"
    *   Design: items 11, 13, 14 and 18; lines 406 and 628–630
*   **Rationale:** Adopt Stage 5 M2. `scripts/palette-dna-evidence.cjs --check` recomputes everything in about 10 seconds, so the stored hashes, the published `evidence.json`, the second script and item 18 are all unnecessary. Introduce the script in stages:
    *   **Change 1:** the automatic and baseline runs only. Its gate is that they reproduce the 2026-11-04 numbers. This fixes Stage 6 B1 and M15.
    *   **Change 2:** add the pinned run.
    *   **Change 3:** add `--check`. Page paths come from one constant that Change 4 updates, which fixes Stage 5 N7.
*   **What this removes:**
    *   The risk that the check misses changes to the script itself, because a fresh run reflects them.
    *   The need for a formatting table (Stage 6 M9). Parse each span as a number and compare it at the precision shown.
    *   Most of the evidence schema (Stage 6 M7), which becomes internal. The doc only needs to name the source files (`run.mts`, `build-page.py`) and define the statistics the pages cite.
*   **Conflict:** Stage 6 M7 and M9 add detail to machinery that M2 deletes. Settle M2 first.

### Z2. Do not adopt the "≤ 1.07" bar for G2. Severity: Major

*   **Affected Scope:** Stage 7 M2; Stage 6 M16; Stage 5 N4; G2 (lines 56–57); line 192; Non-Goal line 77.
*   **Rationale:** Using one statistic everywhere, the per-step median, and restating line 39 as 1.07 against 2.46 are both right. The bar itself is likely to fail:
    *   Pinning brings back the 22% of seeds whose lightness is unusual for their step, so the pinned median will probably fall between 1.07 and 1.26.
    *   A miss could only be fixed by tuning the engine, which is a Non-Goal.
*   **Recommendation:**
    *   G2 passes on behavior: unit tests show the pin is applied.
    *   Report the pinned median on the evidence page.
    *   An optional sanity check: pinned median ≤ automatic median, both per step.
    *   Turn "100% on the designers' step" into a unit test.

### Z3. Cover the pin edge cases in four sentences, with no threshold guard. Severity: Major

*   **Affected Scope:** Stage 7 M3; Stage 6 M1–M6; Stage 5 N1; design §2 (174–188) and item 7 (413–425).
*   **Rationale:** The current verdict already reports approximation with ΔE (`color-ramp.html` 1384–1385), an omitted seed (1382), gray (1323) and a shared anchor (1343). Only four rules need writing:
    1.  The near-duplicate filter keeps the pinned seed.
    2.  A pin on a gray seed has no effect, and the existing note explains why.
    3.  Fit mode does not change how pins work, because `cap` affects chroma only.
    4.  An `s1` that is not a step of the loaded palette resets to Automatic, using the same rule and note as a palette change.
*   **Reject:** the lightness-distance threshold guard and the k±2 study (Stage 7 M3). The threshold would be a new number with nothing measured behind it. Instead, the pinned verdict names the automatic step, for example "…at step 900, the step you chose (closest in lightness: 100)." That discloses any distortion without a threshold or a rejection.
*   **Simplify:**
    *   Drop the `"range"` reason, since the menu cannot offer an invalid step.
    *   Only input 1 can be pinned, so the order rule becomes one bounds check: a pinned seed that is the lighter of two must sit at or before step n−2, and one that is the darker must sit at or after step 1.
    *   Replace the multi-pin pseudocode with that sentence and one result shape.

    This resolves Stage 6 M1 and M2 and the line 177 example.

### Z4. Narrow G4 for the map page instead of adding the full explainer. Severity: Major

*   **Affected Scope:** Stage 6 M11; Stage 7 M9; G4 (61–68); §4 line 218; item 17.
*   **Rationale:** The map page is a study tool; the ramp page is the one people share. Copying the comparison table and limits list doubles the copy and the evidence spans for little gain.
*   **Recommendation:**
    *   The ramp page answers all five G4 questions.
    *   The map page gets the lede, the shared "why" paragraph and a link to the ramp page.
    *   Rewrite line 218 to match.

### Z5. Fix the name collision with wording and scope. Severity: Major

*   **Affected Scope:** Stage 5 M1; Stage 6 M10; Stage 7 M1 and M4; D1; line 631; items 12, 28 and 29.
*   **Rationale:**
    *   Renaming the library would touch a package with 233 tests, its docs and the Explorer, for no visitor benefit.
    *   Publishing a frozen comparison page would put "Palette DNA beats palette-dna" on the public site.
*   **Recommendation:**
    1.  Name the published runs and keys `auto`, `pinned` and `nearest`.
    2.  Scope D1 and the line 631 search to `palette-dna/*.html` and `assets/palette-dna/*`.
    3.  Published pages never mention the library. The "why this engine" link and the Reproduce commands point to the GitHub repository.
    4.  Internal docs say "the palette-dna library".
*   **Assumption to state:** the repository is public.

### Z6. Write the Risks section as a record of accepted risks, not new mechanisms. Severity: Major

*   **Affected Scope:** Stage 7 B1.
*   **Rationale:** The severity follows the standard and stands. The fix should be five or six rows:

| Risk | Treatment |
|---|---|
| Pages can no longer be saved as single files and used offline | Accepted (Alternative C) |
| A page and its engine can mismatch for about 10 minutes after a release | Accepted; keep `?v=`. No hashed filenames or service worker |
| Redirects need JavaScript | Handled by the `noscript` link |
| A late rename after links are shared | Q1 is a gate on Change 4; a `palette-dna/` index URL is optional |
| Experts dispute the claims | The evidence page |
| Plotly, about 3.5 MB on mobile | Existed before this design; accepted, out of scope |
| Review files are public | Item 25 |
| The check misses changes to the script itself | Removed by Z1 |

## Nits

*   **Z7. Simpler test-harness changes** (items 6 and 10; Stage 6 M14; Stage 7 N6; Stage 5 N8).
    *   Each test loads the three asset files into its `vm` context directly, and the "same three files" test checks only the `src` attributes. This avoids the Plotly problem.
    *   Drop the unit test for the map page's first visit; the Playwright check covers it.
    *   Drop item 27 rather than the E2E redirect check, which also verifies that state is restored.
*   **Z8. Provenance needs only the known exceptions plus a headline filter** (Stage 5 N9; Stage 7 M5 and M6; Stage 6 M12).
    *   Accept leaving Material 3 out of the headline (67% against 55%).
    *   Verify only Flexoki and Atlassian, at design time.
    *   If the check fails, name them without the "hand-tuned" label.
    *   Skip researching the other seven palettes.
*   **Z9. Add only a first-time-visitor CUJ** (Stage 7 M8; Stage 6 M13).
    *   E2E already covers returning visitors.
    *   Reword CUJ 2's "Then" to say what the map page already shows.
*   **Z10. One terms paragraph, no glossary** (Stage 6 M8 and N10; Stage 7 M7).
    *   Define UI terms where each first appears.
    *   Disclose in one sentence on the evidence page that the baseline is told the true step.
*   **Z11. Fix the map page's counts by hand** (item 17; Stage 6 N4). Do not add a computed-count rule, because "ten palettes behind the calibration" is correct as written.
*   **Z12. G6 holds; build nothing more around it.**
    *   Z1, Z6 and Z7 absorb the side effects of extracting the engine.
    *   If more machinery accumulates, the fallback is two inline copies plus one test that they are byte-identical.

## Net effect if adopted

*   **Removed:**
    *   the second script, the hash logic and the published `evidence.json`
    *   item 18, and item 27 or another duplicate redirect test
    *   the `"range"` reason and the multi-pin loop
    *   the extra map-page sections
    *   generic `<script src>` resolution in tests
    *   research into seven palettes
    *   the formatting table
    *   the ≤ 1.07 gate
*   **Added:**
    *   four sentences on pin edge cases
    *   one verdict clause
    *   a short Risks table
    *   a terms paragraph
    *   one CUJ
    *   a Q1 gate on Change 4
