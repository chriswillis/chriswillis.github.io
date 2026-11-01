# Browser checks — 31 October 2026

Target: local color-ramp.html, served on 127.0.0.1:8765. Review only; no application changes.

- Normal startup: default #9D58BA, Flexoki, Stays exact. Input controls and mode buttons appear as native accessible controls. Generated swatches are static list items, not interactive selection buttons. This differs from the topology application's old swatch-selection bug.
- Entered `oklch(60% nope 30)` and pressed Enter. Input was accepted; URL became `#c-ananan.flexoki.through`; result became the neutral ramp and said the input was close to gray. No invalid-input message appeared.
- Entered `#D14D42`, Stays exact, Flexoki. Generated anchor/export became `#D14D41`, with “Your color is Flexoki red-400”. See exact-mismatch.png. The difference is small, but contradicts exactness; it is not evidence of perceptible harm for that example.
- Entered `color(display-p3 1 0 0)`. URL became `#c-ff0000.flexoki.through`. Reload changed the input field to `#FF0000`. This confirms a lossy hash overriding the stored higher-precision input.

Probe: `node reviews/color-ramp/probe.cjs` executes the actual inline Engine, Importer, and controller functions in a Node VM with small DOM/storage collaborators. See probe-results.json. JSON null values in malformed parsed coordinates represent NaN; the explicit `finite:false` field records this. The probe is diagnostic evidence, not a complete regression test suite.

No physical phone, physical P3 display, full screen-reader audit, external design-token consumer, or full browser matrix was tested in these checks. Numeric color differences are algorithmic evidence, not display measurements.

## Narrow viewport check

Loaded the app in 320px and 390px iframes using mobile-check.html. Inputs precede the result and swatches become rows with visible hex values. At 390px the export controls and code remain readable. See mobile-layout.png. These are narrow browser viewports, not physical-device tests. The input-first layout should be retained; the topology page's old layout defect does not apply here.
