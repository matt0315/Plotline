import { useEffect, useRef, useState } from 'react'
import { Crown, MessageSquarePlus, LogIn, LogOut, Check, Loader2, CreditCard, Home as HomeIcon, FlaskConical, BookOpen } from 'lucide-react'
import { GATE_COPY, setDevPro, signIn, signOut, useAccount } from '../store/account'
import { useUI } from '../store/ui'
import { api } from '../lib/api'
import { BRAND, PRICE_LABEL } from '../lib/brand'
import { Button, Modal, toast } from './ui'

const PRO_FEATURES = [
  'Unlimited events',
  'Sync across devices, backed up',
  'Live share links for clients and crew',
  'Clean PDF exports — no watermark',
  'DWG import, plus publishing to the venue library',
]

const billingRedirect = async (path: string) => {
  try {
    location.href = (await api<{ url: string }>(path, { method: 'POST' })).url
  } catch (e) {
    toast((e as Error).message)
  }
}

export const startCheckout = async () => {
  const { cloud, user } = useAccount.getState()
  if (!cloud) return toast('Billing is not available in this build')
  if (!user) {
    useAccount.getState().setSignIn(true)
    return
  }
  await billingRedirect('/api/checkout')
}

const openPortal = () => billingRedirect('/api/portal')

export const UpgradeDialog = () => {
  const reason = useAccount((s) => s.upgradeReason)
  const setUpgrade = useAccount((s) => s.setUpgrade)
  const [busy, setBusy] = useState(false)
  const dev = useAccount((s) => s.dev)
  const close = () => setUpgrade(null)
  return (
    <Modal open={!!reason} onClose={close} width="max-w-md">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Crown size={22} />
        </div>
        <h2 className="text-lg font-semibold">Unlock everything</h2>
        {reason && <p className="mt-1 text-sm text-slate-600">{GATE_COPY[reason]}</p>}
        <div className="mt-5 text-4xl font-semibold tracking-tight">
          {PRICE_LABEL}
          <span className="text-base font-normal text-slate-500">/month</span>
        </div>
        <p className="text-xs text-slate-500">One price, billed in US dollars. Every feature. Cancel any time.</p>
      </div>
      <ul className="mt-5 space-y-2">
        {PRO_FEATURES.map((f) => (
          <li key={f} className="flex gap-2 text-sm">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {f}
          </li>
        ))}
      </ul>
      <Button
        variant="primary"
        className="mt-6 w-full py-2.5"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await startCheckout()
          setBusy(false)
        }}
      >
        {busy && <Loader2 size={16} className="animate-spin" />} Upgrade for {PRICE_LABEL}/mo
      </Button>
      {dev && (
        <button
          className="mt-3 w-full text-xs text-slate-400 hover:text-slate-600"
          onClick={async () => {
            await setDevPro(true)
            close()
            toast('Dev mode: Pro unlocked')
          }}
        >
          Dev build — unlock Pro for testing
        </button>
      )}
    </Modal>
  )
}

export const SignInDialog = () => {
  const open = useAccount((s) => s.signInOpen)
  const cloud = useAccount((s) => s.cloud)
  const setOpen = useAccount((s) => s.setSignIn)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!email.includes('@')) return
    setBusy(true)
    try {
      const r = await signIn(email)
      setDevLink(r.devLink ?? null)
      setSent(true)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const close = () => {
    setOpen(false)
    setSent(false)
    setDevLink(null)
  }
  return (
    <Modal open={open} onClose={close} title={`Sign in to ${BRAND}`} width="max-w-sm">
      {!cloud ? (
        <p className="text-sm text-slate-600">Accounts aren't available in this build — everything is saved in this browser.</p>
      ) : sent ? (
        <div className="text-sm text-slate-600">
          <p>
            Check <strong>{email}</strong> for a sign-in link. It works once and expires in 20 minutes.
          </p>
          {devLink && (
            <a href={devLink} className="mt-3 block rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 underline">
              Dev build — no email is sent. Click here to sign in.
            </a>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <p className="mb-3 text-sm text-slate-600">We'll email you a link — no password.</p>
          <input className="input" type="email" autoFocus placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button variant="primary" className="mt-3 w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />} Email me a link
          </Button>
        </form>
      )}
    </Modal>
  )
}

export const AccountMenu = () => {
  const { user, isPro, cloud, dev } = useAccount()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', off)
    return () => window.removeEventListener('mousedown', off)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white pr-2.5 pl-1 text-xs font-medium hover:bg-slate-50">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${isPro ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
          {user?.email?.[0]?.toUpperCase() ?? (isPro ? <Crown size={12} /> : '?')}
        </span>
        {isPro ? 'Pro' : 'Free'}
      </button>
      {open && (
        <div className="absolute right-0 z-[1100] mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <div className="truncate font-medium">{user?.email ?? 'Not signed in'}</div>
            <div className="text-xs text-slate-500">{isPro ? `Pro · ${PRICE_LABEL}/mo` : 'Free plan · saved in this browser'}</div>
          </div>
          <MenuItem icon={<HomeIcon size={16} />} onClick={() => (useUI.getState().setScreen('home'), setOpen(false))}>
            All events
          </MenuItem>
          <MenuItem icon={<BookOpen size={16} />} onClick={() => (window.open('/help/', '_blank', 'noopener'), setOpen(false))}>
            How to use Plotline
          </MenuItem>
          <MenuItem icon={<MessageSquarePlus size={16} />} onClick={() => (useUI.getState().set({ feedbackOpen: true }), setOpen(false))}>
            Send feedback
          </MenuItem>
          {!isPro && (
            <MenuItem icon={<Crown size={16} className="text-brand-600" />} onClick={() => (startCheckout(), setOpen(false))}>
              Upgrade — {PRICE_LABEL}/mo
            </MenuItem>
          )}
          {isPro && user && (
            <MenuItem icon={<CreditCard size={16} />} onClick={openPortal}>
              Manage billing
            </MenuItem>
          )}
          {cloud &&
            (user ? (
              <MenuItem icon={<LogOut size={16} />} onClick={() => (signOut(), setOpen(false))}>
                Sign out
              </MenuItem>
            ) : (
              <MenuItem icon={<LogIn size={16} />} onClick={() => (useAccount.getState().setSignIn(true), setOpen(false))}>
                Sign in
              </MenuItem>
            ))}
          {dev && (
            <MenuItem icon={<FlaskConical size={16} />} onClick={() => (setDevPro(!isPro), setOpen(false))}>
              Dev: {isPro ? 'switch to Free' : 'switch to Pro'}
            </MenuItem>
          )}
        </div>
      )}
    </div>
  )
}

const MenuItem = ({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50">
    <span className="text-slate-500">{icon}</span>
    {children}
  </button>
)
