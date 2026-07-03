// Longitudinal per-user profile, stored locally only (never uploaded).
// Keeps the last 30 days of calibration anchors and session summaries so
// future versions can blend session calibration with a historical prior.

const STORAGE_KEY = 'cogniflow_profile'
const HISTORY_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

function persist(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

function dateKey(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

function cutoff(now) {
  return now - HISTORY_DAYS * DAY_MS
}

export function recordCalibration(profile, now = Date.now()) {
  const data = load()
  const calibrations = { ...(data.calibrations || {}) }
  calibrations[dateKey(now)] = {
    boundaries: profile.boundaries,
    floorW: profile.floorW,
    ceilingW: profile.ceilingW,
    k: profile.k,
    quality: profile.quality,
    createdAt: now,
  }
  for (const [key, entry] of Object.entries(calibrations)) {
    if (entry.createdAt < cutoff(now)) delete calibrations[key]
  }
  persist({ ...data, calibrations })
}

export function recordSessionSummary(summary, now = Date.now()) {
  const data = load()
  const sessions = [...(data.sessions || []), { ...summary, date: dateKey(now), createdAt: now }]
    .filter((s) => s.createdAt >= cutoff(now))
  persist({ ...data, sessions })
}

function meanStd(values) {
  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return { mean, std: Math.sqrt(variance) }
}

export function getProfileStats(now = Date.now()) {
  const data = load()
  const calibrations = Object.values(data.calibrations || {})
    .filter((c) => c.createdAt >= cutoff(now))
  if (!calibrations.length) return null
  const sessions = (data.sessions || []).filter((s) => s.createdAt >= cutoff(now))
  return {
    calibrationCount: calibrations.length,
    sessionCount: sessions.length,
    floorW: meanStd(calibrations.map((c) => c.floorW)),
    ceilingW: meanStd(calibrations.map((c) => c.ceilingW)),
    k: meanStd(calibrations.map((c) => c.k)),
  }
}
