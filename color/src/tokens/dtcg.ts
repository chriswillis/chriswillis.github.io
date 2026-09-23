/**
 * Phase 3.5 — the canonical output: W3C Design Tokens Format Module JSON.
 *
 * OKLCH is the canonical value, with an sRGB `hex` fallback, because that is
 * what the format's colour type is for: `colorSpace` plus `components` says what
 * the colour *is*, and `hex` says what an 8-bit consumer should do about it. For
 * a P3 token the hex is the sRGB sibling the solver already computed, not a
 * clipped conversion done here.
 *
 * Step keys are the reference system's own. Radix tokens come out numbered
 * 1–12, Tailwind's 50–950, Carbon's 10–100. Renumbering is available in the
 * solver and stays an override.
 *
 * Modes are two parallel trees, `light` and `dark`, under each of `color` and
 * `semantic`, because DTCG has no mode concept and inventing one in
 * `$extensions` would make the file readable only by this library. A semantic
 * token in each tree is an alias into the primitives of the same mode, so the
 * same role can point at different steps in the two modes — which it does:
 * `border/strong` is the solid in light mode and one past it in dark.
 */
import type { TokenSet, SemanticToken, PrimitiveToken, Mode } from './build.ts';

export const DTCG_NAMESPACE = 'io.palette-dna';

export interface DTCGColorValue {
  colorSpace: 'oklch';
  components: [number, number, number];
  alpha?: number;
  hex: string;
}

export interface DTCGToken {
  $type?: 'color';
  $value: DTCGColorValue | string;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

export type DTCGNode = DTCGToken | DTCGGroup;
export interface DTCGGroup { [key: string]: DTCGNode | string | undefined; $type?: 'color'; $description?: string }

export interface DTCGOptions {
  /** Include the measurement evidence in `$extensions`. Default true — it is the point. */
  evidence?: boolean;
  namespace?: string;
}

const round = (v: number, d: number) => Number(v.toFixed(d));

function value(hex: string, oklch: { l: number; c: number; h: number }): DTCGColorValue {
  return { colorSpace: 'oklch', components: [round(oklch.l, 5), round(oklch.c, 5), round(Number.isNaN(oklch.h) ? 0 : oklch.h, 3)], hex };
}

function put(root: DTCGGroup, path: string[], token: DTCGToken): void {
  let node = root;
  for (const seg of path.slice(0, -1)) {
    const next = (node[seg] as DTCGGroup | undefined) ?? {};
    node[seg] = next;
    node = next;
  }
  node[path[path.length - 1]!] = token;
}

/** `{color.light.brand.600}` */
const ref = (mode: Mode, family: string, step: string) => `{color.${mode}.${family}.${step}}`;

export function toDTCG(set: TokenSet, opts: DTCGOptions = {}): DTCGGroup {
  const ns = opts.namespace ?? DTCG_NAMESPACE;
  const withEvidence = opts.evidence ?? true;
  const color: DTCGGroup = { $type: 'color' };
  const semantic: DTCGGroup = { $type: 'color' };

  for (const p of set.primitives) {
    for (const mode of set.modes) {
      const v = p.values[mode];
      if (!v) continue;
      const ev = p.evidence[mode];
      const token: DTCGToken = {
        $value: value(v.hex, v.oklch),
        ...(withEvidence
          ? {
              $extensions: {
                [ns]: {
                  id: p.id,
                  kind: p.kind,
                  family: p.family,
                  step: p.step,
                  n: round(ev.n, 4),
                  native: v.native,
                  ...(v.space === 'p3' ? { srgbSibling: { hex: v.hex, deltaEOK: round(v.siblingDeltaE, 4) } } : {}),
                  ...(ev.isSeed ? { seed: true } : {}),
                  ...(ev.detached ? { detached: true } : {}),
                  ...(ev.role ? { referenceRole: ev.role } : {}),
                  contrastVsBackground: { wcag21: round(ev.contrastVsBackground.wcag, 3), apcaLc: round(ev.contrastVsBackground.apca, 1) },
                  ...(ev.mappingDeltaE > 0 ? { gamutMappedBy: round(ev.mappingDeltaE, 5) } : {}),
                  quantizationDeltaE: round(ev.quantizationDeltaE, 5),
                },
              },
            }
          : {}),
      };
      put(color, [mode, p.family, p.step], token);
    }
  }

  for (const s of set.semantics) {
    for (const mode of set.modes) {
      const v = s.values[mode];
      if (!v) continue;
      const a = s.alias[mode];
      const ev = s.evidence[mode];
      const token: DTCGToken = {
        $value: a ? ref(mode, a.family, a.step) : value(v.hex, v.oklch),
        $description: s.spec.description,
        ...(withEvidence
          ? {
              $extensions: {
                [ns]: {
                  id: s.id,
                  role: s.role,
                  requirement: s.spec.source,
                  resolvedTo: a ? `${a.family}/${a.step}` : (s.literal[mode] ?? 'literal'),
                  measuredAgainst: ev.against.role,
                  wcag21: round(ev.against.wcag, 3),
                  apcaLc: round(ev.against.apca, 1),
                  deltaEOK: round(ev.against.deltaE, 4),
                  requirementMet: ev.met,
                  ...(ev.shortfall ? { shortfall: ev.shortfall } : {}),
                  ...(ev.chosenFrom ? { chosenFrom: ev.chosenFrom } : {}),
                  ...(ev.disagreement ? { measuresDisagree: ev.disagreement } : {}),
                  ...(ev.fillWould !== undefined && ev.fillWould !== null ? { fillWouldNeedLightness: round(ev.fillWould, 4) } : {}),
                },
              },
            }
          : {}),
      };
      put(semantic, [mode, ...s.path], token);
    }
  }

  return {
    $description: `${set.name} — generated by palette-dna from ${set.provenance.referenceName}. OKLCH is canonical; \`hex\` is the sRGB fallback.`,
    color,
    semantic,
    $extensions: {
      [ns]: {
        version: 1,
        name: set.name,
        modes: set.modes,
        gamut: set.gamut,
        backgrounds: Object.fromEntries(set.modes.map((m) => [m, set.backgrounds[m] ? value(colorHex(set, m), set.backgrounds[m]!) : null])),
        provenance: set.provenance,
        unmetRequirements: set.semantics.flatMap((s) => set.modes.filter((m) => s.evidence[m] && !s.evidence[m]!.met).map((m) => ({ mode: m, role: s.role, shortfall: s.evidence[m]!.shortfall }))),
        warnings: set.warnings,
      },
    },
  } as unknown as DTCGGroup;
}

/** The page background's hex, taken from whichever primitive matches it, else computed. */
function colorHex(set: TokenSet, mode: Mode): string {
  const bg = set.backgrounds[mode];
  if (!bg) return '#000000';
  let best: PrimitiveToken | null = null;
  let bestD = Infinity;
  for (const p of set.primitives) {
    const v = p.values[mode];
    if (!v) continue;
    const d = Math.abs(v.oklch.l - bg.l) + Math.abs(v.oklch.c - bg.c);
    if (d < bestD) { bestD = d; best = p; }
  }
  return bestD < 0.005 && best ? best.values[mode]!.hex : (bg.l > 0.5 ? '#ffffff' : '#000000');
}

/** Every token in a DTCG document, flattened to `path` + token. */
export function walkDTCG(group: DTCGGroup, path: string[] = []): { path: string[]; token: DTCGToken }[] {
  const out: { path: string[]; token: DTCGToken }[] = [];
  for (const [k, v] of Object.entries(group)) {
    if (k.startsWith('$') || v === undefined || typeof v === 'string') continue;
    if (typeof v === 'object' && '$value' in (v as object)) out.push({ path: [...path, k], token: v as DTCGToken });
    else out.push(...walkDTCG(v as DTCGGroup, [...path, k]));
  }
  return out;
}

/** Resolve `{a.b.c}` aliases against a document; throws on a dangling or circular reference. */
export function resolveDTCG(doc: DTCGGroup): Map<string, DTCGColorValue> {
  const byPath = new Map<string, DTCGToken>();
  for (const { path, token } of walkDTCG(doc)) byPath.set(path.join('.'), token);
  const out = new Map<string, DTCGColorValue>();
  const seen = new Set<string>();
  const resolve = (key: string, chain: string[]): DTCGColorValue => {
    const t = byPath.get(key);
    if (!t) throw new Error(`resolveDTCG: dangling reference {${key}}${chain.length ? ` from ${chain.join(' → ')}` : ''}`);
    if (typeof t.$value !== 'string') return t.$value;
    if (seen.has(key)) throw new Error(`resolveDTCG: circular reference ${[...chain, key].join(' → ')}`);
    seen.add(key);
    const target = t.$value.replace(/^\{|\}$/g, '');
    const v = resolve(target, [...chain, key]);
    seen.delete(key);
    return v;
  };
  for (const key of byPath.keys()) out.set(key, resolve(key, []));
  return out;
}
