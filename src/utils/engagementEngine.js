// v2 cognitive engagement engine.
// Raw signals are normalized against a per-user calibration profile
// (min-max boundaries from a two-anchor calibration), combined into a
// weighted load index W, then expanded through a per-user sigmoid so the
// score spans the full 0-100 range within the user's own physiological
// boundaries. k = 4/(ceiling - floor) places the rest anchor at -2 and
// the task anchor at +2 on the sigmoid, where the curve is steepest.

// Direction of each signal with respect to cognitive load:
//  -1 → LOWER raw value means MORE load (blink rate drops, gaze steadies)
//  +1 → HIGHER raw value means MORE load (pupil dilates)
export const SIGNAL_DIRECTIONS = {
  blinkRate: -1,
  gazeStability: -1, // raw value is gaze jitter variance; steadier = more load
  pupilRatio: 1, // reserved for v2 pupillometry — no pupil landmark in MediaPipe
}

// Informed priors: blink + fixation stability carry the score (percent).
export const ENGINE_WEIGHTS = { blinkRate: 50, gazeStability: 50 }

export const MIN_ANCHOR_SEPARATION = 0.05

export function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

export function normalizeSignal(value, bounds, direction = 1) {
  if (!bounds || !(bounds.max > bounds.min)) return 0.5
  const n = (value - bounds.min) / (bounds.max - bounds.min)
  return clamp01(direction < 0 ? 1 - n : n)
}

// normalized: {key: 0..1}, weights: {key: percent}.
// Keys missing from `normalized` are skipped and the rest renormalized.
export function weightedIndex(normalized, weights) {
  let sum = 0
  let wsum = 0
  for (const [key, w] of Object.entries(weights)) {
    const v = normalized[key]
    if (v == null || !(w > 0)) continue
    sum += v * w
    wsum += w
  }
  return wsum > 0 ? sum / wsum : 0.5
}

export function deriveSigmoidParams(floorW, ceilingW) {
  const span = ceilingW - floorW
  if (!(span >= MIN_ANCHOR_SEPARATION)) {
    return { k: 4, midpoint: 0.5, degenerate: true }
  }
  return { k: 4 / span, midpoint: (floorW + ceilingW) / 2, degenerate: false }
}

export function sigmoidScore(index, { k, midpoint }) {
  return 100 / (1 + Math.exp(-k * (index - midpoint)))
}

// The two calibration anchors always sit at ±2 from the midpoint in the
// sigmoid exponent (k = 4/span and anchor = midpoint ± span/2 → k·span/2 = 2),
// so the rest floor and task ceiling map to these fixed raw outputs
// regardless of the user's k/midpoint. Rescaling against them stretches the
// user's personal rest→peak range across the full 0-100 span, so the resting
// baseline reads 0 and peak effort reads 100 (matching the design intent that
// the score curve toward 100% near the ceiling instead of stalling at ~88).
export const SIGMOID_FLOOR_OUTPUT = 100 / (1 + Math.exp(2)) // ≈ 11.92
export const SIGMOID_CEILING_OUTPUT = 100 / (1 + Math.exp(-2)) // ≈ 88.08

export function rescaleScore(rawSigmoid) {
  const stretched =
    ((rawSigmoid - SIGMOID_FLOOR_OUTPUT) /
      (SIGMOID_CEILING_OUTPUT - SIGMOID_FLOOR_OUTPUT)) *
    100
  return Math.max(0, Math.min(100, stretched))
}

export function computeEngagementScore(raw, profile, weights = ENGINE_WEIGHTS) {
  const normalized = {}
  for (const key of Object.keys(weights)) {
    if (raw[key] == null) continue
    normalized[key] = normalizeSignal(
      raw[key],
      profile.boundaries[key],
      SIGNAL_DIRECTIONS[key] ?? 1,
    )
  }
  const index = weightedIndex(normalized, weights)
  const score = Math.round(rescaleScore(sigmoidScore(index, profile)))
  return { score, index, normalized }
}

// Adaptive ceiling: when the smoothed live index exceeds the calibrated
// ceiling, stretch the ceiling and re-derive the sigmoid.
export function expandCeiling(profile, smoothedIndex) {
  if (!(smoothedIndex > profile.ceilingW)) return profile
  const ceilingW = smoothedIndex
  return { ...profile, ceilingW, ...deriveSigmoidParams(profile.floorW, ceilingW) }
}
