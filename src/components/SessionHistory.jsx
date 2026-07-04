import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './SessionHistory.css'

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s}s`
}

function formatMinutes(sec) {
  if (sec == null) return '--'
  const m = Math.floor(sec / 60)
  return `${m}m`
}

export default function SessionHistory({ onBack, onSelect }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const paths = await invoke('list_sessions')
        const loaded = await Promise.all(
          paths.map(async (path) => {
            const json = await invoke('load_session', { path })
            return { ...JSON.parse(json), path }
          }),
        )
        setSessions(loaded)
      } catch (err) {
        console.error('Failed to load sessions:', err)
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="session-history">
      <div className="history-header">
        <button className="history-back" onClick={onBack}>
          &larr; Back
        </button>
        <h2 className="history-title">Session History</h2>
      </div>

      {loading && (
        <div className="history-loading">Loading sessions...</div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="history-empty">
          No sessions yet.
        </div>
      )}

      <div className="history-list">
        {sessions.map((session) => (
          <button
            className="history-row"
            key={session.path}
            onClick={() => onSelect(session)}
          >
            <div className="history-row-left">
              <span className="history-row-name">{session.name || 'Unnamed'}</span>
              <span className="history-row-meta">
                {formatDate(session.startTime)} &middot; {formatDuration(session.duration)}
              </span>
            </div>
            <div className="history-row-right">
              <span className="history-row-score">
                {formatMinutes(session.summary?.longestFocusedStretchSec)}
              </span>
              <span className="history-row-label">longest focus</span>
              <span className="history-row-peak">
                {session.summary?.focusedSeconds != null
                  ? formatMinutes(session.summary.focusedSeconds)
                  : '--'}
              </span>
              <span className="history-row-label">focused</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
