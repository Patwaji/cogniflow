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
export function buildCalibrationProfile({ rest, task, weights, faceDetectionRate = 1, now = 0 }) {
  const allGaze = [...rest.gazeSamples, ...task.gazeSamples]
  const boundaries = {
    gazeStability: {
      min: percentile(allGaze, 0.05),
      max: percentile(allGaze, 0.95),
    },
    blinkRate: {
      min: Math.min(rest.blinkRatePerMin, task.blinkRatePerMin) - BLINK_BOUND_PAD,
      max: Math.max(rest.blinkRatePerMin, task.blinkRatePerMin) + BLINK_BOUND_PAD,
    },
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

  return { boundaries, phaseMeans, floorW, ceilingW, ...params, quality, createdAt: now }
}

// Re-derive anchors after a weight change without recalibrating.
export function reweightProfile(profile, weights) {
  const floorW = weightedIndex(profile.phaseMeans.rest, weights)
  const ceilingW = weightedIndex(profile.phaseMeans.task, weights)
  return { ...profile, floorW, ceilingW, ...deriveSigmoidParams(floorW, ceilingW) }
}
