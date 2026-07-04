// Formal four-state focus model with anti-flicker hysteresis (borrowed from
// driver-monitoring standards). Pure and time-parameterized: `now` is always
// passed in (never Date.now()), so it is fully unit-testable and resume-safe.
//
// Priority (highest first): calibrating > away > drowsy > drifting > focused.
// - away: no face past a generous grace window (a brief look-down at a book is
//   NOT away).
// - drifting: cumulative look-away past a threshold within a rolling window, OR
//   sustained low engagement. Requires accumulation, so a quick glance never trips.
// - returning to focused after any deviation requires a sustained on-task hold.
// - low tracking confidence freezes the drift/focused decision rather than
//   flipping on noise (away/drowsy still evaluated — presence is reliable).

export const FOCUS_STATES = {
  CALIBRATING: 'calibrating',
  FOCUSED: 'focused',
  DRIFTING: 'drifting',
  DROWSY: 'drowsy',
  AWAY: 'away',
}

export const FOCUS_PARAMS = {
  awayGraceMs: 20000,       // no-face this long → away
  driftWindowMs: 60000,     // rolling window for cumulative look-away
  driftLookAwayMs: 10000,   // cumulative off-material in the window → drifting
  driftEngagementMs: 9000,  // sustained low engagement → drifting
  clearHoldMs: 3000,        // on-task hold required to clear a deviation
  minConfidence: 0.4,       // below this, freeze drift/focused decision
}

// Clamp per-step dt so a long gap (backgrounded app) doesn't dump one huge
// look-away sample into the rolling window.
export const MAX_STEP_DT_MS = 1000

export function createFocusMachine(now) {
  return {
    state: FOCUS_STATES.CALIBRATING,
    since: now,
    lastStepAt: now,
    lastPresentAt: now,
    lookAway: [],          // [{ t, dt, off }] pruned to driftWindowMs
    lowEngagedSince: null,
    onTaskHoldSince: null,
  }
}

export function stepFocusMachine(machine, input, now, params = FOCUS_PARAMS) {
  const m = machine
  const dt = Math.min(Math.max(0, now - m.lastStepAt), MAX_STEP_DT_MS)
  m.lastStepAt = now

  if (input.present) m.lastPresentAt = now

  // Rolling look-away accumulator: only counts while present but off-material.
  // Absence is handled exclusively by the away-grace timer below, so a
  // disappearance doesn't double-count into drift before the grace window
  // (a face gone for 15s must stay focused/frozen, not flip to drifting).
  const off = input.present && !input.onMaterial
  m.lookAway.push({ t: now, dt, off })
  const windowStart = now - params.driftWindowMs
  while (m.lookAway.length && m.lookAway[0].t < windowStart) m.lookAway.shift()
  let cumulativeOffMs = 0
  for (const s of m.lookAway) if (s.off) cumulativeOffMs += s.dt

  // Sustained low-engagement timer (present, on material, but not engaged).
  if (input.present && input.onMaterial && !input.engaged) {
    if (m.lowEngagedSince == null) m.lowEngagedSince = now
  } else {
    m.lowEngagedSince = null
  }

  // On-task hold timer (present + on material + engaged), for return-and-hold.
  const onTask = input.present && input.onMaterial && input.engaged
  if (onTask) {
    if (m.onTaskHoldSince == null) m.onTaskHoldSince = now
  } else {
    m.onTaskHoldSince = null
  }

  let next
  if (input.calibrating) {
    next = FOCUS_STATES.CALIBRATING
  } else if (now - m.lastPresentAt >= params.awayGraceMs) {
    next = FOCUS_STATES.AWAY
  } else if (input.drowsy) {
    next = FOCUS_STATES.DROWSY
  } else if (input.confidence < params.minConfidence) {
    // Freeze drift/focused on unreliable tracking; leave any cleared
    // deviation gracefully by defaulting to focused.
    next = (m.state === FOCUS_STATES.DRIFTING || m.state === FOCUS_STATES.FOCUSED)
      ? m.state
      : FOCUS_STATES.FOCUSED
  } else {
    const driftingActive =
      cumulativeOffMs >= params.driftLookAwayMs ||
      (m.lowEngagedSince != null && now - m.lowEngagedSince >= params.driftEngagementMs)

    if (m.state === FOCUS_STATES.FOCUSED || m.state === FOCUS_STATES.CALIBRATING) {
      next = driftingActive ? FOCUS_STATES.DRIFTING : FOCUS_STATES.FOCUSED
    } else {
      // Returning from a deviation (drifting / cleared away / cleared drowsy):
      // require a sustained on-task hold, then reset accumulators so stale
      // look-away doesn't immediately re-trip drift.
      const held = m.onTaskHoldSince != null && now - m.onTaskHoldSince >= params.clearHoldMs
      if (held) {
        next = FOCUS_STATES.FOCUSED
        m.lookAway = []
        m.lowEngagedSince = null
      } else {
        next = m.state
      }
    }
  }

  if (next !== m.state) {
    m.state = next
    m.since = now
  }
  return { machine: m, state: m.state, since: m.since }
}
