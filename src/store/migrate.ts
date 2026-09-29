import type { EventDoc } from '../types/event'
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
  return d
}
