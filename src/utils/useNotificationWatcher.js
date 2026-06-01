import { useEffect, useRef } from 'react'
import useSignalsStore from '../store/signals'
import { notify, updateTrayScore, canFire } from './notifications'

const NOTIFY_FLOW_MS = 120000
const NOTIFY_DISTRACTED_MS = 120000
const CHECK_INTERVAL = 5000

export default function useNotificationWatcher() {
  const prevSessionState = useRef('idle')
  const prevFocusState = useRef('calibrating')
  const prevScore = useRef(0)

  useEffect(() => {
    return useSignalsStore.subscribe((state, prev) => {
      const fp = prev

      if (state.cognitiveScore !== fp.cognitiveScore) {
        updateTrayScore(state.cognitiveScore)
        prevScore.current = state.cognitiveScore
      }

      if (state.focusState === 'flow' && state.focusState !== fp.focusState) {
        setTimeout(() => {
          if (useSignalsStore.getState().focusState === 'flow' && canFire('flow')) {
            notify('Flow state 🔥', "You've been in flow for 2 minutes.")
          }
        }, NOTIFY_FLOW_MS)
      }

      if (state.focusState === 'distracted' && state.focusState !== fp.focusState) {
        setTimeout(() => {
          if (useSignalsStore.getState().focusState === 'distracted' && canFire('distracted')) {
            notify('Focus check', 'You seem distracted. Take a breath.')
          }
        }, NOTIFY_DISTRACTED_MS)
      }

      if (
        (fp.sessionState === 'running' || fp.sessionState === 'paused') &&
        state.sessionState === 'idle' &&
        canFire('sessionEnd')
      ) {
        const score = state.cognitiveScore
        notify('Session complete', `Avg score: ${score}.`)
      }

      prevSessionState.current = state.sessionState
      prevFocusState.current = state.focusState
    })
  }, [])
}
