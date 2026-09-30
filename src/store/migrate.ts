import type { EventDoc } from '../types/event'
import { newShift } from '../lib/roster'
import { addMinutes } from '../lib/time'
import { SCHEMA_VERSION } from '../types/event'
import { blankEvent } from './generator'

/**
 * Bring an older or partial document up to the current schema.
 * Also used on imported JSON and share links, so it must tolerate missing keys.
 */
export const migrate = (raw: Partial<EventDoc>): EventDoc => {
  const base = blankEvent()
  const d = { ...base, ...raw } as EventDoc
  d.site = { ...base.site, ...(raw.site ?? {}) }
  d.layout = { ...base.layout, ...(raw.layout ?? {}) }
  d.venue = { ...base.venue, ...(raw.venue ?? {}) }
  d.meta = { ...base.meta, ...(raw.meta ?? {}), schemaVersion: SCHEMA_VERSION }
  for (const k of ['guests', 'schedule', 'suppliers', 'docs', 'crew', 'budget'] as const) if (!Array.isArray(d[k])) (d[k] as unknown[]) = []
  // Before rosters, each crew member had one event-day call time. Turn those into shifts.
  if (!Array.isArray(raw.shifts)) {
    d.shifts = d.crew
      .filter((c) => c.callTime)
      .map((c) => newShift({ section: 'General', task: c.role || 'Crew call', day: 0, start: c.callTime!, end: c.finishTime || addMinutes(c.callTime!, 240), crewIds: [c.id], needed: 1 }))
    d.crew = d.crew.map(({ callTime: _c, finishTime: _f, ...c }) => c)
  }
  return d
}
