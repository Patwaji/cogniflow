import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceArea, ResponsiveContainer,
} from 'recharts'
import './ScoreChart.css'

// State-band colors, aligned to the app's semantic tokens.
const BAND_DISTRACTED = '#e05548'
const BAND_FOCUSED = '#32b45c'
const BAND_FLOW = '#7b7af0'
const LINE_COLOR = '#7b7af0'
const HIGHLIGHT = '#8583f2'

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const ss = Math.round(s % 60)
  return `${m}:${String(ss).padStart(2, '0')}`
}

// data: [{ elapsed (sec), cognitiveScore, rawScore?, confidence? }]
// thresholds: { distracted, focused, flow }
// highlight: { startElapsed, endElapsed } | null  (retrospective segment)
// scoreKey: which field on `data` to plot as the line (default 'cognitiveScore')
// showConfidenceLane: render a thin confidence strip below the main chart
export default function ScoreChart({
  data,
  thresholds,
  highlight = null,
  height = 260,
  gradientId = 'score-grad',
  showBaselineLabels = true,
  scoreKey = 'cognitiveScore',
  showConfidenceLane = false,
}) {
  const t = thresholds || { distracted: 20, focused: 55, flow: 80 }
  const n = data.length

  // Map per-point confidence to line opacity via gradient stops, so shaky
  // stretches (glasses, low light) visibly fade rather than imply false
  // precision. Falls back to a solid line for sessions without confidence.
  const hasConfidence = data.some((d) => (d.confidence ?? 0) > 0)
  const stops = hasConfidence && n > 1
    ? data.map((d, i) => ({
        offset: (i / (n - 1)) * 100,
        opacity: 0.3 + 0.7 * Math.max(0, Math.min(1, d.confidence ?? 0)),
      }))
    : null

  const showLane = showConfidenceLane && hasConfidence

  return (
    <div className="score-chart">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          {stops && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                {stops.map((s, i) => (
                  <stop key={i} offset={`${s.offset}%`} stopColor={LINE_COLOR} stopOpacity={s.opacity} />
                ))}
              </linearGradient>
            </defs>
          )}

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="elapsed"
            type="number"
            domain={['dataMin', 'dataMax']}
            stroke="var(--color-text-muted)"
            tick={{ fontSize: 11 }}
            tickFormatter={fmtTime}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            stroke="var(--color-text-muted)"
            tick={{ fontSize: 11 }}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: '10px',
              fontSize: '12px',
              color: 'var(--color-text-primary)',
            }}
            labelFormatter={(v) => fmtTime(v)}
            formatter={(value, name) => [
              name === scoreKey ? Math.round(value) : `${Math.round(value * 100)}%`,
              name === scoreKey ? 'Load' : 'Confidence',
            ]}
          />

          <ReferenceArea y1={0} y2={t.distracted} fill={BAND_DISTRACTED} fillOpacity={0.08} strokeOpacity={0} />
          <ReferenceArea y1={t.focused} y2={t.flow} fill={BAND_FOCUSED} fillOpacity={0.06} strokeOpacity={0} />
          <ReferenceArea y1={t.flow} y2={100} fill={BAND_FLOW} fillOpacity={0.08} strokeOpacity={0} />

          {highlight && (
            <ReferenceArea
              x1={highlight.startElapsed}
              x2={highlight.endElapsed}
              fill={HIGHLIGHT}
              fillOpacity={0.14}
              stroke={HIGHLIGHT}
              strokeOpacity={0.5}
              strokeDasharray="4 3"
            />
          )}

          <Line
            type="monotone"
            dataKey={scoreKey}
            stroke={stops ? `url(#${gradientId})` : LINE_COLOR}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: LINE_COLOR }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {showLane && (
        <div className="score-chart-lane">
          {/* A simple flex row (rather than a second recharts BarChart) keeps
              this strip trivially aligned 1:1 with `data`, one cell per point,
              sharing the same left-to-right ordering as the line above. */}
          <div className="score-chart-lane-strip">
            {data.map((d, i) => (
              <div
                key={i}
                className="score-chart-lane-cell"
                style={{
                  width: `${100 / n}%`,
                  opacity: Math.max(0, Math.min(1, d.confidence ?? 0)),
                }}
              />
            ))}
          </div>
          <span className="score-chart-lane-label">confidence</span>
        </div>
      )}

      {showBaselineLabels && (
        <div className="score-chart-scale">
          <span><span className="score-chart-anchor">100</span> = your task-effort ceiling</span>
          <span><span className="score-chart-anchor">0</span> = your resting baseline</span>
        </div>
      )}
    </div>
  )
}
