# Initial zoom-out review: Palette topology

Reviewed the complete `color-intelligence.html` (2,263 lines, including embedded palette data), the complete `agents/zoom_out.md` persona and `resources/document_standards/zoom-out-standard.md`. Referenced materials were context. No application files were changed. This is an implementation and UX review, not a design-document compliance audit. Findings are based on source inspection, not a browser usability test.

## Purpose and users

The purpose is understandable: help design-system designers and frontend developers inspect the structure of existing palettes, judge interpolation risk, and generate/export colors consistent with a reference. A second audience is readers exploring color science. The visual topology and hold-out demonstrations serve that audience well. The page already has useful boundaries: browser-local operation, separate Engine and Importer closures, explicit gamut handling, source/version metadata, and a keyboard-operable map. No framework rewrite or additional interpolation algorithm is justified by this review.

The root README only names the repository; the implementation supplies enough context to review. Related `color-ramp.html` and the `color/` package establish substantial existing color tooling. Their existence argues for clearer workflow routing and reuse, not expanding this page into another full token platform.

## Findings

### ZO-1 — Major: Basic input validity has no single boundary

**Evidence:** `color-intelligence.html:519–570` parses numeric components without rejecting non-finite values or requiring complete syntax. The hex length expression accepts seven digits. `Importer.tryColor` at 1174–1178 assumes “did not throw” means valid. Seed parsing at 2008–2012 has the same assumption and ignores alpha, whereas imports explicitly reject translucent colors at 1246–1249.

**Impact:** A typo such as `rgb(nope 0 0)` can propagate NaN into geometry; a translucent seed is interpreted as opaque without explanation. This undermines the central promise that the generated result corresponds to the user's color. Adding more individual error messages downstream would increase complexity without repairing the boundary.

**Simpler direction:** Establish one parse-result contract for seed and import paths: fully recognized syntax, supported alpha policy, finite channels, useful failure reason. Reuse it before model construction. Existing `color/src/color/oklch.ts:16–21` already wraps culori parsing and is a candidate to evaluate, with explicit compatibility tests for current formats and missing hue handling.

**Counterargument:** A constrained parser keeps this static artifact small. That is reasonable; a strict validator around the current parser can be a smaller first fix than adopting the package or shipping a new dependency.

### ZO-2 — Major: Core choices are inaccessible through the keyboard

**Evidence:** `.seg input { display: none; }` at line 74 removes all segmented radio controls from keyboard navigation. These include gamut (255–258), snapping (363–367), seed fitting (423–426), and contrast target (447–450). Primary-seed switching uses a clickable span with no keyboard handler at 2041–2053. The canvas supports arrows at 1946–1950, but that does not recover access to those choices.

**Impact:** Keyboard users can move a pick but cannot complete the same generate/fit/export workflow as pointer users. This is a structural control problem, not a need for more custom shortcut code.

**Simpler direction:** Preserve native focusable radios using visually hidden styling and visible focus on the surrounding segment. Make primary selection a native button separate from removal. Give theme switching a descriptive accessible name, and implement or simplify the tab semantics.

**Counterargument:** Compact visual segments are helpful and should remain; native semantics do not require sacrificing their appearance.

### ZO-3 — Major: The confidence presentation exceeds the scope of its evidence

**Evidence:** Calibration is explicitly pooled full-saturation PCHIP hold-outs (1110–1113, 1702–1707). `band(u)` depends on hue/gap but not lightness, extrapolation, or seed reshaping. `update()` at 1881–1902 nevertheless prints a numerical expected error and, within 1.5° of a ramp at full saturation, states “Generated steps reproduce this real ramp exactly.” Seed generation is selected afterward at 1905. The generated ramp can be anchored/reshaped, clipped, or involve off-curve samples excluded from validation. Some caveats exist elsewhere (1866–1869, 2083–2090), but they do not condition this strong local claim.

**Impact:** Users deciding whether to ship exported colors can read an unqualified confidence statement that does not describe the active generation mode. Near a real ramp is also not identical to its hue, so the exactness assertion is broader than its own condition.

**Simpler direction:** Derive one explicit result status from the active model: observed sample, calibrated interpolation, extrapolation, or seed-modified output. Use that status consistently for the map, local explanation, and export metadata. Retain empirical bands where applicable; describe other modes as unvalidated instead of inventing additional statistical corrections.

**Counterargument:** The page already has unusually good explanatory caveats and hold-out tests. Preserve them. The fix is to align their visibility and scope with the result rather than remove the uncertainty feature or claim the pooled numbers are intrinsically invalid.

### ZO-4 — Major: Repeated color engines create avoidable drift

**Evidence:** This page defines Engine at 480, PCHIP at 608, calibration at 1112, and Importer at 1170. `color-ramp.html` independently defines Engine at 366, PCHIP at 494, the same calibration at 998, and Importer at 1056. The repository also has `color/src/color/oklch.ts`, `color/src/dna/curves.ts:81`, and `color/src/contrast/index.ts:18` for related primitives. The color package uses culori and colorjs.io and has its own tests.

**Impact:** Parser, gamut, and interpolation corrections can diverge between tools that appear to share behavior. Maintaining multiple product interfaces is sensible; maintaining copied foundational math makes correctness work more expensive.

**Simpler direction:** First establish which source owns the shared topology engine and importer, then generate the two standalone pages from that source or load a shared static asset. Evaluate reusable primitives from `color/` rather than merging its distinct DNA solver into this surface model. Keep numerical parity checks at the extraction boundary.

**Counterargument:** Self-contained pages simplify publication and archival. Build-time reuse preserves that benefit. A wholesale migration into the newer package is not justified merely by similar names.

### ZO-5 — Nit: The task flow gives technical exploration precedence over obtaining a usable ramp

**Evidence:** Initial view is the 3D surface (260–261, 265). Interpolation methods, layer controls, and a seven-metric table dominate its sidebar (296–355). In the picker the map, generated ramp, and hold-out experiment precede seed entry in DOM order (359–410). The narrow-screen CSS stacks the side panel below that content (155–159). There is no visible first-use explanation of what action produces an export.

**Impact:** A new visitor with a brand color must discover another tab and, on mobile, scroll past a scientific visualization and experiment to find the input. This is a plausible onboarding cost, not a measured abandonment finding.

**Simpler direction:** Add a concise visible purpose and a direct route to “start from a color”; put seed input before the map on narrow screens. Use progressive disclosure for interpolation diagnostics. Consider linking the existing `color-ramp.html` focused workflow rather than adding a second onboarding wizard here.

**Counterargument:** A topology explorer may deliberately lead with the 3D view. Keep that identity if exploration is primary; make the alternative task discoverable without changing the whole product into a generator.

## Priorities and verification

Prioritize ZO-1 through ZO-3: invalid input containment, keyboard access, and result honesty directly affect task completion and trust. Then consolidate shared source incrementally. Treat ZO-5 as a small design experiment with mobile verification, not a mandate for new product scope.

Verify malformed/partial CSS colors and alpha policy across both input paths; keyboard-only selection of every generation control; and confidence text for exact samples, nearby hues, clipped steps, extrapolation, and multi-seed ramps. These checks should validate user-visible behavior rather than reproduce internal algorithms. No blocker requiring a redesign was found.
