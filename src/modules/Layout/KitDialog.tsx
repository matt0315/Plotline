import { useState } from 'react'
import { Plus, Trash2, Pencil, Package } from 'lucide-react'
import type { KitEntry } from '../../types/event'
import { useEvent, useMoney } from '../../store/event'
import { useKit } from '../../store/kit'
import { ASSET_GROUPS } from '../../data/assets'
import { KIT_ICONS } from '../../data/assetIcons'
import { findBuiltIn, kitKey } from '../../data/library'
import { kitFor, kitRows } from '../../lib/kit'
import { currencyOptions, formatMoney } from '../../lib/money'
import { Button, Modal, NumberCell, Select, toast } from '../../components/ui'
import { StaticPlan, Glyph } from './render'
import { addFurniture } from './layoutActions'

type Draft = Omit<KitEntry, 'id' | 'updated'> & { id?: string }

const blank = (currency: string): Draft => ({ name: '', group: 'Décor', w: 1, d: 1, z: 1, shape: 'rect', color: '#e2e8f0', icon: 'Box', owned: 0, price: 0, currency, notes: '' })

/** Add or edit one of your own items. */
export const KitItemForm = ({ initial, onSave, onCancel }: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void }) => {
  const [f, setF] = useState(initial)
  const set = (p: Partial<Draft>) => setF((x) => ({ ...x, ...p }))
  const ok = f.name.trim().length > 1 && f.w > 0 && f.d > 0
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <StaticPlan
            items={[{ id: 'p', kind: 'asset', x: 0, y: 0, w: f.w, h: f.d, rotation: 0, label: '', seats: 0, color: f.color, layer: 'furniture', asset: { name: f.name, shape: f.shape, icon: f.icon } }]}
            spaces={[]}
            guests={[]}
            pad={0.2}
            className="h-14 w-14"
          />
        </div>
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Name, e.g. Rustic bar cart" value={f.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
          <Select value={f.group} options={[...ASSET_GROUPS]} onChange={(group) => set({ group })} className="w-full" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 sm:grid-cols-6">
        {(
          [
            ['w', 'Width (m)'],
            ['d', 'Depth (m)'],
            ['z', 'Height (m)'],
          ] as const
        ).map(([k, label]) => (
          <label key={k}>
            {label}
            <input type="number" min={0.05} step={0.05} className="input mt-0.5 py-1 tabular-nums" value={f[k]} onChange={(e) => set({ [k]: Math.max(0, parseFloat(e.target.value) || 0) })} />
          </label>
        ))}
        <label>
          Shape
          <Select
            value={f.shape}
            options={[
              { value: 'rect', label: 'Rectangle' },
              { value: 'round', label: 'Round' },
            ]}
            onChange={(shape) => set({ shape })}
            className="mt-0.5 w-full"
          />
        </label>
        <label>
          Colour
          <input type="color" className="mt-0.5 block h-8 w-full cursor-pointer rounded border border-slate-200 bg-white p-0.5" value={f.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label>
          Owned
          <input type="number" min={0} className="input mt-0.5 py-1 tabular-nums" value={f.owned} onChange={(e) => set({ owned: Math.max(0, parseInt(e.target.value) || 0) })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {KIT_ICONS.map((ic) => (
          <button key={ic} onClick={() => set({ icon: ic })} className={`flex h-8 w-8 items-center justify-center rounded-lg border ${f.icon === ic ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`} title={ic}>
            <svg viewBox="-0.6 -0.6 1.2 1.2" className="h-5 w-5">
              <Glyph name={ic} size={1} />
            </svg>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Price each</span>
        <input type="number" min={0} className="input w-24 py-1 tabular-nums" value={f.price} onChange={(e) => set({ price: Math.max(0, parseFloat(e.target.value) || 0) })} />
        <Select value={f.currency} options={currencyOptions} onChange={(currency) => set({ currency })} className="max-w-[10rem]" />
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!ok} onClick={() => onSave({ ...f, name: f.name.trim() })}>
          Save item
        </Button>
      </div>
    </div>
  )
}

/** Your kit: what this plan needs against what you own, your prices, and your own custom items. */
export const KitDialog = ({ onClose }: { onClose: () => void }) => {
  const d = useEvent((s) => s.doc)!
  const money = useMoney()
  const { entries, upsert, remove } = useKit()
  const [tab, setTab] = useState<'plan' | 'items'>('plan')
  const [editing, setEditing] = useState<Draft | null>(null)
  const rows = kitRows(d)
  const custom = entries.filter((e) => !e.libraryKey)
  const total = rows.reduce((s, r) => s + r.cost, 0)
  const short = rows.filter((r) => r.short > 0)

  /** Set stock or price for a plan line, creating the kit entry the first time. */
  const setLine = (key: string, label: string, patch: Partial<KitEntry>) => {
    const have = kitFor(key)
    if (have) return void upsert({ ...have, ...patch })
    const b = findBuiltIn(key)
    upsert({
      ...blank(d.currency),
      name: label,
      group: 'Library',
      w: b?.w ?? 0,
      d: b ? ('d' in b ? (b.d as number) : b.h) : 0,
      z: b ? ('z' in b ? (b.z as number) : (b.height ?? 0)) : 0,
      libraryKey: key,
      ...patch,
    })
  }

  return (
    <Modal open onClose={onClose} title="Your kit & prices" width="max-w-3xl">
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(
          [
            ['plan', 'This plan'],
            ['items', `Your own items · ${custom.length}`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === k ? 'bg-white shadow-sm' : 'text-slate-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'plan' ? (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Set what you own and what each costs to hire. Prices are remembered for every event, flow into the budget’s floor-plan line, and show what you’re short.
          </p>
          {!rows.length ? (
            <p className="py-8 text-center text-sm text-slate-400">Nothing on the floor plan yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="py-2 pr-2 text-left font-medium">Item</th>
                    <th className="w-14 px-2 text-right font-medium">Need</th>
                    <th className="w-20 px-2 text-right font-medium">Own</th>
                    <th className="w-16 px-2 text-right font-medium">Short</th>
                    <th className="w-28 px-2 text-right font-medium">Price each</th>
                    <th className="w-24 pl-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const k = kitFor(r.key)
                    return (
                      <tr key={r.key} className="border-b border-slate-50">
                        <td className="py-1 pr-2">{r.label}</td>
                        <td className="px-2 text-right tabular-nums">{r.qty}</td>
                        <td className="px-1">
                          <NumberCell value={k?.owned ?? 0} format={(n) => (k ? String(n) : '—')} onChange={(n) => setLine(r.key, r.label, { owned: Math.max(0, Math.round(n)) })} />
                        </td>
                        <td className={`px-2 text-right tabular-nums ${r.short ? 'font-medium text-amber-700' : 'text-slate-300'}`}>{k ? r.short || '✓' : ''}</td>
                        <td className="px-1">
                          <NumberCell
                            value={k?.price ?? 0}
                            format={(n) => (n ? formatMoney(n, k?.currency ?? d.currency, n % 1 !== 0) : '—')}
                            onChange={(n) => setLine(r.key, r.label, { price: Math.max(0, n), currency: k?.currency ?? d.currency })}
                          />
                        </td>
                        <td className="pl-2 text-right tabular-nums">{r.cost ? money(r.cost) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="pt-3 text-right text-xs text-slate-500">
                      {short.length ? `Short on ${short.length} line${short.length === 1 ? '' : 's'} · ` : ''}Floor-plan kit total
                    </td>
                    <td className="pt-3 pl-2 text-right font-semibold tabular-nums">{money(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">Your own pieces, at their real size. They appear first in the library and work in 3D, the load list and the budget.</p>
          {editing ? (
            <KitItemForm
              initial={editing}
              onCancel={() => setEditing(null)}
              onSave={(f) => {
                upsert(f)
                setEditing(null)
                toast(f.id ? 'Saved' : `${f.name} added to your kit`)
              }}
            />
          ) : (
            <Button onClick={() => setEditing(blank(d.currency))}>
              <Plus size={16} /> Add your own item
            </Button>
          )}
          <ul className="mt-3 divide-y divide-slate-100">
            {custom.map((k) => (
              <li key={k.id} className="flex items-center gap-3 py-2 text-sm">
                <svg viewBox="-0.6 -0.6 1.2 1.2" className="h-6 w-6 shrink-0">
                  <Glyph name={k.icon} size={1} />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {k.name}
                    {k.requestId && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">requested</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {k.group} · {k.w}×{k.d} m, {k.z} m high · own {k.owned}
                    {k.price ? ` · ${formatMoney(k.price, k.currency, k.price % 1 !== 0)} each` : ''}
                  </div>
                </div>
                <Button size="sm" onClick={() => (addFurniture(kitKey(k.id)), onClose())}>
                  Place
                </Button>
                <button onClick={() => setEditing({ ...k })} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit">
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Remove ${k.name} from your kit? Items already on plans stay.`)) remove(k.id)
                  }}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
            {!custom.length && !editing && (
              <li className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-400">
                <Package /> No items of your own yet.
              </li>
            )}
          </ul>
        </>
      )}
    </Modal>
  )
}
