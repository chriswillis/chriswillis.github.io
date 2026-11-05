**Snapshot from 2026-11-04.** This folder is the only comparison of the site's engine with the palette-dna library in `color/`. `extract-engine.py` reads the engine from the pre-Change-1 pages, so to rerun it, check out the commit before the engine moved to `assets/palette-dna/`. The release evidence now comes from `scripts/palette-dna-evidence.cjs`.

# Engine comparison: seeded hold-out

Compares the topology engine embedded in `color-ramp.html` / `color-intelligence.html` with the
`palette-dna` library in `color/`, on the same palette data.

For each lofted ramp in each palette: remove the ramp, seed with its most colorful step, rebuild
it with each engine from the remaining ramps, and score every other step against the shipped
ramp in ΔE OK ×100 (about 2 = one just-noticeable difference).

Engines: topology (Through color and Fit palette), palette-dna (`spacing: 'reference'` and the
default `'auto'`), and a baseline that rotates the nearest remaining ramp to the seed hue.

Reproduce (about 10 seconds):

    python3 extract-engine.py                      # engine.cjs + pals.json from color-ramp.html
    ../../../color/node_modules/.bin/tsx run.mts   # results.json + console summary
    python3 build-page.py                          # comparison.html (self-contained)

Research evidence only. Nothing here is loaded by the site.
