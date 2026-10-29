# Stage 8 — intermediate zoom-out

Read in full: `agents/zoom_out.md`, `resources/document_standards/zoom-out-standard.md`, `zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, and `browser_verification.md`. Inspected the target's relevant styles, generation, comparison, seed, and import paths and performed a bounded reuse search. The target is an implemented application, not a design document; absent document sections are not defects. No application edits or additional browser experiments were performed.

## Assessment

The critique remains focused on the root problem: a visitor should be able to inspect a palette, generate a ramp, and trust that selection, explanation, and export refer to the same result. The browser reproduction strengthens the priority of C1/D1: selecting displayed `#D6791B` produced `#B3900D` and replaced the ramp. Correcting this is more important than rearranging the page. Input integrity and keyboard access belong in the same first tranche. No redesign blocker or need for a new interpolation engine has emerged.

The application is unchanged, so proposed mitigations are directions, not resolved findings. Source-traced import races, comparison state, and mobile issues retain their stated evidence limits.

## Findings about the improvement direction

### IZ-1 — Major: Preserve the result as the unit of inspection

**Affected scope:** critic priority 1; C1; target lines 1852–1906 and 1956.

The suggested mitigation is sufficient only if swatch selection preserves the generated colors, exported CSS, seed mode, and selected color together. Merely retaining seed mode or copying a swatch's lightness still allows the inspector and artifact to disagree. Keep an explicit selected step within the existing generated result and reuse the current inspector. Do not introduce a second independently generated preview or a generalized state-management framework. Preserve keyboard focus when selection updates its display.

**Tradeoff:** Map movement may legitimately generate a new result; distinguish that action from inspecting an existing step. A separate explicit action to leave seed generation is reasonable. Verify the browser-reproduced example and selection of an unanchored step; both must retain the ramp and show the actual selected value.

### IZ-2 — Major: Input validation and import commitment are one integrity boundary

**Affected scope:** ZO-1; C2–C4/C9; critic priority 2; target import and seed paths.

Strict parsing alone does not prevent committing stale preview state, and disabling Add alone does not contain exceptions from inherited keys. Treat supported syntax, finite values, alpha handling, safe name grouping, and committing the currently validated input as one bounded correction. Synchronous validation at commit plus structured preview failure is simpler than versioned asynchronous jobs for this local parser.

**Tradeoff:** Rejecting translucent seeds is the smaller supported policy; a background/compositing UI would add product scope. The existing `color/src/color/oklch.ts` parser is a reuse candidate, not a drop-in contract: it deliberately uses NaN for missing achromatic hue and omits alpha from its result. Validate final coordinates and explicitly handle alpha rather than imposing a blanket finite-hue rule or assuming package adoption solves both problems. A strict correction to the current parser is also defensible.

### IZ-3 — Major: Confidence corrections must accompany correctness repairs

**Affected scope:** ZO-3; critic priority 6; target lines 1893–1905.

Confidence should not be postponed behind optional visual polish. The current local exactness statement is chosen before seed generation and remains broader than its evidence. A concise active-result status, consistently shown beside the result and in export comments, is enough; no new statistical model or recalibration project is justified. Retain pooled evidence for its measured domain and label seed-modified or extrapolated output as outside that validation. Exact reproduction requires actual sample correspondence, not proximity alone.

**Tradeoff:** Keeping the hold-out explanation preserves the educational purpose. Making caveats longer elsewhere does not mitigate an incorrect local assertion.

### IZ-4 — Nit: Consolidation and workflow polish should not become prerequisites

**Affected scope:** ZO-4/ZO-5; critic priorities 4 and 7.

The bounded search confirms duplicated Engine/Importer closures in both HTML pages and an existing `M.seedMap` inverse mapping. Reuse the inverse for comparison instead of adding another geometric approximation. Correct stale comparison outputs in the same bounded change.

Shared-source extraction remains valuable follow-up work, with numerical parity checks, but it should not block the concrete integrity/accessibility fixes. The evidence does not justify a framework migration, merging the DNA solver, new storage infrastructure, or a full onboarding wizard. Retain the topology explorer identity; make the generator route clearer and test narrow-screen seed-first ordering and usable swatch widths before committing to a broader layout change. No measured abandonment or mobile browser evidence supports stronger product conclusions.

## Recommended sequence and closure

1. Preserve generated-result inspection; contain invalid input and make import commitment current; restore native keyboard controls and readable diagnostic captions.
2. Correct comparison mapping/clearing and explicit state preservation, including unset text roles, primary-seed identity, and hue visibility. Align confidence claims with the active result in this correctness pass.
3. Verify a narrow-screen task sequence, then consider shared-source extraction independently.

The mitigations are proportionate if kept to these boundaries. Closure requires user-visible regression checks for the reported transitions, keyboard operation and focus, and confidence across seed/interpolation/extrapolation modes. Engine checks alone cannot establish those UI outcomes. Additional broad research, new algorithms, or a wholesale rewrite are unnecessary for this review.
