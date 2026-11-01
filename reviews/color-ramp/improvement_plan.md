# Proposed repair backlog for color-ramp.html

This is a review proposal, not authorization to edit the application or a completed implementation specification. Keep the standalone page and its current input-first mobile layout. No new numerical algorithm, framework, backend, or shared-source migration is required for the first changes.

## 1. Establish input and output identity

Apply complete supported-syntax validation, finite coordinates, and explicit opaque-input policy to direct input and import extraction. Reject malformed or translucent direct inputs atomically. Preserve the last valid ramp, with explicit UI text saying it belongs to the previous valid input; make export behavior unambiguous while input is invalid. Empty input must not silently retain an unexplained result. Imported transparency can follow the sibling's existing skip-with-note policy if the distinction is visible.

Replace blanket exactness language with output facts, or implement actual identity preservation for supported inputs. Before implementation, choose between exact insertion and a qualified Through mode; do not assume simply changing the label resolves loss of brand-token identity. Handle near-authored samples, neutral inputs, lightness bounds, gamut compression, and anchor collisions. Track surviving seed indices and state precisely which supplied seed was omitted. A near-reference match must not masquerade as literal equality.

Acceptance: actual sample, #D14D42 against Flexoki, #808080, display-p3 red, extreme OKLCH, and near-equal-lightness inputs in both orders. Compare input, anchor, visible value, and exports. Include existing built-in palette parse smoke checks and malformed syntax/alpha/reserved-name cases.

## 2. Preserve state and make import commit current

Specify a versioned URL representation that retains supported color precision and gamut; accept legacy hashes without silently overwriting a higher-precision local value. Define precedence for URL versus stored state, unknown imported palette IDs, and name/format retention. Original input, internal color, and display hex are distinct values.

Invalidate import readiness immediately on text/name edit or file attempt. Commit must validate current input and persist successfully before finalizing selection/closing. Cancel pending preview work. File read failures, size rejection, rapid successive file selections, and storage errors must leave a coherent previous state. Imported names/steps must use own-key-safe collections.

Acceptance: current data after immediate Add, invalid edit after valid preview, renamed preview, oversized/unreadable file after success, storage denial, and precision-preserving reload for one/two colors. Test unknown import IDs and older links. Explicitly define file-read request ordering before implementing asynchronous upload handling.

## 3. Explain the actual result and complete keyboard flows

Keep surface hold-out data as reference evidence, not a per-result probability claim for anchored output. One result-provenance structure should identify reference-ramp substitution, neutral substitution, generated anchors, moved/omitted seeds, and gamut representation. Update visible verdict, mode hints, methodology, metadata, and export caveats together. Show which export formats keep P3 and which provide sRGB fallbacks. Do not add a new calibrated anchored estimator in this change.

Prefer ordinary pressed buttons for export formats unless full tab behavior is implemented. Provide a native keyboard-operable upload action, visible color-input focus, return focus after closing import, and concise live announcements. Test actual assistive technology separately from accessibility-tree inspection.

Acceptance: keyboard input→mode→format→copy, upload/open/close, errors, changing export format, copy rejection fallback, and both themes. Contrast captions must distinguish a measured ratio from an asserted pass; verify any implication about subsequent steps against actual exported colors.

## 4. Keep responsive strengths and isolate source ownership

Retain stacked detailed swatches below 40rem and input-first layout. Defer the optional nearby Copy/export jump action; verify at 320px, 390px, medium desktop widths, and desktop zoom. Do not assume per-step inspection exists or is required: adding it is a separate product choice.

Create a standalone target harness at tests/color-ramp.test.cjs that executes the shipped inline code, with browser checks for state and focus. The existing probe is diagnostic and must become assertions for fixed contracts. Do not treat color/ package tests or the sister page's tests as target coverage.

After behavior is covered, separately choose canonical ownership for Engine, Importer, embedded data, and generated standalone outputs. A shared script or small generation step is viable; migrating to the separate DNA package requires an explicit model decision and is outside this backlog.

## Stage 8 refinements for readiness review

Apply persistence-before-finalization to palette removal as well as addition; a failed write must preserve the previous in-memory list and selection and show an error. Do not relabel current tapered band predictions as reference evidence without justification: prefer actual hold-out summaries and remove unsupported confidence-colored result badges. Extend the existing generated output object rather than creating a parallel provenance model. Exact seed preservation versus explicitly qualified approximation remains a product/implementation decision to settle before that change.

## Readiness outcome

All review stages completed. See implementation_readiness_report.md for unresolved identity, URL, asynchronous import, result-field, format-control, and test-harness contracts. Settle these before each scoped implementation; this document remains a backlog rather than a completed specification.
