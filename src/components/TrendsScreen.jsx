import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Area, ComposedChart, ResponsiveContainer,
} from 'recharts'
import { ArrowLeft } from 'lucide-react'
import { getProfileHistory } from '../utils/profileHistory'
import './TrendsScreen.css'

const HEATMAP_DAYS = 35
const DAY_MS = 24 * 60 * 60 * 1000

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

function scoreColor(score) {
  // Empty days stay very faint so filled days read as the signal, not noise
  if (score == null) return 'rgba(255, 255, 255, 0.025)'
  const alpha = 0.16 + 0.84 * (score / 100)
  return `rgba(123, 122, 240, ${alpha.toFixed(3)})`
}

export default function TrendsScreen({ onBack }) {
  const { calibrations, sessions } = useMemo(() => getProfileHistory(), [])

  const hasData = sessions.length > 0 || calibrations.length > 0

  // Bucket sessions by day for the calendar heatmap
  const dailyAvg = useMemo(() => {
    const acc = {}
    for (const s of sessions) {
      const k = s.date || dayKey(s.createdAt)
      if (!acc[k]) acc[k] = { sum: 0, n: 0, conf: 0 }
      acc[k].sum += s.avgScore
      acc[k].conf += s.avgConfidence ?? 0
      acc[k].n += 1
    }
    const out = {}
    for (const [k, v] of Object.entries(acc)) {
      out[k] = { avg: Math.round(v.sum / v.n), conf: v.conf / v.n, count: v.n }
    }
    return out
  }, [sessions])

  // Bucket sessions by hour-of-day (local time) to surface when focus tends
  // to run higher/lower across the day — the one longitudinal view the
  // dataviz research recommends that wasn't built yet.
  const hourlyAvg = useMemo(() => {
    const acc = {}
    for (const s of sessions) {
      const hour = new Date(s.createdAt).getHours()
      if (!acc[hour]) acc[hour] = { sum: 0, n: 0 }
      acc[hour].sum += s.avgScore
      acc[hour].n += 1
    }
    const out = {}
    for (const [hour, v] of Object.entries(acc)) {
      out[hour] = { avg: Math.round(v.sum / v.n), count: v.n }
    }
    return out
  }, [sessions])

  const hourlyCells = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => ({
        hour,
        bucket: hourlyAvg[hour] || null,
      })),
    [hourlyAvg],
  )

  const heatmapCells = useMemo(() => {
    const cells = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = today.getTime() - (HEATMAP_DAYS - 1) * DAY_MS
    for (let i = 0; i < HEATMAP_DAYS; i++) {
      const ts = start + i * DAY_MS
      const k = dayKey(ts)
      cells.push({ key: k, ts, day: dailyAvg[k] || null })
    }
    return cells
  }, [dailyAvg])

  const sessionTrend = useMemo(
    () =>
      sessions.map((s, i) => ({
        idx: i + 1,
        avgScore: s.avgScore,
        label: new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      })),
    [sessions],
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

  const overall = useMemo(() => {
    if (!sessions.length) return null
    const avg = Math.round(sessions.reduce((a, s) => a + s.avgScore, 0) / sessions.length)
    const conf = Math.round(
      (sessions.reduce((a, s) => a + (s.avgConfidence ?? 0), 0) / sessions.length) * 100,
    )
    return { avg, conf }
  }, [sessions])

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
              <span className="trends-stat-value">{sessions.length}</span>
              <span className="trends-stat-label">Sessions</span>
            </div>
            <div className="trends-stat">
              <span className="trends-stat-value">{overall?.avg ?? '-'}</span>
              <span className="trends-stat-label">Avg load</span>
            </div>
            <div className="trends-stat">
              <span className="trends-stat-value">{overall ? `${overall.conf}%` : '-'}</span>
              <span className="trends-stat-label">Avg confidence</span>
            </div>
            <div className="trends-stat">
              <span className="trends-stat-value">{calibrations.length}</span>
              <span className="trends-stat-label">Calibrations</span>
            </div>
          </div>

          <section className="trends-card">
            <h3 className="trends-card-title">Daily activity</h3>
            <p className="trends-card-hint">Each cell is a day, shaded by your average load.</p>
            <div className="trends-heatmap">
              {heatmapCells.map((cell) => (
                <div
                  key={cell.key}
                  className="trends-heatmap-cell"
                  style={{ background: scoreColor(cell.day?.avg ?? null) }}
                  title={
                    cell.day
                      ? `${cell.key}: avg ${cell.day.avg}, ${cell.day.count} session${cell.day.count > 1 ? 's' : ''}`
                      : `${cell.key}: no sessions`
                  }
                />
              ))}
            </div>
            <div className="trends-heatmap-legend">
              <span>Lower</span>
              <span className="trends-legend-swatch" style={{ background: scoreColor(20) }} />
              <span className="trends-legend-swatch" style={{ background: scoreColor(50) }} />
              <span className="trends-legend-swatch" style={{ background: scoreColor(80) }} />
              <span className="trends-legend-swatch" style={{ background: scoreColor(100) }} />
              <span>Higher</span>
            </div>
          </section>

          {sessions.length > 1 && (
            <section className="trends-card">
              <h3 className="trends-card-title">Focus by time of day</h3>
              <p className="trends-card-hint">
                Each cell is an hour, shaded by your average load in sessions started then.
              </p>
              <div className="trends-hour-strip">
                {hourlyCells.map((cell) => (
                  <div
                    key={cell.hour}
                    className="trends-hour-cell"
                    style={{ background: scoreColor(cell.bucket?.avg ?? null) }}
                    title={
                      cell.bucket
                        ? `${cell.hour}:00: avg ${cell.bucket.avg}, ${cell.bucket.count} session${cell.bucket.count > 1 ? 's' : ''}`
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

          {sessionTrend.length > 1 && (
            <section className="trends-card">
              <h3 className="trends-card-title">Average load per session</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={sessionTrend} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} stroke="var(--color-text-muted)" tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border-strong)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: 'var(--color-text-primary)',
                    }}
                    formatter={(v) => [v, 'Avg load']}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgScore"
                    stroke="#7b7af0"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#7b7af0' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
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
