// Pure weekly-pattern builder: aggregates the last 30 days of session
// summaries into research-grounded, actionable insights — best time of day
// (chronotype), focus stamina (time-to-first-drift), a distraction pattern,
// and one experiment to try. No streaks, no score. `now` is passed in.

function median(nums) {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function fmtHour(h) {
  const am = h < 12
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${am ? 'AM' : 'PM'}`
}

// `now` is accepted (not used yet) to keep the function's purity contract —
// callers pass the current time rather than the builder reaching for it.
// eslint-disable-next-line no-unused-vars
export function buildWeeklyInsights(sessions, now = Date.now()) {
  const base = { sessionCount: sessions.length, bestHour: null, stamina: null, distraction: null, experiment: null }
  if (!sessions.length) return base

  // Best hour of day by average longest focused stretch.
  const byHour = {}
  for (const s of sessions) {
    const h = new Date(s.createdAt).getHours()
    ;(byHour[h] ||= []).push(s.longestFocusedStretchSec ?? 0)
  }
  let bestHour = null
  for (const [h, arr] of Object.entries(byHour)) {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length
    if (!bestHour || avg > bestHour.avgLongestStretchSec) {
      bestHour = { hour: Number(h), avgLongestStretchSec: Math.round(avg) }
    }
  }

  // Stamina: median time-to-first-drift over sessions that actually drifted.
  const firstDrifts = sessions
    .filter((s) => s.firstDriftElapsed != null)
    .map((s) => s.firstDriftElapsed)
  let stamina = null
  if (firstDrifts.length) {
    stamina = {
      medianFirstDriftMin: Math.round(median(firstDrifts) / 60),
      trend: sessions
        .filter((s) => s.firstDriftElapsed != null)
        .map((s) => ({ createdAt: s.createdAt, firstDriftMin: Math.round(s.firstDriftElapsed / 60) })),
    }
  }

  // Distraction pattern: does she drift early or sustain then fade?
  const ratios = sessions
    .filter((s) => s.firstDriftElapsed != null && s.durationSec > 0)
    .map((s) => s.firstDriftElapsed / s.durationSec)
  let distraction = null
  if (ratios.length >= 2) {
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length
    distraction = avgRatio < 0.34
      ? 'Your focus tends to dip early in a session. A brief warm-up or clearer first step may help you settle in.'
      : 'You usually settle in well and fade later in a session. That later dip is a natural spot for a break.'
  }

  // One experiment to try, drawn from the strongest signal available.
  const experiment = stamina
    ? `Try a short break around ${stamina.medianFirstDriftMin} minutes in — that is when your focus typically first dips.`
    : bestHour
      ? `Your longest focus stretches happen around ${fmtHour(bestHour.hour)}. Try scheduling your hardest work then this week.`
      : 'Run a few more sessions and your patterns will start to show here.'

  return { sessionCount: sessions.length, bestHour, stamina, distraction, experiment }
}
