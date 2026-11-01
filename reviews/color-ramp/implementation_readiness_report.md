# Stage 9 — implementation readiness

Completed 1 November 2026. Three fresh-context reviewers completed: implementation-readiness, codebase-details, and style. Each confirmed reads of its persona, the implementation-readiness standard, the proposed plan, and selected context. Implementation and codebase reviewers inspected relevant application code. No application changes or browser execution by these reviewers.

## Verdict

The review backlog identifies actionable defects but is not yet a zero-decision implementation specification. Resolve the following contracts within each repair before coding. This does not prevent delivering the review. No framework or model migration is needed.

## R1 — Major: define identity and invalid-input outcomes

Readiness and Style: plan §1 leaves exact insertion versus qualified approximation open. Define behavior for near-reference substitution, neutral input, bounded lightness, gamut compression, collisions and equality tolerance. Give expected outcomes for #D14D42, #808080, P3 red and near-collision fixtures, not only scenario names. Decide whether invalid/empty input disables export or permits an explicitly identified previous valid result. Choose imported-transparency handling. These are visible product contracts, not implementation details to leave implicit.

## R2 — Major: specify lossless state and precedence

Readiness and Style: plan §2 must define versioned encoding, precision, malformed/unknown-version behavior, legacy-link versus local-value precedence, missing imported palette fallback, and which fields travel in a link. Give old/new hash fixtures and expected loaded states. Current hashOf/save/load are at color-ramp.html:1423–1446.

## R3 — Major: define asynchronous import ownership

Readiness and Style: specify latest-request ownership and whether manual edits, example insertion, close/reopen or a newer file selection invalidate earlier FileReader callbacks. Distinguish committed palette list/selection from draft preview/readiness on failure. Current callbacks at 1519–1536 can overwrite text independently. Persistence-before-finalization for addition and removal is already an actionable boundary; no new architecture is required.

## R4 — Major: separate result facts from confidence without breaking family ordering

Readiness and Codebase: extend existing output with branch-specific preserved/moved/substituted/omitted/gamut-limited facts and identify which measured hold-out summaries, if any, remain visible. renderFamily() uses o.band.i at 1352–1353, while generate() creates it through band() at 1297. Removing unsupported prediction fields without preserving geometric segment ordering can break the family display. Test exact, neutral and generated branches. Retaining unsupported confidence-colored badges under renamed text is insufficient.

## R5 — Major: select format-control semantics and update Copy together

Style: choose ordinary pressed format buttons or fully specified tabs. Codebase: syncTabs() writes aria-selected at 1543, and the successful Copy callback queries [aria-selected="true"] at 1547. Changing only the controls to aria-pressed leaves a null dereference in Copy. Derive format names from authoritative state and test successful announcements as well as rejection fallback.

## R6 — Major: specify integration-test coverage and reuse points

Codebase and Readiness: probe.cjs deliberately cuts the controller before its event handlers. Converting its diagnostic outputs into assertions cannot cover debounced input, import listeners, file ordering, removal, persistence, format controls or Copy. Define a full-controller DOM/event harness or concrete browser runner with controlled storage, timers, FileReader and clipboard. Keep tests/color-ramp.test.cjs as the target entry point and document browser execution separately. Assert outcomes/tolerances, not merely that calls run.

Map reuse explicitly: sibling strict parse/parseRaw at color-intelligence.html:552–583; complete Importer values and null-prototype collections around 1226,1258,1307,1333–1357; target permissive parse around 422 and substring extraction around 1060–1063. Cover all four collectors. Reuse behavior and fixtures; do not independently rebuild the validator or assume sibling tests prove target UI behavior.

## Nit — keep optional navigation out of the repair commitment

Style: plan §4 says to consider a Copy/export jump action while intermediate review defers it. Mark it deferred consistently. Shared-source extraction remains separate. A stable implementation order is validation/state, import persistence, chosen identity/result-facts contract, then UI/accessibility.

## Traceability

R1 maps to consolidated findings 1–2; R2 to 3; R3 to 4; R4 to 2/5; R5 to 6; R6 to 1–8 and verification ownership. These are readiness prerequisites, not additional claims that the existing app fails every listed scenario.
