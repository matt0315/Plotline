import { useState } from 'react'
import { Download, Loader2, FileJson, Crown } from 'lucide-react'
import { useEvent } from '../store/event'
import { useUI } from '../store/ui'
import { useAccount } from '../store/account'
import { exportPack, SECTION_LABELS, type Section } from '../lib/pdf'
import { exportJson } from '../lib/share'
import { Button, Modal, toast } from './ui'
import { startCheckout } from './Account'

const ORDER: Section[] = ['cover', 'layout', 'site', 'seating', 'run', 'suppliers', 'crew', 'budget', 'guests', 'load', 'placecards']

export default function ExportDialog() {
  const d = useEvent((s) => s.doc)!
  const isPro = useAccount((s) => s.isPro)
  const close = () => useUI.getState().set({ exportOpen: false })
  const available = (s: Section) =>
    s === 'site' ? d.site.items.length + d.site.zones.length > 0 : s === 'seating' || s === 'placecards' ? d.guests.some((g) => g.seat) : s === 'guests' ? d.guests.length > 0 : s === 'crew' ? d.crew.length > 0 : s === 'suppliers' ? d.suppliers.length > 0 : s === 'budget' ? d.budget.length > 0 : true
  const [picked, setPicked] = useState<Set<Section>>(new Set(ORDER.filter((s) => available(s) && s !== 'placecards' && s !== 'guests')))
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true)
    try {
      await exportPack(
        d,
        ORDER.filter((s) => picked.has(s)),
      )
      close()
    } catch (e) {
      console.error(e)
      toast('Export failed — try fewer sections')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={close}
      title="Export event pack"
      footer={
        <>
          <Button onClick={() => exportJson(d)} className="mr-auto">
            <FileJson size={16} /> Backup file
          </Button>
          <Button variant="primary" onClick={go} disabled={busy || !picked.size}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">One PDF with everything the team needs on the day. Pick what to include:</p>
      <div className="grid grid-cols-2 gap-1.5">
        {ORDER.map((s) => {
          const ok = available(s)
          return (
            <label key={s} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ok ? 'cursor-pointer border-slate-200 hover:bg-slate-50' : 'border-slate-100 text-slate-400'}`}>
              <input
                type="checkbox"
                className="accent-brand-600"
                disabled={!ok}
                checked={picked.has(s)}
                onChange={(e) =>
                  setPicked((x) => {
                    const n = new Set(x)
                    if (e.target.checked) n.add(s)
                    else n.delete(s)
                    return n
                  })
                }
              />
              {SECTION_LABELS[s]}
            </label>
          )
        })}
      </div>
      {!isPro && (
        <button onClick={startCheckout} className="mt-4 flex w-full items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-left text-xs text-brand-800">
          <Crown size={14} /> Free exports carry a small watermark. Upgrade to remove it.
        </button>
      )}
    </Modal>
  )
}
