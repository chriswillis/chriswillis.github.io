# Comprehension review — color-intelligence.html

## Scope and evidence

Read in full: `agents/comprehension.md`, `resources/document_standards/re-implementation-standard.md`, and `color-intelligence.html` (lines 1–2263), including all twelve embedded palette records at line 478. The implemented interface supplies the product contract; the JavaScript supplies implementation evidence. No missing design-document sections are reported. No application files were changed.

Runtime checks below executed the actual Engine and Importer script bodies in Node's VM, extracted from the HTML without alteration. They are isolated JavaScript tests, **not browser interaction or visual verification**. Findings explicitly marked source-traced were not reproduced in a browser.

## Workflow comprehension

The tool starts with Flexoki (or the saved palette), builds a neutral-relative Oklab surface, and runs leave-one-ramp-out validation. Users can inspect 3D geometry, change its rendering/interpolation controls, compare another palette, or open the picker to select hue/lightness and generate CSS. Imported palettes are parsed, normalized to a common step scale, previewed, and saved in localStorage. Seeds replace or append colors and anchor a generated ramp; moving the picker, adjusting saturation, fitting contrast, or clicking a generated swatch unlocks those seeds. A hold-out replaces the picker's model temporarily while retaining the full 3D model. Only palette, gamut, neutral, comparison, imported palettes, and theme persist; seeds and generated work do not. These paths are traceable in lines 1331–1395, 1678–1707, 1852–2059, and 2122–2256.

The most consequential comprehension problem is that actions presented as selecting or importing a displayed result can instead replace that result or use stale state.

## Findings

### C1 — Major: Selecting a generated seed-ramp swatch changes the ramp and picks a different color

**Scope:** lines 1905–1906, 1956, 2041; seed help at 419.

The swatch click handler unlocks seed mode and copies only the clicked step's lightness. `update()` then derives the picked color from the primary seed's old hue/saturation and replaces the anchored ramp with `genSteps`. Multi-seed ramps vary hue and chroma, so a swatch is not a dependable way to select its displayed color or copy its value. The visible ramp also disappears simply by trying to inspect it.

**Runtime evidence:** Using Flexoki/sRGB and the input's example seeds `#FDE68A, #D97706, #78350F` with Fit palette, `genAnchors` produces middle-anchor `#D6791B`. Applying the actual click transition (retain primary hue/saturation, adopt that step's L, unlock seeds) produces `#B3900D`, a ΔE_OK ×100 difference of 8.135. The handler was traced, and its numerical transition was executed; no browser click was performed.

**Required improvement:** Selecting a generated step should preserve its actual color and the generated ramp. Make abandoning seed mode a separate, explicit action, or explain that transition before it happens.

### C2 — Major: Invalid color syntax can be accepted and stored as a successful palette

**Scope:** lines 523–575, 1174–1178, 1269–1271, 1317–1321, 2006–2009.

`Engine.parse` does not verify component counts or finite results. Import and seed collection treat a nonthrowing return as a valid color. Missing components and malformed numbers therefore become NaN rather than an actionable input error. Hex validation also allows seven digits and silently ignores the seventh. This violates the interface's apparent contract that accepted entries represent usable colors.

**Runtime evidence:** `Engine.parse('rgb()')` and `Engine.parse('rgb(1 2)')` return three NaNs; `Engine.parse('oklch(60% nope 20)')` returns `[0.6, NaN, NaN]`; `Engine.parse('#1234567')` succeeds. Importing the fixture below with the middle red value changed to `rgb()` returns `ok: true`, with nonfinite values in `M.R`.

```json
{"red":["#fee","#f88","#800"],"green":["#efe","#8f8","#080"],"blue":["#eef","#88f","#008"],"yellow":["#ffe","#ff8","#880"]}
```

**Required improvement:** Validate full supported syntax and finite components before adding seeds or building/saving palettes; identify the failed entry and keep prior valid state intact.

### C3 — Major: A legitimate imported ramp name can crash preview instead of producing a result

**Scope:** lines 1254–1259; 2191–2193.

Import grouping uses `{}` and an inherited-property-sensitive existence check. A ramp named `constructor` resolves to the object's inherited constructor instead of a group, and accessing its missing `steps` throws. Preview does not catch failures from `Importer.analyse`, so the UI cannot explain this input failure and can retain a previously enabled Add palette action.

**Runtime evidence:** The C2 fixture imports successfully. Renaming `red` to `constructor` throws `Cannot use 'in' operator to search for '0' in undefined` from `Importer.analyse`.

**Required improvement:** Use own-key-safe grouping and ensure all input failures return structured preview errors.

### C4 — Major: Add palette can commit an earlier preview rather than current input

**Scope:** lines 2188–2196, 2208–2213, 2219–2223.

**Source-traced:** Once a preview succeeds, editing the name or palette only schedules a preview 200 ms later. Add palette stays enabled and commits `impLast` without rereading current fields or flushing the timer. Pasting a replacement and immediately activating Add therefore imports the previous palette/name. A formerly valid preview can likewise be committed after entering invalid input but before validation runs.

**Reproduction procedure:** Load an example, wait for the enabled Add button, edit the name or textarea, then activate Add within 200 ms. Inspect the newly selected palette against the current fields.

**Required improvement:** Validate synchronously at commit or disable commit whenever fields differ from the validated snapshot; cancel pending previews when closing/committing.

### C5 — Major: “No comparison” leaves the former comparison ramp visible

**Scope:** lines 392, 1509–1511, 1908–1920.

**Source-traced:** `renderPickCompare` shows `gcmpwrap` when a comparison exists, but its no-model branch hides only `pkcmp`. No code ever restores `gcmpwrap.hidden = true`. Selecting No comparison or switching the main palette to the comparison palette leaves a stale row labeled as the previous comparison, even though the selector and sidebar say it is disabled. Subsequent pick changes no longer update that row.

**Reproduction procedure:** Open the picker, select any comparison, then select No comparison and move the pick.

**Required improvement:** Hide/clear all comparison outputs together whenever comparison state is absent.

### C6 — Major: Text-step “—” choices cannot actually be selected

**Scope:** lines 471–472, 2180–2186, 2195–2196, 2213; export lines 1878–1881.

**Source-traced:** Each text-step selector offers a blank “—” option, suggesting that no text alias is permitted. Its change handler immediately rebuilds the options. Since the blank string is not in `steps`, `fillTextSelects` replaces it with a default step, and preview assigns that default back to the palette. Thus users cannot suppress the default light/dark aliases through the offered choice; copied CSS can acquire a dark-theme rule they tried to omit.

**Required improvement:** Distinguish initial defaults from explicit blank selections and preserve the latter as null through preview, storage, and export.

### C7 — Major: Primary seed and major segmented controls cannot be operated from the keyboard

**Scope:** line 74; radio controls at 256–259, 305–310, 320–328, 362–365, 423–425, 447–450; seed chips at 2043–2053.

**Source-traced:** Every segmented radio input is `display: none`, removing its native focus/keyboard behavior; the label/span substitutes have no focus target or keyboard handler. Seed selection is implemented on nonfocusable spans with a click handler; only the nested remove button is keyboard-operable. The picker canvas supports arrows, but keyboard users cannot select snapping, gamut, interpolation, contrast target, seed treatment, or a different primary seed through these controls.

**Required improvement:** Keep native radios focusable using visually hidden styling, and provide a keyboard-operable primary-seed control distinct from removal. Verify focus and announcements in a browser/accessibility pass.

### C8 — Nit: Theme changes make hidden hues appear enabled

**Scope:** lines 1425–1429, 1432–1435, 1620–1621, 2250.

**Source-traced:** Theme changes rebuild the hue sidebar with every checkbox hardcoded checked while preserving `S.on`, which controls the actual plotted visibility. Hide a hue (or choose None), then toggle theme: the controls claim all hues are visible while the plot still omits them. This makes the next toggle require an unexpected extra click.

**Required improvement:** Render checkbox state from `S.on` during sidebar reconstruction.

### C9 — Major: Seed alpha is silently discarded, unlike palette import

**Scope:** lines 523–575, 1248–1251, 2006–2009, 2027–2034.

Seed parsing accepts rgba/hsla and alpha-bearing hex but never consults `alphaOf`; the parser explicitly discards alpha. A user can enter a translucent brand color and receive an opaque ramp without explanation. The import workflow instead skips translucent entries with a note, so the same token has inconsistent meaning between the two entry points.

**Runtime evidence:** `Engine.parse('rgba(255,0,0,0.2)')` yields the same Oklab coordinates as opaque red. The absence of alpha handling in seed collection is source-traced.

**Required improvement:** Reject translucent seeds with a clear explanation or require an explicit background/compositing rule; never imply that the entered translucent color is preserved.

### C10 — Nit: Seed limits and default behavior are not stated where users enter colors

**Scope:** lines 419–425, 1678, 2027–2032, 2090.

The help says one color gives a ramp through it, but the default is Fit palette, which can move vivid seeds inward. More than six seeds are silently truncated, and Add at capacity appears to succeed while discarding the new input. The actual fit/through distinction is partly explained after an out-of-palette seed is entered, but the initial promise and limit remain misleading.

**Evidence:** Source-traced default `seedMode: 'fit'` and unconditional `.slice(0, 6)`.

**Required improvement:** State the default fitting behavior and six-seed limit at entry; report omitted colors or disable Add at capacity.

## Review limits

No browser visual pass, clipboard integration test, persistence-failure test, screen-reader run, or external palette/calibration provenance verification was performed. Numerical tests validate the cited transitions only, not all interpolation or statistical claims. The report makes no claim that P3 rendering or contrast behavior was verified on actual display hardware.
