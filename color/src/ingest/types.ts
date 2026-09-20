/** A reference ramp as ingested: ordered steps of one hue family. */
export interface Ramp {
  system: string; // e.g. "tailwind-v4", "radix-light", "radix-dark"
  family: string; // the system's own family key, e.g. "blue"
  /** Which gamut the source values were authored for. */
  gamut: 'srgb' | 'p3';
  /** Ordered light → dark (light mode) or as authored (dark mode), keyed by the system's own step label. */
  steps: { key: string; css: string }[];
  /** Index of the system's canonical anchor step (Tailwind 500, Radix 9). */
  anchorIndex: number;
  /** Whether the step numbering carries a contrast guarantee. */
  numbering: 'contrast-bearing' | 'nominal';
}
