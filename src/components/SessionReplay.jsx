import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { SIGNALS } from '../lib/signalMeta'
import useSettingsStore from '../store/settings'
import ScoreChart from './ScoreChart'
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
  const thresholds = useSettingsStore((s) => s.thresholds)

  const chartData = useMemo(() => {
    return session.dataPoints.map((p, i) => ({
      elapsed: i * 5,
      cognitiveScore: p.cognitiveScore,
      confidence: p.confidence ?? 0,
      blinkRate: Math.round((p.blinkRate ?? 0) * 100),
      pupilDelta: Math.round((p.pupilDelta ?? 0) * 100),
      browFurrow: Math.round((p.browFurrow ?? 0) * 100),
      gazeStability: Math.round((p.gazeStability ?? 0) * 100),
      headMovement: Math.round((p.headMovement ?? 0) * 100),
    }))
  }, [session])

  const summary = session.summary || {}
  const duration = session.duration || 0

  const gt = session.groundTruth
  const highlight = gt
    ? { startElapsed: gt.segmentStartElapsed, endElapsed: gt.segmentEndElapsed }
    : null

  const SIGNAL_CHARTS = SIGNALS

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
            {summary.focusedSeconds ? formatDuration(summary.focusedSeconds) : '--'}
          </span>
          <span className="summary-label">Focused</span>
        </div>
        <div className="summary-card">
          <span className="summary-value summary-distracted">
            {summary.driftingSeconds ? formatDuration(summary.driftingSeconds) : '--'}
          </span>
          <span className="summary-label">Drifting</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{formatDuration(duration)}</span>
          <span className="summary-label">Duration</span>
        </div>
      </div>

      <div className="replay-chart-section">
        <h3 className="replay-section-title">Cognitive Load</h3>
        <ScoreChart
          data={chartData}
          thresholds={thresholds}
          highlight={highlight}
          height={260}
          gradientId="replay-grad"
        />
        {gt && (
          <p className="replay-groundtruth">
            You confirmed this {gt.direction === 'drop' ? 'dip' : 'rise'}:{' '}
            <strong>{gt.answer === 'yes' ? 'yes, remembered' : gt.answer === 'no' ? 'not remembered' : 'skipped'}</strong>
          </p>
        )}
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
