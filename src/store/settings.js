import { create } from 'zustand'

const STORAGE_KEY = 'cogniflow_settings'

const SETTINGS_VERSION = 3

const DEFAULTS = {
  _v: SETTINGS_VERSION,
  weights: {
    blinkRate: 40,
    gazeStability: 35,
    browFurrow: 25,
  },
  thresholds: {
    distracted: 20,
    focused: 55,
    flow: 80,
  },
  notifications: {
    flow: true,
    distracted: true,
    sessionEnd: true,
    drowsy: true,
  },
  calibrationDuration: 30,
  performanceMode: false,
  onboardingDone: false,
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    if (parsed._v !== SETTINGS_VERSION) return { ...DEFAULTS }
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, _v: SETTINGS_VERSION }))
  } catch {}
}

const useSettingsStore = create((set, get) => ({
  ...load(),

  updateWeight: (key, value) => set((state) => {
    const nv = Math.max(0, Math.min(100, value))
    const keys = Object.keys(state.weights)
    const others = keys.filter((k) => k !== key)

    let result
    if (nv >= 100) {
      result = { ...Object.fromEntries(others.map((k) => [k, 0])), [key]: 100 }
    } else {
      const otherSum = others.reduce((s, k) => s + state.weights[k], 0)
      result = { [key]: nv }
      let assigned = 0
      for (let i = 0; i < others.length; i++) {
        const k = others[i]
        if (i === others.length - 1) {
          result[k] = 100 - nv - assigned
        } else if (otherSum === 0) {
          const share = Math.floor((100 - nv) / others.length)
          result[k] = share
          assigned += share
        } else {
          const v = Math.round(state.weights[k] / otherSum * (100 - nv))
          result[k] = v
          assigned += v
        }
      }
    }

    const next = { ...state, weights: result }
    persist(next)
    return next
  }),

  updateThreshold: (key, value) => set((state) => {
    const next = { ...state, thresholds: { ...state.thresholds, [key]: Math.max(0, Math.min(100, value)) } }
    persist(next)
    return next
  }),

  toggleNotification: (key) => set((state) => {
    const next = { ...state, notifications: { ...state.notifications, [key]: !state.notifications[key] } }
    persist(next)
    return next
  }),

  setCalibrationDuration: (value) => set((state) => {
    const next = { ...state, calibrationDuration: value }
    persist(next)
    return next
  }),

  togglePerformanceMode: () => set((state) => {
    const next = { ...state, performanceMode: !state.performanceMode }
    persist(next)
    return next
  }),

  completeOnboarding: () => set((state) => {
    const next = { ...state, onboardingDone: true }
    persist(next)
    return next
  }),

  resetSettings: () => {
    persist({ ...DEFAULTS })
    set({ ...DEFAULTS })
  },
}))

export default useSettingsStore
