# Goldfish Brainstorm Review Report

**Target:** [feature-concept.md](feature-concept.md), Palette DNA brand-first companion builder.

**Mode:** BRAINSTORM. Findings are concept risks and recommendations, not a failed implementation-readiness audit.

## Reviewer Status

| Reviewer | Lens | Status | Raw report |
| --- | --- | --- | --- |
| egm-design | Economics and local performance | completed | [design.md](design.md) |
| egm-codebase-details | Observability and local debuggability | completed | [codebase.md](codebase.md) |
| egm-zoom-out | Contrarian and reuse | completed | [zoom-out.md](zoom-out.md) |
| egm-comprehension | UX and ergonomics | completed | [comprehension.md](comprehension.md) |
| egm-implementation-readiness | Compatibility and rollout | completed | [readiness.md](readiness.md) |
| egm-structural | Maintenance and coupling | completed | [structural.md](structural.md) |

All six were launched with `fork_turns: none`, with no reviewer outputs supplied to another reviewer. Two reviewers ran concurrently as slots allowed. Each returned an actual final report identifying the assigned persona, concept input, and all five baseline files read. Native child read-tool transcripts were not separately audited by the synthesizer. Fresh conversation isolation does not establish exclusion of host instruction files. No failures or timeouts occurred. No implementation, tests, or external research were performed.

Baseline supplied to every reviewer: `palette-dna/ramp.html`, `assets/palette-dna/engine.js`, `assets/palette-dna/palettes.js`, `assets/palette-dna/importer.js`, and `tests/color-ramp.test.cjs`. Historical design documents were not treated as requirements. No additional review standards were supplied for this brainstorm.

## Prioritized Findings

Deduplicated outcome: **0 blockers, 8 major findings, 2 nits**. Major means resolve during design, not that concept exploration must stop. The counts describe the grouped findings below, not the sum of each raw review.

### Reference ownership and edit lifecycle — Severity: Major

**Lenses:** all six. **Scope:** generator/model state and builder interactions.

The current model retains reference data and caches by palette ID. Imported references are shared with Map. Editing that source risks a changed baseline, stale cache, or cross-tool effects. Preserve references and baseline as accepted; reviewers recommend separate proposals and committed overrides with stable IDs. Decide reset destinations and behavior after brand/reference/anchor/mode changes. Proposed simulations must never modify exported colors.

### Suggestion policy is not defined by relative colorfulness alone — Severity: Major

**Lenses:** design, zoom-out, codebase. **Scope:** companion generation.

Existing seed-relative colorfulness can help, but its meaning depends on seed hue/lightness and neutral handling. Decide input source, two-seed handling, candidate count, neutral fallback, vivid-brand bounds, and preservation compromises. Reviewers recommend deterministic bounded transformations and reusing engine primitives; they do not claim a scientifically validated adaptation method.

### Selection inventory and scope identity — Severity: Major

**Lenses:** design, zoom-out, comprehension, readiness, structural. **Scope:** family view, active/selected/full, neutral and exact-match handling.

`M.loft` is a modeling subset and omits authored ramps. Reviewers recommend complete reference inventory for selectable columns, separate active versus selected state, and stable IDs independent of names/position. Decide full-palette content, neutrals, original versus edited variants, duplicates, ordering, and exact brand matches. Preserve each column's step labels rather than assuming uniform numeric scales.

### Preview and diagnostics need concrete color context — Severity: Major

**Lenses:** all six. **Scope:** chart or mini-page preview and accessibility inspection.

A ramp is not a categorical color or semantic UI role. Choose a preview and step/role mapping before defining metrics. Name tested colors/backgrounds, working gamut versus sRGB fallback, and simulation assumptions. Separate contrast from pair distinguishability; neither color difference nor simulation certifies accessibility. A bounded chart and locally bundled vetted simulation method are recommendations, not accepted decisions or researched selections.

### Persistence, sharing, and token exports are different contracts — Severity: Major

**Lenses:** all six. **Scope:** `rk.state`, `#r2`, legacy links, `pt.user`, multi-ramp exports.

New state cannot safely be assumed to fit old readers or shared reference storage. Token exports need not satisfy reference-import requirements and cannot be promised as reloadable projects. Reviewers recommend versioned builder state, preserved legacy input behavior, clear unavailable-reference handling, and visible unsaved state. Resolve snapshots versus recipes, reload/link scope, and rollback behavior without implying project-file scope has already been approved.

### Interactive accessibility and proposal feedback — Severity: Major

**Lenses:** comprehension, codebase. **Scope:** column controls and failure behavior.

The decorative family markup cannot become the interactive control unchanged. Recommend keyboard-operable selection/editing, named states, visible focus, markers beyond dimming, and usable small-screen targets. Explain source/status and material compromises near each ramp. Keep invalid drafts separate from the last valid committed output, with understandable export and persistence feedback.

### Browser work needs meaningful bounds — Severity: Major

**Lenses:** design, zoom-out, structural. **Scope:** imports, recomputation, pairwise diagnostics.

Import text limits do not adequately bound ramp/step work. Whole-palette pairwise analysis multiplied by simulation modes can be costly and misleading. Recommend checking colors actually used, explicit input bounds, and measured latency before workers/caches. No backend quota or token budget is relevant to the current static architecture.

### Shared rendering and generation need explicit transitions — Severity: Major

**Lenses:** structural, readiness, design. **Scope:** page state, shared scripts, exports and analysis.

Current rendering generates/persists and handlers mutate one-ramp state. Additional transitions can diverge without an explicit working-state contract. Recommend pure suggestion/diagnostic computations and a shared scope resolver feeding preview, analysis, and serializers. Keep shared engine behavior compatible and deploy matching assets together; preserve existing single-ramp output semantics.

### Focused verification — Severity: Nit

**Lenses:** codebase, structural, readiness, design. **Scope:** eventual implementation verification.

Extend existing precision, invalid-input, step-pin, import-race, failure, and legacy-state coverage with immutable-source, acceptance/reset/regeneration, scope, and migration invariants. The mocked DOM cannot establish browser focus, dimming, or simulation rendering behavior. This is future verification guidance, not tests run in the brainstorm.

### Update product claims and reuse serializers — Severity: Nit

**Lenses:** comprehension, zoom-out. **Scope:** page wording and export paths.

Existing chart-unsuitability wording needs revision to match the eventual scope without promising a complete theme. Generalize the existing serializer for named ramps and share it between copy/download; retain gamut disclosures and useful approximation explanations.

## Decision Handling

The [concepts brief](../../../concepts_brief.md) separates accepted directions, reviewer recommendations, and unresolved choices. No reviewer recommendation is represented as an author decision. No final preview, simulation method, suggestion formula, project persistence promise, or reset contract has been approved by this review.
