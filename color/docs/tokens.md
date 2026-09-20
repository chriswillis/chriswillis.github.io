# Taxonomy and emitters — Phase 3.5

Primitives are the reference's own steps. Semantic tokens are not declared: each
one states a contrast requirement, and which step fills it is whatever the
contrast matrix says.

```ts
import { solvePair, buildTokens, toDTCG, toCSS, toTailwind, toFigma, toReport } from 'palette-dna';

const pair = solvePair({ light: tailwind, seed: '#7c3aed', neutrals: true });
const set = buildTokens(pair, { brandName: 'brand' });

toDTCG(set);      // canonical — W3C Design Tokens JSON, OKLCH with an sRGB hex fallback
toCSS(set);       // custom properties, both modes
toTailwind(set);  // a v4 @theme block
toFigma(set);     // Figma Variables, sRGB, keyed by stable ID
toReport(set);    // what each role resolved to, and every requirement it could not meet
```

## Can roles be derived at all?

Radix is the test, because it is the only reference in `dna/` that documents
what its twelve steps are for. Writing a requirement table from WCAG 2.1 and
APCA — not from Radix — and then asking where each requirement lands
(`npx tsx spike/phase35.ts`, 25 families × both modes):

| role | requirement | lands on | Radix documents |
|---|---|---|---|
| `background/subtle` | ΔEOK ≥ 0.010 from the page | 2 ×25 | 2 |
| `surface/normal` | ΔEOK ≥ 0.02 from the previous | 3 ×25 | 3 |
| `surface/hover` | " | 4 ×25 | 4 |
| `surface/active` | " | 5 ×25 | 5 |
| `border/subtle` | " | 6 ×25 | 6 |
| `border/normal` | " | 7 ×25 | 7 |
| `border/strong` | 3:1 and Lc 30 (SC 1.4.11) | **9 ×17, 11 ×5, 10 ×3** | 8 |
| `background/solid` | peak chroma | 9 ×25 | 9 |
| `background/solid/hover` | one past the solid | 10 ×25 | 10 |
| `content/subtle` | 4.5:1 and Lc 60 (SC 1.4.3) | 11 ×22, 12 ×3 | 11 |
| `content/normal` | the most contrast, checked at 7:1 / Lc 75 | 12 ×25 | 12 |

Nine of the eleven step-holding roles land on Radix's own step in every one of
the 25 families, in light mode; ten of eleven in dark. `content/subtle` misses in
three light families because Radix's step 11 does not always clear 4.5:1 *and*
Lc 60 together — which Phase 0 had already found.

**The one systematic disagreement is `border/strong`, and it is the point.** SC
1.4.11 asks 3:1 of a boundary that is the only thing identifying a control.
Radix's step 8 measures 1.88–2.38:1 against its light app background, in all 25
families, so the requirement lands past it — usually on the solid, which is where
a focus ring belongs anyway. A table that had copied Radix would have agreed with
Radix and been wrong. This one disagrees and shows its working.

## What the requirements are, and where they come from

Every requirement quotes a published criterion in `source`, with one exception,
which says so:

- **Contrast roles** clear a threshold and take the *least* step that does, so
  the ramp is not spent on more contrast than the criterion asks for:
  `content/subtle` at 4.5:1 / Lc 60 (SC 1.4.3, APCA bronze), `content/normal` at
  the far end checked against 7:1 / Lc 75 (SC 1.4.6), `border/strong`,
  `border/focus` and `icon/normal` at 3:1 / Lc 30–45 (SC 1.4.11).
- **Separation roles** — the surface and border chain — sit at least one JND from
  the link before them, because nothing published says how far apart a hover
  state should be. The exception is `background/subtle` at ΔEOK 0.010, which is
  **calibrated**: it is where Radix puts its own step 2, and a full-width surface
  is detectable well below the small-patch JND. That is the only number in the
  table taken from a design system rather than a criterion, and the test suite
  asserts it is the only one.
- **Chroma roles** — the brand fill and its hover — are found by chroma, because
  the solid's contrast against the background spans 1.46–5.07 in Radix's light
  mode and no threshold identifies it. The fill is the seed's step when the
  palette is seeded, the documented key step when the system has one, and the
  chroma peak otherwise.

Three structural rules are not thresholds:

**A fill is not a foreground.** Steps spent on the brand fill are skipped when
scanning for text. Without that, `content/subtle` lands on the solid for every
family whose solid happens to be dark — legal by WCAG, wrong by hierarchy, and
the reason every reference numbers its solids below its text. Borders, icons and
indicators may use the fill; a focus ring in the brand colour is ordinary.

**A surface is not a foreground either.** A step spent on a surface
(`background/subtle`, `surface/normal`, `surface/hover`, `surface/active`) is not
available to the `content` and `icon` categories, because a foreground is painted
*on* a surface and the two being one colour is not a shared step — it is text
that is not there. This rule came out of the rendered audit page: the light-mode
disabled button had no visible label, because `content/disabled` and
`surface/active` had landed on the same step, in 8 of the 12 references. The
roles that pick this way take the *least* contrasting step that clears their
floor, so the next step along clears it too; skipping a surface costs them
nothing they were promised. Borders are exempt and the exemption matters — they
use the same separation rule as surfaces, and applying the exclusion to them as
well pushed `content/disabled` four steps past its own criterion, turning
disabled text into ordinary text. A border is a line beside content, not a field
behind it. Measured in `spike/phase5-surfaces.ts`; see
[validation.md](validation.md) for why the obvious generalisation of this rule
was rejected.

**The ladder goes one way.** A chain link must be a JND from its predecessor *and*
further from the page than the predecessor was. ΔEOK is a distance, not a
direction: without the second clause a step can sit a JND from the one before it
by moving in chroma while moving back toward the background, which is how
Carbon's dark `surface/active` first came out closer to the page than its hover.
Where a ramp runs out of steps before its solid, the chain repeats the previous
token rather than stepping backwards, and says so — two tokens sharing one colour
is a defect the caller can see, a state that moves the wrong way is not.

## `content/on-solid`, where the two contrast models part company

Text on the brand fill is the role that breaks, and it breaks in an interesting
way. On Radix's 25 light solids:

- White clears 4.5:1 on 5 of them. Black covers the rest, so **WCAG alone is
  satisfiable on every solid.**
- **On 15 of the 25, APCA prefers the opposite foreground to WCAG, and no single
  colour satisfies both.** Radix's blue-9 takes white at 3.26:1 / Lc 65 and black
  at 6.43:1 / Lc 45: white passes APCA's body-text level and fails WCAG AA, black
  does the reverse.

So the token resolves — to the WCAG-satisfying candidate by default, since SC
1.4.3 is the normative one and a button that fails AA does not ship — and records
`disagreement` with both numbers, plus `fillWould`: the lightness the fill would
need for the chosen foreground to clear both. That last number is the decision a
designer actually has to make, and it is the useful output. Candidates are tried
in order — white, the family's own high-contrast text, the page colour, black —
so a tinted dark on a yellow button wins over pure black when both clear.

## The output formats

**DTCG** is canonical. `$value` carries `colorSpace: "oklch"` with `components`,
and a `hex` fallback which for a P3 set is the sRGB sibling the solver pinned, not
a clip done at emit time. Primitives are keyed by the reference's own step
numbering — Radix comes out 1–12, Tailwind 50–950, Carbon 10–100; renumbering
lives in the solver and stays an override. Modes are parallel `light` and `dark`
trees under `color` and `semantic`, because DTCG has no mode concept and putting
one in `$extensions` would make the file readable only by this library. Semantic
tokens are aliases into the primitives of their own mode, so a role can point at
different steps in the two — `border/strong` is the solid in light and one past it
in dark.

Every token carries its evidence under `$extensions["io.palette-dna"]`: the
requirement it was held to, what it was measured against, the WCAG ratio and APCA
Lc achieved, whether the requirement was met and what it was short by. A token set
you cannot audit is a token set you have to trust.

**Stable IDs, not names.** Each token has an `id` — a deterministic FNV-1a hash of
its kind and coordinates — and the ID does not include the mode, because one
token has two values rather than two tokens sharing a name. Renaming
`surface/hover` does not make it a different token, and a build tool keyed on IDs
can follow the rename.

**CSS** emits OKLCH for an sRGB set, since those values *are* the quantized sRGB
colours and a hex fallback would say the same thing twice. A P3 set emits the
sRGB sibling as the base and the wide values inside
`@supports (color: color(display-p3 0 0 0)) and (color-gamut: p3)`, so a narrow
display gets the sibling rather than whatever the browser clips to. Semantic
properties are `var()` references to the primitives, each annotated with its
measured contrast.

**Tailwind v4** is a `@theme` block plus a dark override of the same custom
properties, which is what the framework's dark variant reads.

**Figma** is sRGB only, so OKLCH stays canonical in the DTCG file and Figma gets
the quantized hex. Variables carry a value per mode, the scopes that stop a fill
token offering itself as a stroke, and — for a P3 set — the wide value and its
ΔEOK from the sRGB one under `wideGamut`, so the gap is visible rather than
silently absorbed.

## Not in the table

`overlay/*` is an alpha problem and the DNA carries no alpha. `chart/*` is
categorical separation, which needs the CVD analysis in Phase 4 rather than a
contrast threshold. Inventing either would be inventing taxonomy, which the brief
rules out.

## What it reports that you would otherwise find out later

On a violet seed through Radix, in both modes:

```
  role                        light                        dark
  border/strong             9 5.60:1 Lc76                 11 8.49:1 Lc58
  background/solid          9 5.60:1 Lc76                 9 3.32:1 Lc24
  content/subtle            11 6.19:1 Lc80                12 14.31:1 Lc87
  content/normal            12 13.30:1 Lc98               12 14.31:1 Lc87
  content/on-solid          white 5.70:1 Lc83             white 5.70:1 Lc83

  [dark] content/subtle and content/normal are ΔEOK 0.0000 apart (both on step 12)
         — the text hierarchy has one level, not two
  steps 8, 9, 10 carry body text in light mode (|Lc| 49, 76, 79) but only
         |Lc| 22, 24, 29 in dark — they are solids in dark mode, not text
```

The pinned seed is one colour in both modes, which is what makes it a brand
colour, and the price is that the steps around it change role between modes. That
is Phase 3's finding arriving as a token-level warning.
