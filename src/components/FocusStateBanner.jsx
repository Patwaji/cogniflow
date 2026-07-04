import { useMemo } from 'react'
import useSignalsStore from '../store/signals'
import './FocusStateBanner.css'

const STATE_CONFIG = {
  focused: { color: 'var(--color-success)', bg: 'rgba(52, 199, 89, 0.10)', border: 'rgba(52, 199, 89, 0.2)' },
  drifting: { color: 'var(--color-warning)', bg: 'rgba(232, 150, 60, 0.10)', border: 'rgba(232, 150, 60, 0.2)' },
  drowsy: { color: 'var(--color-danger)', bg: 'rgba(224, 85, 72, 0.14)', border: 'rgba(224, 85, 72, 0.3)' },
  away: { color: 'var(--color-text-secondary)', bg: 'transparent', border: 'transparent' },
  calibrating: { color: 'var(--color-warning)', bg: 'rgba(232, 150, 60, 0.10)', border: 'rgba(232, 150, 60, 0.2)' },
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export default function FocusStateBanner() {
  const focusState = useSignalsStore((s) => s.focusState)
  const focusStateEntryTime = useSignalsStore((s) => s.focusStateEntryTime)

  const secondsInState = useMemo(() => {
    if (!focusStateEntryTime) return 0
    return Math.floor((Date.now() - focusStateEntryTime) / 1000)
  }, [focusState, focusStateEntryTime])

  const config = STATE_CONFIG[focusState] || STATE_CONFIG.calibrating

  let message
  if (focusState === 'focused') {
    message = `Focused for ${formatDuration(secondsInState)}`
  } else if (focusState === 'drifting') {
    message = 'Your attention drifted'
  } else if (focusState === 'drowsy') {
    message = 'You seem to be fading. A short break might help.'
  } else if (focusState === 'away') {
    message = ''
  } else {
    message = 'Calibrating...'
  }

  if (!message) return <div className="focus-banner-spacer" />

  const pulse = focusState === 'drowsy'

  return (
    <div
      className="focus-banner"
      style={{
        background: config.bg,
        borderColor: config.border,
      }}
    >
      <span
        className={`focus-banner-dot${pulse ? ' pulse' : ''}`}
        style={{ background: config.color }}
      />
      <span className="focus-banner-message" style={{ color: config.color }}>
        {message}
      </span>
    </div>
  )
}
