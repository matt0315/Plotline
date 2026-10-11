/**
 * Anonymous usage counts — which features get used, never what's in your event.
 * Sends an event name, an optional short variant (like "wedding") and a random id for this browser,
 * which the server hashes with the day so it can't follow anyone across days. Honours Do Not Track.
 */
const DEVICE_KEY = 'plotline:device'

const device = () => {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return undefined
  }
}

const recent = new Map<string, number>()

export const track = (e: string, v?: string) => {
  try {
    if (navigator.doNotTrack === '1' || (window as { doNotTrack?: string }).doNotTrack === '1') return
    // The same thing twice within a couple of seconds (double clicks, re-renders) counts once.
    const key = `${e}:${v ?? ''}`
    const now = Date.now()
    if (now - (recent.get(key) ?? 0) < 2000) return
    recent.set(key, now)
    const body = JSON.stringify({ e, v: v?.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 24), d: device() })
    if (!navigator.sendBeacon?.('/api/t', new Blob([body], { type: 'text/plain' }))) fetch('/api/t', { method: 'POST', body, keepalive: true, credentials: 'same-origin' }).catch(() => {})
  } catch {
    /* never let counting break the app */
  }
}
