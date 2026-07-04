import { useEffect, useRef } from 'react'
import useSignalsStore from '../store/signals'
import { createNudgeState, stepNudge } from '../utils/nudgeEngine'
import { notify } from '../utils/notifications'

// Steps the pure nudge engine on focus/session changes and fires supportive
// OS notifications. All timing/cooldown logic lives in the engine.
export default function useNudgeWatcher() {
  const stateRef = useRef(createNudgeState(Date.now()))
  useEffect(() => {
    return useSignalsStore.subscribe(
      (s) => ({ focusState: s.focusState, sessionState: s.sessionState, elapsed: s.sessionElapsed }),
      ({ focusState, sessionState, elapsed }) => {
        const now = Date.now()
        const { nudge } = stepNudge(
          stateRef.current,
          { focusState, sessionRunning: sessionState === 'running', sessionElapsedMs: (elapsed || 0) * 1000 },
          now,
        )
        if (nudge) notify(nudge.title, nudge.body)
      },
    )
  }, [])
}
