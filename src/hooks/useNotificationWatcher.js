import { useEffect } from 'react'
import useSignalsStore from '../store/signals'
import { notify, canFire } from '../utils/notifications'
import { buildSessionStory } from '../lib/sessionStory'

// Fires the session-end OS notification only. All in-session focus nudges
// are owned by useNudgeWatcher. No score is ever surfaced here — the
// notification reports story terms (longest focused stretch), not the
// retired 0-100 cognitive score.
export default function useNotificationWatcher() {
  useEffect(() => {
    return useSignalsStore.subscribe(
      (s) => ({
        session: s.sessionState,
        dataPoints: s.sessionDataPoints.length,
      }),
      ({ session, dataPoints }, prev) => {
        if (
          (prev.session === 'running' || prev.session === 'paused') &&
          session === 'idle' &&
          dataPoints > 0 &&
          canFire('sessionEnd')
        ) {
          const state = useSignalsStore.getState()
          if (!state.sessionDataPoints.length || !state.sessionStartTime) return
          const story = buildSessionStory(state.sessionDataPoints, state.sessionStartTime)
          const minutes = Math.round(story.longestFocusedStretchSec / 60)
          notify('Session complete', `Longest focus: ${minutes}m`)
        }
      },
    )
  }, [])
}
