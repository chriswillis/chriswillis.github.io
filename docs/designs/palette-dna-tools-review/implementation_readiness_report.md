# Goldfish Review Report: Stage 9 (Implementation Readiness Test)

**Target:** `docs/designs/palette-dna-tools.md`, DetailedRange lines 357–655
**Reviewers:**

*   `egm-implementation-readiness` (Implementation Readiness Standard): 1 Blocker, 12 Major, 8 Nits.
*   `egm-codebase-details` (Implementation Readiness Standard): 3 Blockers, 14 Major, 7 Nits.
*   `egm-style`: 1 Blocker, 20 Major, 12 Nits.

**Verdict:** Not ready to implement. After deduplication there are 4 Blockers, 12 Major and 10 Nits.

**Confirmed accurate against the source (codebase reviewer):**

*   The engine is 719 lines (ramp page 375–1093, map page 495–1213), and the importer is 156 lines.
*   The `pals` and `palettes` element ids and the parse lines are as described.
*   `loadPalette('flexoki')` appears at map lines 2351 and 2380.
*   There are 21 existing tests.
*   The storage keys, `EXAMPLE`, the `genAnchors` loop location, the `kind: 'exact'` branch, `#r2=` and `#palmeta` are all as described.
*   The `_config.yml` excludes, the feed, the sitemap and the hrefs are as described.
*   Tailwind v4 step 500 is index 5.
*   All evidence figures match `comparison.html`.

## Blockers

### B1. Gates between changes depend on tools that do not exist yet. Reviewers: all three. Also Stage 6 B1 and Stage 8 Z1.

*   **Scope:** line 406; Verification 628–630; items 11 and 14.
*   **Discrepancy:**
    *   **Change 1.** It is verified with `scripts/palette-dna-evidence.cjs`, which is only created in change 3. The fallback ("comparison harness pointed at `engine.js`") cannot run: `extract-engine.py` regexes for inline blocks that change 1 deletes, `run.mts` needs `module.exports` and `tsx`.
    *   **Change 2.** G2 has no harness to measure it at the end of change 2.
    *   **Change 3.** Item 14 reads `palette-dna/*.html`, which only exists after change 4.
*   **Fix:** Adopt Stage 8 Z1: create the evidence script in change 1 (automatic run and baseline), add the pinned run in change 2, and add `--check` in change 3, with page paths kept in one constant that change 4 updates.

### B2. The default-palette change breaks two existing ramp tests. Reviewers: codebase (Blocker), readiness (Major).

*   **Scope:** item 8, item 10, Verification 625; `tests/color-ramp.test.cjs` lines 16 and 23.
*   **Discrepancy:**
    *   Line 23 enters `#D14D41` (Flexoki red) and expects `kind === 'exact'`. Line 16 expects "approximated" for `#D14D42`. Both behaviors exist only because Flexoki is the default.
    *   With Tailwind v4 as the default, both tests fail. The plan says all 21 tests pass and lists no test edits.
*   **Fix:** Item 10 rewrites both tests to select Flexoki explicitly.

### B3. The map-page test harness is not built the way items 6 and 10 assume. Reviewers: codebase (Blocker), readiness (Major). Also Stage 6 M14.

*   **Scope:** items 6, 10 and 26; `tests/color-intelligence.test.cjs` lines 9–16 and 106.
*   **Discrepancy:**
    *   The harness finds `var Engine` and `var Importer` by text and parses `id="palettes"`, and it never runs the controller. After change 1, module load throws and all 9 tests fail.
    *   Generic `<script src>` resolution would also try to load the Plotly CDN script.
    *   A "first visit loads Tailwind v4" test cannot run in this harness.
*   **Fix:** Use Stage 8 Z7:
    *   Both harnesses load the three asset files directly.
    *   The "same three files" test checks only the `src` attributes.
    *   The map first-visit check becomes a source-level assertion or a manual E2E check.

### B4. The pin order rule cannot be implemented as written. Reviewers: style (Blocker), readiness and codebase (Major). Also Stage 6 M1–M3 and Stage 7 M3.

*   **Scope:** item 7 lines 413–425; item 10 line 452; §2 line 177.
*   **Discrepancy:**
    *   **"Must take" is undefined.** It could mean a capacity check or a check against where the other seed would land automatically.
    *   **The example and the test disagree.** The example (pin to 900) is rejected only under the second reading. The test (pin to 950) passes under both, so it cannot tell which rule was built.
    *   **Undefined pieces:** `n`, multi-pin support, and the `"range"` reason, which is unreachable.
    *   **Pins can vanish silently.** The 0.012 L duplicate filter and the `null` return can drop the pin without a reason.
    *   **The pin result is lost.** `gen.map(...)` in `generate()` drops `result.pin` before the verdict sees it.
*   **Fix:** Use Stage 8 Z3:
    *   Only input 1 can be pinned.
    *   Rule: with a second, darker seed, the pin must be at most step n−2; with a second, lighter seed, at least step 1. Here `n = pal.steps.length`.
    *   Drop `"range"`.
    *   The duplicate filter keeps the pinned seed.
    *   A neutral pinned seed means the pin has no effect, with the existing note.
    *   Add `out.pin = gen.pin`.
    *   Add a test that tells the two readings apart (pin to 900 with a darker second seed is accepted).

## Major

*   **M1. Ramp-page pin state and wording are left to the implementer.** (all three reviewers; Stage 6 M5 and M6)
    *   `st.pal` changes in five places: `#pal` change, removal at 1545, the storage event at 1550, import at 1600, and link/saved-state load. Only the first gets the reset rule.
    *   There is no rule for an `s1` that is present but invalid, and no type for it. It should be a string matching `pal.steps`.
    *   The transient note mechanism is undefined, because `out.notes` is rebuilt on every `generate()`.
    *   The `#stephint` text is never given.
    *   The field the control goes after is ambiguous: two fields are labeled "Your color".
    *   Verdict wording is missing for: approximated (Fit mode and clipping), Input 2, the `exact` kind without a pin, and how the rejection sentence combines with the others.
    *   Labels are inconsistent: "Input 1", "your color", "first color".
    *   **Fix:** Write the matrix of verdict wording, use "Your color" throughout, and use the Stage 8 Z3 clause that names the automatic step.
*   **M2. The existing disclaimers contradict the new claim.** (all three reviewers; Stage 5 N3, Stage 6 M13)
    *   The verdict sentence at `color-ramp.html:1377` and the "How it works" paragraph at :352 contradict the new claim.
    *   Item 16's instruction to "remove the sentences these sections now repeat" does not name them.
    *   **Fix:** Quote the replacement for each.
*   **M3. The evidence statistics are defined in `build-page.py`, not `run.mts`.** (all three reviewers; Stage 6 M7 and M9)
    *   The quantile rule is `sorted[min(n-1, int(p*n))]`.
    *   Errors are rounded to 2 decimals before `< 2`.
    *   "Placed" means the nearest output color, not the anchor flag.
    *   Meridian Dark is skipped and Meridian Light is excluded from pooling.
    *   `within1` units and `within2` are undefined, and the check has no formatting rule for counts or `%`.
    *   **Fix:** Name both source files and state these definitions. Under Z1, the check compares at the precision each span shows, so no formatting table is needed.
*   **M4. The evidence-page viewer is built around palette-dna.** (readiness, codebase)
    *   Its sorts and filters reference `palette-dna`; removing it causes NaN and makes every ramp match the "moved" filter.
    *   Its data shape differs from item 11's schema.
    *   It contains hard-coded prose numbers (0.2, 4.05/4.76, 1.45/2.40, 13.2, "eleven palettes").
    *   It has no top bar or theme toggle source, and the placeholder contract is undefined.
    *   **Fix:** Define the viewer's new sort and filter keys for `auto`/`pinned`/`nearest`, embed the data (`{{DATA}}`), remove the prose numbers, and name the source of the top bar and theme code (`color-ramp.html` :243 and :247–255).
*   **M5. The "topology" and "harmonious" search fails on the plan's own output.** (all three reviewers; Stage 5 M1, Stage 7 M1, Stage 8 Z5)
    *   It fails on: the run keys, the `data-evidence` keys, the "topology runs" text, comments (ramp page 30, 1263, 1297, 1547; map page 9, 182), and the card and feed blurbs that say "harmoniously fit" (`index.html:672`, `lab/index.html:137`, `feed.xml:40`).
    *   **Fix:** Rename the keys to `auto`, `pinned` and `nearest`. Scope the search to visible text in published files and name the exact command. List the comment edits. Supply replacement blurbs.
*   **M6. Ramp-page metadata and social text are incomplete.** (all three reviewers)
    *   Still unchanged: `og:title`, `twitter:title`, the three descriptions, `og:image:alt` (which still says Flexoki), the top-bar brand text (:248) and the "Palette topology" cross-link text (:353).
    *   The map social title differs from the image title.
    *   The lab and feed blurb "seven other design systems … estimates how close each step is" overclaims.
    *   **Fix:** Give one title and description per page, used in the meta tags, the image and the cards.
*   **M7. The map page lacks the structure and styles the plan assumes.** (all three reviewers; Stage 6 M11, Stage 8 Z4)
    *   It has no `h1`, `.lede` or `.notes` styles.
    *   Its info line is `#pinfo` (line 1472), not `#palmeta`.
    *   Provenance overlaps with the existing `note` and `source` fields and with the name suffixes "(generated)" and "(charts)".
    *   **Fix:** Narrow G4 (Z4). Name the CSS to copy. Specify the `#pinfo` change. Use a field name other than `source`, or reuse `note`.
*   **M8. Item 16's draft copy will be challenged.** (style; Stage 7 M5 and M6)
    *   "The best-known palettes were tuned by hand" is contradicted by Material 3 and Primer.
    *   Flexoki is called hand-tuned before verification.
    *   The error figures have no unit and leave out Radix (hand-tuned, 0.82).
    *   "Reporting how your color was changed" contradicts "kept exactly".
    *   "Best at" is a quality judgment.
    *   **Fix:** Use the style reviewer's rewrites, verify Flexoki and Atlassian first (Z8), and add a fallback sentence.
*   **M9. Cross-link rewrites in item 19 are wrong.**
    *   Prefixing with `../` sends `color-intelligence.html` through a redirect.
    *   **Fix:** List each rewrite: `./`→`../`, `assets/`→`../assets/`, `color-intelligence.html`→`map.html`.
*   **M10. Redirect pages drop link previews.** (codebase)
    *   Preview scrapers do not run JavaScript, so a page containing "only" the canonical link, robots tag, script and noscript loses its previews on re-scrape.
    *   **Fix:** Keep the `og:` and `twitter:` tags on the redirect pages.
*   **M11. The E2E checks have no spec file, runner or server.**
    *   **Fix:** Name `tests/e2e/palette-dna.spec.mjs`, use the Playwright that `color/package.json` already has, and serve with `python3 -m http.server`. Alternatively, relabel them as manual steps.
*   **M12. The fixture is underspecified.** (readiness, codebase, style)
    *   It uses one seed per call, so it misses the multi-seed path that item 7 rewrites.
    *   No colors, `cap` values, compared fields or writing command are given.
    *   If `pin` is always attached, deep-equality checks fail.
    *   **Fix:** Name the seed sets, including the map test's `#FDE68A, #D97706, #78350F`. Cover both `cap` values. Compare `[L,a,b,step,anchor,seedIndex]`. Name the command that writes the fixture.

## Nits

*   **N1. Item 1's line range and the stale comment.**
    *   The range is 375–1093; line 374 is the `<script>` tag.
    *   The stale "src/engine.js" comment is at controller line 1257, so it belongs in item 4.
*   **N2. Item 9 wording.**
    *   Line 2380 is a ternary. Say "replace the `'flexoki'` literal".
    *   Refer to the code by its content, because line numbers shift after change 1.
*   **N3. The ramp page's fallbacks at 1545 and 1550 still say `'flexoki'`.**
*   **N4. Item 25 belongs in the Change 1 list.** Its `_config.yml` comment (lines 10–11) also goes stale.
*   **N5. The `palettes.js` layout is ambiguous.** Use line 1 `var PALETTES =`, then the JSON, then a final line `;`.
*   **N6. Item 17's "ten" rule would break "the ten palettes behind the calibration" (map page 1552).** List the exact strings to change.
*   **N7. Item 21 is missing build details.**
    *   No output paths, capture method, or new iframe `src` and hash for `social-preview.html` (which currently loads `../../color-ramp.html#c-99ccee.flexoki.through`).
    *   No source exists for the map image.
*   **N8. Missing values.**
    *   The `?v=` format.
    *   The location of the release checklist.
    *   The `#palmeta` display format. A source link would require escaped HTML instead of `textContent`.
*   **N9. The engine-comparison README's reproduce steps break after change 1.** Item 29 only adds a note.
*   **N10. Wording.**
    *   "neighbours" (British spelling).
    *   The page is called analyzer, map page and `color-intelligence.html`.
    *   "Anchor ring" and "model" are undefined.
    *   "From a single color" leaves out "and the palette's other ramps".
    *   The `meta refresh` rationale should be that it cannot carry the hash.

## Traceability to earlier stages

| This report | Earlier |
|---|---|
| B1 | S6 B1, M15; S5 N7; S8 Z1 |
| B3 | S6 M14; S8 Z7 |
| B4 | S5 N1; S6 M1–M4; S7 M3; S8 Z3 |
| M1 | S6 M5, M6 |
| M2 | S5 N3; S6 M13 |
| M3 | S6 M7, M9; S8 Z1 |
| M5 | S5 M1; S6 M10; S7 M1; S8 Z5 |
| M7 | S6 M11; S7 M9; S8 Z4 |
| M8 | S7 M5, M6; S8 Z8 |
