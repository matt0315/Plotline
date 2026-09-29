import type { DocResponse } from '../types/event'
import { api } from '../lib/api'
import { cloudActive } from './account'
import { useEvent, update } from './event'
import { storage } from './persistence'

/**
 * Crew submit forms from a share link into a holding table.
 * Pull them into the event, save, then clear them — in that order,
 * so a failed save never loses a response.
 */
export const pullResponses = async (eventId: string): Promise<number> => {
  if (!cloudActive()) return 0
  const rows = await api<{ id: string; form_id: string; response: DocResponse }[]>(`/api/events/${encodeURIComponent(eventId)}/responses`).catch(() => [])
  if (!rows.length) return 0
  const doc = useEvent.getState().doc
  if (!doc || doc.id !== eventId || useEvent.getState().readOnly) return 0

  update((d) => {
    for (const row of rows) {
      const form = d.docs.find((f) => f.id === row.form_id)
      if (form && !form.responses.some((r) => r.id === row.response.id)) form.responses.push(row.response)
    }
  })
  await storage().saveEvent(useEvent.getState().doc!)
  await api(`/api/events/${encodeURIComponent(eventId)}/responses`, { method: 'DELETE', json: { ids: rows.map((r) => r.id) } })
  return rows.length
}
