import { useEffect } from 'react'
import { Plus, Trash2, HardHat, FileDown, Wallet } from 'lucide-react'
import type { CrewMember } from '../../types/event'
import { useEvent, update } from '../../store/event'
import { useUI } from '../../store/ui'
import { crewCost } from '../../lib/derived'
import { hoursBetween } from '../../lib/time'
import { money } from '../../lib/money'
import { uid } from '../../lib/id'
import { Button, Cell, Empty, IconButton, NumberCell, PageHeader, focusSoon } from '../../components/ui'

const ROLES = ['Event manager', 'Coordinator', 'Stage manager', 'Site manager', 'Production manager', 'AV tech', 'Bar staff', 'Wait staff', 'Chef', 'Runner', 'Security', 'Steward', 'First aider', 'Registration', 'Driver', 'Rigger']

const edit = (id: string, fn: (c: CrewMember) => void, key: string) =>
  update((d) => {
    const c = d.crew.find((x) => x.id === id)
    if (c) fn(c)
  }, `crew-${key}-${id}`)

export default function Crew() {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const focusId = useUI((s) => s.focusId)
  const total = crewCost(d)
  const hours = d.crew.reduce((s, c) => s + hoursBetween(c.callTime, c.finishTime), 0)
  const inBudget = d.budget.some((b) => b.source === 'crew')

  useEffect(() => {
    if (focusId) requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`#crew-${focusId} input`)?.focus())
  }, [focusId])

  const add = () => {
    const last = d.crew[d.crew.length - 1]
    const c: CrewMember = { id: uid('c'), name: '', role: '', phone: '', email: '', callTime: last?.callTime ?? d.startTime, finishTime: last?.finishTime ?? '', rate: last?.rate ?? 0, notes: '' }
    update((x) => void x.crew.push(c))
    focusSoon(`#crew-${c.id} input`)
  }

  return (
    <div>
      <PageHeader
        title="Crew"
        sub={`${d.crew.length} people · ${hours.toFixed(1)} hours · ${money(total)} — call times appear on the run sheet`}
        actions={
          <>
            <Button onClick={async () => (await import('../../lib/pdf')).exportPack(d, ['crew'])} disabled={!d.crew.length}>
              <FileDown size={16} /> Call sheet
            </Button>
            {!readOnly && (
              <Button variant="primary" onClick={add}>
                <Plus size={16} /> Add crew
              </Button>
            )}
          </>
        }
      />
      {!inBudget && total > 0 && !readOnly && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-3 text-sm">
          <Wallet size={16} className="text-brand-600" />
          <span className="flex-1">Crew costs {money(total)} but isn't in your budget yet.</span>
          <Button size="sm" onClick={() => update((x) => void x.budget.push({ id: uid('b'), category: 'Staffing', name: 'Crew', estimate: total, actual: 0, paid: 0, source: 'crew' }))}>
            Add to budget
          </Button>
        </div>
      )}
      <datalist id="roles">
        {ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {!d.crew.length ? (
        <div className="card">
          <Empty icon={<HardHat />} title="No crew yet" body="Add your team with call and finish times. Their calls go on the run sheet; hours × rate goes in the budget." action={!readOnly && <Button variant="primary" onClick={add}>Add crew</Button>} />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className={`w-full min-w-[860px] text-sm ${readOnly ? 'pointer-events-none' : ''}`}>
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Mobile</th>
                <th className="w-28 px-3 py-2 font-medium">Call</th>
                <th className="w-28 px-3 py-2 font-medium">Finish</th>
                <th className="w-16 px-3 py-2 text-right font-medium">Hours</th>
                <th className="w-24 px-3 py-2 text-right font-medium">$/hr</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Cost</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {[...d.crew]
                .sort((a, b) => a.callTime.localeCompare(b.callTime))
                .map((c) => {
                  const h = hoursBetween(c.callTime, c.finishTime)
                  return (
                    <tr key={c.id} id={`crew-${c.id}`} className={`group border-b border-slate-100 last:border-0 ${focusId === c.id ? 'bg-brand-50' : ''}`}>
                      <td className="px-1 py-0.5">
                        <Cell value={c.name} placeholder="Name" onChange={(v) => edit(c.id, (x) => void (x.name = v), 'name')} />
                      </td>
                      <td className="px-1">
                        <input className="cell" list="roles" value={c.role} placeholder="Role" onChange={(e) => edit(c.id, (x) => void (x.role = e.target.value), 'role')} />
                      </td>
                      <td className="px-1">
                        <Cell value={c.phone} type="tel" placeholder="—" onChange={(v) => edit(c.id, (x) => void (x.phone = v), 'phone')} />
                      </td>
                      <td className="px-1">
                        <input type="time" className="cell tabular-nums" value={c.callTime} onChange={(e) => edit(c.id, (x) => void (x.callTime = e.target.value), 'call')} />
                      </td>
                      <td className="px-1">
                        <input type="time" className="cell tabular-nums" value={c.finishTime} onChange={(e) => edit(c.id, (x) => void (x.finishTime = e.target.value), 'fin')} />
                      </td>
                      <td className="px-3 text-right text-slate-500 tabular-nums">{h ? h.toFixed(1) : '—'}</td>
                      <td className="px-1">
                        <NumberCell value={c.rate} format={(n) => (n ? money(n) : '—')} onChange={(n) => edit(c.id, (x) => void (x.rate = n), 'rate')} />
                      </td>
                      <td className="px-3 text-right font-medium tabular-nums">{h * c.rate ? money(h * c.rate) : '—'}</td>
                      <td>
                        <IconButton className="opacity-0 group-hover:opacity-100 max-sm:opacity-100" onClick={() => update((x) => void (x.crew = x.crew.filter((y) => y.id !== c.id)))}>
                          <Trash2 size={14} />
                        </IconButton>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
            <tfoot className="border-t border-slate-200 text-sm font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={5}>
                  Total
                </td>
                <td className="px-3 text-right tabular-nums">{hours.toFixed(1)}</td>
                <td />
                <td className="px-3 text-right tabular-nums">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
