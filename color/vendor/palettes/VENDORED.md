# Vendored: color-js/palettes (data subset)

- Upstream: https://github.com/color-js/palettes (Lea Verou; palettes.colorjs.io)
- Commit: 6583c31a8edcc6bcc36d5b5dc235d395697cdd00
- Vendored: 2026-09-19
- Files: data/colors/*.json (normalized per-palette colors, 11 systems), data/hues.json
  (published per-hue statistics), data/palette_metadata.json. Build scripts, site and raw
  source files omitted.
- License: see LICENSE

Methodology of the published hue statistics (from `_build/summary.js` upstream): for each
palette and hue family, the 1–2 middle steps *by index* are converted to OKLCH with
Color.js; their hues are pooled across palettes, unwrapped to avoid the 0/360 seam, and
summarized with a population standard deviation (÷N). Family membership is by the
source system's own key name (e.g. "blue"), not by hue proximity.
