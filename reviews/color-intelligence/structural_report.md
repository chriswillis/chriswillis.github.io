# Structural review — color-intelligence.html

Read in full: `/Users/chris.willis/.codex/plugins/cache/egm/egm/0.1.0/agents/structural.md` and `/Users/chris.willis/.codex/plugins/cache/egm/egm/0.1.0/resources/document_standards/feature-spec-standard.md`.

Scope: the implemented single-page application, including Engine, Importer, persisted palette choices, model/view state, picker, seed editing, hold-out mode, and CSS export. The specification rubric is adapted to implementation boundaries and failure modes; no missing document headings are reported. No application files were changed. Findings below are source-traced; the reserved-name parser exception was additionally reproduced by executing the actual Engine and Importer scripts in Node's VM.

## S1 — Major: Commit imports from the current input, not a stale preview

Affected scope: lines 2188–2193, 2208–2212, 2219–2223.

`impLast` is the only value committed by Add palette. Editing either textarea or name schedules a preview 200 ms later without invalidating `impLast` or disabling Add. After loading a valid example, replacing the text and immediately clicking Add therefore imports the previous palette; changing the name immediately before Add similarly loses the change. This is a transaction-integrity issue at the import boundary, not merely delayed feedback.

Proposed fix: synchronously invalidate the ready result and disable Add on input, then validate the current values on commit (or require an exact input/version match). Cancel pending preview work after successful commit. Verify valid A → edit to B → immediate Add, and valid A → invalid input → immediate Add.

## S2 — Major: Use dictionaries without inherited keys for imported ramp names

Affected scope: lines 1254–1259; exception reaches preview at line 2191.

`groups = {}` and `if (!groups[name])` treat inherited properties as pre-existing ramp objects. An otherwise ordinary ramp named `constructor` resolves to `Object.prototype.constructor`, whose `.steps` is undefined. The next `in` operation throws before the guarded `Engine.build` call. This leaves the dialog without an actionable validation error and may retain an earlier enabled import result.

Reproduced with actual scripts: `Importer.analyse('constructor: #fee #fcc #f88\nblue: #eef #ccf #88f\ngreen: #efe #cfc #8f8\nyellow: #ffe #ffc #ff8')` throws `Cannot use 'in' operator to search for '1' in undefined`.

Proposed fix: use `Map` or null-prototype dictionaries for externally named collections and own-key checks. Catch normalization/parser errors at the public import boundary. Verify reserved names in CSS, JSON, and line formats.

## S3 — Major: Segmented controls are unavailable to keyboard users

Affected scope: line 74 (`.seg input { display: none; }`), controls at lines 297–303, 312–319, 365–370, 423–426, 447–451.

All segmented radio inputs are removed from layout and the focus/accessibility tree. Their wrapping labels are not independently focusable. Consequently keyboard users cannot choose interpolation methods, surface display mode, snapping mode, seed fit/through behavior, or contrast targets, although the map itself supports keyboard movement. The application's main control hierarchy has no keyboard path to these branches.

Proposed fix: visually conceal the native radios while keeping them focusable and provide a visible focus style on the associated segment. Retain radio-group arrow-key behavior and give each group an accessible name. Verify tab and arrow navigation through every segmented group.

## S4 — Major: Theme changes desynchronize hue toggles from model state

Affected scope: lines 1425–1429, 1432–1435, 2250–2252.

`buildSidebar()` recreates every hue checkbox with literal `checked`, while `themeChanged()` invokes it without changing `S.on`. Hide a hue (or select None), then toggle the theme: the graph still respects the old disabled `S.on` values, but every checkbox now says it is visible. Clicking the checked control once merely sets the already-false state again, making the first action appear ineffective.

Proposed fix: render each checkbox from `S.on[r.name]`, and keep theme updates presentation-only. Verify partial and all-hidden selections across manual and system theme changes.

## S5 — Major: The explicit “no text step” choice cannot persist

Affected scope: lines 2180–2185, 2191–2195, 2213; CSS alias emission at lines 1876–1878.

Both text-step selects offer `—` with value `''`, but `fillTextSelects()` treats that value as missing because it is absent from the palette steps and immediately chooses a default numeric step. Selecting `—` fires `previewImport()`, which replaces the selection and overwrites the intended null with that default. Users cannot import a palette without inventing text roles, and the subsequent CSS export emits text aliases they expressly declined.

Proposed fix: distinguish an uninitialized selection from an intentional empty selection. Default once on the first successful parse, preserve `''` on subsequent previews, and reset only invalid nonempty choices when the scale changes. Verify both null text roles survive Add and suppress the corresponding exported aliases.

## S6 — Nit: Removing an earlier seed changes the surviving primary seed

Affected scope: lines 2004, 2048–2050.

The primary seed is stored by array index. The remove handler splices the array and only adjusts `P.pi` if it exceeds the new length. With seeds A/B/C and B selected (`P.pi = 1`), removing A shifts B to index 0 while leaving `P.pi = 1`; C unexpectedly becomes primary and moves the pick. This breaks selection identity during a local edit.

Proposed fix: decrement `P.pi` when removing an earlier item, or store stable seed identity rather than an index. Define the replacement rule separately for removing the primary itself. Verify removing an item before, after, and at the primary position.

## Assessment

The numerical engine and import normalization already form useful separate boundaries, and asynchronous validation uses cancellation tokens. The highest-value structural improvements are transactional import commits, safe external-name dictionaries, keyboard-complete control groups, and consistently rendering controls from authoritative state. No generic split-the-file refactor or specification-template rewrite is required to address these findings.
