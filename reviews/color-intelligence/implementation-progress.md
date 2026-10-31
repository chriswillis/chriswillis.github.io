# First change set — 31 October 2026

Implemented in color-intelligence.html:

- Generated swatch inspection preserves the selected point, anchored ramp, and focus. Passive validation/comparison refreshes retain the inspected step. Explicit map/keyboard/saturation edits resume from the inspected color's mapped coordinates.
- In seeded mode, contrast buttons select the lightest/darkest qualifying existing step; an unreachable target leaves the selection unchanged. Ordinary surface picking retains its continuous solver.
- Whole color values require supported syntax and finite coordinates. Seeds reject an entire submission if any entry is malformed, translucent, or beyond the six-seed limit. Imported malformed values fail preview; translucent import entries retain the existing explicit skip-with-note behavior.
- Import dictionaries accept inherited-looking names safely. Readiness invalidates immediately when input changes; Add revalidates current input and handles storage failure without adding a temporary palette.
- Text roles default to unset and explicit blanks remain unset. Removing a seed before the primary preserves the surviving primary's identity.
- Seed-shaped results no longer display surface-calibration estimates as though they validated the anchored result.

Validation: `node --test tests/color-intelligence.test.cjs` — six passing groups exercising shipped code, all embedded built-in colors, supported input formats, invalid inputs, reserved names, seeded swatch identity in Fit/Through, contrast selection/no-solution behavior, and current-input import commits. This uses isolated Node execution with small DOM collaborators for controller functions; it is not a full browser simulation.

Browser checks: normal startup; example multi-seed ramp; selecting D6791B retains D6791B and keyboard focus; seeded contrast target selects AA4C0A with a displayed 5.45:1 ratio; example import previews with unset roles; malformed rgb() disables Add and displays an error. See seed-selection-fixed.png. These checks do not cover all browsers or physical P3 displays.

Remaining review work: the full keyboard/accessibility pass, readable contrast captions, comparison coordinate/reset fixes, broader calibration eligibility, mobile flow, and shared-source work. The sibling color-ramp.html has not been changed. No commit or deployment performed.

# Second change set — 31 October 2026

- Restored native keyboard access to segmented radio controls, added named groups and visible focus, and made primary-seed selection/removal native buttons with retained focus. View controls expose their pressed state; import feedback and completed color picks have live announcements.
- Contrast previews still show the actual foreground/background pairing, while ratios and pass/fail captions use readable interface colors independently.
- Comparison ramps now map the actual picked color through the comparison palette's neutral axis and fitted saturation. Near-neutral picks explicitly omit hue comparisons; clearing comparison clears both output locations. Saturation caps and lightness clamps are described.
- Theme changes preserve hue visibility checkbox state.

Validation: `node --test tests/color-intelligence.test.cjs` — eight passing test groups. Added comparison inverse-coordinate, fitted saturation, neutral/absent reset, and contrast-caption separation coverage. Browser checks verified radio arrow-key operation, keyboard primary-seed selection with focus retention, comparison selection/removal, readable failing contrast captions, and an unchecked red hue remaining unchecked after switching theme. See accessibility-comparison-fixed.png. This is a scoped accessibility improvement, not a complete assistive-technology audit.

Remaining review work: broader calibration eligibility and claims, mobile workflow, shared-source work, and a comprehensive accessibility audit. The sibling color-ramp.html remains unchanged. No commit or deployment performed.

# Third change set — 31 October 2026

- Removed blanket seed accuracy and exact-ramp claims. Explained Fit versus Through, clipping/shared-anchor limits, and that the picker uses PCHIP independently of the 3D controls.
- Added one result-eligibility function used by the selected-color explanation and CSS export scope count. Numerical reference values are withheld for seed-shaped results, changed saturation, clipping, lightness outside either neighbouring ramp, near-ramp taper (<5 degrees), gaps outside the tabulated 25.3–131.4 degree range, active hold-outs, and missing/stale palette checks. Exact sample matches are described without promising whole-ramp identity. Remaining values are explicitly empirical pooled references, not individual confidence intervals. These conservative gates do not constitute a new statistical validation.
- Map stippling is labeled as a surface reference, separately from the active seeded result. Error-based stippling is suppressed at changed saturation and unsupported hue gaps; extrapolation stippling remains separately explained.
- At narrow widths, the existing seed controls move before the map and the picked summary/copy controls move directly after the generated ramp. DOM and keyboard order follow the layout. Desktop positions restore at the breakpoint. Ramp cells scroll horizontally at a readable minimum width with hex values retained. Map methodology and hold-out experiments use collapsed disclosures.

Validation: nine Node test groups pass, including eligibility exclusions and prior identity/import/comparison regressions; git diff --check passes. Browser checks at desktop and in actual 320px/390px iframe viewports verified initial layout, example seed submission, inspecting step 500 (#D6791B), nearby copy controls, and collapsed experiment panels. Copy reported success in both frames; clipboard readback confirmed #D6791B in the 390px frame. Screenshot: mobile-workflow-fixed.png. A reusable manual viewport page is tests/color-intelligence-mobile.html. Physical phones, full screen-reader behavior, zoomed desktop, breakpoint transitions, and physical P3 rendering were not tested.

Remaining: comprehensive accessibility/browser coverage and separately scoped shared-source extraction. The empirical calibration itself has not been independently reproduced. No commit or deployment performed.
