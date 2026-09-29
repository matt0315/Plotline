import { create } from 'zustand'
import { api } from '../lib/api'
import { FREE_EVENT_LIMIT } from '../lib/brand'

export type GateAction = 'second-event' | 'share' | 'clean-export' | 'cloud-sync' | 'dwg' | 'publish-plan'

export const GATE_COPY: Record<GateAction, string> = {
  'second-event': `The free plan holds ${FREE_EVENT_LIMIT} event. Upgrade to plan as many events as you like.`,
  share: 'Share links let clients and crew open your plan on any device.',
  'clean-export': 'Remove the watermark from your PDF exports.',
  'cloud-sync': 'Sync your events across devices and keep them backed up.',
  dwg: 'DWG files are converted to DXF on our servers. Free plans can import DXF, PDF and images.',
  'publish-plan': 'Publish your venue plan so organisers can find it and plan on it.',
}

export interface AccountUser {
  id: string
  email: string
}

interface AccountState {
  user: AccountUser | null
  isPro: boolean
  /** The Worker API answered — accounts, sync and billing are available. */
  cloud: boolean
  /** Development build of the Worker (sign-in links shown on screen, Pro toggle). */
  dev: boolean
  ready: boolean
  upgradeReason: GateAction | null
  signInOpen: boolean
  setUpgrade: (r: GateAction | null) => void
  setSignIn: (open: boolean) => void
  refresh: () => Promise<void>
}

const LOCAL_PRO_KEY = 'plotline:dev-pro'

/** Without a backend (plain `vite` static preview), dev builds can still fake Pro locally. */
const localPro = () => {
  try {
    return import.meta.env.DEV && localStorage.getItem(LOCAL_PRO_KEY) === '1'
  } catch {
    return false
  }
}

export const useAccount = create<AccountState>((set) => ({
  user: null,
  isPro: false,
  cloud: false,
  dev: false,
  ready: false,
  upgradeReason: null,
  signInOpen: false,
  setUpgrade: (upgradeReason) => set({ upgradeReason }),
  setSignIn: (signInOpen) => set({ signInOpen }),
  refresh: async () => {
    try {
      const r = await api<{ user: AccountUser | null; isPro: boolean; dev: boolean }>('/api/me')
      set({ user: r.user, isPro: r.isPro || (!r.user && localPro()), cloud: true, dev: r.dev, ready: true })
    } catch {
      set({ user: null, isPro: localPro(), cloud: false, dev: import.meta.env.DEV, ready: true })
    }
  },
}))

/** Returns true if allowed; otherwise opens the upgrade dialog and returns false. */
export const gate = (action: GateAction): boolean => {
  if (useAccount.getState().isPro) return true
  useAccount.getState().setUpgrade(action)
  return false
}

export const signIn = (email: string) => api<{ sent: boolean; devLink?: string }>('/api/auth/start', { method: 'POST', json: { email } })

export const signOut = async () => {
  await api('/api/auth/logout', { method: 'POST' })
  await useAccount.getState().refresh()
}

/** Development only. Signed in: flips Pro on the server. Signed out: a local flag. */
export const setDevPro = async (on: boolean) => {
  const { user } = useAccount.getState()
  if (user) await api('/api/dev/pro', { method: 'POST', json: { on } })
  else
    try {
      localStorage.setItem(LOCAL_PRO_KEY, on ? '1' : '0')
    } catch {
      /* storage blocked */
    }
  await useAccount.getState().refresh()
  if (on) (await import('./persistence')).syncUp()
}

/** Cloud sync applies to signed-in Pro users. */
export const cloudActive = () => {
  const s = useAccount.getState()
  return s.cloud && !!s.user && s.isPro
}
