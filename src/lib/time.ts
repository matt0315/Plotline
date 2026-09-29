/** "HH:MM" helpers. Times are local to the event day. */
export const toMinutes = (t: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : NaN
}

export const fromMinutes = (mins: number): string => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const addMinutes = (t: string, delta: number): string => {
  const m = toMinutes(t)
  return Number.isNaN(m) ? t : fromMinutes(m + delta)
}

export const hoursBetween = (start: string, end: string): number => {
  const a = toMinutes(start)
  const b = toMinutes(end)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return ((b - a + 1440) % 1440) / 60
}

export const fmt12 = (t: string): string => {
  const m = toMinutes(t)
  if (Number.isNaN(m)) return t
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'am' : 'pm'}`
}

export const daysUntil = (date: string): number | null => {
  if (!date) return null
  const d = new Date(date + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}
