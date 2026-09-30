import { useState } from 'react'
import { Lightbulb, Bug, MessageCircle, MessageSquarePlus, Loader2, Check } from 'lucide-react'
import { useUI } from '../store/ui'
import { useEvent } from '../store/event'
import { useAccount } from '../store/account'
import { api } from '../lib/api'
import { Button, Modal } from './ui'

type Kind = 'idea' | 'problem' | 'other'

const KINDS: { id: Kind; label: string; icon: React.ReactNode; placeholder: string }[] = [
  { id: 'idea', label: 'I need…', icon: <Lightbulb size={16} />, placeholder: 'What would make planning your events easier? A feature, an item for the floor plan, a template…' },
  { id: 'problem', label: 'Something’s wrong', icon: <Bug size={16} />, placeholder: 'What happened, and what did you expect instead?' },
  { id: 'other', label: 'Other', icon: <MessageCircle size={16} />, placeholder: 'Anything on your mind.' },
]

/** Opens the feedback dialog. Icon-only on small screens. */
export const FeedbackButton = ({ compact }: { compact?: boolean }) => (
  <button
    onClick={() => useUI.getState().set({ feedbackOpen: true })}
    className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 ${compact ? '' : 'sm:border sm:border-slate-200 sm:px-2.5'}`}
    title="Send feedback"
  >
    <MessageSquarePlus size={16} />
    <span className={compact ? 'sr-only' : 'max-sm:sr-only'}>Feedback</span>
  </button>
)

export const FeedbackDialog = () => {
  const open = useUI((s) => s.feedbackOpen)
  const user = useAccount((s) => s.user)
  const [kind, setKind] = useState<Kind>('idea')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    useUI.getState().set({ feedbackOpen: false })
    // Keep a half-written message if they close by accident; clear it once sent.
    if (sent) {
      setSent(false)
      setMessage('')
    }
    setError(null)
  }

  const send = async () => {
    setBusy(true)
    setError(null)
    const { tab, screen } = useUI.getState()
    const doc = useEvent.getState().doc
    const { isPro } = useAccount.getState()
    try {
      await api('/api/feedback', {
        method: 'POST',
        json: {
          kind,
          message,
          email: email || user?.email || '',
          // Enough to understand the request — never guest lists or event contents.
          context: {
            screen: screen === 'workspace' ? tab : screen,
            eventType: doc?.type,
            guestCount: doc?.guestCount,
            plan: isPro ? 'pro' : 'free',
            viewport: `${window.innerWidth}×${window.innerHeight}`,
          },
        },
      })
      setSent(true)
    } catch (e) {
      setError((e as Error).message || 'Couldn’t send — check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const current = KINDS.find((k) => k.id === kind)!

  return (
    <Modal open={open} onClose={close} title="Tell us what you need" width="max-w-md">
      {sent ? (
        <div className="py-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Check size={22} />
          </div>
          <p className="font-medium">Thanks — we read every message.</p>
          <p className="mt-1 text-sm text-slate-500">{email || user?.email ? 'We’ll reply if we need more detail.' : 'Leave your email next time if you’d like a reply.'}</p>
          <Button className="mt-4" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {KINDS.map((k) => (
              <button
                type="button"
                key={k.id}
                onClick={() => setKind(k.id)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium ${
                  kind === k.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {k.icon}
                {k.label}
              </button>
            ))}
          </div>
          <textarea autoFocus className="input h-32" placeholder={current.placeholder} value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} />
          {!user && <input className="input mt-2" type="email" placeholder="Your email, if you'd like a reply (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />}
          <p className="mt-2 text-xs text-slate-400">We include which screen you’re on and your event type — never your guest list or event details.</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy || message.trim().length < 3}>
              {busy && <Loader2 size={16} className="animate-spin" />} Send
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

