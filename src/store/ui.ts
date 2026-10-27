import { create } from 'zustand'
import type { Tab } from '../lib/derived'
import type { Pack } from '../types/event'

type Screen = 'boot' | 'home' | 'onboarding' | 'workspace'

const TAB_KEY = 'plotline:tab'
const savedTab = (): Tab => {
  try {
    const t = localStorage.getItem(TAB_KEY) as Tab | null
    return t && t !== 'pack' ? t : 'overview'
  } catch {
    return 'overview'
  }
}

interface UIState {
  screen: Screen
  tab: Tab
  palette: boolean
  guestPanel: boolean
  exportOpen: boolean
  tablePlanOpen: boolean
  shareOpen: boolean
  feedbackOpen: boolean
  /** An id to scroll to / highlight after a jump (e.g. run sheet row → supplier). */
  focusId: string | null
  /** Set when viewing a cloud share link — lets crew submit forms without an account. */
  shareToken: string | null
  /** Set when the share link is a pack for one audience. */
  pack: Omit<Pack, 'token'> | null
  /** Open the share dialog on this audience's pack ("supplier:<id>"). */
  packFocus: string | null
  setScreen: (s: Screen) => void
  go: (t: Tab, focusId?: string) => void
  set: (p: Partial<UIState>) => void
}

export const useUI = create<UIState>((set) => ({
  screen: 'boot',
  tab: savedTab(),
  palette: false,
  guestPanel: false,
  exportOpen: false,
  tablePlanOpen: false,
  shareOpen: false,
  feedbackOpen: false,
  focusId: null,
  shareToken: null,
  pack: null,
  packFocus: null,
  setScreen: (screen) => set({ screen }),
  go: (tab, focusId) => {
    try {
      if (tab !== 'pack') localStorage.setItem(TAB_KEY, tab)
    } catch {
      /* ignore */
    }
    set({ tab, focusId: focusId ?? null, palette: false })
  },
  set: (p) => set(p),
}))
