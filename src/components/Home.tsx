import { useRef } from 'react'
import { Plus, Trash2, Copy, Upload, CalendarDays } from 'lucide-react'
import { useEvent } from '../store/event'
import { useUI } from '../store/ui'
import { useAccount } from '../store/account'
import { canCreateEvent, createAndOpen, deleteEvent, duplicateEvent, openEvent } from '../store/actions'
import { storage } from '../store/persistence'
import { EVENT_TEMPLATES } from '../data/eventTemplates'
import { importJson } from '../lib/share'
import { BRAND, FREE_EVENT_LIMIT, PRICE_LABEL } from '../lib/brand'
import { daysUntil } from '../lib/time'
import { Button, IconButton, toast } from './ui'
import { AccountMenu } from './Account'
import { FeedbackButton } from './Feedback'

export const Home = () => {
  const events = useEvent((s) => s.events)
  const current = useEvent((s) => s.doc?.id)
  const isPro = useAccount((s) => s.isPro)
  const file = useRef<HTMLInputElement>(null)

  const newEvent = async () => {
    if (await canCreateEvent()) useUI.getState().setScreen('onboarding')
  }

  return (
    <div className="min-h-full">
      <header className="flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-4">
        <button onClick={() => useUI.getState().setScreen('onboarding')} className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-100" title={`${BRAND} home`}>
          <img src="/favicon.svg" className="h-7 w-7" alt="" />
          <span className="font-semibold">{BRAND}</span>
        </button>
        <div className="flex-1" />
        <FeedbackButton />
        <AccountMenu />
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Your events</h1>
          <div className="flex gap-2">
            <Button onClick={() => file.current?.click()}>
              <Upload size={16} /> Import
            </Button>
            <Button variant="primary" onClick={newEvent}>
              <Plus size={16} /> New event
            </Button>
          </div>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const doc = await importJson(f)
                if (await canCreateEvent()) await createAndOpen(doc)
              } catch {
                toast("That file isn't a plan export")
              }
            }}
          />
        </div>

        {!isPro && (
          <p className="mb-4 text-sm text-slate-500">
            Free plan · {Math.min(events.length, FREE_EVENT_LIMIT)} of {FREE_EVENT_LIMIT} event, saved in this browser. Unlimited events, sync and sharing are {PRICE_LABEL}/mo.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => {
            const days = daysUntil(e.date)
            return (
              <div key={e.id} className={`card group flex items-start gap-3 p-4 transition hover:border-brand-300 hover:shadow-sm ${current === e.id ? 'ring-2 ring-brand-100' : ''}`}>
                <button className="min-w-0 flex-1 text-left" onClick={() => openEvent(e.id)}>
                  <div className="truncate font-semibold">{e.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>{EVENT_TEMPLATES[e.type]?.label}</span>
                    {e.date && (
                      <>
                        <span>·</span>
                        <CalendarDays size={12} />
                        {new Date(e.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {days != null && days >= 0 && <span className="text-brand-600">· {days === 0 ? 'today' : `${days}d to go`}</span>}
                      </>
                    )}
                  </div>
                </button>
                <div className="flex opacity-0 transition group-hover:opacity-100 max-sm:opacity-100">
                  <IconButton
                    title="Duplicate"
                    onClick={async () => {
                      const d = await storage().loadEvent(e.id)
                      if (d) await duplicateEvent(d)
                    }}
                  >
                    <Copy size={16} />
                  </IconButton>
                  <IconButton
                    title="Delete"
                    onClick={async () => {
                      if (confirm(`Delete “${e.name}”? This can't be undone.`)) await deleteEvent(e.id)
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            )
          })}
          <button onClick={newEvent} className="flex min-h-[76px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-sm font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600">
            <Plus size={16} /> New event
          </button>
        </div>
      </div>
    </div>
  )
}
