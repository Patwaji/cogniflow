import {
  normalizeSignal,
  weightedIndex,
  deriveSigmoidParams,
  SIGNAL_DIRECTIONS,
  clamp01,
} from './engagementEngine'

// Padding (blinks/min) around the two blink anchors so a live rate equal
// to an anchor doesn't sit exactly on a boundary.
export const BLINK_BOUND_PAD = 1

// A blink boundary narrower than this (blinks/min) means the short calibration
// caught too little blink variation — its min/max collapse and normalizeSignal
// would pin the live signal at a hardcoded neutral 0.5 forever. Fall back to a
// population blink-rate range (blinks/min is a well-understood scale) so the
// live signal tracks the user's actual blinking instead of freezing.
export const BLINK_MIN_SEPARATION = 3
export const BLINK_FALLBACK = { min: 5, max: 25 }

// Continuous signals (gaze jitter, brow ratio) have no population scale, so a
// collapsed boundary can't be substituted — drop it instead, letting the
// signal be skipped in scoring rather than frozen at 0.5.
const CONTINUOUS_MIN_SEPARATION = 1e-6

function usableBlinkBoundary(b) {
  return b.max - b.min >= BLINK_MIN_SEPARATION ? b : { ...BLINK_FALLBACK }
}

function usableContinuousBoundary(b) {
  return b && b.max - b.min > CONTINUOUS_MIN_SEPARATION ? b : null
}

// Sample counts expected per phase for full coverage credit
// (~12s of usable phase at ~15-30fps → 120 is a conservative target).
const COVERAGE_TARGET = 120

// Weighted-index separation (ceiling - floor) that earns full quality credit.
const FULL_SEPARATION = 0.3

export const EAR_THRESHOLD_RATIO = 0.7
export const EAR_THRESHOLD_MIN = 0.15
export const EAR_THRESHOLD_MAX = 0.28
export const EAR_THRESHOLD_DEFAULT = 0.20

// Per-user blink cutoff: eyes are open for most of the rest phase, so the 70th
// percentile of rest-phase EAR approximates the open-eye baseline. A fixed
// fraction below it is the blink cutoff. Clamped so a bad calibration can't
// produce an unusable threshold. A fixed 0.20 cutoff generalizes poorly across
// eye shape / glasses (literature: 21% -> 96.6% accuracy when personalized).
// Only truly empty input falls back to the legacy default — even a handful of
// samples are clamped to a real (if extreme) threshold rather than discarded.
export function deriveEarThreshold(restEarSamples) {
  if (!restEarSamples || restEarSamples.length === 0) return EAR_THRESHOLD_DEFAULT
  const openBaseline = percentile(restEarSamples, 0.70)
  const th = openBaseline * EAR_THRESHOLD_RATIO
  return Math.max(EAR_THRESHOLD_MIN, Math.min(EAR_THRESHOLD_MAX, th))
}

export function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  // floor, not round: with small sample counts, rounding p95 up lands the
  // boundary exactly on the outlier we are trying to exclude
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[idx]
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

function phaseNormalized(phase, boundaries) {
  const normalized = {}
  if (boundaries.blinkRate) {
    normalized.blinkRate = normalizeSignal(phase.blinkRatePerMin, boundaries.blinkRate, SIGNAL_DIRECTIONS.blinkRate)
  }
  if (boundaries.gazeStability) {
    normalized.gazeStability = normalizeSignal(mean(phase.gazeSamples), boundaries.gazeStability, SIGNAL_DIRECTIONS.gazeStability)
  }
  if (boundaries.browFurrow) {
    normalized.browFurrow = normalizeSignal(mean(phase.browSamples), boundaries.browFurrow, SIGNAL_DIRECTIONS.browFurrow)
  }
  return normalized
}

// Minimum raw brow-ratio samples per phase before we trust boundaries built
// from them — mirrors the blink-sample-count gate above, keeping a sparse
// calibration from producing a noisy browFurrow signal.
const MIN_BROW_SAMPLES = 8

// Returns { browFurrow: {min,max} } from p5/p95 of the combined rest+task
// brow-ratio samples, or {} when absent/too sparse — spread into `boundaries`
// so callers with no brow data get an unchanged 2-signal profile.
function browBoundary(browSamples) {
  const ok =
    browSamples &&
    browSamples.rest?.length >= MIN_BROW_SAMPLES &&
    browSamples.task?.length >= MIN_BROW_SAMPLES
  if (!ok) return {}
  const allBrow = [...browSamples.rest, ...browSamples.task]
  const b = usableContinuousBoundary({ min: percentile(allBrow, 0.05), max: percentile(allBrow, 0.95) })
  return b ? { browFurrow: b } : {}
}

function withBrowSamples(phase, samples, hasBrow) {
  return hasBrow ? { ...phase, browSamples: samples } : phase
}

// rest/task: { gazeSamples: number[], blinkRatePerMin: number }
// browSamples (optional): { rest: number[], task: number[] } — raw brow-ratio
// samples per phase. Omitted (or too sparse) callers get a profile with no
// browFurrow boundary/phaseMeans, so computeEngagementScore simply skips it.
export function buildCalibrationProfile({
  rest,
  task,
  weights,
  faceDetectionRate = 1,
  now = 0,
  restEarSamples,
  blinkRateSamples,
  browSamples,
}) {
  const allGaze = [...rest.gazeSamples, ...task.gazeSamples]
  // Prefer p5/p95 of the full rolling blink-rate distribution (mirrors how
  // gaze boundaries are built) once enough samples exist; a couple of
  // aggregate anchors are too easily skewed by one outlier window. With too
  // few samples, fall back to the original 2-anchor ± pad estimate.
  const blinkRaw =
    blinkRateSamples && blinkRateSamples.length >= 8
      ? { min: percentile(blinkRateSamples, 0.05), max: percentile(blinkRateSamples, 0.95) }
      : {
          min: Math.min(rest.blinkRatePerMin, task.blinkRatePerMin) - BLINK_BOUND_PAD,
          max: Math.max(rest.blinkRatePerMin, task.blinkRatePerMin) + BLINK_BOUND_PAD,
        }
  const gazeBoundary = usableContinuousBoundary({
    min: percentile(allGaze, 0.05),
    max: percentile(allGaze, 0.95),
  })
  const boundaries = {
    ...(gazeBoundary ? { gazeStability: gazeBoundary } : {}),
    blinkRate: usableBlinkBoundary(blinkRaw),
    ...browBoundary(browSamples),
  }
  const hasBrow = boundaries.browFurrow != null

  const phaseMeans = {
    rest: phaseNormalized(withBrowSamples(rest, browSamples?.rest, hasBrow), boundaries),
    task: phaseNormalized(withBrowSamples(task, browSamples?.task, hasBrow), boundaries),
  }

  const floorW = weightedIndex(phaseMeans.rest, weights)
  const ceilingW = weightedIndex(phaseMeans.task, weights)
  const params = deriveSigmoidParams(floorW, ceilingW)

  const separation = clamp01((ceilingW - floorW) / FULL_SEPARATION)
  const coverage = clamp01(
    Math.min(rest.gazeSamples.length, task.gazeSamples.length) / COVERAGE_TARGET,
  )
  // A degenerate profile (rest and task produced near-identical weighted
  // indices — the signals never separated) is an untrustworthy calibration, so
  // tank its quality. This surfaces as low confidence, nudging a recalibration
  // instead of presenting a frozen score at high confidence.
  const degeneratePenalty = params.degenerate ? 0.35 : 1
  const quality =
    degeneratePenalty * (0.4 * separation + 0.3 * coverage + 0.3 * clamp01(faceDetectionRate))

  return {
    boundaries,
    phaseMeans,
    floorW,
    ceilingW,
    ...params,
    quality,
    createdAt: now,
    earThreshold: deriveEarThreshold(restEarSamples),
  }
}

// Re-derive anchors after a weight change without recalibrating.
export function reweightProfile(profile, weights) {
  const floorW = weightedIndex(profile.phaseMeans.rest, weights)
  const ceilingW = weightedIndex(profile.phaseMeans.task, weights)
  return { ...profile, floorW, ceilingW, ...deriveSigmoidParams(floorW, ceilingW) }
}
