import { useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import useSignalsStore from '../store/signals'
import './SessionControls.css'

export default function SessionControls({ onHistory, onSettings }) {
  const sessionState = useSignalsStore((s) => s.sessionState)
  const sessionElapsed = useSignalsStore((s) => s.sessionElapsed)
  const sessionStartTime = useSignalsStore((s) => s.sessionStartTime)
  const sessionEndTime = useSignalsStore((s) => s.sessionEndTime)
  const sessionDataPoints = useSignalsStore((s) => s.sessionDataPoints)
  const startSession = useSignalsStore((s) => s.startSession)
  const pauseSession = useSignalsStore((s) => s.pauseSession)
  const resumeSession = useSignalsStore((s) => s.resumeSession)
  const stopSession = useSignalsStore((s) => s.stopSession)
  const discardSession = useSignalsStore((s) => s.discardSession)
  const tickSession = useSignalsStore((s) => s.tickSession)
  const recordDataPoint = useSignalsStore((s) => s.recordDataPoint)

  useEffect(() => {
    if (sessionState !== 'running') return
    const id = setInterval(tickSession, 1000)
    return () => clearInterval(id)
  }, [sessionState, tickSession])

  useEffect(() => {
    if (sessionState !== 'running') return
    const id = setInterval(recordDataPoint, 5000)
    return () => clearInterval(id)
  }, [sessionState, recordDataPoint])

  const handleSave = useCallback(async () => {
    if (!sessionStartTime || !sessionEndTime || sessionDataPoints.length === 0) {
      discardSession()
      return
    }

    const scores = sessionDataPoints.map((p) => p.cognitiveScore)
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    let peakScore = -Infinity
    let peakTimestamp = 0
    let lowestScore = Infinity
    let lowestTimestamp = 0
    for (const p of sessionDataPoints) {
      if (p.cognitiveScore > peakScore) {
        peakScore = p.cognitiveScore
        peakTimestamp = p.timestamp
      }
      if (p.cognitiveScore < lowestScore) {
        lowestScore = p.cognitiveScore
        lowestTimestamp = p.timestamp
      }
    }

    const flowPoints = sessionDataPoints.filter((p) => p.focusState === 'flow')
    const distractedPoints = sessionDataPoints.filter((p) => p.focusState === 'distracted')

    const sessionData = {
      name: `Session ${new Date(sessionStartTime).toLocaleDateString()}`,
      startTime: sessionStartTime,
      endTime: sessionEndTime,
      duration: Math.floor((sessionEndTime - sessionStartTime) / 1000),
      dataPoints: sessionDataPoints,
      summary: {
        avgScore,
        peakScore,
        peakTimestamp,
        lowestScore,
        lowestTimestamp,
        totalFlowSeconds: flowPoints.length * 5,
        totalDistractedSeconds: distractedPoints.length * 5,
      },
    }

    try {
      await invoke('save_session', { sessionJson: JSON.stringify(sessionData) })
      discardSession()
    } catch (err) {
      console.error('Failed to save session:', err)
    }
  }, [sessionStartTime, sessionEndTime, sessionDataPoints, discardSession])

  const handleDiscard = useCallback(() => {
    discardSession()
  }, [discardSession])

  const showSave = sessionState === 'idle' && sessionDataPoints.length > 0

  const mins = Math.floor(sessionElapsed / 60)
  const secs = sessionElapsed % 60
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  if (showSave) {
    return (
      <div className="session-controls">
        <div className="session-save-card">
          <p className="session-save-label">Session complete</p>
          <p className="session-save-stats">
            {sessionDataPoints.length} data points &middot; {timeStr} duration
          </p>
          <div className="session-save-actions">
            <button className="session-btn session-btn-primary" onClick={handleSave}>
              Save
            </button>
            <button className="session-btn session-btn-secondary" onClick={handleDiscard}>
              Discard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="session-controls">
      <div className="session-timer">{timeStr}</div>
      <div className="session-buttons">
        {sessionState === 'idle' && (
          <>
            <button className="session-btn session-btn-primary" onClick={startSession}>
              Start session
            </button>
            <button className="session-btn session-btn-ghost" onClick={onHistory}>
              History
            </button>
            <button className="session-btn session-btn-ghost" onClick={onSettings}>
              Settings
            </button>
          </>
        )}
        {sessionState === 'running' && (
          <>
            <button className="session-btn session-btn-secondary" onClick={pauseSession}>
              Pause
            </button>
            <button className="session-btn session-btn-danger" onClick={stopSession}>
              Stop
            </button>
          </>
        )}
        {sessionState === 'paused' && (
          <>
            <button className="session-btn session-btn-primary" onClick={resumeSession}>
              Resume
            </button>
            <button className="session-btn session-btn-danger" onClick={stopSession}>
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  )
}
