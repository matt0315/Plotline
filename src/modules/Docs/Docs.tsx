import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, FileCheck2, PenLine, ClipboardList, Inbox, FileDown, Camera, QrCode, Download, Loader2 } from 'lucide-react'
import type { DocField, DocForm, DocResponse, FieldType, FieldValue } from '../../types/event'
import { useEvent, update } from '../../store/event'
import { useUI } from '../../store/ui'
import { gate } from '../../store/account'
import { DOC_TEMPLATES, fieldsFrom } from '../../data/docTemplates'
import { uid } from '../../lib/id'
import { download, slug } from '../../lib/share'
import { useAccount } from '../../store/account'
import { SignaturePad, compressPhoto } from '../../components/SignaturePad'
import { Button, Empty, IconButton, Modal, PageHeader, toast } from '../../components/ui'

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Short answer' },
  { value: 'longtext', label: 'Paragraph' },
  { value: 'choice', label: 'Multiple choice' },
  { value: 'checkbox', label: 'Tick box' },
  { value: 'date', label: 'Date' },
  { value: 'photo', label: 'Photo' },
  { value: 'signature', label: 'Signature' },
  { value: 'heading', label: 'Section heading' },
]

const editForm = (id: string, fn: (f: DocForm) => void, key?: string) =>
  update((d) => {
    const f = d.docs.find((x) => x.id === id)
    if (f) fn(f)
  }, key ? `doc-${key}-${id}` : undefined)

/* ---------- Builder ---------- */

const Builder = ({ form }: { form: DocForm }) => {
  const d = useEvent((s) => s.doc)!
  const field = (fid: string, fn: (f: DocField) => void, key: string) =>
    editForm(form.id, (f) => {
      const x = f.fields.find((y) => y.id === fid)
      if (x) fn(x)
    }, `${key}-${fid}`)
  const move = (i: number, dir: -1 | 1) =>
    editForm(form.id, (f) => {
      const j = i + dir
      if (j < 0 || j >= f.fields.length) return
      ;[f.fields[i], f.fields[j]] = [f.fields[j], f.fields[i]]
    })

  return (
    <div className="space-y-3">
      <input className="w-full rounded-md bg-transparent text-lg font-semibold outline-none focus:ring-2 focus:ring-brand-100" value={form.title} onChange={(e) => editForm(form.id, (f) => void (f.title = e.target.value), 'title')} />
      <textarea className="input h-16" placeholder="Description or instructions" value={form.description} onChange={(e) => editForm(form.id, (f) => void (f.description = e.target.value), 'desc')} />
      <label className="flex items-center gap-2 text-xs text-slate-500">
        Linked to
        <select
          className="input w-auto py-1 text-xs"
          value={form.attachedTo ? `${form.attachedTo.kind}:${form.attachedTo.id}` : ''}
          onChange={(e) =>
            editForm(form.id, (f) => {
              const [kind, id] = e.target.value.split(':')
              if (!kind) delete f.attachedTo
              else f.attachedTo = { kind: kind as 'supplier' | 'crew', id }
            })
          }
        >
          <option value="">Nothing</option>
          {d.suppliers.map((s) => (
            <option key={s.id} value={`supplier:${s.id}`}>
              Supplier · {s.name || s.category}
            </option>
          ))}
          {d.crew.map((c) => (
            <option key={c.id} value={`crew:${c.id}`}>
              Crew · {c.name || c.role}
            </option>
          ))}
        </select>
      </label>
      <ol className="space-y-2">
        {form.fields.map((f, i) => (
          <li key={f.id} className={`group rounded-xl border p-3 ${f.type === 'heading' ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input className="cell min-w-0 flex-1 basis-48 font-medium" value={f.label} placeholder="Question" onChange={(e) => field(f.id, (x) => void (x.label = e.target.value), 'label')} />
              <select className="cell w-40" value={f.type} onChange={(e) => field(f.id, (x) => void ((x.type = e.target.value as FieldType), x.type === 'choice' && !x.options?.length && (x.options = ['Yes', 'No'])), 'type')}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {f.type !== 'heading' && (
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input type="checkbox" className="accent-brand-600" checked={!!f.required} onChange={(e) => field(f.id, (x) => void (x.required = e.target.checked), 'req')} /> Required
                </label>
              )}
              <div className="flex">
                <IconButton onClick={() => move(i, -1)} disabled={i === 0}>
                  <ChevronUp size={15} />
                </IconButton>
                <IconButton onClick={() => move(i, 1)} disabled={i === form.fields.length - 1}>
                  <ChevronDown size={15} />
                </IconButton>
                <IconButton onClick={() => editForm(form.id, (x) => void (x.fields = x.fields.filter((y) => y.id !== f.id)))}>
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </div>
            {f.type === 'choice' && (
              <input
                className="cell mt-1 text-xs text-slate-500"
                value={(f.options ?? []).join(', ')}
                placeholder="Options, separated by commas"
                onChange={(e) =>
                  field(
                    f.id,
                    (x) =>
                      void (x.options = e.target.value
                        .split(',')
                        .map((o) => o.trim())
                        .filter((o, k, a) => o || k === a.length - 1)),
                    'opts',
                  )
                }
              />
            )}
          </li>
        ))}
      </ol>
      <Button onClick={() => editForm(form.id, (f) => void f.fields.push({ id: uid('f'), type: 'text', label: '' }))}>
        <Plus size={16} /> Add question
      </Button>
    </div>
  )
}

/* ---------- Fill ---------- */

const Fill = ({ form, onDone }: { form: DocForm; onDone: () => void }) => {
  const readOnly = useEvent((s) => s.readOnly)
  const shareToken = useUI((s) => s.shareToken)
  const [by, setBy] = useState('')
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [busy, setBusy] = useState(false)
  const set = (id: string, v: FieldValue) => setValues((x) => ({ ...x, [id]: v }))

  const submit = async () => {
    const missing = form.fields.find((f) => f.required && f.type !== 'heading' && !values[f.id])
    if (missing) return toast(`“${missing.label}” is required`)
    const response: DocResponse = { id: uid('r'), submittedAt: new Date().toISOString(), by: by || 'Anonymous', values }
    if (readOnly) {
      if (shareToken) {
        setBusy(true)
        try {
          const { submitSharedResponse } = await import('../../lib/share')
          await submitSharedResponse(shareToken, form.id, response)
        } catch {
          setBusy(false)
          return toast('Could not submit — try again')
        }
        setBusy(false)
        toast('Submitted — thank you')
      } else {
        const { exportResponse } = await import('../../lib/pdf')
        await exportResponse(form, response)
        toast("Saved as PDF — send it to the organiser")
      }
    } else {
      editForm(form.id, (f) => void f.responses.push(response))
      toast('Response saved')
    }
    setValues({})
    setBy('')
    onDone()
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">{form.title}</h2>
        {form.description && <p className="mt-1 text-sm text-slate-500">{form.description}</p>}
      </div>
      <label className="block">
        <span className="label">Your name</span>
        <input className="input" value={by} onChange={(e) => setBy(e.target.value)} />
      </label>
      {form.fields.map((f) => (
        <div key={f.id}>
          {f.type === 'heading' ? (
            <h3 className="border-b border-slate-200 pt-2 pb-1 text-sm font-semibold">{f.label}</h3>
          ) : f.type === 'checkbox' ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={!!values[f.id]} onChange={(e) => set(f.id, e.target.checked)} />
              {f.label}
              {f.required && <span className="text-red-500">*</span>}
            </label>
          ) : (
            <label className="block">
              <span className="label text-sm text-slate-700">
                {f.label} {f.required && <span className="text-red-500">*</span>}
              </span>
              {f.type === 'text' && <input className="input" value={(values[f.id] as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} />}
              {f.type === 'longtext' && <textarea className="input h-20" value={(values[f.id] as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} />}
              {f.type === 'date' && <input type="date" className="input" value={(values[f.id] as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} />}
              {f.type === 'choice' && (
                <div className="flex flex-wrap gap-2">
                  {(f.options ?? []).filter(Boolean).map((o) => (
                    <button type="button" key={o} onClick={() => set(f.id, o)} className={`rounded-full px-3 py-1.5 text-sm ${values[f.id] === o ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {f.type === 'photo' && (
                <div className="flex items-center gap-3">
                  <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                    <Camera size={16} /> {values[f.id] ? 'Retake' : 'Add photo'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) set(f.id, await compressPhoto(file))
                      }}
                    />
                  </span>
                  {values[f.id] && <img src={values[f.id] as string} className="h-14 rounded-md object-cover" alt="" />}
                </div>
              )}
              {f.type === 'signature' && <SignaturePad value={(values[f.id] as string) ?? ''} onChange={(v) => set(f.id, v)} />}
            </label>
          )}
        </div>
      ))}
      <Button variant="primary" className="w-full py-2.5" disabled={busy}>
        {busy && <Loader2 size={16} className="animate-spin" />} Submit
      </Button>
    </form>
  )
}

/* ---------- Responses ---------- */

const Responses = ({ form }: { form: DocForm }) => {
  const [open, setOpen] = useState<DocResponse | null>(null)
  const csv = () => {
    const cols = form.fields.filter((f) => f.type !== 'heading' && f.type !== 'photo' && f.type !== 'signature')
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const rows = [['Submitted', 'By', ...cols.map((c) => c.label)], ...form.responses.map((r) => [new Date(r.submittedAt).toLocaleString(), r.by, ...cols.map((c) => String(r.values[c.id] ?? ''))])]
    download(new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }), `${slug(form.title)}-responses.csv`)
  }
  if (!form.responses.length) return <Empty icon={<Inbox />} title="No responses yet" body="Fill it in here, or share the link with crew and they can complete it on their phone." />
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={csv}>
          <Download size={14} /> CSV
        </Button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {[...form.responses].reverse().map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpen(r)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50">
              <span className="font-medium">{r.by}</span>
              <span className="text-xs text-slate-500">{new Date(r.submittedAt).toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={`${form.title} — ${open.by}`}
          footer={
            <>
              <Button
                variant="danger"
                onClick={() => {
                  editForm(form.id, (f) => void (f.responses = f.responses.filter((x) => x.id !== open.id)))
                  setOpen(null)
                }}
              >
                Delete
              </Button>
              <Button variant="primary" onClick={async () => (await import('../../lib/pdf')).exportResponse(form, open)}>
                <FileDown size={16} /> PDF
              </Button>
            </>
          }
        >
          <dl className="space-y-3">
            {form.fields
              .filter((f) => f.type !== 'heading')
              .map((f) => {
                const v = open.values[f.id]
                return (
                  <div key={f.id}>
                    <dt className="text-xs text-slate-500">{f.label}</dt>
                    <dd className="text-sm">
                      {f.type === 'signature' || f.type === 'photo' ? v ? <img src={v as string} className="mt-1 max-h-40 rounded border border-slate-200" alt="" /> : '—' : typeof v === 'boolean' ? (v ? '✓ Yes' : '✗ No') : v || '—'}
                    </dd>
                  </div>
                )
              })}
          </dl>
          <p className="mt-4 text-xs text-slate-400">Submitted {new Date(open.submittedAt).toLocaleString()}</p>
        </Modal>
      )}
    </div>
  )
}

/* ---------- QR for crew ---------- */

const CrewLink = ({ form, onClose }: { form: DocForm; onClose: () => void }) => {
  const d = useEvent((s) => s.doc)!
  const [url, setUrl] = useState<string | null>(null)
  const [qr, setQr] = useState('')
  useEffect(() => {
    ;(async () => {
      const { currentShareToken, createCloudShare } = await import('../../lib/share')
      const token = (await currentShareToken(d.id)) ?? (await createCloudShare(d))
      const u = `${location.origin}/?s=${token}&form=${form.id}`
      setUrl(u)
      const QR = await import('qrcode')
      setQr(await QR.toDataURL(u, { margin: 1, width: 480 }))
    })().catch(() => toast('Could not create a link'))
  }, [d, form.id])
  return (
    <Modal open onClose={onClose} title={`Crew link — ${form.title}`} width="max-w-sm">
      {!url ? (
        <Loader2 className="mx-auto animate-spin text-slate-400" />
      ) : (
        <div className="text-center">
          {qr && <img src={qr} alt="QR code" className="mx-auto w-56" />}
          <p className="mt-3 text-sm text-slate-600">Print it on a clipboard or site sign. Crew scan, fill in, sign — no login.</p>
          <input className="input mt-3 text-xs" readOnly value={url} onFocus={(e) => e.target.select()} />
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" onClick={() => (navigator.clipboard.writeText(url), toast('Link copied'))}>
              Copy link
            </Button>
            {qr && (
              <Button size="sm" onClick={() => fetch(qr).then((r) => r.blob()).then((b) => download(b, `${slug(form.title)}-qr.png`))}>
                Download QR
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------- Page ---------- */

export default function Docs() {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const focusId = useUI((s) => s.focusId)
  const [sel, setSel] = useState<string | null>(focusId && d.docs.some((f) => f.id === focusId) ? focusId : d.docs[0]?.id ?? null)
  const [mode, setMode] = useState<'build' | 'fill' | 'responses'>(readOnly || focusId ? 'fill' : 'build')
  const [picking, setPicking] = useState(false)
  const [qr, setQr] = useState(false)
  const form = d.docs.find((f) => f.id === sel) ?? d.docs[0]

  // While Docs is open, keep pulling in crew submissions.
  useEffect(() => {
    if (readOnly) return
    const pull = () => import('../../store/responses').then(({ pullResponses }) => pullResponses(d.id).then((n) => n && toast(`${n} new response${n === 1 ? '' : 's'} from crew`)))
    pull()
    const t = setInterval(pull, 30000)
    return () => clearInterval(t)
  }, [d.id, readOnly])

  const create = (tplKey?: string) => {
    const tpl = DOC_TEMPLATES.find((t) => t.key === tplKey)
    const f: DocForm = { id: uid('d'), title: tpl?.title ?? 'Untitled form', description: tpl?.description ?? '', fields: tpl ? fieldsFrom(tpl) : [{ id: uid('f'), type: 'text', label: '' }], responses: [] }
    update((x) => void x.docs.push(f))
    setSel(f.id)
    setMode('build')
    setPicking(false)
  }

  // Crew arriving via a form link only need the form.
  if (readOnly && focusId && form)
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-5">
          <Fill form={form} onDone={() => {}} />
        </div>
      </div>
    )

  return (
    <div>
      <PageHeader
        title="Docs & forms"
        sub="Risk assessments, safety checks, crew sign-ins, delivery notes and sign-offs — filled on any phone, signed on screen."
        actions={
          !readOnly && (
            <Button variant="primary" onClick={() => setPicking(true)}>
              <Plus size={16} /> New form
            </Button>
          )
        }
      />
      {!d.docs.length ? (
        <div className="card">
          <Empty icon={<FileCheck2 />} title="No forms yet" body="Start from a template — risk assessment, site safety check, crew sign-in and more." action={!readOnly && <Button variant="primary" onClick={() => setPicking(true)}>Choose a template</Button>} />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[240px_1fr]">
          <ul className="card h-fit divide-y divide-slate-100 overflow-hidden">
            {d.docs.map((f) => (
              <li key={f.id}>
                <button onClick={() => setSel(f.id)} className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm ${form?.id === f.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50'}`}>
                  <FileCheck2 size={16} className="shrink-0 opacity-60" />
                  <span className="flex-1 truncate">{f.title}</span>
                  {f.responses.length > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{f.responses.length}</span>}
                </button>
              </li>
            ))}
          </ul>
          {form && (
            <div className="card p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-slate-100 pb-3">
                {(
                  [
                    ['build', 'Edit', <PenLine size={14} key="b" />],
                    ['fill', 'Fill in', <ClipboardList size={14} key="f" />],
                    ['responses', `Responses · ${form.responses.length}`, <Inbox size={14} key="r" />],
                  ] as const
                )
                  .filter(([k]) => !readOnly || k !== 'build')
                  .map(([k, label, icon]) => (
                    <button key={k} onClick={() => setMode(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                      {icon}
                      {label}
                    </button>
                  ))}
                <div className="flex-1" />
                {!readOnly && (
                  <>
                    <IconButton title="Crew link & QR code" onClick={() => (useAccount.getState().cloud ? gate('share') && setQr(true) : toast('Crew links need accounts, which aren’t available in this build'))}>
                      <QrCode size={16} />
                    </IconButton>
                    <IconButton title="Blank form PDF" onClick={async () => (await import('../../lib/pdf')).exportResponse(form, null)}>
                      <FileDown size={16} />
                    </IconButton>
                    <IconButton
                      title="Delete form"
                      onClick={() => {
                        if (!confirm(`Delete “${form.title}” and its responses?`)) return
                        update((x) => void (x.docs = x.docs.filter((f) => f.id !== form.id)))
                        setSel(null)
                      }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </>
                )}
              </div>
              {mode === 'build' && !readOnly && <Builder form={form} />}
              {mode === 'fill' && (
                <div className="mx-auto max-w-lg">
                  <Fill form={form} onDone={() => !readOnly && setMode('responses')} />
                </div>
              )}
              {mode === 'responses' && <Responses form={form} />}
            </div>
          )}
        </div>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title="New form" width="max-w-2xl">
        <div className="grid gap-2 sm:grid-cols-2">
          {DOC_TEMPLATES.map((t) => (
            <button key={t.key} onClick={() => create(t.key)} className="rounded-xl border border-slate-200 p-3 text-left hover:border-brand-300 hover:bg-brand-50/40">
              <div className="text-sm font-semibold">{t.title}</div>
              <div className="mt-0.5 text-xs text-slate-500">{t.description}</div>
              <div className="mt-1 text-[11px] text-slate-400">{t.fields.length} questions</div>
            </button>
          ))}
          <button onClick={() => create()} className="rounded-xl border-2 border-dashed border-slate-200 p-3 text-left hover:border-brand-300">
            <div className="text-sm font-semibold">Blank form</div>
            <div className="mt-0.5 text-xs text-slate-500">Build your own</div>
          </button>
        </div>
      </Modal>
      {qr && form && <CrewLink form={form} onClose={() => setQr(false)} />}
    </div>
  )
}
