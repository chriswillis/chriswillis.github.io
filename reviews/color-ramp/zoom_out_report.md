# Color ramp — Stage 5 zoom-out review

Reviewed 31 October 2026. Scope: the implemented `color-ramp.html`, evaluated as an application rather than a missing design document. This report completes only the delegated Stage 5 review.

## Assessment

The product objective is clear: turn one or two supplied colors into an exportable ramp shaped by a known palette. The input-first layout, explicit Fit/Through choice, ordinary HTML controls, local imports, and static deployment are appropriate for that objective. A framework migration, new interpolation methods, or a new backend would not address the main problems.

The important architectural boundary is between an accepted input, the actual generated colors, and what the interface promises about those colors. That boundary currently leaks in three places: permissive input acceptance, unconditional exactness language, and accuracy claims derived from a different generation procedure. Import preview and commit also have distinct notions of the current input. Repair these contracts before expanding features. No universal deployment blocker was established; four Major findings follow, plus one maintenance Nit.

## Evidence and files read

- Full target HTML source, including markup, styles, Engine, Importer, controller, and embedded palette data. The long embedded JSON was also parsed directly from the full file; it contains 12 palettes. Palette values were not independently checked against their upstream publishers.
- `/Users/chris.willis/.codex/plugins/cache/egm/egm/0.1.0/agents/zoom_out.md` and its `resources/document_standards/zoom-out-standard.md`, fully.
- `reviews/color-intelligence/implementation-progress.md` and `reviews/color-intelligence/consolidated_review_report.md`, as selected lessons and hypotheses. Their browser and test results are not evidence that this target passes or fails.
- Repository `README.md` (only a repository title) and `color/README.md`, for project and reuse context.
- Relevant sibling source: `color-intelligence.html` strict parser at 552–581, import commit and preview invalidation around 2329–2350; searches for shared Engine/Importer and calibration code.
- `color/src/color/oklch.ts`, and the initial harness/parser/import test sections of `tests/color-intelligence.test.cjs`, for concrete reuse candidates and test ownership.

Verification used isolated Node execution of this target's actual inline Engine and Importer, with its actual embedded Flexoki data. No browser session, screen-reader check, phone viewport check, statistical reproduction, or full app regression suite was performed in this stage. Source-traced findings below are distinguished from executed probes. No application file was edited.

## ZO-1 — Major: the central confidence promise describes a different experiment

**Affected scope:** `color-ramp.html:255`, 343, 995–1033, 1251–1265, 1291–1298, 1330–1343.

**Verified source evidence:** The hold-out test calls `genSteps(u, 1, method)` for ordinary full-saturation surface reconstruction (1015–1023). The live generator calls `genAnchors(seeds, {cap: ...})` (1291), which relocates steps, changes chroma, and can interpolate between two seed hues. Nevertheless every generated result receives `band(...)` evaluated at the mean seed hue, then the verdict says steps typically fall within a numeric distance of what the designers would make and that one in ten miss by more than the displayed p90. The band also tapers linearly to zero within five degrees of a known ramp, clamps through `calAt` beyond the tabulated gap domain, and appears before palette-specific hold-outs have completed. None of these branches tests whether the active seeded result belongs to the measured population.

This is a verified mismatch of model and claim, not proof that a specific error number is numerically wrong. The empirical corpus and its claimed perceptual interpretation were not independently validated.

**Simplicity rationale:** The user needs a truthful explanation of the result they can copy. Maintaining a plausible confidence story for every unsupported mode adds complexity without evidence. A single eligibility decision shared by the verdict and any future export metadata is simpler than exceptions scattered through wording and badges. For anchored output, withhold individual probability claims and explain that the hold-outs describe reference-surface reconstruction. If empirical references remain, label them as that and state their domain; validating a new anchored estimator is separate research.

**Strongest counterargument:** The notes already say the estimate says less about vivid steps, and local hold-outs adapt it to each palette. That is useful context, but neither adjustment validates relocated lightness, lower chroma, two-anchor hue changes, or near-ramp taper. A caveat about some steps does not support the remaining individual probabilistic assertion.

**Acceptance direction:** Default one-seed, pastel, Fit, two-seed, clipped, and imported-wide-gap results must receive statements supported by their actual generation path. Do not require a new statistical project before removing unsupported precision.

## ZO-2 — Major: “Stays exact” has implicit substitution paths

**Affected scope:** `color-ramp.html:287`, 341, 738–751, 811–818, 1276–1295, 1322–1328, 1397.

**Executed evidence:** With the target's Flexoki model, `seedMap(parse('#D14D42'))` returns `exact: 'red-400'` and `exactE: 0.11219636836587787`. Flexoki red-400 is `#D14D41`. The source's exact branch returns the entire authored ramp regardless of mode and describes the supplied color as that authored step. Thus the finite matching tolerance becomes literal identity in the UI. The actual input value is not retained even in Stays exact.

The same probe maps `#777777` to `neutral: true`. Source then substitutes the palette's neutral ramp, which has no anchor (1286–1289), while the active mode hint still says the color goes into the ramp unchanged. Further exceptions are evident in source: lightness clamps, gamut handling, and near-equal-lightness seed filtering. The exactness defect does not depend on those unprobed cases.

**Simplicity rationale:** Use explicit output facts—preserved, approximated, replaced by reference, or excluded—rather than letting a UI mode imply guarantees the generator does not enforce. Near-reference recognition can remain a useful suggestion; it should not bypass the preservation contract silently. A small result-status contract is preferable to adding yet another interpolation algorithm.

**Strongest counterargument:** A ΔE of about 0.112 is visually tiny and returning a designer-authored ramp is valuable. That supports an optional match/snap behavior or an explicit approximate-match explanation. It does not make a different exported brand token exact, especially for users comparing literal values.

**Acceptance direction:** Check both numerical and exported identity for an actual sample, a nearby sample, gray input, extreme lightness, and two near-equal-lightness inputs. Any unsupported exactness condition should be explained beside the active result.

## ZO-3 — Major: accepted color input is not a validated model boundary

**Affected scope:** `color-ramp.html:411–461`, 1058–1061, 1140–1147, 1233, 1449–1458.

**Executed evidence:** The target parser returns `[0.6, NaN, NaN]` for `oklch(60% nope 20)`; the controller's `isFinite(p[0])` accepts it. It also accepts seven-digit `#1234567` and trailing text in `rgb(1 2 3)junk`. `#ff000080` is accepted as opaque red because alpha is ignored by seed generation. A four-hued-ramp JSON fixture with a ramp named `constructor` throws `Cannot use 'in' operator to search for '0' in undefined` inside Importer. The modal catches the exception and shows an error, so this last probe is not a claim that the entire browser app crashes.

**Simplicity rationale:** Full syntax consumption, finite coordinates, an explicit alpha policy, and own-key-safe import collections belong at the input boundary. Checking just one coordinate downstream or relying on the renderer to tolerate invalid values creates multiple inconsistent contracts. Harden the shared boundary once, then let generation assume validated data.

**Reuse verified:** The sibling's parser at `color-intelligence.html:552–581` already validates complete syntax and all coordinates; its import groups use `Object.create(null)` at 1307. Its tests execute shipped inline code. The package also has a culori-based parser at `color/src/color/oklch.ts:17`, but its return type deliberately permits NaN hue for achromatic colors and is not a drop-in Oklab/alpha contract. Adapt the sibling repair and cover this target; do not blindly transplant the package solver.

**Strongest counterargument:** Typical hex input works, and the modal already catches exceptions. This limits the frequency and blast radius, but supported functional color input explicitly invites the malformed-channel path; a caught failure for a valid ramp name still rejects usable data.

**Acceptance direction:** Exercise the actual target with malformed channels, extra text, unsupported hex length, alpha, and inherited-looking names. Confirm invalid edits leave a clearly identified previous valid result rather than silently committing bad data.

## ZO-4 — Major: import preview and commit disagree about what is being saved

**Affected scope:** `color-ramp.html:363`, 1220, 1495–1535.

**Verified source transition, not browser timing reproduction:** `schedulePreview` only delays preview for 200 ms; it leaves `impLast` and Add enabled (1515). Add commits that stored preview without re-reading the current text/name (1531–1535). A successful preview A followed by an edit to B and an immediate Add can therefore save A. File-too-large and file-read-error branches also only replace the message, leaving existing readiness untouched. `saveUser` swallows storage errors, while the dialog promises the palette is saved locally.

**Simplicity rationale:** Preview is a derived view, not the authoritative transaction. Invalidate readiness on edits and validate the actual current input at commit. Report persistence failure as part of that commit contract. There is no need for asynchronous infrastructure or a new state library.

**Reuse verified:** `color-intelligence.html:2329` immediately invalidates preview readiness, and its Add handler revalidates and handles storage failure. These are directly relevant patterns; their presence does not prove this target is fixed.

**Strongest counterargument:** The race window is short and most users wait for a preview. But the action currently advertises readiness for content that has changed, and persistent wrong imports are more costly than the small synchronous validation needed to prevent them.

**Acceptance direction:** Valid A→edited B→immediate Add, valid→invalid→Add, name-only changes, oversized/read-failed file selection after success, and denied storage must each commit the current validated data or produce an explicit failure.

## ZO-5 — Nit: shared implementation has already diverged; preserve standalone delivery without multiplying owners

**Affected scope:** target Engine/Importer at 367–1206; sibling Engine/Importer; `tests/color-intelligence.test.cjs:8`; `color/README.md` and `color/src/color/oklch.ts`.

**Verified evidence:** Both pages embed the related palette-surface Engine/Importer, while the sibling now has strict parsing and current-input commit fixes absent from this target. Its regression harness explicitly reads `color-intelligence.html`, so passing it does not validate `color-ramp.html`. The target also carries 3D mesh, hull, volume, and alternative interpolation routines not exposed by this UI.

**Simplicity rationale:** Duplication has a demonstrated maintenance cost. First add target-specific regression coverage for the repaired contracts. Then choose one source owner with a small build step that can still emit standalone pages, or use a shared static script if that deployment tradeoff is acceptable. Do not turn this into a wholesale DNA-solver migration: the separate package uses a different model and product scope.

**Strongest counterargument:** Copying a complete engine makes standalone publishing simple and preserves tested numerical behavior; unused routines are mostly lazy and have no demonstrated performance cost here. Therefore extraction and trimming are follow-up work, not prerequisites to repairing the four Major contracts. No performance defect is asserted.

## Hypotheses and retained strengths

The mobile workflow already leads with input and turns swatches into readable rows below 40rem; the sibling's old map-before-input defect is not inherited by this app. Native Fit/Through buttons are present, so the sibling's hidden-radio defect is not inherited either. Export tab semantics and live-region verbosity warrant a dedicated accessibility check, but this stage did not establish a full keyboard failure.

The hash serializer at 1423–1426 stores seeds as sRGB hex and identifies local imports by browser-local ID. A shared/reloaded P3 result may therefore differ, and imported palettes cannot be reconstructed in an unrelated browser from that hash alone. This is a source-grounded reproducibility hypothesis for a dedicated controller/browser check; there is no visible share button and no executed end-to-end reproduction here, so it is not elevated to a Major finding in this review.

No absent design-document headings are treated as app defects. No cache, worker, framework, backend, or feature expansion is recommended without evidence of need. The proposed repair order is input validity and exactness, import commit integrity, then truthful confidence wording, followed by separately scoped shared-source ownership.
