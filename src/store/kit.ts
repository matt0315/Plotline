import { create } from 'zustand'
import type { KitEntry } from '../types/event'
import { loadKit, saveKit } from './persistence'
import { setKitRegistry } from '../lib/kit'
import { uid } from '../lib/id'
import { toast } from '../components/ui'

interface KitState {
  entries: KitEntry[]
  updated: string
  loaded: boolean
  load: () => Promise<void>
  upsert: (e: Omit<KitEntry, 'id' | 'updated'> & { id?: string }) => KitEntry
  remove: (id: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

const persist = (entries: KitEntry[], updated: string) => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveKit({ entries, updated }).catch(() => toast('Couldn’t sync your kit — it’s saved in this browser'))
  }, 600)
}

/** Your own kit: custom items and your stock and prices for library items. Shared across all your events. */
export const useKit = create<KitState>((set, get) => ({
  entries: [],
  updated: '',
  loaded: false,
  load: async () => {
    const k = await loadKit()
    setKitRegistry(k.entries)
    set({ entries: k.entries, updated: k.updated, loaded: true })
  },
  upsert: (e) => {
    const now = new Date().toISOString()
    const entry: KitEntry = { ...e, id: e.id ?? uid('k'), updated: now }
    const entries = get().entries.some((x) => x.id === entry.id) ? get().entries.map((x) => (x.id === entry.id ? entry : x)) : [entry, ...get().entries]
    setKitRegistry(entries)
    set({ entries, updated: now })
    persist(entries, now)
    return entry
  },
  remove: (id) => {
    const now = new Date().toISOString()
    const entries = get().entries.filter((x) => x.id !== id)
    setKitRegistry(entries)
    set({ entries, updated: now })
    persist(entries, now)
  },
}))
