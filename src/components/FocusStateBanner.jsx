import { useMemo } from 'react'
import useSignalsStore from '../store/signals'
import './FocusStateBanner.css'

const STATE_CONFIG = {
  flow: { color: 'var(--color-flow)', bg: 'rgba(94, 92, 230, 0.12)', border: 'rgba(94, 92, 230, 0.25)' },
  focused: { color: 'var(--color-success)', bg: 'rgba(52, 199, 89, 0.10)', border: 'rgba(52, 199, 89, 0.2)' },
  normal: { color: 'var(--color-text-secondary)', bg: 'transparent', border: 'transparent' },
  distracted: { color: 'var(--color-distracted)', bg: 'rgba(255, 69, 58, 0.10)', border: 'rgba(255, 69, 58, 0.2)' },
  calibrating: { color: 'var(--color-warning)', bg: 'rgba(255, 159, 10, 0.10)', border: 'rgba(255, 159, 10, 0.2)' },
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

  const config = STATE_CONFIG[focusState] || STATE_CONFIG.normal

  let message
  if (focusState === 'flow') {
    message = `You've been in flow for ${formatDuration(secondsInState)} 🔥`
  } else if (focusState === 'focused') {
    message = 'Focused'
  } else if (focusState === 'distracted') {
    message = 'You seem distracted'
  } else if (focusState === 'normal') {
    message = ''
  } else {
    message = 'Calibrating...'
  }

  if (!message) return <div className="focus-banner-spacer" />

  return (
    <div
      className="focus-banner"
      style={{
        background: config.bg,
        borderColor: config.border,
      }}
    >
      <span className="focus-banner-dot" style={{ background: config.color }} />
      <span className="focus-banner-message" style={{ color: config.color }}>
        {message}
      </span>
    </div>
  )
}
