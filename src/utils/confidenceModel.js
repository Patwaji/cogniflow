import { clamp01 } from './engagementEngine'

// Every prediction carries a confidence score. Locked split:
export const CONFIDENCE_WEIGHTS = {
  face: 0.30,          // face detection rate over recent frames
  iris: 0.25,          // iris landmark temporal stability (jitter vs head motion)
  illumination: 0.20,  // lighting level + stability
  calibration: 0.15,   // calibration profile quality
  framerate: 0.10,     // achieved fps vs target
}

export function computeConfidence(components) {
  let sum = 0
  for (const [key, w] of Object.entries(CONFIDENCE_WEIGHTS)) {
    sum += w * clamp01(components[key] ?? 0)
  }
  return clamp01(sum)
}

// residuals: per-frame max(0, |iris movement| - |head movement|) in
// normalized landmark units. MediaPipe gives no true landmark error, so we
// use temporal stability as the proxy: iris jitter while the head is still
// means the tracker is guessing.
export const IRIS_JITTER_SCALE = 0.004

export function irisStabilityFromResiduals(residuals) {
  if (residuals.length < 2) return 1
  const m = residuals.reduce((a, b) => a + Math.max(0, b), 0) / residuals.length
  return clamp01(1 - m / IRIS_JITTER_SCALE)
}

// lumas: recent mean-luma samples (0..255). Quality = stability x level.
const LUMA_CV_FULL_PENALTY = 0.2
const LUMA_DARK_FLOOR = 40

export function illuminationQuality(lumas) {
  if (lumas.length < 2) return 1
  const m = lumas.reduce((a, b) => a + b, 0) / lumas.length
  if (m <= 0) return 0
  const variance = lumas.reduce((a, b) => a + (b - m) ** 2, 0) / lumas.length
  const cv = Math.sqrt(variance) / m
  const stability = clamp01(1 - cv / LUMA_CV_FULL_PENALTY)
  const level = clamp01(m / LUMA_DARK_FLOOR)
  return stability * level
}

export function framerateQuality(actualFps, targetFps) {
  if (!targetFps) return 1
  return clamp01(actualFps / targetFps)
}
