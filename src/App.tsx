import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useEvent } from './store/event'
import { useUI } from './store/ui'
import { useAccount } from './store/account'
import { openEvent } from './store/actions'
import { seedPlan } from './store/plans'
import { loadCloudShare, readShareHash } from './lib/share'
import { Shell } from './components/Shell'
import { Onboarding } from './components/Onboarding'
import { Home } from './components/Home'
import { UpgradeDialog, SignInDialog } from './components/Account'
import { FeedbackDialog } from './components/Feedback'
import { toast } from './components/ui'

let booted = false
const boot = async () => {
  if (booted) return
  booted = true
  await useAccount.getState().refresh()
  const params = new URLSearchParams(location.search)

  const signin = params.get('signin')
  if (signin) {
    toast(signin === 'ok' ? `Signed in as ${useAccount.getState().user?.email ?? 'you'}` : 'That sign-in link has expired — request a new one')
    history.replaceState(null, '', location.pathname)
  }
  // Pro and signed in: upload anything made on this device before signing in.
  import('./store/persistence')
    .then(({ syncUp }) => syncUp())
    .then((n) => {
      if (n) useEvent.getState().refreshEvents()
    })

  if (params.get('checkout') === 'success') {
    toast('Welcome aboard — everything is unlocked')
    history.replaceState(null, '', location.pathname)
    // The webhook can land a moment after the redirect.
    setTimeout(() => useAccount.getState().refresh(), 2500)
  }

  // Shared links open read-only and never touch local storage.
  const token = params.get('s')
  if (token) {
    const shared = await loadCloudShare(token)
    if (shared) {
      if (shared.plan) seedPlan(shared.plan)
      useEvent.getState().open(shared.doc, { readOnly: true })
      const form = params.get('form')
      useUI.getState().set({ tab: form ? 'docs' : 'overview', focusId: form, shareToken: token })
      return useUI.getState().setScreen('workspace')
    }
    toast('That share link has expired or been turned off')
  }
  const fromHash = readShareHash(location.hash)
  if (fromHash) {
    useEvent.getState().open(fromHash, { readOnly: true })
    useUI.getState().set({ tab: 'overview' })
    return useUI.getState().setScreen('workspace')
  }

  await useEvent.getState().refreshEvents()
  const events = useEvent.getState().events
  if (events.length && (await openEvent(events[0].id))) return
  useUI.getState().setScreen('onboarding')
}

export default function App() {
  const screen = useUI((s) => s.screen)
  const hasDoc = useEvent((s) => !!s.doc)

  useEffect(() => {
    boot()
  }, [])

  return (
    <>
      {screen === 'boot' && (
        <div className="flex h-full items-center justify-center text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {screen === 'onboarding' && <Onboarding />}
      {screen === 'home' && <Home />}
      {screen === 'workspace' && hasDoc && <Shell />}
      <UpgradeDialog />
      <SignInDialog />
      <FeedbackDialog />
    </>
  )
}
