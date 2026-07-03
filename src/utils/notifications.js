import { invoke } from '@tauri-apps/api/core'

const DEBOUNCE_MS = 300000
const lastFired = { flow: 0, distracted: 0, sessionEnd: 0, drowsy: 0 }

export function canFire(type) {
  const now = Date.now()
  if (now - lastFired[type] < DEBOUNCE_MS) return false
  lastFired[type] = now
  return true
}

export async function notify(title, body) {
  try {
    await invoke('trigger_notification', { title, body })
  } catch (err) {
    console.error('Notification failed:', err)
  }
}

export async function updateTrayScore(score) {
  try {
    await invoke('update_tray_score', { score })
  } catch {
    /* tray may not be available */
  }
}
