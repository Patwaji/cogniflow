import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts'
import './SessionReplay.css'

function formatDuration(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s}s`
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SessionReplay({ session, onBack }) {
  const chartData = useMemo(() => {
    return session.dataPoints.map((p, i) => ({
      elapsed: i * 5,
      cognitiveScore: p.cognitiveScore,
      blinkRate: Math.round((p.blinkRate ?? 0) * 100),
      pupilDelta: Math.round((p.pupilDelta ?? 0) * 100),
      browFurrow: Math.round((p.browFurrow ?? 0) * 100),
      gazeStability: Math.round((p.gazeStability ?? 0) * 100),
      headMovement: Math.round((p.headMovement ?? 0) * 100),
    }))
  }, [session])

  const summary = session.summary || {}
  const duration = session.duration || 0

  const SIGNAL_CHARTS = [
    { key: 'blinkRate', label: 'Blink rate', color: '#5e5ce6' },
    { key: 'pupilDelta', label: 'Pupil dilation', color: '#34c759' },
    { key: 'browFurrow', label: 'Brow tension', color: '#ff9f0a' },
    { key: 'gazeStability', label: 'Gaze stability', color: '#5ac8fa' },
    { key: 'headMovement', label: 'Head stillness', color: '#ff453a' },
  ]

  return (
    <div className="session-replay">
      <div className="replay-header">
        <button className="replay-back" onClick={onBack}>
          &larr; Back
        </button>
        <div className="replay-header-info">
          <h2 className="replay-title">{session.name || 'Unnamed Session'}</h2>
          <span className="replay-date">{formatDate(session.startTime)}</span>
        </div>
      </div>

      <div className="replay-summary">
        <div className="summary-card">
          <span className="summary-value">{summary.avgScore ?? '--'}</span>
          <span className="summary-label">Avg score</span>
        </div>
        <div className="summary-card">
          <span className="summary-value summary-peak">{summary.peakScore ?? '--'}</span>
          <span className="summary-label">Peak</span>
        </div>
        <div className="summary-card">
          <span className="summary-value summary-low">{summary.lowestScore ?? '--'}</span>
          <span className="summary-label">Lowest</span>
        </div>
        <div className="summary-card">
          <span className="summary-value summary-flow">
            {summary.totalFlowSeconds ? formatDuration(summary.totalFlowSeconds) : '--'}
          </span>
          <span className="summary-label">In flow</span>
        </div>
        <div className="summary-card">
          <span className="summary-value summary-distracted">
            {summary.totalDistractedSeconds ? formatDuration(summary.totalDistractedSeconds) : '--'}
          </span>
          <span className="summary-label">Distracted</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{formatDuration(duration)}</span>
          <span className="summary-label">Duration</span>
        </div>
      </div>

      <div className="replay-chart-section">
        <h3 className="replay-section-title">Cognitive Score</h3>
        <div className="replay-chart-wrapper">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="elapsed"
                stroke="var(--color-text-muted)"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${Math.floor(v / 60)}m`}
              />
              <YAxis
                domain={[0, 100]}
                stroke="var(--color-text-muted)"
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                }}
                formatter={(value) => [value, 'Score']}
                labelFormatter={(label) => `${label}s`}
              />
              <ReferenceArea y1={0} y2={20} fill="#ff453a" fillOpacity={0.08} />
              <ReferenceArea y1={20} y2={55} fill="#ff9f0a" fillOpacity={0.06} />
              <ReferenceArea y1={55} y2={80} fill="#34c759" fillOpacity={0.06} />
              <ReferenceArea y1={80} y2={100} fill="#5e5ce6" fillOpacity={0.06} />
              {summary.peakScore != null && (
                <ReferenceLine
                  y={summary.peakScore}
                  stroke="#34c759"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: `Peak ${summary.peakScore}`,
                    fill: '#34c759',
                    fontSize: 11,
                    position: 'right',
                  }}
                />
              )}
              {summary.lowestScore != null && (
                <ReferenceLine
                  y={summary.lowestScore}
                  stroke="#ff453a"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: `Low ${summary.lowestScore}`,
                    fill: '#ff453a',
                    fontSize: 11,
                    position: 'right',
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="cognitiveScore"
                stroke="#5e5ce6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#5e5ce6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="replay-signals-section">
        <h3 className="replay-section-title">Signal Breakdown</h3>
        <div className="replay-signals-grid">
          {SIGNAL_CHARTS.map(({ key, label, color }) => (
            <div className="replay-signal-chart" key={key}>
              <span className="replay-signal-label">{label}</span>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="elapsed"
                    stroke="var(--color-text-muted)"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${Math.floor(v / 60)}m`}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="var(--color-text-muted)"
                    tick={{ fontSize: 10 }}
                    width={24}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: 'var(--color-text-primary)',
                    }}
                    formatter={(value) => [value, label]}
                    labelFormatter={(label) => `${label}s`}
                  />
                  <Line
                    type="monotone"
                    dataKey={key}
                    stroke={color}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
