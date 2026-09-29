import { create } from 'zustand'
import { produce, type Draft } from 'immer'
import type { EventDoc, EventSummary } from '../types/event'
import { storage } from './persistence'

const HISTORY = 100
const COALESCE_MS = 800

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface EventState {
  doc: EventDoc | null
  past: EventDoc[]
  future: EventDoc[]
  lastKey: string | null
  lastAt: number
  readOnly: boolean
  saveState: SaveState
  events: EventSummary[]

  /** Mutate the document. Updates with the same `key` inside 800ms merge into one undo step (drags, typing). */
  update: (fn: (d: Draft<EventDoc>) => void, key?: string) => void
  undo: () => void
  redo: () => void
  open: (doc: EventDoc, opts?: { readOnly?: boolean }) => void
  close: () => void
  refreshEvents: () => Promise<void>
}

export const useEvent = create<EventState>((set, get) => ({
  doc: null,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
  readOnly: false,
  saveState: 'idle',
  events: [],

  update: (fn, key) => {
    const { doc, past, lastKey, lastAt, readOnly } = get()
    if (!doc || readOnly) return
    const next = produce(doc, (d) => {
      fn(d)
      d.meta.updated = new Date().toISOString()
    })
    if (next === doc) return
    const now = Date.now()
    const merge = key != null && key === lastKey && now - lastAt < COALESCE_MS
    set({
      doc: next,
      past: merge ? past : [...past.slice(-HISTORY + 1), doc],
      future: [],
      lastKey: key ?? null,
      lastAt: now,
    })
  },

  undo: () => {
    const { doc, past, future } = get()
    if (!doc || !past.length) return
    set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], lastKey: null })
  },

  redo: () => {
    const { doc, past, future } = get()
    if (!doc || !future.length) return
    set({ doc: future[0], past: [...past, doc], future: future.slice(1), lastKey: null })
  },

  open: (doc, opts) =>
    set({ doc, past: [], future: [], lastKey: null, readOnly: !!opts?.readOnly, saveState: 'idle' }),

  close: () => set({ doc: null, past: [], future: [] }),

  refreshEvents: async () => set({ events: await storage().listEvents() }),
}))

/* ---------- Autosave ---------- */

let timer: ReturnType<typeof setTimeout> | undefined
let lastSaved: EventDoc | null = null

useEvent.subscribe((s, prev) => {
  if (!s.doc || s.readOnly || s.doc === prev.doc || s.doc === lastSaved) return
  if (prev.doc?.id !== s.doc.id) {
    // Just opened — nothing to save yet.
    lastSaved = s.doc
    return
  }
  clearTimeout(timer)
  useEvent.setState({ saveState: 'saving' })
  timer = setTimeout(async () => {
    const doc = useEvent.getState().doc
    if (!doc) return
    try {
      await storage().saveEvent(doc)
      lastSaved = doc
      useEvent.setState({ saveState: 'saved' })
      useEvent.getState().refreshEvents()
    } catch (e) {
      console.error('Save failed', e)
      useEvent.setState({ saveState: 'error' })
    }
  }, 400)
})

/** Flush pending saves when the tab closes. */
window.addEventListener('beforeunload', () => {
  const doc = useEvent.getState().doc
  if (doc && doc !== lastSaved && !useEvent.getState().readOnly) storage().saveEvent(doc)
})

export const doc = () => useEvent.getState().doc!
export const update = (fn: (d: Draft<EventDoc>) => void, key?: string) => useEvent.getState().update(fn, key)
