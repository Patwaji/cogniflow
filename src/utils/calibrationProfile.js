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
  return {
    blinkRate: normalizeSignal(phase.blinkRatePerMin, boundaries.blinkRate, SIGNAL_DIRECTIONS.blinkRate),
    gazeStability: normalizeSignal(mean(phase.gazeSamples), boundaries.gazeStability, SIGNAL_DIRECTIONS.gazeStability),
  }
}

// rest/task: { gazeSamples: number[], blinkRatePerMin: number }
export function buildCalibrationProfile({
  rest,
  task,
  weights,
  faceDetectionRate = 1,
  now = 0,
  restEarSamples,
  blinkRateSamples,
}) {
  const allGaze = [...rest.gazeSamples, ...task.gazeSamples]
  // Prefer p5/p95 of the full rolling blink-rate distribution (mirrors how
  // gaze boundaries are built) once enough samples exist; a couple of
  // aggregate anchors are too easily skewed by one outlier window. With too
  // few samples, fall back to the original 2-anchor ± pad estimate.
  const blinkBoundary =
    blinkRateSamples && blinkRateSamples.length >= 8
      ? { min: percentile(blinkRateSamples, 0.05), max: percentile(blinkRateSamples, 0.95) }
      : {
          min: Math.min(rest.blinkRatePerMin, task.blinkRatePerMin) - BLINK_BOUND_PAD,
          max: Math.max(rest.blinkRatePerMin, task.blinkRatePerMin) + BLINK_BOUND_PAD,
        }
  const boundaries = {
    gazeStability: {
      min: percentile(allGaze, 0.05),
      max: percentile(allGaze, 0.95),
    },
    blinkRate: blinkBoundary,
  }

  const phaseMeans = {
    rest: phaseNormalized(rest, boundaries),
    task: phaseNormalized(task, boundaries),
  }

  const floorW = weightedIndex(phaseMeans.rest, weights)
  const ceilingW = weightedIndex(phaseMeans.task, weights)
  const params = deriveSigmoidParams(floorW, ceilingW)

  const separation = clamp01((ceilingW - floorW) / FULL_SEPARATION)
  const coverage = clamp01(
    Math.min(rest.gazeSamples.length, task.gazeSamples.length) / COVERAGE_TARGET,
  )
  const quality =
    0.4 * separation + 0.3 * coverage + 0.3 * clamp01(faceDetectionRate)

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
