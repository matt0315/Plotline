import { useState } from 'react'
import { ArrowLeft, Heart, Briefcase, Tent, PartyPopper, Sparkles, Check, Loader2 } from 'lucide-react'
import type { EventType, Venue } from '../types/event'
import { EVENT_TEMPLATES } from '../data/eventTemplates'
import { blankEvent, DEFAULT_VENUE, generateEvent } from '../store/generator'
import { canCreateEvent, createAndOpen } from '../store/actions'
import { useEvent } from '../store/event'
import { useUI } from '../store/ui'
import { BRAND } from '../lib/brand'
import { VenueSearch } from './VenueSearch'
import { FeedbackButton } from './Feedback'
import { Button, Select } from './ui'
import { currencyOptions, localCurrency } from '../lib/money'

const TYPES: { id: EventType; icon: React.ReactNode }[] = [
  { id: 'wedding', icon: <Heart size={20} /> },
  { id: 'corporate', icon: <Briefcase size={20} /> },
  { id: 'festival', icon: <Tent size={20} /> },
  { id: 'private', icon: <PartyPopper size={20} /> },
]

const QUICK = [50, 100, 150, 250, 500]

const WHAT_YOU_GET = [
  'Floor plan with tables spaced for service and access',
  'Run sheet with every beat of the day, timed',
  'A budget with typical costs for your size, in your currency',
  'Supplier checklist linked to the budget',
  'Safety docs and crew call times',
]

export const Onboarding = () => {
  const [type, setType] = useState<EventType>('wedding')
  const [guests, setGuests] = useState(120)
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [venue, setVenue] = useState<Venue>({ ...DEFAULT_VENUE })
  const [busy, setBusy] = useState(false)
  const [currency, setCurrency] = useState(localCurrency)
  const hasEvents = useEvent((s) => s.events.length > 0)

  const build = async (blank = false) => {
    if (!(await canCreateEvent())) return
    setBusy(true)
    const doc = blank ? blankEvent({ name: name || 'Untitled event', type, guestCount: guests, date, venue, currency }) : generateEvent({ type, name, date, guestCount: guests, venue, currency })
    await createAndOpen(doc)
    setBusy(false)
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-brand-50 to-slate-50">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:py-14 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-6 flex items-center gap-2">
            {hasEvents && (
              <button onClick={() => useUI.getState().setScreen('home')} className="mr-1 rounded-lg p-1.5 text-slate-500 hover:bg-white">
                <ArrowLeft size={18} />
              </button>
            )}
            <img src="/favicon.svg" className="h-8 w-8" alt="" />
            <span className="font-semibold">{BRAND}</span>
            <div className="flex-1" />
            <FeedbackButton />
            {hasEvents && (
              <Button size="sm" className="whitespace-nowrap" onClick={() => useUI.getState().setScreen('home')}>
                My events
              </Button>
            )}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your whole event, planned in 30 seconds.</h1>
          <p className="mt-2 text-slate-600">Four answers. We draft the floor plan, run sheet, budget and supplier list — you edit from there. No signup.</p>

          <div className="card mt-8 space-y-6 p-5 sm:p-6">
            <div>
              <label className="label">1 · What kind of event?</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                      type === t.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className={type === t.id ? 'text-brand-600' : 'text-slate-500'}>{t.icon}</span>
                    <span className="text-sm font-semibold">{EVENT_TEMPLATES[t.id].label}</span>
                    <span className="text-xs text-slate-500">{EVENT_TEMPLATES[t.id].blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">2 · How many guests?</label>
              <div className="flex flex-wrap items-center gap-2">
                <input type="number" min={1} className="input w-28 tabular-nums" value={guests || ''} onChange={(e) => setGuests(Math.max(0, parseInt(e.target.value) || 0))} />
                {QUICK.map((q) => (
                  <button key={q} onClick={() => setGuests(q)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${guests === q ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">3 · When?</label>
                <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Event name (optional)</label>
                <input className="input" value={name} placeholder={`${EVENT_TEMPLATES[type].label}${date ? ' ' + new Date(date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">4 · Where?</label>
              <VenueSearch value={venue.name} onPick={(p) => setVenue({ name: p.name, address: p.address, lat: p.lat, lng: p.lng, zoom: 18 })} />
              {venue.address && <p className="mt-1.5 truncate text-xs text-slate-500">{venue.address}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>Budget in</span>
              <Select value={currency} options={currencyOptions} onChange={setCurrency} className="max-w-[15rem]" />
              <span className="text-xs text-slate-400">You can change it later</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button variant="primary" className="px-5 py-2.5 text-base" onClick={() => build()} disabled={busy || guests < 1}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                Build my plan
              </Button>
              <button onClick={() => build(true)} className="text-sm text-slate-500 hover:text-slate-800">
                or start blank
              </button>
            </div>
          </div>
        </div>

        <aside className="hidden lg:block lg:pt-24">
          <div className="card p-5">
            <h3 className="text-sm font-semibold">You'll get a complete first draft</h3>
            <ul className="mt-3 space-y-2.5">
              {WHAT_YOU_GET.map((w) => (
                <li key={w} className="flex gap-2 text-sm text-slate-600">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  {w}
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">Got the venue's CAD drawing? Drop it in on the floor plan — DXF, DWG, PDF or a photo.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
