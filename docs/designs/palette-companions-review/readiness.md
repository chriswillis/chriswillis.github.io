# Compatibility-Brainstormer — raw report

No blocker to exploration. Four **Major** compatibility risks should shape the concept brief; these are proposed refinements, not approved decisions.

1. **Migration & Backward Compatibility — saved state and rollback.** Existing state uses `rk.state`, share links use `#r2=`, and legacy `#c-…` links remain supported. Adding edited columns or selections to these existing containers risks older code silently discarding them when it renders and saves. Recommend versioned builder state, preserving legacy readers and prior data. Legacy sessions should initialize with only their generated brand ramp selected. Unresolved: whether saved projects contain color snapshots, generation parameters, or both; how new links behave after rollback; whether imported references travel with links.
2. **Migration & Backward Compatibility — reference mutation affects another tool.** Imported palettes reside in shared `pt.user`; the page explicitly synchronizes this list with Palette DNA Map. `Engine.build` retains the palette and raw array references, while model caches are keyed by palette ID. Editing those objects directly can change the generator baseline, leak edits to Map, or leave stale models. Recommend keeping original reference objects immutable and storing selections, accepted suggestions, and edits separately. Unresolved: reset target for each column, treatment of existing edits when the brand/reference changes, and recovery when another tab removes the source palette.
3. **Migration & Backward Compatibility — export identity and round trips.** Current exports serialize one named ramp. Multiple ramps introduce duplicate-name collisions, ordering, and scope ambiguity. Built-ins include semantic step names, reversed numeric tone scales, and neutrals with different step arrays. The importer requires four hued ramps sharing a scale, and its JSON/CSS collectors generally expect numeric step suffixes; therefore selected exports and semantic-step exports cannot automatically serve as reloadable projects. Recommend preserving existing single-ramp output behavior and explicitly distinguishing token export from project saving. Unresolved: “full palette” includes original or edited reference columns, neutral inclusion, collision naming, and whether project round trips are promised.
4. **Migration & Backward Compatibility — shared engine and release coupling.** The engine and importer are shared classic scripts; existing tests enforce their loading order and common release version. Companion changes to existing generation methods could change old ramp outputs or Map behavior. Recommend additive companion operations, preserving existing generation semantics and deploying compatible HTML/assets together. Retain regression coverage for legacy URLs, precise P3 input, pinned steps, and transactional import failures; add builder-state migration/rollback coverage once persistence is chosen.

A related scope choice: the family view currently uses `M.loft`, which deliberately excludes overlapping reference ramps. “Select existing hue columns” and “full palette” should explicitly decide whether they include all authored ramps (`M.R`/`pal.ramps`) or just those used to construct the surface.

Files actually read:

- `/Users/chris.willis/.codex/plugins/cache/egm/egm/0.1.0/agents/implementation_readiness.md`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/docs/designs/palette-companions-review/feature-concept.md`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/palette-dna/ramp.html`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/assets/palette-dna/engine.js`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/assets/palette-dna/palettes.js`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/assets/palette-dna/importer.js`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/tests/color-ramp.test.cjs`

Read-only review; no external fetching or tests executed.
