// Pure After-Action-Review builder: turns four-state data points into a
// segmented "story" (focused stretches, drifts, drowsy spells, away gaps),
// headline metrics, and a deterministic "try this next" takeaway. No score.

export const STORY_TICK_SECONDS = 5

export function buildSessionStory(dataPoints, startTime) {
  const empty = {
    segments: [], longestFocusedStretchSec: 0,
    focusedSec: 0, driftingSec: 0, drowsySec: 0, awaySec: 0,
    driftCount: 0, drowsyCount: 0, awayCount: 0,
    firstDriftElapsed: null, takeaway: null,
  }
  if (!dataPoints || dataPoints.length === 0) return empty

  const pts = dataPoints.map((p) => ({
    elapsed: Math.max(0, Math.round((p.timestamp - startTime) / 1000)),
    state: p.focusState,
  }))

  // Group contiguous same-state runs into segments. Each point represents
  // STORY_TICK_SECONDS of elapsed time, so a segment ends one tick past its
  // last point.
  const segments = []
  let cur = null
  for (const p of pts) {
    if (cur && cur.state === p.state) {
      cur.endElapsed = p.elapsed + STORY_TICK_SECONDS
    } else {
      if (cur) segments.push(cur)
      cur = { state: p.state, startElapsed: p.elapsed, endElapsed: p.elapsed + STORY_TICK_SECONDS }
    }
  }
  if (cur) segments.push(cur)
  for (const s of segments) s.durationSec = s.endElapsed - s.startElapsed

  const totals = { focused: 0, drifting: 0, drowsy: 0, away: 0 }
  let longestFocusedStretchSec = 0
  let driftCount = 0, drowsyCount = 0, awayCount = 0
  let firstDriftElapsed = null
  for (const s of segments) {
    if (s.state in totals) totals[s.state] += s.durationSec
    if (s.state === 'focused') longestFocusedStretchSec = Math.max(longestFocusedStretchSec, s.durationSec)
    if (s.state === 'drifting') { driftCount++; if (firstDriftElapsed == null) firstDriftElapsed = s.startElapsed }
    if (s.state === 'drowsy') drowsyCount++
    if (s.state === 'away') awayCount++
  }

  const story = {
    segments, longestFocusedStretchSec,
    focusedSec: totals.focused, driftingSec: totals.drifting,
    drowsySec: totals.drowsy, awaySec: totals.away,
    driftCount, drowsyCount, awayCount, firstDriftElapsed,
    takeaway: null,
  }
  story.takeaway = buildTakeaway(story)
  return story
}

function fmtMin(sec) {
  const m = Math.round(sec / 60)
  return m <= 1 ? '1 minute' : `${m} minutes`
}

// Deterministic, session-specific "where to next". Ordered by salience so the
// most useful single suggestion surfaces. Supportive, never blaming.
export function buildTakeaway(story) {
  if (!story || story.segments.length === 0) return null
  if (story.drowsyCount >= 1) {
    return 'You got drowsy at least once. A shorter session, or a break before you hit that wall, might help next time.'
  }
  if (story.driftCount >= 2 && story.firstDriftElapsed != null) {
    return `Your focus first dipped around ${fmtMin(story.firstDriftElapsed)} in. Try a short break near there next time to get ahead of it.`
  }
  if (story.driftCount === 0 && story.longestFocusedStretchSec >= 120) {
    return `Strong session — your longest unbroken focus was ${fmtMin(story.longestFocusedStretchSec)}. See if you can match it next time.`
  }
  if (story.driftCount >= 1) {
    return `You drifted ${story.driftCount === 1 ? 'once' : `${story.driftCount} times`} but came back each time. Noticing the dip is half the battle.`
  }
  return 'A steady session. Keep an eye on when your focus tends to dip and plan a break just before it.'
}
