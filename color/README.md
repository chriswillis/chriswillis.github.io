# Palette DNA

Extract the perceptual DNA of a design-system palette — lightness, chroma-relative-to-the-
gamut-shell, and hue-drift curves in OKLCH — and transfer it onto arbitrary target hues.

```ts
import { palette } from 'palette-dna';

const p = palette({ seed: '#7c3aed', neutrals: true, families: { danger: '#dc2626' } });
p.tokens;  // primitives + semantics, light and dark, keyed by stable ID
p.lint;    // every finding, with its evidence and its remedy
```

One call: solve both modes from the seed, assign the semantic roles from the contrast
matrix, audit the result against 185 ramps from 13 shipping systems, and lint it. Every
stage is available on its own; this is the path that picks defaults for all of them.

**The default reference is Tailwind v4** — the most used of the thirteen, it documents a
key step (500) so a brand fill has somewhere to pin, and it is authored for Display P3.
Its curves are what a generated palette inherits unless another reference is named: the
lightness spine, the relative-chroma shape, the hue drift, the chroma blend. One thing
cannot follow that default, and it is worth stating plainly: the light-to-dark
calibration is measured from Radix, because Radix is the only reference here that ships a
light *and* a dark scale of the same palette. Tailwind has no dark scale, so there is
nothing in it to measure. The reference supplies the curves; Radix supplies the
relationship between the modes. Different questions — and only one of them has thirteen
possible answers.

**Spacing defaults to `'auto'`, which means even.** See `docs/solver.md`.

**The semantic hues can be derived instead of chosen.** `semantics: true` places
danger, warning, success and info inside the hue windows the corpus says those
names occupy — ±2σ of the eleven shipping systems that publish them — at the
positions that
keep all five families furthest apart under normal vision and all three colour-
vision deficiencies. Scored five families against five, it beats the references'
own hand-picked hues on all twelve, median ΔEOK 0.0174 → 0.0235. It stays off by
default and a named seed always wins. It also declines to tell you things that
are true nine times in ten: that the brand is in the closest pair, or that a role
landed on the edge of its window. See `docs/semantics.md`.

**Perception is modelled, reported, and mostly not applied.** OKLab L is a
luminance correlate, so it does not know that a saturated step looks brighter
than it measures. Measured against Radix, a Helmholtz–Kohlrausch term explains
13.5% of what the dark mirror leaves over — but correcting the mirror with it
recovers 0.03 of a JND, so it is not shipped. Applied to *even spacing* it
matters a great deal: ramps even by ΔEOK (mean CV 0.035) come out at CV 0.263
when remeasured in apparent lightness, worst on the magentas and pinks the effect
predicts. That is opt-in, because it is a trade rather than a fix — apparent
evenness costs measured evenness roughly 1:1 at every strength. The audit reports
both rulers either way. See `docs/perception.md`.

Status: **all phases complete (0–7).** Built-in DNA for 13 systems in `dna/` (format:
`docs/dna-format.md`); the entry point is documented in `docs/palette.md`, the solver in
`docs/solver.md`, perception in `docs/perception.md`, derived semantic hues in
`docs/semantics.md`, fuzzing in `docs/fuzzing.md`, dark mode in
`docs/dark-mode.md`, grays in `docs/neutrals.md`, tokens in `docs/tokens.md`, the
validation harness in `docs/validation.md`. Findings: `docs/phase0-report.md` (premise
test on Tailwind v4 and Radix) and `docs/all-systems.md` (curves across all 13 systems).
Figures in `out/` (`fig9_solver_demo.png` the solver, `fig10_dark_mode.png` dark mode,
`fig11_tokens.png` the role assignment, `fig12_audit.png` the audit page). Example audits:
`out/audit/*.html`.

```ts
import { ingestPalette, extractSystemDNA, serializeDNA, parseDNA, familyCurves } from 'palette-dna';

const ramps = ingestPalette({ blue: { '50': '#eff6ff', /* … */ '950': '#172554' } }, { id: 'mine', keyStepKey: '500' });
const dna = extractSystemDNA(ramps, { id: 'mine', name: 'My system', source: { kind: 'inline', ref: 'tokens.json' } });
fs.writeFileSync('mine.json', serializeDNA(dna));
const blue = familyCurves(parseDNA(fs.readFileSync('mine.json', 'utf8')).families.blue);
blue.L(0.5); // OKLab L at the middle of the ramp, from the monotone spine

// Phase 2: a brand color through a reference's DNA — the seed is exact at its step
import { solveRamp } from 'palette-dna';
const ramp = solveRamp({ dna: parseDNA(fs.readFileSync('dna/tailwind-v4.json', 'utf8')), seed: '#7c3aed' });
ramp.steps.map((s) => [s.key, s.color.css, s.sibling?.native, s.contrast.wcagVsBg]);

// Steps are re-placed at equal ΔEOK by default: `spacing: 'auto'` resolves to 'even'
// everywhere except the five references whose step numbers are a contrast promise
// rather than a label, where respacing would break the promise while keeping the number.
ramp.spacing.mode; // 'even'
ramp.spacing.rule; // 'even-by-default' | 'contrast-bearing-numbering' | 'asked'
ramp.spacing.cv;   // 0.08 for Radix, against 0.95 for its own placement

// grays are extracted and solved separately — see docs/neutrals.md
import { solveNeutralRamp } from 'palette-dna';
const grays = solveNeutralRamp({ dna, tintFrom: '#7c3aed' }); // slate, retinted to the brand

// Phase 3: both modes from one seed. The seed is exact and on the same step in both,
// which is what Radix does — its step 9 solid is identical in its light and dark scales
// in all 25 families. The dark reference is the system's own when it ships one, else
// mirrored from the light one in the contrast domain (docs/dark-mode.md).
import { solvePair } from 'palette-dna';
const pair = solvePair({ light: dna, seed: '#7c3aed', neutrals: true });
pair.dark.steps.map((s) => s.color.native);
pair.pin;        // the shared color, and what holding it costs in each mode
pair.darkSource; // 'derived' or 'authored', plus what the derivation could not do

// Phase 3.5: semantic tokens, assigned from the contrast matrix rather than declared.
// Nine of Radix's eleven documented step roles come back on Radix's own step in all 25
// families; the one systematic disagreement is border/strong, because Radix's step 8
// measures 1.88–2.38:1 and SC 1.4.11 asks 3:1 (docs/tokens.md).
import { buildTokens, toDTCG, toCSS, toTailwind, toFigma, toReport } from 'palette-dna';
const tokens = buildTokens(pair, { brandName: 'brand' });
toDTCG(tokens);   // canonical W3C DTCG JSON: OKLCH values, sRGB hex fallback, evidence in $extensions
toCSS(tokens); toTailwind(tokens); toFigma(tokens);
console.log(toReport(tokens)); // every role, what it resolved to, and every requirement it could not meet

// Phase 4: audit it. Every number measured on the emitted 8-bit colour and reported
// against 185 ramps from 13 shipping systems, not against a threshold of ours
// (docs/validation.md). Nothing is repaired — a harness that fixes what it finds is a
// generator with extra steps.
import { audit, lint, renderAudit, reportAudit } from 'palette-dna';
const a = audit(tokens, { reference: dna, families: { success, danger }, ramps: { light: pair.light, dark: pair.dark } });
const findings = lint(tokens, a);
fs.writeFileSync('audit.html', renderAudit(tokens, a, findings)); // components, matrices, CVD, findings
process.exit(findings.clean ? 0 : 1);

// Phase 7: derive the semantic hues instead of picking them. Placed inside the ±2σ hue
// window the corpus gives each name, at the positions that keep all five families
// furthest apart under normal vision and all three deficiencies (docs/semantics.md).
import { deriveSemanticHues, loadCentroids } from 'palette-dna';
const s = deriveSemanticHues({ dna, centroids: loadCentroids(), brandHue: 300 });
s.hues;             // { danger: 30.9, warning: 104.8, success: 160.8, info: 261.7 }
s.gain;             // what placing them was worth against the conventional hues
s.corpus.verdict;   // where the result sits against the same measure on the references
s.warnings;         // only when hue has genuinely run out of room — 1 brand hue in 24
```

## The explorer

```
npm run build:app     # → out/app/index.html (standalone) and artifact.html
```

A control bar over the audit page: seed, reference, spacing, lightness ruler,
gamut, neutrals and derived semantics, with the full audit regenerated on every
change. The audit page is not reimplemented — `renderAudit` already produces it,
and the explorer drops that document into an iframe, so the tool and the artefact
it writes cannot drift apart. A solve is ~6 ms, so it keeps up with a colour
picker being dragged; the derivation is ~80 ms and memoised on the three inputs
it actually depends on. A second tab runs a fuzz campaign in a worker and links
every defect back into the explorer.

One self-contained file: 1.3 MB, 519 KB gzipped, all thirteen DNA sets and the
measured hue centroids inlined, no network at runtime.

## Layout

```
src/
  index.ts                public API
  palette.ts              palette(): the one-call path, and the Tailwind-v4 default
  builtins.ts             the 13 reference systems: source, license, key step, roles
  gamut/shell.ts          thin GamutShell interface; nutelch behind it, exact bisection oracle
  color/oklch.ts          culori parsing, hue arithmetic, circular stats, ΔEOK
  color/hk.ts             Helmholtz–Kohlrausch, viewing conditions, apparent lightness, ΔE_HK
  contrast/index.ts       WCAG 2.1 + APCA via Color.js (oracle; hot paths come in Phase 2)
  ingest/index.ts         generic ingest: { family: { step: css } } → normalized ramps
  ingest/                 loaders: Tailwind v4 theme.css, @radix-ui/colors, color-js/palettes dataset
  dna/extract.ts          ramp → per-step L, C, h, relC (sRGB/P3), Δh, contrast
  dna/curves.ts           monotone PCHIP, Catmull-Rom, linear; invertMonotone
  dna/spine.ts            monotone spine + detached steps (Radix bright solids)
  dna/weights.ts          w(n) blend fit and transfer statistics (kinship)
  dna/metrics.ts          numbering class (measured), first AA step, hue-drift ranges
  dna/centroids.ts        hue-family centroids (peak-chroma + published) and classifier
  dna/neutrals.ts         gray ramps: tint hue, tint strength, absolute chroma envelope
  dna/schema.ts           SystemDNA / FamilyDNA types, serializeDNA, parseDNA
  dna/system.ts           extractSystemDNA, familyCurves (pure — bundles for a browser)
  dna/toolchain.ts        the node-only half: which colour libraries produced a DNA
  contrast/fast.ts        culori hot-path WCAG 2.1 + APCA, bit-for-bit with Color.js
  solver/reference.ts     reference selection (nearest-two by hue, aggregate fallback, forced)
  solver/neutral.ts       solveNeutralRamp: transfer a gray ramp onto a target tint hue
  solver/index.ts         solveRamp: seed placement, spine warp, modes, gamut map, quantize, promises
  solver/pair.ts          solvePair: one seed into both modes, pinned, with the cost reported
  dark/mirror.ts          deriveDarkDNA: the contrast mirror, its calibration and its limits
  tokens/roles.ts         the role table: what each semantic token requires, and from which criterion
  tokens/assign.ts        assignRoles: which step meets it, measured, with the shortfalls named
  tokens/build.ts         buildTokens: one token, one value per mode, one stable ID
  tokens/dtcg.ts          W3C Design Tokens JSON (canonical) + alias resolution
  tokens/emit.ts          CSS custom properties, Tailwind v4 @theme, Figma Variables, a text report
  tokens/semantics.ts     deriveSemanticHues: danger/warning/success/info placed by measurement
  validate/baseline.ts    the corpus: 185 ramps across 13 systems, measured on every check
  validate/audit.ts       contrast matrix, step uniformity, CVD simulation, gamut headroom, promises
  validate/lint.ts        15 rules, each with its evidence and its remedy; none of them repair anything
  validate/render.ts      a self-contained audit page: the tokens driving real components, both modes
  validate/report.ts      the same numbers as text, for CI
  validate/fuzz.ts        the fuzz harness: crashes, invariant breaks, findings by rarity
app/main.ts               the explorer: controls over renderAudit in an iframe
app/fuzz-worker.ts        the campaign, off the main thread
app/shell.html            the page shell (the audit page's own visual language)
scripts/build-dna.ts      builds dna/*.json and dna/centroids.json
scripts/demo-solver.ts    solver demo → out/solver-demo.json (spike/plot_solver.py renders fig9)
scripts/demo-dark.ts      dark-mode demo → out/dark-demo.json (spike/plot_dark.py renders fig10)
scripts/demo-tokens.ts    token demo → out/tokens/* (spike/plot_tokens.py renders fig11)
scripts/demo-audit.ts     audit demo → out/audit/*.html and *.json
scripts/fuzz.ts           fuzz campaign → out/fuzz.json (npm run fuzz)
scripts/build-app.ts      bundles the explorer into one self-contained HTML file
dna/                      built-in DNA (13 systems) + centroids + index
test/                     vitest + fast-check: curves, spine, oracle (Color.js), dna round-trip, solver
spike/
  smoke.ts                tables for blue/yellow/green + oracle checks
  phase0.ts / phase0b.ts / phase0c.ts   the analysis (normalizations, transfer error, hue
                          centroids, Radix dark, Radix P3, hybrid weight fit)
  verify.ts               Color.js-only recomputation of the headline numbers
  plot.py                 Phase 0 figures (fig0–fig5)
  all-systems.ts          extraction + metrics for all 13 systems → out/dna/*.json, out/all-systems.json
  plot_all.py             cross-system figures (fig6a, fig6b, fig7, fig8)
  phase3.ts / phase3b.ts  the light → dark measurement on Radix's two scales
  check-dark.ts           derived vs authored dark, under every setting
  phase35.ts              role recovery against Radix's twelve documented step roles
  phase4.ts               the corpus measurement behind validate/baseline.ts
  phase5-spacing.ts       does even spacing break contrast-bearing numbering? (it breaks 2 of 5)
  phase5-surfaces.ts      does a foreground stay legible on the surface it lands on?
  phase6-hk.ts            is the Helmholtz–Kohlrausch effect visible in Radix's dark scale?
  phase6-fit.ts           does an H–K term fit Radix better? (no: 0.03 JND — the negative result)
  phase6-spacing.ts       is a ramp even by ΔEOK even in appearance? (no: 7.45× worse)
  phase7-semantics.ts     is there room to place the semantic hues? (yes: 12 of 12, and it prints the band)
  drive-semantics.mjs     drives the built explorer through the semantics toggle
  plot_dark.py            fig10
  plot_tokens.py          fig11
  shoot-audit.mjs         fig12 (screenshots out/audit/radix-violet.html)
vendor/
  nutelch/                pinned copy of meodai/nutelch 0.2.0 @ 915b785 (see VENDORED.md)
  palettes/               pinned data subset of color-js/palettes @ 6583c31 (see VENDORED.md)
out/                      phase0.json, all-systems.json, reports, fig0–fig8, dna/<system>.json
```

## Run

```
npm install
npm test                # 233 tests: fitters, spine, Color.js oracle parity, DNA round-trips,
                        # solver identity + properties, neutrals, dark mode, token
                        # assignment, the audit, the linter, and the entry point
npm run build:dna       # regenerate dna/*.json (≈2 s)
npm run fuzz            # fuzz campaign; exits 1 on crashes or invariant breaks
npm run fuzz -- --cases 5000 --seed 42
npm run build:app       # the explorer → out/app/index.html
npx tsx spike/smoke.ts
npx tsx spike/phase0.ts && npx tsx spike/phase0b.ts && npx tsx spike/phase0c.ts
npx tsx spike/verify.ts
python3 spike/plot.py
npx tsx spike/all-systems.ts && python3 spike/plot_all.py
npx tsx spike/phase3.ts && npx tsx spike/phase3b.ts && npx tsx spike/check-dark.ts
npx tsx scripts/demo-dark.ts && python3 spike/plot_dark.py
npx tsx spike/phase35.ts
npx tsx scripts/demo-tokens.ts && python3 spike/plot_tokens.py
npx tsx spike/phase4.ts
npx tsx scripts/demo-audit.ts && node spike/shoot-audit.mjs
npx tsx spike/phase5-spacing.ts && npx tsx spike/phase5-surfaces.ts
npx tsx spike/phase6-hk.ts && npx tsx spike/phase6-fit.ts && npx tsx spike/phase6-spacing.ts
npx tsx spike/phase7-semantics.ts
npm run typecheck
```

Dependencies are pinned exactly: culori 4.0.2 (workhorse), colorjs.io 0.7.1 (oracle),
@radix-ui/colors 3.0.0, tailwindcss 4.3.3 (for `theme.css`).
