// Pure JITAI nudge decision. Fires supportive nudges ONLY when the user is
// off-track (drifting / drowsy / long-away) plus a loose ~90-min break
// backstop. Per-type cooldowns + an hourly cap keep it from nagging. `now` is
// always passed in (never Date.now()) so it is testable and resume-safe.

export const NUDGE_TYPES = { DRIFT: 'drift', DROWSY: 'drowsy', AWAY: 'away', BACKSTOP: 'backstop' }

export const NUDGE_PARAMS = {
  awayNudgeMs: 60000,        // must be away this long before nudging (don't punish self-breaks)
  backstopMs: 5400000,       // ~90 min continuous session → one gentle break offer
  perTypeCooldownMs: 600000, // same nudge type won't re-fire within 10 min
  hourlyCap: 4,              // max nudges per rolling hour
}

// Supportive, observational tone. Never guilt / streaks / "overdue".
export const NUDGE_COPY = {
  drift: { title: 'Attention check', body: 'Looks like your focus drifted. Want a quick reset?' },
  drowsy: { title: 'Feeling it?', body: 'You seem to be fading. A short break might help.' },
  away: { title: 'Still there?', body: 'Your session is here whenever you are ready.' },
  backstop: { title: 'Going strong', body: 'You have been at it a while. A break is there if you want one.' },
}

export function createNudgeState(now) {
  void now // accepted for interface symmetry with stepNudge; state itself starts empty
  return {
    lastFocusState: null,
    lastByType: {},     // type → last fired timestamp
    recent: [],         // timestamps of recent nudges (for hourly cap)
    awaySince: null,    // when current away episode began
    awayNudged: false,  // nudged for the current away episode already
    backstopFired: false,
  }
}

function canFire(s, type, now, params) {
  // per-type cooldown
  const last = s.lastByType[type]
  if (last != null && now - last < params.perTypeCooldownMs) return false
  // rolling hourly cap
  const cutoff = now - 3600000
  const inHour = s.recent.filter((t) => t >= cutoff).length
  return inHour < params.hourlyCap
}

function fire(s, type, now) {
  s.lastByType[type] = now
  s.recent = [...s.recent.filter((t) => t >= now - 3600000), now]
  return { type, ...NUDGE_COPY[type] }
}

export function stepNudge(nudgeState, input, now, params = NUDGE_PARAMS) {
  const s = nudgeState
  const prev = s.lastFocusState
  const fs = input.focusState

  // Track the away episode boundaries.
  if (fs === 'away') {
    if (s.awaySince == null) { s.awaySince = now; s.awayNudged = false }
  } else {
    s.awaySince = null
    s.awayNudged = false
  }

  let nudge = null
  if (input.sessionRunning) {
    // Backstop: once per session, ~90 min in, while focused (don't stack).
    if (!s.backstopFired && fs === 'focused' && input.sessionElapsedMs >= params.backstopMs) {
      if (canFire(s, NUDGE_TYPES.BACKSTOP, now, params)) { nudge = fire(s, NUDGE_TYPES.BACKSTOP, now); s.backstopFired = true }
    } else if (fs === 'drifting' && prev !== 'drifting') {
      if (canFire(s, NUDGE_TYPES.DRIFT, now, params)) nudge = fire(s, NUDGE_TYPES.DRIFT, now)
    } else if (fs === 'drowsy' && prev !== 'drowsy') {
      if (canFire(s, NUDGE_TYPES.DROWSY, now, params)) nudge = fire(s, NUDGE_TYPES.DROWSY, now)
    } else if (fs === 'away' && !s.awayNudged && s.awaySince != null && now - s.awaySince >= params.awayNudgeMs) {
      if (canFire(s, NUDGE_TYPES.AWAY, now, params)) { nudge = fire(s, NUDGE_TYPES.AWAY, now); s.awayNudged = true }
    }
  }

  s.lastFocusState = fs
  return { nudgeState: s, nudge }
}
