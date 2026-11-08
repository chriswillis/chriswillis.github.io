# Palette companion builder — implementation notes

Implemented locally on 2026-11-07 from the approved `concepts_brief.md`.

## User workflow

`palette-dna/ramp.html` starts with the brand ramp selected. The builder shows all authored hue and neutral columns, including hues excluded from the generation surface. Selected columns appear first; unused swatches are dimmed, while their names and selection controls stay readable. Selecting a column and opening its editor are separate actions.

Suggest companion colors produces up to three uncommitted proposals. Accept adds a column. When an accepted companion is active, Replace explicitly replaces that column with a proposal. Undo restores the previous working state. Reset restores a reference's original ramp or a companion's accepted baseline. Removing a companion deletes the working column; deselecting/resetting a reference does not delete the reference.

Hue and colorfulness edits preserve the baseline lightness values and reduce chroma where necessary to fit the source gamut. The brand remains controlled by the original seed inputs. Brand, anchor, second-seed, mode, and reference changes regenerate the brand while preserving accepted companions and edits; unaccepted proposals are discarded. Older retained columns keep their source and step names.

## Computation

`assets/palette-dna/builder.js` contains pure inventory, transformation, suggestion, chart, simulation, and export operations. `builder-ui.js` owns working state and interaction. Neither changes the shared engine, reference palettes, or Map page.

Suggestions use the primary seed's relative colorfulness, with a scale of `1 + 0.25 × (relative − 1)` bounded to 75–110%. A neutral seed uses 100%. The second seed shapes the brand ramp but does not separately set the companion chroma scale. Candidate hue and lightness progressions remain authored; gamut limits can reduce chroma. Greedy candidate selection maximizes the minimum Oklab distance to the brand, currently selected colors, and earlier proposals under normal vision and the three simulations, using automatic light-background chart steps. A distance below 0.5 excludes near-duplicates; it is not an accessibility threshold. This is a deterministic heuristic, not proof of aesthetic fit or perceptual distinguishability.

The chart uses one step per selected ramp. Automatic selection favors Oklab lightness 0.56 on white or 0.72 on #181818, with a penalty for contrast below 3:1. The editor can choose another step. Preview choices do not change exported ramps.

Simulations use the Machado, Oliveira & Fernandes severity-1.0 matrices in linear sRGB, with gamut clipping and sRGB encoding after transformation. The original paper is linked from the page: https://doi.org/10.1109/TVCG.2009.113. Matrix coefficients were cross-checked against QGIS's primary source documentation: https://api.qgis.org/api/qgsprevieweffect_8cpp_source.html. QGIS was used to verify coefficients, not copied as a transfer-function implementation. The original project's description of severity and matrices was located in Machado's thesis: https://www.inf.ufrgs.br/~oliveira/students_dissertations/Masters/Gustavo_Machado_Masters_thesis_UFRGS_2010.pdf.

Contrast measures actual rounded, unsimulated sRGB chart colors against the chosen background. Pair distances measure the displayed normal/simulated chart colors. Wide-gamut fallback disclosures remain visible. These diagnostics do not certify accessibility or simulate every individual's perception.

## State and export

Working state uses `pd.builder.v1`, separate from `rk.state` and the shared `pt.user` reference imports. Accepted columns are snapshots; edits are relative to those baselines. Reload restores working state when generation settings match. A different generator link starts brand-only, retains the older saved workspace until the next change, and explains this visibly. Page links do not share the working palette. Storage failures are reported. Undo is session-only and holds one prior mutation.

The builder bounds reference inventory and stored working records to 96 each, with at most 64 steps per column. This bounds the new builder's work; it does not retrofit the pre-existing importer or model construction with additional limits. Oversized references leave brand export available and disable companion suggestions.

Selected ramps is the default export scope. Active ramp exports the editor's ramp even when deselected. All available ramps includes current references and retained working columns, with edits applied and proposals excluded. All scopes use the same normalization and collision resolution across the full working inventory. Copy and Download use the same serialized text. Formats remain CSS hex, CSS OKLCH, Tailwind 4, Tailwind 3, and JSON design tokens. Empty selected export and invalid seed drafts disable both actions. Token exports are not editable project files.

## Verification

- `node --test tests/color-ramp.test.cjs tests/color-intelligence.test.cjs`: 44 passed, including 14 new builder tests.
- `node scripts/palette-dna-evidence.cjs --check`: passed; original generation evidence is unchanged.
- `PLAYWRIGHT_CHANNEL=chrome node tests/palette-builder-browser.cjs http://127.0.0.1:8765`: passed against a local static server. Checks keyboard selection/focus, proposals, acceptance, edits after brand changes, copy/download byte equality, preview/export separation, reload, invalid-input blocking, and no page overflow at 320, 390, 760, and 1280 pixels. Desktop and mobile screenshots were inspected.
- JavaScript syntax and `git diff --check`: passed.
- The broader engine suite has one existing exact-JSON fixture failure. The engine, palette data, fixture recorder, and fixture are unchanged. Comparing parsed values found 1,419 floating-point differences, maximum `5.828670879282072e-16`, and zero nonnumeric differences. The other five engine tests passed. The fixture was not regenerated to hide this difference.

No deployment or publication was performed. Mini-page previews, individual-step editing, portable project files, and cloud storage remain deferred.
