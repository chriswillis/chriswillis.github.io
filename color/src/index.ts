// Public API — Phase 1 (extractor).
export { ingestPalette, type PaletteInput, type IngestOptions } from './ingest/index.ts';
export type { Ramp } from './ingest/types.ts';
export { extractRamp, type RampDNA, type StepDNA } from './dna/extract.ts';
export { extractSystemDNA, familyCurves, familyFromRamp, type ExtractOptions } from './dna/system.ts';
export { defaultToolchain } from './dna/toolchain.ts';
export { serializeDNA, parseDNA, DNA_SCHEMA, type SystemDNA, type FamilyDNA, type FamilyKnots, type SourceInfo } from './dna/schema.ts';
export { pchip, catmullRom, linear, fit, sample, grid, invertMonotone, type Curve, type FitMethod } from './dna/curves.ts';
export { findSpine, detectDirection, type SpineResult, type Direction } from './dna/spine.ts';
export { fitWeights, predictChroma, JND, type WeightFit, type StepPoint } from './dna/weights.ts';
export { numberingMetrics, hueDriftMetrics, isDarkScale, CONTRAST_BEARING_THRESHOLD, type NumberingMetrics } from './dna/metrics.ts';
export { computeCentroids, classifyHue, type CentroidTable, type Classification } from './dna/centroids.ts';
export { shell, exactCuspChroma, type Gamut, type GamutShell } from './gamut/shell.ts';
export { parseToOklch, deltaEOK, hueDelta, circularMean, circularSd, type Oklch } from './color/oklch.ts';
export { wcag21, apca, relativeLuminance, APCA_VERSION } from './contrast/index.ts';
export { builtinSpecs, type BuiltinSpec } from './builtins.ts';
export { solveRamp, placeSeed, gamutMap, quantize, JND_L, WCAG_THRESHOLDS, type SolveInput, type SolvedRamp, type SolvedStep, type SolvedColor } from './solver/index.ts';
export { selectReference, type ReferenceCurves } from './solver/reference.ts';
export { wcag21Fast, apcaFast, luminanceY } from './contrast/fast.ts';
export { solveNeutralRamp, type SolveNeutralInput } from './solver/neutral.ts';
export { extractNeutral, estimateTint, neutralSetMetrics, nearestNeutral, PURE_GRAY_MAX_CHROMA, type NeutralDNA, type NeutralSetMetrics } from './dna/neutrals.ts';
// Phase 3 — dark mode
export { deriveDarkDNA, mirrorStep, mirrorFamily, compareDNA, defaultDarkSurface, RADIX_CALIBRATION, BALANCED_LAMBDA, APCA_INVERTIBLE_LC, type DarkMirrorOptions, type DarkMirrorCalibration, type DarkDerivation, type MirrorStepInput } from './dark/mirror.ts';
export { solvePair, pinCost, type SolvePairInput, type SolvedPair } from './solver/pair.ts';
// Phase 3.5 — taxonomy and emitters
export { ROLES, ROLE_ORDER, roleByName, type RoleSpec, type Rule, type Against, type Category, type State } from './tokens/roles.ts';
export { assignRoles, solidStep, roleAgreement, lightnessForForeground, type RoleAssignment, type RoleAssignments, type AssignOptions } from './tokens/assign.ts';
export { buildTokens, stableId, type TokenSet, type TokenColor, type PrimitiveToken, type SemanticToken, type BuildOptions, type Mode } from './tokens/build.ts';
export { toDTCG, walkDTCG, resolveDTCG, DTCG_NAMESPACE, type DTCGGroup, type DTCGToken, type DTCGColorValue, type DTCGOptions } from './tokens/dtcg.ts';
export { toCSS, toTailwind, toFigma, toReport, type CssOptions, type TailwindOptions, type FigmaFile, type FigmaCollection, type FigmaVariable } from './tokens/emit.ts';
// Phase 4 — the validation harness
export { audit, contrastMatrix, uniformity, cvdReport, headroom, promiseCheck, simulate, DEFICIENCIES, type Audit, type AuditOptions, type ContrastMatrix, type ContrastCell, type UniformityReport, type CvdReport, type HeadroomReport, type HeadroomStep, type PromiseCheck, type Deficiency } from './validate/audit.ts';
export { CORPUS, position, beatsSystems, type CorpusBaseline, type Band } from './validate/baseline.ts';
export { lint, RULES, type LintResult, type LintOptions, type Finding, type Severity, type RuleName } from './validate/lint.ts';
export { renderAudit, type RenderOptions } from './validate/render.ts';
export { reportAudit, usablePairs } from './validate/report.ts';
// Phase 6 — perception: viewing conditions and the Helmholtz–Kohlrausch effect
export { hkGamma, apparentL, lForApparent, deltaEHK, suvTheta, coefficientQ, coefficientKBr, defaultViewing, AVERAGE_SURROUND, DARK_SURROUND, DEFAULT_STRENGTH, type ViewingConditions, type HKOptions, type HKMethod } from './color/hk.ts';
// Phase 5 — the one-call entry point
export { palette, loadDNA, builtinDNAIds, DEFAULT_REFERENCE, type Palette, type PaletteOptions } from './palette.ts';
export { chooseSpacing } from './solver/index.ts';
export { loadDatasetNeutrals } from './ingest/dataset.ts';
export { loadRadixNeutrals, RADIX_NEUTRALS } from './ingest/radix.ts';
export { loadTailwindV4Neutrals, TAILWIND_NEUTRALS } from './ingest/tailwind.ts';
