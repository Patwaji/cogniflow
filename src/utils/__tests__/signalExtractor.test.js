import { describe, it, expect } from 'vitest'
import {
  calculateGazeRatio,
  calculateIrisCentroid,
  calculateBrowRatio,
  estimateOnMaterial,
} from '../signalExtractor'

// Face with nose (1), cheeks (234/454), eye corners, and irises set — enough
// for estimateOnMaterial. noseX shifts head yaw; irisH is the horizontal iris
// ratio (0.5 = centered); irisY is the vertical iris position (ignored by
// estimateOnMaterial, so it exercises the "looking down at a notebook" case).
function makeMaterialFace({ noseX = 0.5, irisH = 0.5, irisY = 0.5 } = {}) {
  const lm = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }))
  const set = (i, x, y) => { lm[i] = { x, y, z: 0 } }
  set(1, noseX, 0.50)   // nose tip
  set(234, 0.30, 0.55)  // left cheek
  set(454, 0.70, 0.55)  // right cheek
  set(33, 0.30, 0.50); set(133, 0.40, 0.50)   // left eye inner/outer
  set(263, 0.60, 0.50); set(362, 0.70, 0.50)  // right eye inner/outer
  const lx = 0.30 + irisH * 0.10 // between left inner (0.30) and outer (0.40)
  const rx = 0.60 + irisH * 0.10 // between right inner (0.60) and outer (0.70)
  for (const i of [468, 469, 470, 471, 472]) set(i, lx, irisY)
  for (const i of [473, 474, 475, 476, 477]) set(i, rx, irisY)
  return lm
}

describe('estimateOnMaterial', () => {
  it('head forward + centered gaze → on material', () => {
    expect(estimateOnMaterial(makeMaterialFace())).toBe(true)
  })

  it('looking DOWN at a notebook (head forward) is still on material (copy-pen work)', () => {
    expect(estimateOnMaterial(makeMaterialFace({ irisY: 0.28 }))).toBe(true)
  })

  it('head turned away → off material', () => {
    // nose offset (0.58-0.5)/faceWidth(0.4) = 0.20 > yaw tolerance
    expect(estimateOnMaterial(makeMaterialFace({ noseX: 0.58 }))).toBe(false)
  })

  it('far side-glance (head forward) → off material', () => {
    expect(estimateOnMaterial(makeMaterialFace({ irisH: 0.95 }))).toBe(false)
  })
})

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

  it('clamps the y-ratio instead of exploding when lids nearly meet (blink-moment noise)', () => {
    const lm = makeFace()
    // Near-closed eye: bottom lid lands within 1e-7 of the top lid, so the
    // denominator (lTop.y - lBot.y + 1e-6) shrinks toward the epsilon while
    // the iris (still at its unmoved y=0.50, from makeFace) is ~0.04 away
    // from the lids — a numerator/denominator ratio in the tens of
    // thousands without clamping. Applied to both eyes.
    lm[145] = { x: 0.35, y: 0.46 - 1e-7, z: 0 } // left bottom lid, ~touching left top lid (0.46)
    lm[374] = { x: 0.65, y: 0.46 - 1e-7, z: 0 } // right bottom lid, ~touching right top lid (0.46)

    // Sanity check: confirm this setup actually would explode without the
    // clamp, so the assertion below is testing the clamp and not a no-op.
    const lTop = 0.46, lBot = 0.46 - 1e-7, iris = 0.50
    const unclamped = (iris - lBot) / (lTop - lBot + 1e-6)
    expect(Math.abs(unclamped)).toBeGreaterThan(1000)

    const g = calculateGazeRatio(lm)
    expect(g.y).toBeGreaterThanOrEqual(-0.5)
    expect(g.y).toBeLessThanOrEqual(1.5)
    expect(Number.isFinite(g.y)).toBe(true)
  })
})

// Minimal synthetic face for brow-ratio tests: only the indices
// calculateBrowRatio reads — brows (70, 300) via calculateBrowDistance, and
// cheeks (234, 454) for face width.
function makeBrowFace({ leftBrowX = 0.40, rightBrowX = 0.60, leftCheekX = 0.20, rightCheekX = 0.80 } = {}) {
  const lm = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }))
  const set = (i, x, y) => { lm[i] = { x, y, z: 0 } }
  set(70, leftBrowX, 0.40)
  set(300, rightBrowX, 0.40)
  set(234, leftCheekX, 0.50)
  set(454, rightCheekX, 0.50)
  return lm
}

describe('calculateBrowRatio', () => {
  it('is invariant to uniform scaling of all landmark coordinates', () => {
    const base = makeBrowFace()
    const baseRatio = calculateBrowRatio(base)

    const factor = 2.5
    const scaled = base.map((p) => ({ x: p.x * factor, y: p.y * factor, z: p.z * factor }))
    const scaledRatio = calculateBrowRatio(scaled)

    expect(scaledRatio).toBeCloseTo(baseRatio, 6)
  })

  it('furrowing (brows move closer together) lowers the ratio', () => {
    const relaxed = makeBrowFace({ leftBrowX: 0.40, rightBrowX: 0.60 })
    const furrowed = makeBrowFace({ leftBrowX: 0.46, rightBrowX: 0.54 })

    const relaxedRatio = calculateBrowRatio(relaxed)
    const furrowedRatio = calculateBrowRatio(furrowed)

    expect(furrowedRatio).toBeLessThan(relaxedRatio)
  })
})
