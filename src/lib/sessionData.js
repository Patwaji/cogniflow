// Builds the persisted session payload from the in-memory session points.
// Shared so the post-session review and any other saver produce identical
// on-disk shape. `groundTruth` is optional retrospective validation.

import { buildSessionStory } from './sessionStory'

export function buildSessionData({ startTime, endTime, dataPoints, groundTruth = null }) {
  const scores = dataPoints.map((p) => p.cognitiveScore)
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)

  let peakScore = -Infinity
  let peakTimestamp = 0
  let lowestScore = Infinity
  let lowestTimestamp = 0
  for (const p of dataPoints) {
    if (p.cognitiveScore > peakScore) {
      peakScore = p.cognitiveScore
      peakTimestamp = p.timestamp
    }
    if (p.cognitiveScore < lowestScore) {
      lowestScore = p.cognitiveScore
      lowestTimestamp = p.timestamp
    }
  }

  const confidences = dataPoints.map((p) => p.confidence ?? 0)
  const avgConfidence = Number(
    (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(2),
  )

  const story = buildSessionStory(dataPoints, startTime)

  return {
    name: `Session ${new Date(startTime).toLocaleDateString()}`,
    startTime,
    endTime,
    duration: Math.floor((endTime - startTime) / 1000),
    dataPoints,
    groundTruth,
    summary: {
      avgScore,
      avgConfidence,
      peakScore,
      peakTimestamp,
      lowestScore,
      lowestTimestamp,
      longestFocusedStretchSec: story.longestFocusedStretchSec,
      focusedSeconds: story.focusedSec,
      driftingSeconds: story.driftingSec,
      drowsySeconds: story.drowsySec,
      awaySeconds: story.awaySec,
      firstDriftElapsed: story.firstDriftElapsed,
    },
  }
}

// Finds the ~5-minute window with the largest net score change, for the
// retrospective validation prompt. Returns null when there aren't enough
// points to make a meaningful claim.
const WINDOW_SECONDS = 300

export function findBiggestChangeSegment(dataPoints, startTime) {
  if (dataPoints.length < 4) return null

  const pts = dataPoints.map((p) => ({
    elapsed: Math.round((p.timestamp - startTime) / 1000),
    score: p.cognitiveScore,
  }))

  let best = null
  for (let i = 0; i < pts.length; i++) {
    const windowEndElapsed = pts[i].elapsed + WINDOW_SECONDS
    let j = i
    while (j + 1 < pts.length && pts[j + 1].elapsed <= windowEndElapsed) j++
    if (j === i) continue
    const delta = pts[j].score - pts[i].score
    if (!best || Math.abs(delta) > Math.abs(best.delta)) {
      best = {
        startElapsed: pts[i].elapsed,
        endElapsed: pts[j].elapsed,
        delta,
        direction: delta < 0 ? 'drop' : 'rise',
      }
    }
  }

  // Require a real change to bother asking (10+ points on the 0-100 scale)
  if (!best || Math.abs(best.delta) < 10) return null
  return best
}
