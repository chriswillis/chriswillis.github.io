# UX and Ergonomics-Brainstormer — raw report

No concept-level blockers. The brand-first direction fits the existing generator, but these UX decisions should be resolved before implementation. All findings concern **UX & Developer Ergonomics**; requirements below are recommendations, not approved scope.

1. **Major — Active, selected, and full scopes need distinct meanings.**
   “Active” could mean the ramp being edited or every included ramp. Dimmed reference columns may look disabled despite remaining selectable. Recommend defining **editing one ramp**, **including ramps in the palette**, and **reference-only ramps** as separate states. Export should name its scope and show ramp/color counts before copying or downloading.
2. **Major — Suggestion acceptance and regeneration need a predictable contract.**
   Users need to know whether suggestions are previews, replacements, or additions. Changing brand color, reference palette, anchor step, or fit mode currently regenerates immediately; extending that behavior could overwrite accepted edits. Recommend showing proposals separately until accepted and explicitly defining how later generator changes affect accepted and edited columns. Reset should identify its destination: original reference, accepted suggestion, or current generator output. Keep deletion distinct from deselection.
3. **Major — Preview requires an explicit mapping from ramps to actual colors.**
   Selecting hue columns does not identify which steps become chart series or UI roles. Shipped palettes use incompatible step conventions, including numeric and named steps. Recommend displaying the exact ramp-step tokens used by the preview and offering a clear background choice. Resolve chart versus mini-page scope, representative-step selection, and whether preview settings also affect export. Do not imply that exporting ramps exports a usable theme or categorical series.
4. **Major — Accessibility results need actionable, contextual interpretation.**
   Existing contrast output examines one ramp against reference poles and its endpoints. Companion distinguishability concerns pairs of rendered series, not those same measurements. Recommend separate contrast and distinguishability views that name the tested colors/background, identify problematic pairs, and suggest an action such as changing a representative step or removing a companion. Label simulations as previews; do not imply simulation alone certifies accessibility. Decide whether metrics describe wide-gamut output or the sRGB export fallback.
5. **Major — Selecting “existing hue columns” must include reference colors omitted by the model.**
   `renderFamily` currently displays `M.loft`, while the engine excludes overlapping reference ramps from loft construction. Additional neutrals also exist in palette data. A builder based directly on that view would hide legitimate existing choices. Recommend retaining all original ramps as selectable references, with any modeling exclusions explained separately. Resolve neutral selection and differing neutral-step counts.
6. **Major — Browser-only edits need visible persistence and recovery semantics.**
   The current URL/local-storage state stores generator inputs, while imported references remain browser-local. New selections, accepted suggestions, and edited ramps will not fit that existing meaning automatically. Recommend defining which edits survive reload, what a shared link includes, and how unavailable imported references are explained. Preserve the current actionable invalid-input behavior: retain the last valid result and prevent exporting misleading stale edits.
7. **Major — Interactive columns cannot inherit the current decorative markup unchanged.**
   Existing family swatches are spans/divs, with names marked `aria-hidden`. Recommend keyboard-operable selection and editing controls, explicit accessible names and state, visible focus, and selection markers beyond dimming. Preserve readable labels and usable targets when many ramps appear on narrow screens.
8. **Nit — Existing messaging contradicts the expanded purpose.**
   The page currently says chart colors are unsuitable and dark-mode tokens are unsupported. Recommend revising these statements to explain the actual supported preview/output scope. Preserve helpful approximation, gamut, and omitted-anchor explanations, but place per-ramp details near the affected ramp to avoid a large combined verdict.

**Files read**

- `/Users/chris.willis/.codex/plugins/cache/egm/egm/0.1.0/agents/comprehension.md`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/docs/designs/palette-companions-review/feature-concept.md`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/palette-dna/ramp.html`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/assets/palette-dna/engine.js`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/assets/palette-dna/palettes.js` (parsed data and metadata inspection)
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/assets/palette-dna/importer.js`
- `/Users/chris.willis/Documents/GitHub/chriswillis.github.io/tests/color-ramp.test.cjs`

Read-only source review; no external fetching or tests executed.
