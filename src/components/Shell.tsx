import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import {
  LayoutDashboard,
  LayoutGrid,
  Map as MapIcon,
  Users,
  Clock,
  Store,
  Wallet,
  FileCheck2,
  HardHat,
  Undo2,
  Redo2,
  Search,
  Download,
  Share2,
  ChevronDown,
  Loader2,
  Check,
  CloudOff,
  Cloud,
  Eye,
} from 'lucide-react'
import { useEvent } from '../store/event'
import { useUI } from '../store/ui'
import { useAccount } from '../store/account'
import { budgetTotals, seatingStats, type Tab } from '../lib/derived'
import { money } from '../lib/money'
import { BRAND } from '../lib/brand'
import { IconButton, Button } from './ui'
import { AccountMenu } from './Account'
import { CommandPalette } from './CommandPalette'
import { FeedbackButton } from './Feedback'
import { Overview } from '../modules/Overview'
import { duplicateEvent } from '../store/actions'

const Layout = lazy(() => import('../modules/Layout/Layout'))
const SiteMap = lazy(() => import('../modules/SiteMap/SiteMap'))
const Guests = lazy(() => import('../modules/Guests/Guests'))
const RunSheet = lazy(() => import('../modules/RunSheet/RunSheet'))
const Suppliers = lazy(() => import('../modules/Suppliers/Suppliers'))
const Budget = lazy(() => import('../modules/Budget/Budget'))
const Docs = lazy(() => import('../modules/Docs/Docs'))
const Crew = lazy(() => import('../modules/Crew/Crew'))
const ExportDialog = lazy(() => import('./ExportDialog'))
const ShareDialog = lazy(() => import('./ShareDialog'))

export const TABS: { id: Tab; label: string; icon: ReactNode; short?: string }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
  { id: 'layout', label: 'Floor plan', icon: <LayoutGrid size={18} />, short: 'Floor' },
  { id: 'site', label: 'Site map', icon: <MapIcon size={18} />, short: 'Site' },
  { id: 'guests', label: 'Guests', icon: <Users size={18} /> },
  { id: 'run', label: 'Run sheet', icon: <Clock size={18} />, short: 'Run' },
  { id: 'suppliers', label: 'Suppliers', icon: <Store size={18} /> },
  { id: 'budget', label: 'Budget', icon: <Wallet size={18} /> },
  { id: 'docs', label: 'Docs', icon: <FileCheck2 size={18} /> },
  { id: 'crew', label: 'Crew', icon: <HardHat size={18} /> },
]

const SaveBadge = () => {
  const s = useEvent((x) => x.saveState)
  const readOnly = useEvent((x) => x.readOnly)
  const cloud = useAccount((a) => !!(a.user && a.isPro))
  if (readOnly)
    return (
      <span className="hidden items-center gap-1 text-xs text-amber-700 sm:flex">
        <Eye size={14} /> View only
      </span>
    )
  return (
    <span className="hidden items-center gap-1 text-xs text-slate-500 lg:flex" title={cloud ? 'Saved to your account' : 'Saved in this browser'}>
      {s === 'saving' ? <Loader2 size={14} className="animate-spin" /> : s === 'error' ? <CloudOff size={14} className="text-red-500" /> : cloud ? <Cloud size={14} /> : <Check size={14} />}
      {s === 'saving' ? 'Saving' : s === 'error' ? 'Save failed' : 'Saved'}
    </span>
  )
}

const TopBar = () => {
  const doc = useEvent((s) => s.doc)!
  const canUndo = useEvent((s) => s.past.length > 0)
  const canRedo = useEvent((s) => s.future.length > 0)
  const { undo, redo } = useEvent.getState()
  const set = useUI((s) => s.set)
  const go = useUI((s) => s.go)
  const b = budgetTotals(doc)
  const st = seatingStats(doc)

  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
      <button onClick={() => useUI.getState().setScreen('home')} className="flex min-w-[80px] shrink items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100" title="All events">
        <img src="/favicon.svg" alt={BRAND} className="h-7 w-7 shrink-0" />
        <span className="min-w-0 truncate text-sm font-semibold">{doc.name}</span>
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>

      <div className="ml-2 hidden items-center gap-1.5 md:flex">
        {b.target > 0 && (
          <button onClick={() => go('budget')} className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${b.variance < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {b.variance < 0 ? `${money(-b.variance)} over` : `${money(b.variance)} under`}
          </button>
        )}
        {doc.type === 'festival' ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 tabular-nums">{doc.guestCount.toLocaleString()} capacity</span>
        ) : (
          <button onClick={() => go('layout')} className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${st.capacity < doc.guestCount ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
            {st.capacity} seats · {doc.guestCount} guests
          </button>
        )}
      </div>

      <div className="flex-1" />
      <SaveBadge />
      <div className="flex items-center">
        <IconButton onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          <Undo2 size={18} />
        </IconButton>
        <IconButton onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
          <Redo2 size={18} />
        </IconButton>
      </div>
      <button onClick={() => set({ palette: true })} className="hidden items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 sm:flex">
        <Search size={14} /> Search <kbd className="rounded bg-slate-100 px-1 font-sans">⌘K</kbd>
      </button>
      <IconButton className="sm:hidden" onClick={() => set({ palette: true })}>
        <Search size={18} />
      </IconButton>
      <FeedbackButton compact />
      <Button size="sm" onClick={() => set({ shareOpen: true })} className="max-sm:hidden">
        <Share2 size={14} /> Share
      </Button>
      <Button size="sm" variant="primary" onClick={() => set({ exportOpen: true })}>
        <Download size={14} /> <span className="hidden sm:inline">Export pack</span>
      </Button>
      <AccountMenu />
    </header>
  )
}

const Nav = () => {
  const tab = useUI((s) => s.tab)
  const go = useUI((s) => s.go)
  return (
    <>
      <nav className="no-print hidden w-44 shrink-0 flex-col gap-0.5 border-r border-slate-200 bg-white p-2 md:flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => go(t.id)}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${tab === t.id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <nav className="no-print scroll-thin fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} className={`flex min-w-[64px] flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium ${tab === t.id ? 'text-brand-600' : 'text-slate-500'}`}>
            {t.icon}
            {t.short ?? t.label}
          </button>
        ))}
      </nav>
    </>
  )
}

const ReadOnlyBanner = () => {
  const readOnly = useEvent((s) => s.readOnly)
  if (!readOnly) return null
  const saveCopy = async () => {
    const doc = useEvent.getState().doc
    if (!doc) return
    history.replaceState(null, '', location.pathname)
    await duplicateEvent(doc)
  }
  return (
    <div className="no-print flex items-center justify-center gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      You're viewing a shared plan.
      <Button size="sm" onClick={saveCopy}>
        Save a copy to edit
      </Button>
    </div>
  )
}

const Module = () => {
  const tab = useUI((s) => s.tab)
  switch (tab) {
    case 'overview':
      return <Overview />
    case 'layout':
      return <Layout />
    case 'site':
      return <SiteMap />
    case 'guests':
      return <Guests />
    case 'run':
      return <RunSheet />
    case 'suppliers':
      return <Suppliers />
    case 'budget':
      return <Budget />
    case 'docs':
      return <Docs />
    case 'crew':
      return <Crew />
  }
}

const FULL_BLEED: Tab[] = ['layout', 'site']

export const Shell = () => {
  const tab = useUI((s) => s.tab)
  const exportOpen = useUI((s) => s.exportOpen)
  const shareOpen = useUI((s) => s.shareOpen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const typing = (e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable]')
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useUI.getState().set({ palette: !useUI.getState().palette })
      } else if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        if (e.shiftKey) useEvent.getState().redo()
        else useEvent.getState().undo()
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault()
        useEvent.getState().redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const full = FULL_BLEED.includes(tab)
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <ReadOnlyBanner />
      <div className="flex min-h-0 flex-1">
        <Nav />
        <main className={`relative min-w-0 flex-1 ${full ? 'overflow-hidden' : 'scroll-thin overflow-y-auto pb-24 md:pb-8'}`}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-slate-400">
                <Loader2 className="animate-spin" />
              </div>
            }
          >
            {full ? (
              // Stop above the phone tab bar so floating toolbars stay reachable.
              <div className="absolute inset-x-0 top-0 bottom-[60px] md:bottom-0">
                <Module />
              </div>
            ) : (
              <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
                <Module />
              </div>
            )}
          </Suspense>
        </main>
      </div>
      <CommandPalette />
      <Suspense>
        {exportOpen && <ExportDialog />}
        {shareOpen && <ShareDialog />}
      </Suspense>
    </div>
  )
}
