import { describe, it, expect, beforeEach, vi } from 'vitest'

const STORAGE_KEY = 'cogniflow_settings'

async function freshStore() {
  // re-import module fresh so load() reruns against current localStorage
  vi.resetModules()
  const mod = await import('../settings.js')
  return mod.default
}

describe('settings v4', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults weights to blink 40 / gaze 35 / brow 25', async () => {
    const store = await freshStore()
    expect(store.getState().weights).toEqual({ blinkRate: 40, gazeStability: 35, browFurrow: 25 })
  })

  it('defaults notifications to drift/drowsy/away/sessionEnd all on', async () => {
    const store = await freshStore()
    expect(store.getState().notifications).toEqual({
      drift: true, drowsy: true, away: true, sessionEnd: true,
    })
  })

  it('discards persisted settings from previous schema versions', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      _v: 3,
      weights: { blinkRate: 50, gazeStability: 50 },
    }))
    const store = await freshStore()
    expect(store.getState().weights).toEqual({ blinkRate: 40, gazeStability: 35, browFurrow: 25 })
    expect(store.getState().notifications).toEqual({
      drift: true, drowsy: true, away: true, sessionEnd: true,
    })
  })

  it('keeps v4-persisted settings', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      _v: 4,
      weights: { blinkRate: 70, gazeStability: 20, browFurrow: 10 },
    }))
    const store = await freshStore()
    expect(store.getState().weights).toEqual({ blinkRate: 70, gazeStability: 20, browFurrow: 10 })
  })

  it('stamps _v on persist', async () => {
    const store = await freshStore()
    store.getState().updateThreshold('flow', 85)
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(raw._v).toBe(4)
  })

  it('updateWeight keeps the three weights summing to 100', async () => {
    const store = await freshStore()
    store.getState().updateWeight('blinkRate', 70)
    const w = store.getState().weights
    expect(w.blinkRate).toBe(70)
    expect(w.gazeStability + w.browFurrow).toBe(30)
  })
})
