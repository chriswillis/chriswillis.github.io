# Color intelligence — Stage 7 design critique

Reviewed `color-intelligence.html` in full (2,263 lines, including all embedded palette data), the full EGM `agents/design_critic.md`, and `resources/document_standards/feature-spec-standard.md`. The standard is applied to the implemented app's task flows, assumptions, alternatives, and failure handling; missing document sections are not findings. No application files were changed.

Evidence boundary: source inspection plus isolated Node execution of the actual embedded Engine. No browser, keyboard, visual, or end-to-end tests were performed. Runtime results below are engine checks or explicit simulations of the source event handler, not observed browser interactions.

## Findings

### D1 — Major: Selecting a generated seed swatch destroys the ramp being selected

**Scope:** `color-intelligence.html:1956`, `1905`, `1879–1880`, `925–978`.

The generated swatch handler calls `unlockSeed()`, copies only the swatch's lightness, and runs `update()`. Update derives the picked color from the primary seed's hue and saturation and replaces the anchored ramp with an ordinary surface ramp. A user inspecting or copying a generated swatch therefore gets a different color and loses the ramp they just made. Multiple seeds make this especially visible because each anchor can have a different hue and saturation.

**Reproduction:** Select Flexoki, use `#FDE68A, #D97706, #78350F`, choose Through seed, and click the generated swatch for the middle seed. Engine execution plus the event-handler state transition predicts step 500 changes from `#D97706` to `#B3900D` (ΔE ×100 = 8.50). The event sequence itself was not exercised in a browser.

**Recommendation:** Keep the generated ramp immutable during swatch inspection. Set the picked color from the selected generated point, retain the anchor state, and reserve seed unlocking for explicit map/saturation edits. Verify that every swatch's picked values and copied values equal that swatch before and after selection.

### D2 — Major: Core mode controls cannot be reached by keyboard

**Scope:** `color-intelligence.html:74`, `259–262`, `305–311`, `321–329`, `363–367`, `423–426`, `447–451`, `2041–2052`.

All segmented controls hide their native radio inputs with `display: none`; their containing labels have no keyboard behavior or focusability. This removes gamut, interpolation, snapping, seed mode, and contrast target selection from keyboard access. In particular, keyboard users cannot switch from Fit palette to Through seed, so they cannot complete the same seed-preservation workflow as pointer users. Seed chips also use clickable spans to choose the primary seed, leaving only their remove buttons keyboard accessible.

**Evidence:** Direct source inference; keyboard navigation was not runtime-tested.

**Recommendation:** Visually hide radio inputs without removing them from focus/navigation and expose a visible focus state on the associated segment. Make primary-seed selection a real button separate from its remove button. Test completing a seed import, switching modes, selecting the primary seed, choosing a contrast target, and copying a result using only the keyboard.

### D3 — Major: “At the same hue” comparison uses the wrong coordinate system

**Scope:** `color-intelligence.html:1911–1916`, `856–868`, `807–820`.

The comparison flow feeds the picked color's geometric angle around the comparison neutral axis directly into `B.genSteps`. The model's `u` coordinate is a ramp-position coordinate; actual geometric hue is warped at each lightness. `seedMap` already implements the inverse transformation, but this comparison path bypasses it. Comparison ramps and “this hue is on/between” statements can therefore describe the wrong hue position, undermining the main comparison task.

**Runtime evidence:** For Tailwind v3 red at L=0.85, the correct red ramp position is 27.353°. `atan2` as used by the comparison returns normalized 378.831° (18.831° modulo 360), while `seedMap` returns the correct 27.353°. This is an 8.522° coordinate error for a point explicitly generated on that ramp.

**Recommendation:** Use the comparison model's inverse color mapping for the hue position, with explicit behavior for near-neutral colors where hue is undefined. Test a comparison against known points on the comparison palette's real ramps at several lightness levels.

### D4 — Major: Malformed or transparent seeds can silently produce invalid or different colors

**Scope:** `color-intelligence.html:532–577`, `2007–2013`, `2028–2034`.

Seed validation treats “did not throw” as a valid color. Numeric parsers can return NaN without throwing, the hex regex accepts seven-digit hex, and alpha is ignored. This makes apparently accepted input unreliable: malformed functions enter the color model, and fully transparent red becomes opaque red with no seed-input warning. Importing palettes does check alpha, so behavior differs between the two entry points.

**Runtime evidence:** `Engine.parse('rgb(nope 0 0)')` returns `[NaN, NaN, NaN]`; `Engine.parse('#1234567')` accepts the value as `#123456`; `Engine.parse('rgba(255,0,0,0)')` returns opaque red's Oklab coordinates. The actual seed UI was not tested.

**Recommendation:** Validate complete syntax, exact supported hex lengths, finite components, and alpha before committing any seed state. Reject unsupported transparency with a clear message or offer an explicit compositing background. Keep the previous valid selection on errors. Distinguish skipped text from successfully parsed colors when a paste contains a mix.

### D5 — Major: Removing comparison leaves a stale comparison ramp visible

**Scope:** `color-intelligence.html:1908–1920`, `1520–1535`, `392`.

`renderPickCompare` returns early when no comparison exists after hiding only `pkcmp`. It never hides `gcmpwrap`, which was made visible for the previous comparison. Selecting “No comparison,” or making the comparison palette the main palette, can leave an old palette's ramp and label beside newly changing generated colors. The stale panel looks like an active comparison although it no longer updates.

**Reproduction from source:** Choose any comparison; enter the picker; select No comparison; move the pick. The old `gcmpwrap` stays visible while the new generated ramp changes. Browser confirmation remains outstanding.

**Recommendation:** Reset all comparison presentation together, including the generated comparison ramp, whenever comparison state becomes absent. Verify removal, changing the main palette to the comparison palette, and removal of an imported comparison palette.

### D6 — Major: Imported palettes cannot opt out of generated light/dark text aliases

**Scope:** `color-intelligence.html:2180–2195`, `1860–1875`, `472–475`.

The text-step selectors offer a dash option, but `fillTextSelects` immediately replaces an empty selection with a guessed step on each preview. Selecting the dash triggers preview, so the UI cannot retain “no text step.” Import then stores these guessed steps as if explicitly selected, and CSS export creates default light/dark text aliases. Palettes used only for fills or charts are forced into text semantics, and the selected step can fail the displayed contrast requirement.

**Reproduction from source:** Import the example, choose dash for either text-step selector, and observe that preview chooses a numbered step again. Not browser-tested.

**Recommendation:** Preserve an explicitly empty selection separately from an uninitialized selector. Default to no text role unless the user chooses one, or clearly label and require acceptance of a suggestion. Test that export omits an alias when its role is unset.

### D7 — Nit: Theme changes make hue visibility controls disagree with the plot

**Scope:** `color-intelligence.html:1436–1440`, `2249–2252`.

`themeChanged` rebuilds the hue controls, whose HTML always contains `checked`, while preserving `S.on`. Previously hidden hues remain absent from the plot but their controls now appear checked. Clicking a falsely checked control first unchecks it without restoring the hue, making visibility seem broken.

**Reproduction from source:** Hide a hue, toggle the theme, and inspect the checkbox versus the plot. Browser confirmation remains outstanding.

**Recommendation:** Render checkbox state from `S.on`, preserving the user's visibility choices across theme changes.

## Assessment

The engine separates model, importer, and rendering concerns and offers useful alternatives (PCHIP, cubic, chord, nearest-ramp validation). Explicit out-of-gamut and extrapolation explanations are valuable. The highest-priority improvements are preserving the generated artifact while users inspect it, making core task controls operable by keyboard, and aligning comparison and input semantics with the model. These defects are more consequential than further visual polish. No blocker was established in this scoped review.
