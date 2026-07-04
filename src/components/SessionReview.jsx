import { useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Check, X } from 'lucide-react'
import useSignalsStore from '../store/signals'
import { buildSessionData, findBiggestChangeSegment } from '../lib/sessionData'
import { buildSessionStory } from '../lib/sessionStory'
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
  const sessionIntention = useSignalsStore((s) => s.sessionIntention)
  const discardSession = useSignalsStore((s) => s.discardSession)

  const [answer, setAnswer] = useState(null) // 'yes' | 'no' | null
  const [retro, setRetro] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const story = useMemo(
    () => buildSessionStory(dataPoints, startTime),
    [dataPoints, startTime],
  )

  const segment = useMemo(
    () => findBiggestChangeSegment(dataPoints, startTime),
    [dataPoints, startTime],
  )

  const duration = useMemo(
    () => Math.floor((endTime - startTime) / 1000),
    [startTime, endTime],
  )

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

    const sessionData = buildSessionData({
      startTime,
      endTime,
      dataPoints,
      groundTruth,
      notes: { intention: sessionIntention, retro },
    })

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
          {fmtDuration(duration)} &middot; {dataPoints.length} readings
        </span>
      </div>

      {sessionIntention?.trim() && (
        <p className="review-intention">Working on: {sessionIntention}</p>
      )}

      <div className="review-stats">
        <div className="review-stat">
          <span className="review-stat-value review-stat-longest">
            {fmtDuration(story.longestFocusedStretchSec)}
          </span>
          <span className="review-stat-label">Longest focus</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-value review-stat-focused">
            {fmtDuration(story.focusedSec)}
          </span>
          <span className="review-stat-label">Focused</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-value review-stat-drifts">{story.driftCount}</span>
          <span className="review-stat-label">Drifts</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-value review-stat-drowsy">{story.drowsyCount}</span>
          <span className="review-stat-label">Drowsy</span>
        </div>
      </div>

      <div className="review-timeline" aria-label="Session timeline">
        {story.segments.map((seg, i) => {
          const total = story.segments[story.segments.length - 1]?.endElapsed || 1
          const width = ((seg.endElapsed - seg.startElapsed) / total) * 100
          return (
            <div
              key={i}
              className={`review-seg review-seg-${seg.state}`}
              style={{ width: `${width}%` }}
              title={`${seg.state} · ${Math.round(seg.durationSec)}s`}
            />
          )
        })}
      </div>
      <div className="review-legend">
        <span><i className="dot dot-focused" /> Focused</span>
        <span><i className="dot dot-drifting" /> Drifting</span>
        <span><i className="dot dot-drowsy" /> Drowsy</span>
        <span><i className="dot dot-away" /> Away</span>
      </div>

      {story.takeaway && (
        <div className="review-takeaway">
          <span className="review-takeaway-label">Try this next</span>
          <p className="review-takeaway-text">{story.takeaway}</p>
        </div>
      )}

      <div className="review-retro">
        <label className="review-retro-label" htmlFor="review-retro-input">
          How did it go? (optional)
        </label>
        <textarea
          id="review-retro-input"
          className="review-retro-input"
          value={retro}
          onChange={(e) => setRetro(e.target.value)}
          placeholder="Anything worth remembering for next time..."
          rows={3}
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
