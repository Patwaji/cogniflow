import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Area, ComposedChart, ResponsiveContainer,
} from 'recharts'
import { ArrowLeft } from 'lucide-react'
import { getProfileHistory } from '../utils/profileHistory'
import { buildWeeklyInsights } from '../lib/weeklyInsights'
import './TrendsScreen.css'

const HEATMAP_DAYS = 35
const DAY_MS = 24 * 60 * 60 * 1000
const FULL_INTENSITY_MIN = 120 // minutes of focused time considered "full" heat

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

function fmtHour12(h) {
  const am = h < 12
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${am ? 'AM' : 'PM'}`
}

function focusColor(minutes) {
  // Empty days/hours stay very faint so filled cells read as the signal, not noise
  if (minutes == null) return 'rgba(255, 255, 255, 0.025)'
  const alpha = 0.16 + 0.84 * Math.min(minutes / FULL_INTENSITY_MIN, 1)
  return `rgba(123, 122, 240, ${alpha.toFixed(3)})`
}

export default function TrendsScreen({ onBack }) {
  const { calibrations, sessions } = useMemo(() => getProfileHistory(), [])
  const [now] = useState(() => Date.now())
  const insights = useMemo(() => buildWeeklyInsights(sessions, now), [sessions, now])

  const hasData = sessions.length > 0 || calibrations.length > 0

  const bestStretchMin = useMemo(() => {
    if (!sessions.length) return null
    const maxSec = Math.max(...sessions.map((s) => s.longestFocusedStretchSec ?? 0))
    return Math.round(maxSec / 60)
  }, [sessions])

  // Bucket sessions by day for the calendar heatmap, shaded by focused minutes
  const dailyFocus = useMemo(() => {
    const acc = {}
    for (const s of sessions) {
      const k = s.date || dayKey(s.createdAt)
      if (!acc[k]) acc[k] = { sec: 0, n: 0 }
      acc[k].sec += s.focusedSeconds ?? 0
      acc[k].n += 1
    }
    const out = {}
    for (const [k, v] of Object.entries(acc)) {
      out[k] = { min: Math.round(v.sec / 60), count: v.n }
    }
    return out
  }, [sessions])

  // Bucket sessions by hour-of-day (local time), shaded by average longest
  // focused stretch — surfaces the chronotype signal behind "best time of day".
  const hourlyStretch = useMemo(() => {
    const acc = {}
    for (const s of sessions) {
      const hour = new Date(s.createdAt).getHours()
      if (!acc[hour]) acc[hour] = { sum: 0, n: 0 }
      acc[hour].sum += s.longestFocusedStretchSec ?? 0
      acc[hour].n += 1
    }
    const out = {}
    for (const [hour, v] of Object.entries(acc)) {
      out[hour] = { min: Math.round(v.sum / v.n / 60), count: v.n }
    }
    return out
  }, [sessions])

  const hourlyCells = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => ({
        hour,
        bucket: hourlyStretch[hour] || null,
      })),
    [hourlyStretch],
  )

  const heatmapCells = useMemo(() => {
    const cells = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = today.getTime() - (HEATMAP_DAYS - 1) * DAY_MS
    for (let i = 0; i < HEATMAP_DAYS; i++) {
      const ts = start + i * DAY_MS
      const k = dayKey(ts)
      cells.push({ key: k, ts, day: dailyFocus[k] || null })
    }
    return cells
  }, [dailyFocus])

  const staminaTrend = useMemo(
    () =>
      (insights.stamina?.trend ?? []).map((p, i) => ({
        idx: i + 1,
        firstDriftMin: p.firstDriftMin,
        label: new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      })),
    [insights.stamina],
  )

  const driftData = useMemo(
    () =>
      calibrations.map((c) => ({
        label: new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        floor: Number((c.floorW ?? 0).toFixed(3)),
        ceiling: Number((c.ceilingW ?? 0).toFixed(3)),
        range: [Number((c.floorW ?? 0).toFixed(3)), Number((c.ceilingW ?? 0).toFixed(3))],
        quality: Math.round((c.quality ?? 0) * 100),
      })),
    [calibrations],
  )

  return (
    <div className="trends-screen">
      <div className="trends-header">
        <button className="trends-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <h2 className="trends-title">Insights</h2>
        <span className="trends-sub">Last 30 days, on this device only</span>
      </div>

      {!hasData && (
        <div className="trends-empty">
          No history yet. Run and save a few sessions and your trends will show up here.
        </div>
      )}

      {hasData && (
        <div className="trends-body">
          <div className="trends-stat-row">
            <div className="trends-stat">
              <span className="trends-stat-value">{insights.sessionCount}</span>
              <span className="trends-stat-label">Sessions</span>
            </div>
            <div className="trends-stat">
              <span className="trends-stat-value">{bestStretchMin != null ? `${bestStretchMin}m` : '—'}</span>
              <span className="trends-stat-label">Best focus stretch</span>
            </div>
            <div className="trends-stat">
              <span className="trends-stat-value">
                {insights.stamina ? `${insights.stamina.medianFirstDriftMin}m` : '—'}
              </span>
              <span className="trends-stat-label">Typical stamina</span>
            </div>
            <div className="trends-stat">
              <span className="trends-stat-value">{calibrations.length}</span>
              <span className="trends-stat-label">Calibrations</span>
            </div>
          </div>

          {insights.experiment && (
            <section className="trends-experiment">
              <span className="trends-experiment-label">This week&apos;s experiment</span>
              <p className="trends-experiment-text">{insights.experiment}</p>
            </section>
          )}

          <section className="trends-card">
            <h3 className="trends-card-title">Daily activity</h3>
            <p className="trends-card-hint">Each cell is a day, shaded by minutes spent focused.</p>
            <div className="trends-heatmap">
              {heatmapCells.map((cell) => (
                <div
                  key={cell.key}
                  className="trends-heatmap-cell"
                  style={{ background: focusColor(cell.day?.min ?? null) }}
                  title={
                    cell.day
                      ? `${cell.key}: ${cell.day.min}m focused, ${cell.day.count} session${cell.day.count > 1 ? 's' : ''}`
                      : `${cell.key}: no sessions`
                  }
                />
              ))}
            </div>
            <div className="trends-heatmap-legend">
              <span>Less</span>
              <span className="trends-legend-swatch" style={{ background: focusColor(20) }} />
              <span className="trends-legend-swatch" style={{ background: focusColor(50) }} />
              <span className="trends-legend-swatch" style={{ background: focusColor(80) }} />
              <span className="trends-legend-swatch" style={{ background: focusColor(120) }} />
              <span>More</span>
            </div>
          </section>

          {sessions.length > 1 && insights.bestHour && (
            <section className="trends-card">
              <h3 className="trends-card-title">Best time of day</h3>
              <p className="trends-card-hint">
                Best around <strong>{fmtHour12(insights.bestHour.hour)}</strong> — your longest focus stretches
                happen here.
              </p>
              <div className="trends-hour-strip">
                {hourlyCells.map((cell) => (
                  <div
                    key={cell.hour}
                    className="trends-hour-cell"
                    style={{ background: focusColor(cell.bucket?.min ?? null) }}
                    title={
                      cell.bucket
                        ? `${cell.hour}:00: ${cell.bucket.min}m longest stretch (avg), ${cell.bucket.count} session${cell.bucket.count > 1 ? 's' : ''}`
                        : `${cell.hour}:00: no sessions`
                    }
                  />
                ))}
              </div>
              <div className="trends-hour-labels">
                <span>0</span>
                <span>6</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
              </div>
            </section>
          )}

          {insights.stamina && (
            <section className="trends-card">
              <h3 className="trends-card-title">Focus stamina</h3>
              <p className="trends-card-hint">
                You typically focus ~{insights.stamina.medianFirstDriftMin}m before your first dip.
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={staminaTrend} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                  <YAxis stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border-strong)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: 'var(--color-text-primary)',
                    }}
                    formatter={(v) => [`${v}m`, 'Time to first dip']}
                  />
                  <Line
                    type="monotone"
                    dataKey="firstDriftMin"
                    stroke="#7b7af0"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#7b7af0' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              {insights.distraction && <p className="trends-card-note">{insights.distraction}</p>}
            </section>
          )}

          {driftData.length > 1 && (
            <section className="trends-card">
              <h3 className="trends-card-title">Calibration drift</h3>
              <p className="trends-card-hint">
                Your resting and task-effort load anchors over time. A steady gap means consistent calibration.
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={driftData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 1]} stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border-strong)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="range"
                    stroke="none"
                    fill="#7b7af0"
                    fillOpacity={0.12}
                    isAnimationActive={false}
                  />
                  <Line type="monotone" dataKey="ceiling" stroke="#7b7af0" strokeWidth={2} dot={false} isAnimationActive={false} name="Task ceiling" />
                  <Line type="monotone" dataKey="floor" stroke="#6aaed9" strokeWidth={2} dot={false} isAnimationActive={false} name="Rest floor" />
                </ComposedChart>
              </ResponsiveContainer>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
