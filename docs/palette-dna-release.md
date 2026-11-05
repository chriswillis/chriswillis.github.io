# Palette DNA release checklist

Run from the repository root before committing a release of the Palette DNA pages.
Design: `docs/designs/palette-dna-tools.md`.

1. **Version the shared scripts.** Set the same `?v=YYYY-MM-DD` (the release date) on all three
   `<script src="…assets/palette-dna/…">` tags in every page that loads them: the ramp page and the
   map page. Keep `engine.js` compatible with the previous controller for one release, because a
   page cached before the release can load the new engine for about ten minutes.
2. **Run the tests.** `node --test tests/*.test.cjs`
3. **Refresh and check the evidence.** `node scripts/palette-dna-evidence.cjs`, then
   `node scripts/palette-dna-evidence.cjs --check`. The check fails if any `data-evidence` number on
   the tool pages, or the committed `palette-dna/evidence.html`, differs from a fresh run.
4. **Manual checks.** Serve the repository with `python3 -m http.server 8000` and open
   `http://localhost:8000/`:
   - Both tool pages at 320, 390 and 1280 px wide, light and dark: no horizontal scroll.
   - With site data cleared, the ramp page loads its default palette with the example ramp.
   - Export (CSS, Tailwind, tokens) matches the swatches.
   - `palette-dna/evidence.html` renders, and its viewer filters work.
   - After a rename or move: old links (with their `#r2=` state) land on the new page intact, and
     a palette imported earlier is still listed.
   - New social images look right in a link-preview tool.
5. **Commit.**
