import { describe, it, expect } from 'vitest'
import { buildSessionStory, buildTakeaway, STORY_TICK_SECONDS } from '../sessionStory'

// Build data points 5s apart with the given focusState sequence.
function pts(states, startTime = 1000) {
  return states.map((state, i) => ({
    timestamp: startTime + i * STORY_TICK_SECONDS * 1000,
    focusState: state,
    cognitiveScore: 50,
    confidence: 1,
  }))
}
const START = 1000

describe('buildSessionStory', () => {
  it('groups contiguous states into segments with elapsed bounds', () => {
    const s = buildSessionStory(pts(['focused', 'focused', 'drifting', 'focused']), START)
    expect(s.segments).toHaveLength(3)
    expect(s.segments[0]).toMatchObject({ state: 'focused', startElapsed: 0 })
    expect(s.segments[1].state).toBe('drifting')
    expect(s.segments[2].state).toBe('focused')
  })

  it('computes the longest focused stretch (not total focused time)', () => {
    // focused x2 (10s), drift, focused x4 (20s) → longest = 20s+tick boundary
    const s = buildSessionStory(pts(['focused', 'focused', 'drifting', 'focused', 'focused', 'focused', 'focused']), START)
    expect(s.longestFocusedStretchSec).toBeGreaterThanOrEqual(20)
    expect(s.focusedSec).toBeGreaterThan(s.longestFocusedStretchSec) // total > longest single
  })

  it('counts lapses and finds the first drift time', () => {
    const s = buildSessionStory(pts(['focused', 'focused', 'focused', 'drifting', 'focused', 'drowsy']), START)
    expect(s.driftCount).toBe(1)
    expect(s.drowsyCount).toBe(1)
    expect(s.firstDriftElapsed).toBe(3 * STORY_TICK_SECONDS) // 15s
  })

  it('returns zeroed metrics + null firstDrift for an all-focused session', () => {
    const s = buildSessionStory(pts(['focused', 'focused', 'focused']), START)
    expect(s.driftCount).toBe(0)
    expect(s.firstDriftElapsed).toBeNull()
  })
})

describe('buildTakeaway', () => {
  it('flags drowsiness first', () => {
    const s = buildSessionStory(pts(['focused', 'drowsy', 'focused']), START)
    expect(buildTakeaway(s)).toMatch(/drows/i)
  })

  it('suggests a break near the first-drift time when drifting repeats', () => {
    const s = buildSessionStory(pts(['focused', 'focused', 'drifting', 'focused', 'drifting', 'focused']), START)
    const t = buildTakeaway(s)
    expect(t).toMatch(/drift|break/i)
  })

  it('celebrates a long unbroken stretch when there are no lapses', () => {
    const long = Array(30).fill('focused') // 150s focused
    const t = buildTakeaway(buildSessionStory(pts(long), START))
    expect(t).toMatch(/longest|stretch|strong/i)
  })
})
