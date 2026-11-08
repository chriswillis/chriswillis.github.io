# Palette DNA: Brand-First Companion Palette Builder

* **Author:** chris willis
* **Date:** 2026-11-07
* **Status:** Approved by the author for implementation. Built locally; implementation decisions and verification are recorded in `docs/designs/palette-companions-implementation.md`.

## Overview

The main risks are unintended replacement of accepted colors and accessibility results that imply more than they measure. The author has agreed that changing the brand updates only its ramp, preserving accepted companions and manual edits. New suggestions remain proposals until accepted. The defaults below complete the proposed interaction; technical diagnostic methods still require validation during design.

Palette DNA will help designers build a custom palette around a brand color for design systems and data visualization. It starts with only the brand-generated ramp selected. An explicit **Suggest companion colors** action proposes companions informed by the reference palette's character and the brand's relative colorfulness, retaining hue identities and lightness progressions where possible. Users can accept suggestions or select existing reference hue columns, adjust individual ramps, reset or delete edited columns, inspect the selected palette, and export it.

The existing tool generates one ramp from one or two colors using a chosen reference. It already has color conversion, gamut handling, contrast inspection, imports, and several export formats. The proposed builder extends this workflow; a selected palette is not automatically a finished semantic theme or a validated categorical chart scheme.

## Analysis

All six fresh-context reviewers completed. None found a blocker to concept exploration. They identified significant design choices to settle before implementation. Detailed findings and read lists are retained in [the consolidated report](docs/designs/palette-companions-review/goldfish_review_report.md).

### Contrarian: reuse the engine and keep the first preview bounded

Existing generation and relative-colorfulness helpers are useful starting points. A small deterministic suggestion policy is a stronger initial candidate than a general optimizer. Matching every hue to the same chroma could erase the reference's deliberate differences. The strongest counterargument to the expanded builder is that selection plus existing ramp editing may provide most of its value without automatic adaptation; the explicit suggestion action allows that simpler workflow to coexist.

A single categorical chart is the accepted first preview because it exposes companion relationships with fewer new concepts. The author agreed to this narrower first version after the review. A mini page is deferred; it would add role assignments, backgrounds, typography, and component states.

### Economics and local performance: bound work in the browser

This is a static client-side tool; no backend, LLM service, or distributed tracing is indicated. Imports have a text-size limit but not a sufficient explicit ramp/step computation bound. Pairwise checks across every swatch and every simulation could multiply work that has little relevance to the actual preview. Reviewers recommend evaluating the colors actually used, bounding inputs, and measuring interaction latency before introducing workers or additional caching.

### UX: distinguish editing, inclusion, and reference context

The active ramp being edited and the ramps selected for output need separate meanings. Dimming unused reference hues must not make selectable colors look unavailable; keyboard controls, readable labels, visible focus, and non-color selection markers are recommended. Suggestion proposals should be visibly distinct from accepted or manually edited colors. Reset must state its destination, and deletion must be distinguishable from deselection.

The current family view uses a generator subset called `M.loft`, which omits some authored hues. Reviewers recommend using the complete reference inventory for selection, leaving model exclusions as explanatory information. Neutral inclusion and differing neutral step lists remain unresolved. Stable column identity is particularly important when the brand exactly matches a reference hue.

### Compatibility: preserve existing sessions and shared references

Imported reference palettes are stored in `pt.user`, shared with Palette DNA Map. Current ramp settings use `rk.state`, `#r2` links, and older link handling. Reviewers recommend separate, versioned builder state and additive changes to shared generation code. Edited output must not silently enter the shared reference registry or change later generation.

Existing token exports cannot be assumed to reload as editable projects: the reference importer expects enough compatible hue ramps to construct a model, while a selected export may contain one ramp or semantic step names. Project saving or portable sharing would need an explicit contract; neither is accepted additional scope. Existing single-ramp output and old links should remain useful under the eventual compatibility plan.

### Observability: explain local results and their limits

Reviewers recommend showing each column's source, proposed/accepted/edited status, and material gamut or lightness compromises. Failed persistence should be visible if users are relying on saved edits. Reproducibility means clearly stating what survives reload and what a link includes, not adding server telemetry.

Contrast checks must name the foreground/background pair. Categorical distinguishability concerns the exact colors used together in a chart, its background, and the viewing assumptions. A color-distance value or color-vision-deficiency simulation does not certify accessibility. Diagnostics should identify the step, working gamut or exported fallback, and simulation mode they describe. No simulation implementation was found in the searched source; method selection and validation remain future work, without a scientific guarantee in this brief.

### Maintenance: separate the source, proposals, and committed work

Reviewers recommend immutable reference data and generator baseline, separate proposals and accepted edits, stable column IDs, and explicit state transitions. One resolved set of colors should feed preview, metrics, and serializers so their scopes cannot drift. Simulations should be derived views and never change actual palette values. Reuse the existing export formats and validation harness; browser checks will also be needed for interactive columns and simulations.

## Goals vs. Non-Goals

**Accepted in-scope goals:**

- Begin with only the brand-generated ramp selected.
- Offer companion suggestions only through **Suggest companion colors**, informed by reference character and relative brand colorfulness.
- Allow acceptance of suggestions and selection of existing hue columns.
- Support per-ramp adjustment, reset, and deletion of edited columns.
- Preview selected colors while unused reference hues remain dimmed for context.
- Use a categorical chart for the first preview; defer the mini page preview.
- Provide accessibility measurements and color-vision-deficiency simulations, with contrast and categorical distinguishability treated separately.
- Copy or download active, selected, or full palette scopes in existing formats: CSS hex, CSS OKLCH, Tailwind 4, Tailwind 3, and JSON tokens.
- Preserve the original reference palette and prevent silent mutation of the generator baseline by automatic edits.

**Accepted non-goals and boundaries:**

- Individual-step editing is deferred.
- A universal accessibility score or automatic certification is excluded.
- Reference character, hue identity, and lightness progression are intentions to preserve where possible, not unconditional mathematical guarantees.

**Not established as scope:** a general theme editor, semantic token assignment, cloud projects, a new backend, portable project files, optimization framework, or comprehensive chart library. These are not implied by the accepted builder direction.

## Alternatives Weighed

| Alternative | Current disposition and reason |
| --- | --- |
| Start with all reference hues selected | Excluded by the accepted brand-only starting state; users build outward deliberately. |
| Automatically apply suggestions or silently train on edited output | Excluded by explicit suggestion/acceptance and baseline-preservation decisions. |
| Edit individual color steps now | Deferred by the user; the initial editing unit is the ramp. |
| One universal accessibility score | Excluded by accepted direction; contrast and categorical distinctions answer different questions. |
| Select existing hues without suggesting adaptations | Retained as an accepted manual path; reviewers challenge whether it may satisfy much of the need. |
| Equalize chroma across all hues or build a broad optimizer | Reviewers advise against this initial approach because it may erase reference character or add unnecessary complexity; no author rejection is recorded. |
| Generic chart versus mini page | Author accepted a chart-first version after review. Mini page deferred because it needs more role decisions. |
| Use token exports as editable project files | Reviewers advise against assuming equivalence because the importer and export scopes have different purposes; project persistence remains unresolved. |

## Key Decisions & Staging for Next Steps

**Accepted decisions to carry forward:** brand-first selection; explicit suggestions and acceptance; preservation of reference character where possible; reference and baseline protection; per-ramp editing; scoped existing-format export; separate contrast and categorical diagnostics; deferred step editing.

**Additional accepted decision after review:** use a categorical chart for the first preview and defer the mini page.

**Accepted brand-change behavior:** changing the brand updates only the brand ramp. Accepted companions and manual edits retain their values and selection. Suggest companion colors can propose a fresh set, but nothing replaces accepted work without acceptance. Recalculate diagnostics against the changed brand and current companions; preservation does not imply they still fit equally well.

**Reviewer recommendations awaiting author alignment:** immutable layers with stable IDs; complete authored-hue inventory; independent active/selected states; deterministic bounded suggestions; visible provenance and save failures; one shared output-scope resolver; versioned working state separate from references; reuse existing engine and exporters.

### Proposed defaults for author alignment

- **Selection and editing:** selecting includes a column in the custom palette; opening it for editing is a separate action. Start with the brand selected. Use visible selection markers in addition to dimming. Keep all authored reference hues available, including those excluded from the generator's surface.
- **Reset and removal:** Reset edits restores the column's baseline: the original reference ramp or the accepted suggestion before manual edits. Removing an added companion deletes that working column; an original reference column can be deselected and its edits reset, but its source is never deleted. Provide Undo for removal and replacement. The brand stays available even when deselected.
- **Suggestions:** initially propose up to three companions, fewer when there are insufficient distinct candidates. Show proposals separately and accept them individually. Accepting a fresh set adds companions by default; replacing an existing companion is an explicit action. Use deterministic, bounded adjustments informed by relative brand colorfulness, rather than equalizing chroma. With a near-neutral brand, retain reference colorfulness rather than inventing a meaningful brand hue. Candidate ranking, bounds, and duplicate detection must be evaluated before implementation is specified.
- **Other generation changes:** propose the same preservation rule for anchor, second seed, fit mode, and reference changes: regenerate the brand, retain accepted companions and edits, and discard only unaccepted proposals. Retained companions keep their source labels and own step keys, even when a new reference uses different steps. This extension of the agreed brand-change rule awaits alignment.
- **Chart preview:** start with a labeled categorical bar chart on an explicit light background, with a dark-background toggle. Choose and display one representative step per selected ramp; allow that chart step to change without changing the underlying ramp. The automatic step rule is a design task because palettes use different step names and lightness ranges. The preview must remain readable through labels as well as color.
- **Accessibility inspection:** show contrast against the preview background, weakest pairs among actual chart colors, and protanopia, deuteranopia, and tritanopia simulations. Use sRGB chart colors for an explicit baseline and show when a wide-gamut ramp differs. Simulations affect the preview only. Research and validate the simulation model and distance method during design; do not attach an unsupported pass/fail threshold to categorical distance.
- **Export:** default to Selected ramps. Active ramp exports the open editor's ramp, even if not selected. Label full scope All available ramps and describe that it includes unused reference hues and accepted additions, with working edits applied once per column; exclude unaccepted suggestions. Resolve stable names and collisions before serialization. Copy and Download use identical values for a given scope and format. Disable selected export with a clear message when selection is empty. Preview step/background settings do not trim or recolor ramp exports.
- **Saving:** retain working edits and selection locally in separate versioned storage, with visible failure feedback. Keep original imported palettes unchanged and preserve existing links. Until a portable project contract is designed, do not imply that an old generator link or a CSS/token download reproduces the editable project. Cloud storage and project-file import/export remain deferred.

### Questions reserved for formal design

Choose and test the suggestion formula, bounds, candidate ranking, two-seed interpretation, and near-duplicate handling; specify the chart step rule and diagnostic methods; define neutral inventory and exact brand/reference identity; specify state schema, missing-reference recovery, legacy links, naming, and computation limits. These are required design outputs, not claims that the brainstorm has solved them.

**Suggested staging, not an approved delivery plan:** settle interaction and scope definitions first; draft the state and compatibility contracts; compare a few deterministic suggestion candidates on representative references and edge cases; then specify preview and diagnostic behavior. Preserve current precision, import-failure, invalid-input, pinned-step, and legacy-link checks; add immutable-reference, transition, export-scope, and browser-interaction verification. No implementation or external-method validation was performed in this brainstorm.
