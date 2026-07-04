import { describe, it, expect } from 'vitest'
import { calculateGazeRatio, calculateIrisCentroid } from '../signalExtractor'

// Minimal synthetic face: only the landmark indices the gaze functions read.
// Iris centers sit exactly mid-way between each eye's corners and lids → ratio 0.5/0.5.
function makeFace(shiftX = 0, shiftY = 0) {
  const lm = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }))
  const set = (i, x, y) => { lm[i] = { x: x + shiftX, y: y + shiftY, z: 0 } }
  // Left eye: inner 33, outer 133, top 159, bottom 145
  set(33, 0.30, 0.50); set(133, 0.40, 0.50); set(159, 0.35, 0.46); set(145, 0.35, 0.54)
  // Left iris 468-472, centered at (0.35, 0.50)
  for (const i of [468, 469, 470, 471, 472]) set(i, 0.35, 0.50)
  // Right eye: inner 263, outer 362, top 386, bottom 374
  set(263, 0.60, 0.50); set(362, 0.70, 0.50); set(386, 0.65, 0.46); set(374, 0.65, 0.54)
  // Right iris 473-477, centered at (0.65, 0.50)
  for (const i of [473, 474, 475, 476, 477]) set(i, 0.65, 0.50)
  return lm
}

describe('calculateGazeRatio', () => {
  it('returns ~0.5/0.5 when irises are centered in the eyes', () => {
    const g = calculateGazeRatio(makeFace())
    expect(g.x).toBeCloseTo(0.5, 2)
    expect(g.y).toBeCloseTo(0.5, 2)
  })

  it('is invariant to whole-head translation (the bug fix)', () => {
    const base = calculateGazeRatio(makeFace(0, 0))
    const shifted = calculateGazeRatio(makeFace(0.1, -0.07)) // head moves, eyes do not roll
    expect(shifted.x).toBeCloseTo(base.x, 3)
    expect(shifted.y).toBeCloseTo(base.y, 3)
  })

  it('contrast: raw iris centroid is NOT translation-invariant (documents why the fix matters)', () => {
    const base = calculateIrisCentroid(makeFace(0, 0))
    const shifted = calculateIrisCentroid(makeFace(0.1, 0))
    expect(Math.abs(shifted.x - base.x)).toBeGreaterThan(0.05)
  })

  it('tracks true eye movement: iris shifted toward outer corner raises x-ratio', () => {
    const lm = makeFace()
    for (const i of [468, 469, 470, 471, 472]) lm[i] = { x: 0.385, y: 0.50, z: 0 } // toward outer (0.40)
    const g = calculateGazeRatio(lm)
    expect(g.x).toBeGreaterThan(0.6)
  })
})
