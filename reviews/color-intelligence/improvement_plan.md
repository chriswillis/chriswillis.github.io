# Proposed improvement plan

This is a review artifact, not authorization to modify the application. Target: `color-intelligence.html`. Preserve the existing topology model, built-in palettes, static deployment, and 3D exploration workflow. The separate `color/` DNA solver is related tooling, not a drop-in equivalent.

## 1. Preserve color and seed identity

Separate the selected generated step from coordinates used to generate a ramp. Inspecting a swatch must retain the generated ramp and anchor state, show that step's actual color, and make Copy hex/OKLCH agree with it. Only explicit map/saturation edits abandon the anchored ramp. Keep focus on the selected step through rendering. Preserve primary seed identity when another seed is removed.

Verify the three example seeds in Fit and Through modes; inspect every generated step and compare displayed and copied values before/after selection. Remove seeds before, after, and at the primary selection. Include single and neutral seeds.

## 2. Validate and commit inputs consistently

Require supported complete color syntax, finite components, and exact hex lengths before model construction. Share the validation contract between imports and seeds. Reject unsupported transparency with a visible explanation; retain prior valid state. Use own-key-safe collections for externally supplied ramp/step names. Turn failures into structured errors at the import boundary.

Invalidate preview readiness on every input edit. Commit a validated snapshot of current fields; cancel stale scheduled previews on close/commit. Distinguish initial text-role defaults from explicit blank choices. Surface localStorage failures rather than silently implying persistence.

Verify malformed functions, seven-digit hex, alpha, reserved names, valid→invalid input, rapid edit→Add, and explicit unset roles. Preserve currently supported valid CSS color forms. Keep imported test fixtures local and disposable.

## 3. Repair comparison and presentation state

Map the selected color into comparison model coordinates with its inverse mapping, defining a stable near-neutral fallback. Specify whether the comparison preserves palette-relative saturation or actual color chroma; label that choice. Reset both comparison sidebar and comparison ramp when comparison is absent. Render hue checkboxes from authoritative visibility state on theme changes.

Verify known colors on comparison ramps at several lightnesses, removal of comparison, switching primary to comparison, and partial/all-hidden hue selections across themes.

## 4. Complete accessible interaction and result wording

Keep native segmented radios focusable with visible focus and named groups. Use separate native buttons for primary-seed selection/removal with color-specific labels. Give import and theme controls explicit names. Choose complete tab semantics or ordinary view-switch buttons. Add a concise status region for committed changes and errors, not every drag frame.

Keep preview Aa text in the picked color but place ratios and verdicts in readable UI-colored captions. Display the background name. Scope uncertainty to calibrated interpolation; label seeded/extrapolated results as outside that calibration when appropriate. Remove unsupported exactness and unscoped accuracy promises. Use plain labels distinguishing palette saturation from chroma relative to gamut.

Verify a keyboard-only seed→mode→target→swatch→copy workflow, focus retention, visible errors, and readable diagnostics near either pole in both themes. Check confidence statements against actual generation state.

## 5. Improve the mobile workflow, then reduce maintenance drift

Put seed input before the map and selected-color summary close to the ramp/export action on narrow screens. Place hold-out experiments and methodology under optional disclosures. Give ramp cells a minimum usable width with scrolling or an equivalent detailed inspector; keep meaningful values readable. Preserve a compact overall palette view where useful.

Verify at 320px and 390px widths and zoomed desktop; this is proposed usability validation, not completed evidence.

After behavior is pinned by regression checks, determine ownership of the topology engine/importer shared with `color-ramp.html`, then extract a shared source or build-time module while retaining standalone deliverables. Verify numerical and interaction parity before changing both pages. Do not migrate wholesale to the separate DNA solver on the basis of similar terminology.

## Delivery and boundaries

Deliver changes in small, reviewable groups, starting with identity, input integrity, and keyboard access. No framework replacement or new statistical calibration is required. Existing `color/` tests do not automatically exercise this HTML's independent engine. Add targeted engine and browser regression checks for repaired contracts; run relevant checks before each change group is considered complete. Browser/P3/offline/performance coverage remains explicitly bounded to what is actually run.

## Readiness status after Stage 9

This remains a prioritized backlog. Before implementing each group, resolve its relevant R1–R6 decisions in implementation_readiness_report.md. In particular, the §1 preservation rule must explicitly account for contrast-target buttons; §2 must specify complete token consumption and mixed-input handling; §3 must define the comparison invariant and neutral fallback; §4 needs a calibration-eligibility matrix. Shared-source extraction in §5 is deferred to a separately scoped ownership/build proposal. The review probe is not a complete regression suite.
