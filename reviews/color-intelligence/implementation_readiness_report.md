# Stage 9 — implementation readiness

Three fresh-context reviewers completed the implementation-readiness, codebase-details, and style personas. Each confirmed full reads of its persona, the implementation-readiness standard, and improvement_plan.md, and inspected relevant application code. This stage assessed the proposed review backlog against the actual tool. It did not certify completed fixes. No application files changed.

## Verdict

The high-priority defects are actionable, but the proposed plan remains a backlog rather than a fully specified implementation contract. Resolve the decisions below within each change before coding it. A full architectural rewrite is unnecessary.

## R1 — Major: Contrast targeting must have an explicit relationship to anchored ramps

Readiness finding 1; codebase finding 1. Plan §1 says only map/saturation edits abandon anchors, but HTML lines 1958–1966 also unlock seeds when fitting contrast. The solver searches `PM.point(P.u, L, P.s)`, not the anchored curve. Removing the unlock alone would make the solver and displayed result disagree.

Choose whether targeting leaves anchored mode, selects a qualifying generated step, or solves an anchored curve. Label the operation accordingly. Verify reachable/unreachable targets after selecting Fit and Through swatches; selected color, copied values, anchor state, and measured contrast must agree. This is a dependency of A1/A6, not evidence that existing contrast arithmetic is universally wrong.

## R2 — Major: Define comparison invariants and neutral behavior

Readiness finding 2; codebase finding 3; style finding 1. Plan §3 leaves relative saturation versus actual chroma unresolved. The inverse mapping can return a neutral result without `u` and can clamp lightness near poles. Define the preserved quantity, label, near-neutral fallback, and out-of-range-lightness treatment before replacing the angle calculation. Include expected chromatic, neutral, and Through-seed cases with numerical tolerances. Maps to A8.

## R3 — Major: Strict parsing must extend through token extraction

Readiness finding 3; codebase finding 2. Tightening `Engine.parse` alone does not repair substring extraction in `Importer.tryColor` and `parseSeeds` (HTML lines 1171–1178, 2008–2012). Define complete-value validation for JSON values and full consumption of seed lists while allowing the declaration syntax needed for CSS/SCSS/LESS imports. Choose atomic rejection or explicit partial acceptance for mixed valid/invalid submissions. Test trailing junk, valid-plus-malformed seed lists, and mixed opaque/translucent imports, including whether prior state changes. Maps to A2/A4.

## R4 — Major: Make calibration eligibility an explicit matrix

Readiness finding 4. Plan §4's “when appropriate” is not executable. Define displayed status and whether estimates are hidden or qualified for ordinary full-saturation interpolation, Fit anchors, Through anchors, extrapolated steps, reduced saturation, and clipping. The status must follow the selected result's provenance rather than stale generator coordinates. Maps to A10.

## R5 — Major: Specify accessibility and mobile interactions before implementing layout

Style finding 2. Choose full tabs or ordinary view-switch buttons; select scrollable detailed swatches or another concrete inspection interaction. Define breakpoint, DOM ordering, cell width, and focus contract. These choices are still open recommendations, not completed designs. Maps to A5/A12.

## R6 — Major: Give regression tests a concrete entry point; defer source extraction

Codebase finding 4; style finding 3. `color/vitest.config.ts` targets its own `color/test` suite; its build creates the DNA explorer rather than this topology page. A suitable immediate follow-up is a small standalone topology test entry that extracts the actual inline Engine/Importer, as the review's `verify-engine.cjs` does, paired with browser interaction tests for DOM/state bugs. Select committed paths and commands during implementation. The current review probe is diagnostic, not a complete pass/fail regression suite.

Shared-source extraction requires its own ownership/build decision affecting both HTML tools. Keep it explicitly deferred until repaired behavior has coverage, rather than treating “determine ownership then extract” as a ready implementation task. Maps to A13 and the verification approach for A1–A12.

## Counterargument and scope

A review need not settle every product decision, and the user requested a review rather than implementation. These gaps therefore do not block delivery of the review. They prevent mislabeling the proposed backlog as a zero-decision implementation plan. The consolidated report retains them so a later fix can resolve only the choices relevant to its scope.
