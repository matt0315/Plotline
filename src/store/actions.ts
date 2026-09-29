import type { EventDoc } from '../types/event'
import { storage } from './persistence'
import { gate } from './account'
import { useEvent } from './event'
import { useUI } from './ui'
import { FREE_EVENT_LIMIT } from '../lib/brand'
import { uid } from '../lib/id'
import { migrate } from './migrate'

/** Free plan holds one event. The single place that rule lives. */
export const canCreateEvent = async (): Promise<boolean> => {
  const n = (await storage().listEvents()).length
  return n < FREE_EVENT_LIMIT || gate('second-event')
}

export const createAndOpen = async (doc: EventDoc) => {
  await storage().saveEvent(doc)
  useEvent.getState().open(doc)
  await useEvent.getState().refreshEvents()
  useUI.getState().setScreen('workspace')
  useUI.getState().go('overview')
}

export const openEvent = async (id: string) => {
  const doc = await storage().loadEvent(id)
  if (!doc) return false
  useEvent.getState().open(migrate(doc))
  useUI.getState().setScreen('workspace')
  // Anything crew submitted from a share link while we were away.
  import('./responses').then(({ pullResponses }) => pullResponses(id)).catch(() => {})
  return true
}

export const deleteEvent = async (id: string) => {
  await storage().deleteEvent(id)
  if (useEvent.getState().doc?.id === id) useEvent.getState().close()
  await useEvent.getState().refreshEvents()
}

export const duplicateEvent = async (source: EventDoc, name?: string) => {
  if (!(await canCreateEvent())) return
  const now = new Date().toISOString()
  await createAndOpen({ ...source, id: uid('e'), name: name ?? `${source.name} (copy)`, meta: { ...source.meta, created: now, updated: now } })
}
