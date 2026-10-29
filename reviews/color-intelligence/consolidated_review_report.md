# Color intelligence: technical and UX review

Reviewed 28 October 2026. Target: [color-intelligence.html](../../color-intelligence.html). EGM consolidated review, adapted to an implemented tool: the HTML and visible interface supply feature behavior, the embedded JavaScript supplies implementation, and the proposed improvement plan supplies the final readiness review scope. No application changes were made.

## Assessment

Fix result integrity before polishing the interface. The most consequential defect is that selecting a generated swatch can change its color and discard its seeded ramp. Other immediate issues affect input validation, keyboard access, and comparison accuracy. The tool does not need a framework rewrite or more interpolation algorithms to address these problems.

The existing model/view separation, hold-out experiment, gamut indicators, and empirical diagnostics are worth retaining. The issue is whether those explanations and controls remain consistent with the exact result a user is inspecting or exporting.

## Recommended order

| Order | Action | Priority | Evidence |
|---|---|---|---|
| 1 | Preserve the selected generated color and seeded ramp | Major | Browser reproduction + engine execution |
| 2 | Validate color syntax, finite values, alpha, and imported names | Major | Executed Engine/Importer probes |
| 3 | Restore keyboard access and readable contrast diagnostics | Major | Source + accessibility tree; caption issue source-traced |
| 4 | Commit current import input and preserve unset text roles | Major | Source-traced state transitions |
| 5 | Repair comparison coordinates and clear inactive comparisons | Major | Engine check + source tracing |
| 6 | Make confidence wording describe the active model | Major | Source tracing and observed seeded readout |
| 7 | Repair small state inconsistencies | Nit | Source tracing |
| 8 | Improve narrow-screen input→inspect→copy flow | Major UX opportunity | Source-based layout risk; desktop screenshot inspected |
| 9 | Consolidate shared source after regression coverage | Follow-up | Source duplication; no migration attempted |

“Major” means a material task or result problem. No universal launch blocker was established. Opportunities are separated from reproduced defects; mobile usability and scientific calibration were not independently validated.

## Findings and concrete fixes

### A1. Selecting a swatch must inspect that swatch

At [line 1956](/Users/chris.willis/Documents/GitHub/chriswillis.github.io/color-intelligence.html:1956), clicking a generated cell unlocks seeds, copies only its lightness, then recomputes from the old hue/saturation. The anchored ramp is replaced by ordinary surface generation at lines 1880–1906.

**Observed:** With Flexoki and the example seeds `#FDE68A, #D97706, #78350F`, default Fit palette displays a middle anchor `#D6791B`. Clicking it shows `#B3900D`, replaces the ramp, and exposes Back to seeds. The engine-computed difference is ΔE_OK ×100 ≈8.14. Browser focus also falls back to the page after the button is replaced.

**Fix:** Separate generated-step inspection from generator edits. Preserve the generated ramp/anchors, set the selected result from the actual step, and keep focus stable. Map or saturation edits can explicitly leave seed mode. Inspecting a color should not regenerate it.

**Acceptance:** For each swatch in single- and multiple-seed ramps, selected hex/OKLCH and copied values match the displayed step; the ramp remains unchanged. Exercise both Fit and Through modes.

### A2. Reject invalid colors before they reach the model

Parsing at lines 523–568 accepts incomplete numeric functions and seven-digit hex. Seeds and imports assume that a nonthrowing parse is valid. Executed probes show `rgb()` and `rgb(1 2)` produce NaNs; `oklch(60% nope 20)` has nonfinite channels; `#1234567` is accepted; an import containing `rgb()` returns success. Seed alpha is silently discarded, while import has a separate alpha policy.

**Fix:** One strict parse-result contract: recognized complete syntax, supported lengths/component rules, finite coordinates, explicit alpha treatment, and an actionable error. For the initial fix, reject translucent seeds with an explanation rather than inventing a background. Preserve previous valid state on failure.

**Acceptance:** Malformed inputs cannot change or persist the current model. Existing supported valid formats continue to work. Mixed valid/invalid input reports omissions. The attached [probe](verify-engine.cjs) and [results](engine-results.json) reproduce current failures; JSON nulls in the results represent serialized NaNs.

**Tradeoff:** A validated small parser may be sufficient. Adopting an existing parser is an option, not a prerequisite for this repair.

### A3. Imported names must be treated as data

At lines 1254–1259, ordinary objects and inherited-key checks are used as dictionaries. Renaming a valid ramp to `constructor` causes an uncaught TypeError in an executed import probe.

**Fix:** Use own-key-safe collections and return structured failures from the public import boundary. Do not leave an old successful preview actionable after a parse failure.

**Acceptance:** Reserved-looking names in each supported import format either import safely or produce a specific validation error, without throwing out of preview.

### A4. Validate the input being committed

At lines 2208–2223, editing content schedules a 200 ms preview but leaves Add enabled; Add commits the old `impLast`. A rapid edit→Add can import the previous content or name. This is source-traced, not browser-timing-tested.

**Fix:** Invalidate readiness immediately on input, tie preview to an input revision, and commit a validated current snapshot. Cancel pending work on close/commit. Surface storage failure rather than silently promising that the import is saved.

**Acceptance:** Valid A→B→immediate Add never imports A; valid→invalid→Add cannot commit the earlier result; save failure clearly distinguishes temporary use from persisted data.

### A5. Essential controls need native keyboard behavior

At line 74, `display: none` removes all segmented radio inputs from focus and accessibility navigation. The browser accessibility tree confirms those choices appear as text. Gamut, snapping, interpolation, seed mode, and contrast targets therefore lack their native control path. Primary-seed selection is a clickable span at lines 2041–2053.

**Fix:** Keep native radios focusable with visible segment focus, named groups, and native arrow behavior. Give seed selection/removal separate buttons and color-specific labels. Name the import textarea and theme action. Complete the tab semantics or use ordinary view-switch buttons. Announce committed changes/errors concisely rather than every drag frame.

**Acceptance:** Complete seed→mode→primary→target→swatch→copy using a keyboard, with focus retained across updates. Verify actual assistive-technology behavior separately; this review was not a full screen-reader audit.

### A6. Keep contrast verdicts readable when the sample fails

At lines 1887–1889 both “Aa” and its ratio/verdict use the picked color on the test background. Near that background, the diagnostic disappears with the sample it is diagnosing.

**Fix:** Keep “Aa” as the realistic preview; put the ratio, background name, and result in a separate readable interface caption. Improve meaningful small metadata currently using faint `--tx-3` styling.

**Acceptance:** Pole and near-pole samples retain readable diagnostics in both interface themes. Do not infer general component accessibility from a text-pair badge alone.

### A7. Preserve an explicit unset text role

At lines 2180–2196, selecting `—` gets replaced by a guessed numbered step on the next preview. Export can therefore create aliases the user tried to omit.

**Fix:** Distinguish initial defaults from intentional blanks; preserve null roles through preview, save, and export. Label guesses as suggestions if retained.

**Acceptance:** Both unset roles survive import and omit corresponding light/dark aliases. This is a source-confirmed branch issue; the dialog interaction was not browser-tested.

### A8. Compare using the model's inverse mapping

At lines 1911–1913, comparison passes a geometric angle around its neutral axis to `genSteps`, but that function expects the model's ramp-position coordinate. These coordinates diverge with hue drift. The engine reviewer measured an 8.522° mismatch for a known Tailwind v3 red point at L=0.85.

**Fix:** Use the model's inverse color mapping and define the near-neutral fallback. Specify whether comparison preserves palette-relative saturation or physical chroma; make the label match the chosen operation.

**Acceptance:** Known comparison-ramp points map back to that ramp across lightness levels. Exercise clipped, near-neutral, and seeded picked results. This numerical check does not constitute cross-display color validation.

### A9. Clear every comparison output together

At lines 1908–1920, the absent-comparison branch hides the sidebar but leaves `gcmpwrap` visible. The old ramp can remain beside newly generated colors after No comparison is selected.

**Fix:** Reset the sidebar, generated comparison row, labels, and associated state together.

**Acceptance:** No comparison, switching primary to the comparison palette, and removing an imported comparison leave no stale output.

### A10. Qualify confidence by the active generation mode

The uncertainty calculation uses pooled full-saturation PCHIP hold-outs (lines 1110–1113, 1690–1707), while the readout can describe seeded or otherwise altered results. “Reproduce this real ramp exactly” is triggered by proximity within 1.5°, not verified identity. Seed help promises a ramp through the input while default Fit can alter it.

**Fix:** Derive one result status shared by the readout, overlays, and export metadata: observed sample, calibrated interpolation, extrapolation, or seed-modified output. Retain empirical bands only within their stated scope. Replace unqualified exactness and accuracy promises with scoped descriptions.

**Acceptance:** Exact samples, nearby hues, clipping, extrapolation, changed interpolation, saturation changes, and seeded output receive matching descriptions. This review does not establish that the pooled data are wrong; it establishes a mismatch between their scope and some UI claims.

### A11. Preserve selection state across small edits

Theme rebuilding hardcodes all hue checkboxes as checked while retaining the hidden-hue state (lines 1425–1435, 2250). Removing a seed before the primary can shift the primary to another surviving item because identity is stored as an index (lines 2004, 2048–2050).

**Fix:** Render controls from authoritative state; preserve seed identity through array edits. State the six-seed cap and report additions that exceed it rather than silently truncating.

**Acceptance:** Theme changes retain partial/all-hidden hues. Removing before/after/at the primary follows a documented selection rule. Seed-limit feedback matches actual accepted input.

### A12. Make the mobile workflow follow the user's task

Below 52rem, the entire map, explanation, ramp, and hold-out experiment precede seed input/results in the stacked layout (lines 155–165, 359–458). Evenly divided ramp cells and hidden hex labels weaken touch inspection. This is a layout risk from source, not measured mobile abandonment.

**Fix:** Order narrow-screen content as input→map→selected value→ramp/export. Move experiment/methodology detail into optional disclosures, retain a short visual legend, give detailed swatches a usable minimum width, and keep a stable selected-value inspector. Clarify “Palette saturation” versus chroma relative to gamut. Add a concise heading/main landmark and direct route to start from a color.

**Acceptance:** At 320px, 390px, and zoomed desktop, complete the seed→inspect→copy task without repeatedly traversing research diagnostics.

**Counterargument:** A topology explorer may intentionally lead with 3D. Preserve that identity and the expert diagnostics; a generator-first redesign is not established as necessary by this review.

### A13. Reduce duplicated implementation after fixing behavior

`color-ramp.html` contains a closely related copied Engine/Importer. The separate `color/` package has related primitives and tests but a distinct DNA solver. Its test suite does not automatically validate this page.

**Fix:** First pin repaired contracts with targeted tests. Then choose a shared source owner and generate standalone pages or share a static asset. Preserve numerical behavior and separate product purposes.

**Counterargument:** Standalone files simplify publication. Build-time sharing can preserve that advantage. A wholesale package migration or framework rewrite is not justified.

## Evidence and review boundaries

The review used fresh-context EGM personas, complete source reads, isolated execution of the actual Engine/Importer, and a browser check of normal startup, accessibility structure, picker layout, and seeded swatch selection. See [browser notes](browser_verification.md).

![Browser reproduction: the selected D6791B swatch becomes B3900D](seed-selection.png)

No application fixes, commits, publication, or deployment were performed. No full browser matrix, phone viewport, physical P3 display, storage failure, offline CDN failure, clipboard permission, performance benchmark, or independent statistical calibration study was completed. Proposed acceptance checks are future work, not claims of passing tests. The initial git working tree was clean; only review artifacts were added.

## Traceability

| Consolidated action | Raw findings |
|---|---|
| A1 | Comprehension C1; Design D1 |
| A2 | Zoom-out ZO-1; Comprehension C2/C9; Design D4 |
| A3 | Comprehension C3; Structural S2 |
| A4 | Comprehension C4; Structural S1 |
| A5 | Zoom-out ZO-2; Comprehension C7; Design D2; Structural S3; Style S1/S3/S8 |
| A6 | Style S2/S5 |
| A7 | Comprehension C6; Design D6; Structural S5 |
| A8 | Design D3 |
| A9 | Comprehension C5; Design D5 |
| A10 | Zoom-out ZO-3; Style S6; Comprehension C10 |
| A11 | Comprehension C8/C10; Design D7; Structural S4/S6 |
| A12 | Zoom-out ZO-5; Style S4/S5/S7/S9 |
| A13 | Zoom-out ZO-4 |

Stage artifacts: [initial zoom-out](zoom_out_report.md), [comprehension](comprehension_report.md), [critic synthesis](critic_report.md), [design](design_report.md), [structure](structural_report.md), [style](style_report.md), [intermediate zoom-out](intermediate_zoom_out_report.md). Proposed sequence: [improvement plan](improvement_plan.md).

## Final readiness check

All five EGM stages completed. The final [implementation-readiness report](implementation_readiness_report.md) identifies six decisions to settle during implementation; the [improvement plan](improvement_plan.md) is a proposed backlog, not a fully specified or executed design.

| Readiness finding | Affected actions | Decision required |
|---|---|---|
| R1 | A1/A6 | Whether contrast targeting leaves anchored mode, selects a generated step, or solves an anchored curve |
| R2 | A8 | Comparison's preserved saturation/chroma quantity and neutral/pole fallback |
| R3 | A2/A4 | Full-input consumption and atomic versus explicit partial acceptance |
| R4 | A10 | Eligibility matrix for estimates across generation modes |
| R5 | A5/A12 | Exact navigation semantics, mobile order, detailed swatch behavior, and focus contract |
| R6 | A13; verification throughout | Committed regression-test path/command; separate ownership/build proposal before extraction |

The extra source review confirmed that contrast-target handlers currently unlock seeds. Therefore the proposed preservation rule must account for those buttons, not just map dragging and saturation. Parser hardening must likewise cover token extraction, which currently discards unmatched surrounding text before parsing. These are repair dependencies, not reasons to delay fixing the demonstrated defects.
