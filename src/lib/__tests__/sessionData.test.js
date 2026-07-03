import { describe, it, expect } from 'vitest'
import { buildSessionData, findBiggestChangeSegment } from '../sessionData'

const START = 1_000_000

function pt(elapsedSec, score, focusState = 'normal', confidence = 0.8) {
  return {
    timestamp: START + elapsedSec * 1000,
    cognitiveScore: score,
    confidence,
    focusState,
  }
}

describe('buildSessionData', () => {
  it('computes summary stats and carries groundTruth', () => {
    const dataPoints = [
      pt(0, 40, 'normal'),
      pt(5, 80, 'flow'),
      pt(10, 20, 'distracted'),
    ]
    const gt = { answer: 'yes' }
    const s = buildSessionData({ startTime: START, endTime: START + 15000, dataPoints, groundTruth: gt })
    expect(s.summary.avgScore).toBe(Math.round((40 + 80 + 20) / 3))
    expect(s.summary.peakScore).toBe(80)
    expect(s.summary.lowestScore).toBe(20)
    expect(s.summary.totalFlowSeconds).toBe(5)
    expect(s.summary.totalDistractedSeconds).toBe(5)
    expect(s.summary.avgConfidence).toBeCloseTo(0.8, 2)
    expect(s.duration).toBe(15)
    expect(s.groundTruth).toBe(gt)
  })
})

describe('findBiggestChangeSegment', () => {
  it('returns null for too few points', () => {
    expect(findBiggestChangeSegment([pt(0, 50), pt(5, 55)], START)).toBeNull()
  })

  it('returns null when no change exceeds the threshold', () => {
    const flat = Array.from({ length: 20 }, (_, i) => pt(i * 5, 50 + (i % 2)))
    expect(findBiggestChangeSegment(flat, START)).toBeNull()
  })

  it('finds a sharp drop and reports the direction', () => {
    // steady high, then collapses around 60s
    const pts = []
    for (let i = 0; i < 12; i++) pts.push(pt(i * 5, 85))
    for (let i = 12; i < 24; i++) pts.push(pt(i * 5, 25))
    const seg = findBiggestChangeSegment(pts, START)
    expect(seg).not.toBeNull()
    expect(seg.direction).toBe('drop')
    expect(seg.delta).toBeLessThan(-10)
    expect(seg.endElapsed).toBeGreaterThan(seg.startElapsed)
  })

  it('finds a sharp rise', () => {
    const pts = []
    for (let i = 0; i < 12; i++) pts.push(pt(i * 5, 20))
    for (let i = 12; i < 24; i++) pts.push(pt(i * 5, 90))
    const seg = findBiggestChangeSegment(pts, START)
    expect(seg.direction).toBe('rise')
    expect(seg.delta).toBeGreaterThan(10)
  })
})
