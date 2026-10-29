# Stage 7 — Style and UX review

Target: `color-intelligence.html`, entire application. This is a source-based review; browser rendering and assistive-technology behavior were not tested. Findings distinguish directly observable implementation from layout risks requiring viewport verification. No application files were edited.

Read confirmation: read `agents/style.md` and `resources/document_standards/feature-spec-standard.md` in full from the EGM 0.1.0 plugin. Applied clarity, objective claims, alternatives, and explicit limits to interface wording and interaction. Specification headings are not requirements for this HTML application. The report file is the only review output written as explicitly requested.

## Findings

### S1 — Major: essential segmented controls cannot receive keyboard focus

**Evidence:** line 74 hides every `.seg input` with `display: none`. These radios control gamut (255–258), interpolation (298–303, 312–320), snapping (363–367), seed behavior (423–426), and contrast target (447–451). There is no replacement keyboard interaction on the labels.

**Impact:** users navigating with a keyboard cannot choose these settings, even though the canvas supports arrow keys. This blocks core workflows.

**Practical fix:** retain native radio inputs using a visually hidden technique that preserves focus, expose a focus outline on the associated segment, and group related radios with a named fieldset/legend. Also replace the `.off` pointer-events styling (223) with actual disabled state for inactive controls.

**Tradeoff:** native radios preserve reliable selection behavior with minimal JavaScript. Rebuilding these as ARIA radio widgets gives more styling control but requires implementing focus and arrow-key behavior correctly.

**Verification:** keyboard-only operation must change each group and expose a visible focus state; inactive controls must not activate.

### S2 — Major: the contrast verdict becomes unreadable precisely when contrast fails

**Evidence:** `update()` puts both sample text and the contrast number/badge in the selected color (1888–1889). The two cards use the palette's light/dark pole backgrounds (1887).

**Impact:** a selected color near either background hides its own ratio and failure status. These are essential diagnostic results rather than decorative previews.

**Practical fix:** keep “Aa” in the selected foreground color, but render the ratio, background name, and result in a separate high-contrast caption using interface text colors. Clarify that the badge describes this text/background pair.

**Tradeoff:** a separate caption slightly increases card height but keeps realistic previews and readable diagnostics together.

**Verification:** select each pole color and a near-pole color; both ratios and results remain readable in both interface themes.

### S3 — Major: seed selection and feedback do not have equivalent nonvisual interactions

**Evidence:** primary seed chips are click-only spans (2041–2052); only their remove buttons are focusable, and every remove button is named “Remove seed.” The canvas has an instructional accessible label (379), but selected values and validation/error containers have no live status mechanism (`vhex`, `voklch`, `vpos`, `seedmsg`, `impp`). `#impt` at 469 has a placeholder but no explicit label. The theme button (262, 2247–2248) exposes only a moon/sun glyph.

**Impact:** keyboard users cannot choose a different primary seed; screen-reader users cannot readily distinguish seed deletion controls or discover updated results and errors. Several controls lack useful names.

**Practical fix:** split each chip into sibling “Make [color] primary” and “Remove [color]” buttons, expose the primary state, label the palette textarea, and label the theme action dynamically. Add one concise, polite status region for committed picker changes and import/seed errors; do not announce every pointer-move frame.

**Tradeoff:** using one debounced status region avoids a stream of duplicate announcements. Multiple verbose live regions would make dragging and typing difficult to follow.

### S4 — Major: mobile flow puts seed input and picked-color results after the entire workbench

**Evidence:** `.pick` becomes a one-column grid below 52rem (155–165). Its main content contains the full-height map, long legend, generated ramp, and hold-out test (359–407); seed entry and picked-color results appear afterward (409–458). The mobile map aspect ratio is `1 / 1.05` (162).

**Impact:** on a narrow screen, entering a seed, inspecting its ramp, and reading the picked value require movement between separated parts of a long page. This is a structural usability risk inferred from DOM order, not a measured scroll distance.

**Practical fix:** order the primary flow as seed/pick controls, map, selected-color summary, ramp/export. Put hold-out testing and nearest-color diagnostics in optional disclosure sections. Use semantic DOM order matching the visual order.

**Tradeoff:** disclosures reduce immediate access to research diagnostics; preserve their expanded state and keep the current desktop inspection workflow available.

**Verification:** at 320px and 390px widths, complete a seed → inspect → copy workflow without repeatedly traversing the hold-out section. Check zoomed desktop layouts as well.

### S5 — Major: narrow ramp cells and low-contrast metadata weaken the application's precise color workflow

**Evidence:** ramp columns divide available width evenly regardless of step count (129, 1857); mobile hides hex labels (161), while hold-out step/error text shrinks to 0.55rem (244). Hex labels use `--tx-3` at 134; hold-out step labels and several numerical differences also use that token (198, 2104–2105). Defined foreground/background pairs yield approximately 2.00:1 in light mode and 2.61:1 in dark mode by direct luminance calculation.

**Impact:** thirteen steps become very narrow targets on phones, and values used for precise comparison are difficult to read. Imported ramps can have still more steps. Tooltips do not replace persistent values on touch devices.

**Practical fix:** set a usable minimum cell width and allow horizontal scrolling within the ramp, retain the selected step's full value in a stable inspector, and use the secondary text token or another sufficiently contrasting token for meaningful metadata. Keep hold-out errors at readable text size.

**Tradeoff:** scrolling sacrifices an all-at-once overview. A compact overview plus a scrollable detailed strip preserves both use cases; wrapping is simpler but makes ramp progression less obvious.

### S6 — Major: certainty language exceeds the demonstrated scope and current behavior

**Evidence:** introductory seed copy says “One color gives a ramp through it” and “about twice as accurate” (419), while default mode is `fit` (1678) and generation caps the seeds to the palette (`cap`, 1905). The application itself tells users to switch modes to include an outlying seed (2091). The position readout claims “reproduce this real ramp exactly” whenever angular distance is below 1.5° and saturation is 1 (1898), even though the pick can be merely near the ramp. The uncertainty calculation uses pooled calibration (1109–1113), with limitations relegated to smaller text (1900).

**Impact:** users can reasonably expect exact seed preservation or a guaranteed error bound when the application provides a fitted model and empirical estimate.

**Practical fix:** use “A seed guides the ramp. Fit palette may adjust it; Through seed aims to preserve it within the selected gamut.” Replace “twice as accurate” with a scoped, linked benchmark claim or omit it until that evidence is accessible. Use “Near the [name] ramp” unless exact reproduction is actually verified; place “estimated from held-out ramps” next to uncertainty numbers.

**Tradeoff:** concise qualification is preferable to a lengthy warning; retain detailed methodology in an expandable explanation rather than removing useful uncertainty information.

### S7 — Major: dense terminology hides the action a new user should take

**Evidence:** the 3D sidebar presents validation details before interpolation controls (291–323), and `renderValidation()` adds method tables, error components, calibration factors, and correlation values (1487–1503). The picker legend at 382 explains neutral axes, lofting, off-curve steps, interior ramps, uncertainty, just-noticeable differences, and clipping in one paragraph. “Saturation” (368) is a fraction of this palette's surface (`pointSeg`, 823–830), while “rel C” (443) is relative to gamut chroma (1884, 1892).

**Impact:** two different normalized chroma measures appear without an immediate distinction, and specialist explanation competes with pick/generate/export actions.

**Practical fix:** label the slider “Palette saturation” with “1 = this palette's surface,” label the value “Chroma / gamut maximum,” and give the map a short visible instruction (“Pick a color, then copy its ramp”). Provide a compact visual legend for stipple, hatch, and marker types; move derivation and benchmark details into “How estimates work.”

**Tradeoff:** experts may prefer everything visible. Persist disclosure state and retain the existing numerical detail rather than simplifying away model limits.

### S8 — Nit: tabs expose incomplete semantics and mix unrelated controls into the tab list

**Evidence:** `nav[role=tablist]` contains palette selection, import, gamut, theme, and the actual tabs (249–263). Tab buttons have no `aria-controls`; panel containers (265, 359) have no tabpanel relationship. The switcher updates hidden/selected state but has no tab keyboard pattern (2229–2245).

**Impact:** navigation is usable through ordinary button activation but its announced structure does not match a coherent two-tab control.

**Practical fix:** separate global controls from the tab list, connect tabs to named panels, and implement roving focus and directional navigation. Alternatively, use ordinary view-switch buttons with explicit pressed state if full tab semantics are unnecessary.

**Tradeoff:** ordinary buttons are simpler; proper tabs provide a familiar relationship between selected view and panel. Choose one complete interaction pattern.

### S9 — Nit: UI lacks a useful title and landmark structure for orientation

**Evidence:** `h1` is styled (68) but no h1 exists in the document. The mobile breakpoint hides the brand/title (164). Main content uses generic divs; the chart container is empty markup before Plotly renders (267). Chart instructions appear at the bottom of the sidebar (353).

**Impact:** users arriving on mobile or navigating by headings/landmarks lack a clear statement of the tool and its primary interaction.

**Practical fix:** include a concise page heading and main landmark; provide a textual chart description and move short operation instructions beside the plot. Keep the detailed metrics table as a complementary textual inspection surface.

**Tradeoff:** a compact heading consumes a small amount of vertical space but improves orientation without redesigning the visualization.

## Suggested order

Fix keyboard access and readable contrast results first (S1–S3). Then repair mobile workflow and precision metadata (S4–S5), qualify model claims (S6), and introduce progressive disclosure and clear terminology (S7). Complete navigation semantics and landmarks (S8–S9) in the same accessibility pass where practical. Preserve the existing useful uncertainty overlays, labeled native inputs, keyboard-enabled picker, and hold-out comparison as foundations.
