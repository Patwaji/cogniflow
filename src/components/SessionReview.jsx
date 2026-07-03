import { useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Check, X } from 'lucide-react'
import useSignalsStore from '../store/signals'
import useSettingsStore from '../store/settings'
import ScoreChart from './ScoreChart'
import { buildSessionData, findBiggestChangeSegment } from '../lib/sessionData'
import './SessionReview.css'

function fmtClock(elapsedSec) {
  const m = Math.floor(elapsedSec / 60)
  const s = Math.round(elapsedSec % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default function SessionReview({ onDone }) {
  const startTime = useSignalsStore((s) => s.sessionStartTime)
  const endTime = useSignalsStore((s) => s.sessionEndTime)
  const dataPoints = useSignalsStore((s) => s.sessionDataPoints)
  const discardSession = useSignalsStore((s) => s.discardSession)
  const thresholds = useSettingsStore((s) => s.thresholds)

  const [answer, setAnswer] = useState(null) // 'yes' | 'no' | null
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const chartData = useMemo(
    () =>
      dataPoints.map((p) => ({
        elapsed: Math.max(0, Math.round((p.timestamp - startTime) / 1000)),
        cognitiveScore: p.cognitiveScore,
        confidence: p.confidence ?? 0,
      })),
    [dataPoints, startTime],
  )

  const segment = useMemo(
    () => findBiggestChangeSegment(dataPoints, startTime),
    [dataPoints, startTime],
  )

  const stats = useMemo(() => {
    const scores = dataPoints.map((p) => p.cognitiveScore)
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    const peak = Math.max(...scores)
    const low = Math.min(...scores)
    const flowSec = dataPoints.filter((p) => p.focusState === 'flow').length * 5
    const duration = Math.floor((endTime - startTime) / 1000)
    return { avg, peak, low, flowSec, duration }
  }, [dataPoints, startTime, endTime])

  async function handleSave() {
    setSaving(true)
    const groundTruth = segment
      ? {
          segmentStartElapsed: segment.startElapsed,
          segmentEndElapsed: segment.endElapsed,
          direction: segment.direction,
          answer, // 'yes' | 'no' | null if skipped
          askedAt: endTime,
        }
      : null

    const sessionData = buildSessionData({ startTime, endTime, dataPoints, groundTruth })

    try {
      await invoke('save_session', { sessionJson: JSON.stringify(sessionData) })
      discardSession()
      onDone()
    } catch (err) {
      console.error('Failed to save session:', err)
      setSaveError(true)
      setSaving(false)
    }
  }

  function handleDiscard() {
    discardSession()
    onDone()
  }

  const promptText = segment
    ? segment.direction === 'drop'
      ? `Around ${fmtClock(segment.startElapsed)} your focus dropped sharply. Do you remember getting distracted or taking a break around then?`
      : `Around ${fmtClock(segment.startElapsed)} your focus rose sharply. Do you remember locking into something around then?`
    : null

  return (
    <div className="session-review">
      <div className="review-header">
        <h2 className="review-title">Session review</h2>
        <span className="review-subtitle">
          {fmtDuration(stats.duration)} &middot; {dataPoints.length} readings
        </span>
      </div>

      <div className="review-stats">
        <div className="review-stat">
          <span className="review-stat-value">{stats.avg}</span>
          <span className="review-stat-label">Avg load</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-value review-stat-peak">{stats.peak}</span>
          <span className="review-stat-label">Peak</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-value review-stat-low">{stats.low}</span>
          <span className="review-stat-label">Lowest</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-value review-stat-flow">
            {stats.flowSec ? fmtDuration(stats.flowSec) : '-'}
          </span>
          <span className="review-stat-label">In flow</span>
        </div>
      </div>

      <div className="review-chart">
        <ScoreChart
          data={chartData}
          thresholds={thresholds}
          highlight={segment}
          height={280}
          gradientId="review-grad"
        />
      </div>

      {promptText && (
        <div className="review-validation">
          <p className="review-validation-q">{promptText}</p>
          <div className="review-validation-actions">
            <button
              className={`review-chip${answer === 'yes' ? ' active' : ''}`}
              onClick={() => setAnswer('yes')}
            >
              <Check size={15} /> Yes, I remember
            </button>
            <button
              className={`review-chip${answer === 'no' ? ' active' : ''}`}
              onClick={() => setAnswer('no')}
            >
              <X size={15} /> No, I don&apos;t
            </button>
          </div>
          <p className="review-validation-note">
            Optional. Your answer stays on this device and helps validate the score.
          </p>
        </div>
      )}

      {saveError && (
        <p className="review-save-error">
          Could not save to disk (session storage needs the desktop app).
        </p>
      )}

      <div className="review-actions">
        <button className="session-btn session-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save session'}
        </button>
        <button className="session-btn session-btn-secondary" onClick={handleDiscard} disabled={saving}>
          Discard
        </button>
      </div>
    </div>
  )
}
