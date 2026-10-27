import { useEffect, useState } from 'react'
import { Copy, Link2Off, Loader2, Mail, Settings2 } from 'lucide-react'
import type { Pack, PackAudience, PackOptions } from '../types/event'
import { useEvent } from '../store/event'
import { useUI } from '../store/ui'
import { defaultOptions, packAudiences } from '../lib/packs'
import { deletePack, listPacks, packUrl, savePack } from '../lib/share'
import { Button, IconButton, toast } from './ui'

const OPTION_LABEL: [keyof PackOptions, string, string][] = [
  ['floor', 'Floor plan', 'Including 3D'],
  ['site', 'Site map', ''],
  ['run', 'Full run sheet', 'Not just their times'],
  ['load', 'Load list', 'For hire companies'],
  ['dietary', 'Dietary needs by table', 'Counts only, no names'],
  ['contacts', 'Contacts', 'Other suppliers’ and crew phone numbers'],
]

const GROUPS: [PackAudience['kind'], string][] = [
  ['supplier', 'Suppliers'],
  ['team', 'Crew teams'],
  ['crew', 'People'],
]

const keyOf = (a: Pick<PackAudience, 'kind' | 'id'>) => `${a.kind}:${a.id}`

/** One live link per supplier, team or person, showing only their part of the event. */
export const PacksPanel = () => {
  const d = useEvent((s) => s.doc)!
  const focus = useUI((s) => s.packFocus)
  const [packs, setPacks] = useState<Map<string, Pack> | null>(null)
  const [open, setOpen] = useState<string | null>(focus)
  const [busy, setBusy] = useState<string | null>(null)
  // Choices made before a link exists.
  const [drafts, setDrafts] = useState<Map<string, PackOptions>>(new Map())

  useEffect(() => {
    listPacks(d.id).then((list) => setPacks(new Map(list.map((p) => [keyOf(p.audience), p]))))
  }, [d.id])

  const save = async (a: PackAudience, opts: PackOptions) => {
    const k = keyOf(a)
    setBusy(k)
    try {
      // The pack reads the saved event, so make sure the latest version is in the cloud first.
      const { storage } = await import('../store/persistence')
      await storage().saveEvent(useEvent.getState().doc!)
      const p = await savePack(d.id, a, opts)
      setPacks((m) => new Map(m).set(k, p))
      return p
    } catch {
      toast('Could not save the pack')
    } finally {
      setBusy(null)
    }
  }

  const copy = (p: Pack) => {
    navigator.clipboard.writeText(packUrl(p.token))
    toast(`Link for ${p.audience.label} copied`)
  }

  const email = (a: PackAudience, p: Pack) => {
    const to = a.kind === 'supplier' ? d.suppliers.find((s) => s.id === a.id)?.email : a.kind === 'crew' ? d.crew.find((c) => c.id === a.id)?.email : ''
    const subject = `${d.name}: your plan`
    const body = `Hi,\n\nHere's everything you need for ${d.name} — your times, the plan and anything to fill in. It stays up to date, so keep the link handy:\n\n${packUrl(p.token)}\n\nThanks!`
    location.href = `mailto:${to ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const audiences = packAudiences(d)
  if (!packs)
    return (
      <div className="flex justify-center py-8 text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  if (!audiences.length) return <p className="py-4 text-sm text-slate-600">Add suppliers or build a crew roster first — each one can then get their own pack.</p>

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        A live link for each supplier, team or person with just their times, their forms and the extras you tick. Guest names, the budget and quotes are never included.
      </p>
      <div className="scroll-thin -mx-1 max-h-[55vh] space-y-4 overflow-y-auto px-1">
        {GROUPS.map(([kind, title]) => {
          const list = audiences.filter((a) => a.kind === kind)
          if (!list.length) return null
          return (
            <div key={kind}>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {list.map((a) => {
                  const k = keyOf(a)
                  const p = packs.get(k)
                  const opts = p?.opts ?? drafts.get(k) ?? defaultOptions(d, a)
                  return (
                    <li key={k} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.label}</span>
                        {busy === k && <Loader2 size={14} className="animate-spin text-slate-400" />}
                        {p ? (
                          <>
                            <IconButton title="Email the link" onClick={() => email(a, p)}>
                              <Mail size={15} />
                            </IconButton>
                            <IconButton title="What's included" active={open === k} onClick={() => setOpen(open === k ? null : k)}>
                              <Settings2 size={15} />
                            </IconButton>
                            <Button size="sm" onClick={() => copy(p)}>
                              <Copy size={14} /> Copy link
                            </Button>
                          </>
                        ) : (
                          <>
                            <IconButton title="What's included" active={open === k} onClick={() => setOpen(open === k ? null : k)}>
                              <Settings2 size={15} />
                            </IconButton>
                            <Button size="sm" variant="primary" disabled={busy === k} onClick={async () => (await save(a, opts)) && setOpen(null)}>
                              Create link
                            </Button>
                          </>
                        )}
                      </div>
                      {open === k && (
                        <div className="mt-2 grid gap-1 rounded-lg bg-slate-50 p-2 sm:grid-cols-2">
                          {OPTION_LABEL.map(([o, label, hint]) => (
                            <label key={o} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-white">
                              <input
                                type="checkbox"
                                className="mt-0.5 accent-brand-600"
                                checked={opts[o]}
                                onChange={(e) => {
                                  const next = { ...opts, [o]: e.target.checked }
                                  if (p) save(a, next)
                                  else setDrafts((m) => new Map(m).set(k, next))
                                }}
                              />
                              <span>
                                {label}
                                {hint && <span className="block text-xs text-slate-500">{hint}</span>}
                              </span>
                            </label>
                          ))}
                          {p && (
                            <button
                              className="flex items-center gap-1 px-1.5 py-1 text-xs text-red-600 hover:underline sm:col-span-2"
                              onClick={async () => {
                                await deletePack(d.id, p.token)
                                setPacks((m) => {
                                  const n = new Map(m)
                                  n.delete(k)
                                  return n
                                })
                                toast('Link turned off')
                              }}
                            >
                              <Link2Off size={12} /> Turn off this link
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
