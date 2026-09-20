/**
 * Phase 3.5 — the role table. What each semantic token *requires*, so that
 * which step fills it is a measurement rather than a convention.
 *
 * Radix is the alignment target because it is the only reference here that
 * documents what its steps are for. Measuring its twelve roles across 25
 * families and both modes (spike/phase35.ts) says three things about how roles
 * can be recovered:
 *
 *  1. **Steps 1–8 are contrast roles with tight, ordered bands.** Against the
 *     app background, Radix's step 2 sits at WCAG 1.03–1.04, step 3 at
 *     1.09–1.13, step 8 at 1.88–2.38 (light mode, p10–p90 across 31 ramps).
 *     Consecutive bands barely overlap, so a step can be found by requirement.
 *
 *  2. **Step 9 is not a contrast role at all.** The solid's contrast against the
 *     background spans 1.46–5.07 in light mode and 3.57–12.46 in dark — the same
 *     spread that made it unmirrorable in Phase 3. It is the brand color, found
 *     where chroma peaks, which the DNA already measures as `peakIndex`.
 *
 *  3. **Nothing in WCAG or APCA says how far apart a hover state should be**, so
 *     the surface and border chain is anchored on perceptual separation instead:
 *     each link at least `minDeltaE` from the one before it. The default 0.02 is
 *     the CSS Color 4 JND; the subtle background uses 0.010, because that is
 *     where Radix puts its own step 2 (ΔEOK 0.010–0.015 from step 1 in light
 *     mode) and a full-width surface is detectable well below the small-patch
 *     JND. That number is calibrated, not derived, and it is the only one here
 *     that is.
 *
 * Where a requirement does come from a published criterion it is quoted in
 * `source`, and the assignment will happily disagree with Radix: SC 1.4.11 wants
 * 3:1 for a boundary that identifies a control, and Radix's step 8 reaches
 * 1.88–2.38:1 on its light background, so `border/strong` lands further down the
 * ramp than step 8 does. That disagreement is the point of deriving rather than
 * copying — it is reported, with the evidence, instead of being papered over.
 *
 * Not in this table, deliberately: `overlay/*`, which is an alpha problem and
 * the DNA carries no alpha; and `chart/*`, which is a categorical-separation
 * problem that needs the CVD analysis in Phase 4, not a contrast threshold.
 * Inventing either would be inventing taxonomy.
 */

export type Category = 'background' | 'surface' | 'border' | 'content' | 'icon' | 'indicator';
export type State = 'normal' | 'subtle' | 'strong' | 'hover' | 'active' | 'focus' | 'selected' | 'disabled';

/** What a role's contrast is measured against. */
export type Against =
  | { kind: 'page' }
  /** Another role's resolved color — a chain link, or text on a fill. */
  | { kind: 'role'; role: string };

export type Rule =
  /**
   * Clear a published contrast threshold against `against`. `pick: 'least'`
   * takes the first step that clears it, so the ramp is not spent on more
   * contrast than the criterion asks for; `'most'` takes the far end.
   */
  | { kind: 'contrast'; wcag?: number; apca?: number; pick: 'least' | 'most' }
  /** Sit at least `minDeltaE` from `against`, and no further than the next role needs. */
  | { kind: 'separation'; minDeltaE: number }
  /** The brand fill: where chroma peaks, plus an offset for its interaction states. */
  | { kind: 'peak-chroma'; offset: number }
  /**
   * A foreground for a fill. Tries each candidate in order — a role name, or
   * `'white'` / `'black'` — and takes the first that clears the threshold, or
   * the best available when none does.
   */
  | {
      kind: 'foreground'; candidates: string[]; wcag: number; apca: number;
      /**
       * Which measure decides when no candidate satisfies both. Default `'wcag'`,
       * because SC 1.4.3 is the normative one and a button that fails AA does not
       * ship. Candidates are tried in order, so the list also carries a preference:
       * white first because it is the common answer, then the family's own
       * high-contrast text — a tinted dark on a yellow button reads better than pure
       * black and clears the same thresholds — then the page colour, then black.
       */
      prefer?: 'wcag' | 'apca';
    };

export interface RoleSpec {
  /** `{category}/{subcategory}/{state}`, with the subcategory omitted where there is none. */
  name: string;
  category: Category;
  subcategory?: string;
  state: State;
  against: Against;
  rule: Rule;
  /** Where the requirement comes from. Never invented; `calibrated:` marks the one exception. */
  source: string;
  description: string;
  /**
   * May this role use the brand fill's step? A fill is not a foreground, so text
   * never may; a border or an icon in the brand color is ordinary, so they do.
   */
  allowFill?: boolean;
  /** The Radix step this role corresponds to, for the alignment report only — never used to assign. */
  radixStep?: number;
}

const SC_143 = 'WCAG 2.1 SC 1.4.3 Contrast (Minimum), AA: 4.5:1 for body text';
const SC_146 = 'WCAG 2.1 SC 1.4.6 Contrast (Enhanced), AAA: 7:1 for body text';
const SC_1411 = 'WCAG 2.1 SC 1.4.11 Non-text Contrast, AA: 3:1 for information required to identify a control or its state';
const APCA_BRONZE = 'APCA-W3 bronze: Lc 60 for body text, Lc 45 for large text, Lc 30 for non-text';
const JND = 'CSS Color 4 gamut-mapping JND, ΔEOK 0.02';

/**
 * The default role table. Ordered: the separation chain resolves in sequence,
 * each link from the one before it.
 */
export const ROLES: RoleSpec[] = [
  {
    name: 'background/page', category: 'background', state: 'normal',
    against: { kind: 'page' }, rule: { kind: 'separation', minDeltaE: 0 },
    source: 'given — the page background the ramp is solved against',
    description: 'The app background. Not taken from the ramp; it is the surface everything else is measured against.',
    radixStep: 1,
  },
  {
    name: 'background/subtle', category: 'background', state: 'subtle',
    against: { kind: 'role', role: 'background/page' }, rule: { kind: 'separation', minDeltaE: 0.01 },
    source: `calibrated: Radix's step 2 sits ΔEOK 0.010–0.015 from its step 1 in light mode, 0.019–0.036 in dark`,
    description: 'A tinted band behind a section — readable as a different surface, not as an element.',
    radixStep: 2,
  },
  {
    name: 'surface/normal', category: 'surface', state: 'normal',
    against: { kind: 'role', role: 'background/subtle' }, rule: { kind: 'separation', minDeltaE: 0.02 },
    source: JND,
    description: 'The resting fill of a component — a card, an input, an unpressed button.',
    radixStep: 3,
  },
  {
    name: 'surface/hover', category: 'surface', state: 'hover',
    against: { kind: 'role', role: 'surface/normal' }, rule: { kind: 'separation', minDeltaE: 0.02 },
    source: JND,
    description: 'The same component under the pointer. A JND is the floor for a state change to register at all.',
    radixStep: 4,
  },
  {
    name: 'surface/active', category: 'surface', state: 'active',
    against: { kind: 'role', role: 'surface/hover' }, rule: { kind: 'separation', minDeltaE: 0.02 },
    source: JND,
    description: 'Pressed, or selected. Also used for `surface/selected`.',
    radixStep: 5,
  },
  {
    name: 'border/subtle', category: 'border', state: 'subtle',
    against: { kind: 'role', role: 'surface/active' }, rule: { kind: 'separation', minDeltaE: 0.02 },
    source: JND,
    description: 'A separator or a decorative hairline — not required to identify anything, so no 3:1 claim.',
    radixStep: 6,
  },
  {
    name: 'border/normal', category: 'border', state: 'normal',
    against: { kind: 'role', role: 'border/subtle' }, rule: { kind: 'separation', minDeltaE: 0.02 },
    source: JND,
    description: 'The edge of a component whose fill already identifies it.',
    radixStep: 7,
  },
  {
    name: 'border/strong', category: 'border', state: 'strong',
    against: { kind: 'page' }, rule: { kind: 'contrast', wcag: 3, apca: 30, pick: 'least' }, allowFill: true,
    source: SC_1411,
    description: 'A boundary that is the only thing identifying a control. This is a requirement, not a position, so it can land well past the step a system uses for its strong border — on most hues it lands on the brand fill, which is where a focus ring belongs anyway.',
    radixStep: 8,
  },
  {
    name: 'border/focus', category: 'border', state: 'focus',
    against: { kind: 'page' }, rule: { kind: 'contrast', wcag: 3, apca: 30, pick: 'least' }, allowFill: true,
    source: SC_1411,
    description: 'The focus ring. Same requirement as a strong border; usually the same step.',
  },
  {
    name: 'background/solid', category: 'background', subcategory: 'solid', state: 'normal',
    against: { kind: 'page' }, rule: { kind: 'peak-chroma', offset: 0 },
    source: 'measured — the peak-chroma step, which the DNA records as `peakIndex`',
    description: 'The brand fill. Found by chroma, not contrast: across Radix its contrast against the background spans 1.46–5.07 in light mode, so no threshold identifies it.',
    radixStep: 9,
  },
  {
    name: 'background/solid/hover', category: 'background', subcategory: 'solid', state: 'hover',
    against: { kind: 'role', role: 'background/solid' }, rule: { kind: 'peak-chroma', offset: 1 },
    source: 'measured — one step past the peak, the direction every reference moves its solid on hover',
    description: 'The brand fill under the pointer.',
    radixStep: 10,
  },
  {
    name: 'indicator/normal', category: 'indicator', state: 'normal',
    against: { kind: 'page' }, rule: { kind: 'peak-chroma', offset: 0 },
    source: 'measured — the same step as the solid',
    description: 'A status dot, a badge fill, a chart series marker. The brand color at full strength.',
  },
  {
    name: 'icon/normal', category: 'icon', state: 'normal',
    against: { kind: 'page' }, rule: { kind: 'contrast', wcag: 3, apca: 45, pick: 'least' }, allowFill: true,
    source: `${SC_1411}; ${APCA_BRONZE}`,
    description: 'A glyph carrying meaning. Non-text, so 3:1 — but APCA asks Lc 45 of anything with strokes that fine, and the assignment takes whichever step clears both.',
  },
  {
    name: 'content/subtle', category: 'content', state: 'subtle',
    against: { kind: 'page' }, rule: { kind: 'contrast', wcag: 4.5, apca: 60, pick: 'least' },
    source: `${SC_143}; ${APCA_BRONZE}`,
    description: 'Secondary text. "Subtle" names its role, not a discount on legibility: it still has to clear body-text contrast.',
    radixStep: 11,
  },
  {
    name: 'content/normal', category: 'content', state: 'normal',
    against: { kind: 'page' }, rule: { kind: 'contrast', wcag: 7, apca: 75, pick: 'most' },
    source: `${SC_146}; APCA-W3 Lc 75, the practical body-text level above bronze`,
    description: 'Primary text: the most contrasting step the ramp has. The thresholds are checked rather than used to select, so the report says whether the darkest step actually reaches AAA — on Radix\'s dark scale it clears 7:1 easily and reaches Lc 86–96, short of the Lc 90 APCA wants for fluent text in 18 of 25 families.',
    radixStep: 12,
  },
  {
    name: 'content/on-solid', category: 'content', subcategory: 'on-solid', state: 'normal',
    against: { kind: 'role', role: 'background/solid' },
    rule: { kind: 'foreground', candidates: ['white', 'content/normal', 'background/page', 'black'], wcag: 4.5, apca: 60, prefer: 'wcag' },
    source: `${SC_143}; ${APCA_BRONZE}`,
    description: 'Text or an icon on the brand fill, and the role where palettes actually break. White clears 4.5:1 on only 5 of Radix\'s 25 light solids, and black covers the rest — so WCAG alone is always satisfiable. Satisfying WCAG and APCA with the *same* colour is not: on blue-9 white reaches 3.26:1 / Lc 65 and black 6.43:1 / Lc 45, and on 15 of the 25 solids the two measures prefer opposite foregrounds and neither clears both. The assignment resolves per family, says which measure prefers what, and reports the lightness the fill would need for one colour to satisfy both.',
  },
  {
    name: 'content/disabled', category: 'content', state: 'disabled',
    against: { kind: 'page' }, rule: { kind: 'contrast', wcag: 2, apca: 30, pick: 'least' },
    source: 'WCAG 2.1 exempts disabled controls from 1.4.3 and 1.4.11, so nothing published applies; the floor here is APCA Lc 30, its spot-reading level — a licence to be quiet, not to disappear',
    description: 'Text in a disabled control. The one role with no criterion behind it, so it takes the quietest step that is still readable at all.',
  },
];

/** Roles resolved from the chain in order; the rest may resolve in any order. */
export const ROLE_ORDER: string[] = ROLES.map((r) => r.name);

export function roleByName(name: string): RoleSpec | undefined {
  return ROLES.find((r) => r.name === name);
}
