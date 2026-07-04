import { useEffect } from 'react'
import useSignalsStore from '../store/signals'
import './SessionControls.css'

export default function SessionControls({ onHistory, onSettings, onTrends }) {
  const sessionState = useSignalsStore((s) => s.sessionState)
  const sessionElapsed = useSignalsStore((s) => s.sessionElapsed)
  const sessionIntention = useSignalsStore((s) => s.sessionIntention)
  const startSession = useSignalsStore((s) => s.startSession)
  const setSessionIntention = useSignalsStore((s) => s.setSessionIntention)
  const pauseSession = useSignalsStore((s) => s.pauseSession)
  const resumeSession = useSignalsStore((s) => s.resumeSession)
  const stopSession = useSignalsStore((s) => s.stopSession)
  const tickSession = useSignalsStore((s) => s.tickSession)
  const recordDataPoint = useSignalsStore((s) => s.recordDataPoint)
  const cameraOff = useSignalsStore((s) => s.cameraOff)
  const toggleCameraOff = useSignalsStore((s) => s.toggleCameraOff)

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

  const mins = Math.floor(sessionElapsed / 60)
  const secs = sessionElapsed % 60
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  return (
    <div className="session-controls">
      <div className="session-timer">{timeStr}</div>
      <div className="session-buttons">
        {sessionState === 'idle' && (
          <>
            <p className="session-companion-sub">Start a session and I'll keep you company - quietly, and only speak up if your focus drifts.</p>
            <input
              className="session-intention"
              type="text"
              value={sessionIntention}
              onChange={(e) => setSessionIntention(e.target.value)}
              placeholder="What are you working on? (optional)"
              maxLength={80}
            />
            <button className="session-btn session-btn-primary" onClick={startSession}>
              Start session
            </button>
            <button className="session-btn session-btn-ghost" onClick={onTrends}>
              Insights
            </button>
            <button className="session-btn session-btn-ghost" onClick={onHistory}>
              History
            </button>
            <button className="session-btn session-btn-ghost" onClick={onSettings}>
              Settings
            </button>
            <button className="session-btn session-btn-ghost" onClick={toggleCameraOff}>
              {cameraOff ? 'Turn camera on' : 'Turn camera off'}
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
            <button className="session-btn session-btn-ghost" onClick={toggleCameraOff}>
              {cameraOff ? 'Turn camera on' : 'Turn camera off'}
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
            <button className="session-btn session-btn-ghost" onClick={toggleCameraOff}>
              {cameraOff ? 'Turn camera on' : 'Turn camera off'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
