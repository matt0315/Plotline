import { useEffect, useRef } from 'react'
import {
  Trash2,
  Copy,
  RotateCw,
  Lock,
  Unlock,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlertTriangle,
  RectangleHorizontal,
  RectangleVertical,
  Plus,
  X,
  Ruler,
  Move,
  Upload,
  Eye,
  EyeOff,
} from 'lucide-react'
import type { Layer, LayoutItem } from '../../types/event'
import { useEvent, update } from '../../store/event'
import { usePlan } from '../../store/plans'
import { KIND_LABEL } from '../../data/furniture'
import { clearanceIssues, isSeating, chairBlockSize, fmtFt, seatsLocal, WALKWAY_MIN } from '../../lib/geometry'
import { runOf } from '../../lib/runs'
import { seatMap, seatKey, seatingStats } from '../../lib/derived'
import { uid } from '../../lib/id'
import { STAGE_HEIGHTS, deckDims, isDeckStage, stageKit, stageSize } from '../../lib/staging'
import { useLayoutView } from './viewStore'
import { addTablesForShortfall, align, deleteItems, distribute, duplicateItems, extendRun, rotateBy } from './layoutActions'
import { seatGuest } from '../Guests/guestActions'
import { Button, IconButton, NumberCell, toast } from '../../components/ui'

const SWATCHES = ['#ffffff', '#f1f5f9', '#fef3c7', '#fde68a', '#fed7aa', '#fecdd3', '#fbcfe8', '#ddd6fe', '#c7d2fe', '#bae6fd', '#bbf7d0', '#cbd5e1', '#334155']
const LAYERS: Layer[] = ['structure', 'furniture', 'decor']

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2">
    <span className="w-20 shrink-0 text-xs text-slate-500">{label}</span>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

const Section = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="border-b border-slate-100 px-4 py-3">
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{title}</h3>
      {action}
    </div>
    <div className="space-y-2">{children}</div>
  </section>
)

const edit = (id: string, fn: (i: LayoutItem) => void, key: string) =>
  update((d) => {
    const i = d.layout.items.find((x) => x.id === id)
    if (i) fn(i)
  }, `${key}-${id}`)

/** Stages are sized in whole decks, so plans match the hire stock exactly. */
const StageControls = ({ item }: { item: LayoutItem }) => {
  const d = item.decks!
  const kit = stageKit(item)!
  const k = deckDims(d)
  const setDecks = (next: typeof d) =>
    edit(
      item.id,
      (i) => {
        i.decks = next
        Object.assign(i, stageSize(next))
      },
      'decks',
    )
  const Stepper = ({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) => (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex items-center gap-1">
        <IconButton onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1}>
          −
        </IconButton>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">{value}</span>
        <IconButton onClick={() => onChange(Math.min(30, value + 1))}>+</IconButton>
      </div>
    </div>
  )
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Stepper label="Decks across" value={d.across} onChange={(n) => setDecks({ ...d, across: n })} />
        <Stepper label="Decks deep" value={d.deep} onChange={(n) => setDecks({ ...d, deep: n })} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Decks {k.x} × {k.y} m
        </span>
        <button
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-brand-700 hover:bg-white"
          title="Turn the decks 90°"
          onClick={() => setDecks({ ...d, turned: !d.turned })}
        >
          {d.turned ? <RectangleVertical size={14} /> : <RectangleHorizontal size={14} />} Turn decks
        </button>
      </div>
      <label className="block text-xs text-slate-500">
        Height
        <select
          className="input mt-1 py-1.5"
          value={item.height ?? 0.4}
          onChange={(e) => edit(item.id, (i) => void (i.height = parseFloat(e.target.value)), 'height')}
        >
          {STAGE_HEIGHTS.map((h) => (
            <option key={h.m} value={h.m}>
              {h.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm font-medium">
        {item.w.toFixed(2)} × {item.h.toFixed(2)} m <span className="font-normal text-slate-500">· {fmtFt(item.w)} × {fmtFt(item.h)}</span>
      </p>
      <ul className="space-y-0.5 text-xs text-slate-600">
        <li>
          {kit.decks} deck{kit.decks === 1 ? '' : 's'} · {kit.legs} legs at {Math.round(kit.height * 1000)} mm
        </li>
        <li>{kit.treads ? `${kit.treads} set${kit.treads === 1 ? '' : 's'} of stage stairs` : 'No stairs needed at this height'}</li>
        <li>{kit.skirting} m of skirting (front and sides)</li>
      </ul>
      {kit.needsRail && (
        <p className="flex gap-1.5 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          At this height, open sides usually need handrails or edge protection — check your local rules.
        </p>
      )}
    </div>
  )
}

/** Trestles butted end to end: the whole run's size and seats, and one tap to add another. */
const RunControls = ({ item }: { item: LayoutItem }) => {
  const items = useEvent((s) => s.doc!.layout.items)
  const run = runOf(items, item.id)
  const seats = run.reduce((n, t) => n + seatsLocal(t).length, 0)
  const length = run.reduce((n, t) => n + Math.max(t.w, t.h), 0)
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
      {run.length > 1 ? (
        <>
          Run of <strong className="text-slate-800">{run.length}</strong> · {length.toFixed(1)} m · <strong className="text-slate-800">{seats}</strong> seats
        </>
      ) : (
        'Drag another trestle onto either end to join them into one long table.'
      )}
      <Button size="sm" className="mt-2 w-full" onClick={() => extendRun(item.id)}>
        <Plus size={14} /> Add a trestle to the run
      </Button>
    </div>
  )
}

const Single = ({ item }: { item: LayoutItem }) => {
  const guests = useEvent((s) => s.doc!.guests)
  const seats = seatMap(guests)
  const label = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const f = () => label.current?.focus()
    window.addEventListener('focus-label', f)
    return () => window.removeEventListener('focus-label', f)
  }, [])

  return (
    <>
      <Section title={item.asset?.name ?? (item.joinable ? 'Trestle' : KIND_LABEL[item.kind])}>
        <input ref={label} className="input" placeholder="Label" value={item.label} onChange={(e) => edit(item.id, (i) => void (i.label = e.target.value), 'label')} />
        {item.kind === 'chair-block' ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              Rows
              <input
                type="number"
                min={1}
                className="input mt-1"
                value={item.rows ?? 1}
                onChange={(e) =>
                  edit(
                    item.id,
                    (i) => {
                      i.rows = Math.max(1, parseInt(e.target.value) || 1)
                      Object.assign(i, chairBlockSize(i.rows, i.cols ?? 1))
                      i.seats = i.rows * (i.cols ?? 1)
                    },
                    'rows',
                  )
                }
              />
            </label>
            <label className="text-xs text-slate-500">
              Per row
              <input
                type="number"
                min={1}
                className="input mt-1"
                value={item.cols ?? 1}
                onChange={(e) =>
                  edit(
                    item.id,
                    (i) => {
                      i.cols = Math.max(1, parseInt(e.target.value) || 1)
                      Object.assign(i, chairBlockSize(i.rows ?? 1, i.cols))
                      i.seats = (i.rows ?? 1) * i.cols
                    },
                    'cols',
                  )
                }
              />
            </label>
          </div>
        ) : (
          isSeating(item) &&
          item.kind !== 'chair' && (
            <Row label="Seats">
              <div className="flex items-center gap-1">
                <IconButton onClick={() => edit(item.id, (i) => void (i.seats = Math.max(0, i.seats - 1)), 'seats')}>−</IconButton>
                <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.seats}</span>
                <IconButton onClick={() => edit(item.id, (i) => void (i.seats = Math.min(40, i.seats + 1)), 'seats')}>+</IconButton>
              </div>
            </Row>
          )
        )}
        {isDeckStage(item) && <StageControls item={item} />}
        {item.joinable && <RunControls item={item} />}
        {item.kind === 'asset' && (
          <Row label="Height">
            <div className="input w-24 p-0">
              <NumberCell value={item.height ?? 1} format={(n) => `${n.toFixed(2)} m`} onChange={(n) => edit(item.id, (i) => void (i.height = Math.max(0, Math.min(30, n))), 'height')} />
            </div>
          </Row>
        )}
        {item.kind !== 'chair-block' && !isDeckStage(item) && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              {item.kind === 'round-table' || item.kind === 'cocktail-table' ? 'Diameter (m)' : 'Width (m)'}
              <div className="input mt-1 p-0">
                <NumberCell
                  value={item.w}
                  format={(n) => n.toFixed(2)}
                  onChange={(n) =>
                    edit(
                      item.id,
                      (i) => {
                        i.w = Math.max(0.1, n)
                        if (i.kind === 'round-table' || i.kind === 'cocktail-table' || i.kind === 'pillar' || i.kind === 'plant') i.h = i.w
                      },
                      'w',
                    )
                  }
                />
              </div>
              <span className="text-[10px] text-slate-400">{fmtFt(item.w)}</span>
            </label>
            {!(item.kind === 'round-table' || item.kind === 'cocktail-table' || item.kind === 'pillar' || item.kind === 'plant') && (
              <label className="text-xs text-slate-500">
                Depth (m)
                <div className="input mt-1 p-0">
                  <NumberCell value={item.h} format={(n) => n.toFixed(2)} onChange={(n) => edit(item.id, (i) => void (i.h = Math.max(0.05, n)), 'h')} />
                </div>
                <span className="text-[10px] text-slate-400">{fmtFt(item.h)}</span>
              </label>
            )}
          </div>
        )}
        <Row label="Rotation">
          <div className="flex items-center gap-1">
            <input
              type="range"
              min={0}
              max={359}
              step={15}
              value={item.rotation}
              onChange={(e) => edit(item.id, (i) => void (i.rotation = parseInt(e.target.value)), 'rot')}
              className="flex-1 accent-brand-600"
            />
            <span className="w-9 text-right text-xs tabular-nums">{Math.round(item.rotation)}°</span>
          </div>
        </Row>
        {item.kind !== 'label' && (
          <Row label="Colour">
            <div className="flex flex-wrap gap-1">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => edit(item.id, (i) => void (i.color = c), 'color')}
                  className={`h-5 w-5 rounded-full border ${item.color === c ? 'ring-2 ring-brand-500 ring-offset-1' : 'border-slate-300'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Row>
        )}
        <Row label="Layer">
          <div className="flex gap-1">
            {LAYERS.map((l) => (
              <button key={l} onClick={() => edit(item.id, (i) => void (i.layer = l), 'layer')} className={`rounded-md px-2 py-1 text-xs capitalize ${item.layer === l ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                {l}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {isSeating(item) && item.seats > 0 && item.kind !== 'chair-block' && (
        <Section title={`Seated ${[...Array(item.seats).keys()].filter((i) => seats.has(seatKey(item.id, i))).length} / ${item.seats}`}>
          <ul className="space-y-0.5">
            {[...Array(item.seats).keys()].map((i) => {
              const g = seats.get(seatKey(item.id, i))
              return (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-right text-xs text-slate-400 tabular-nums">{i + 1}</span>
                  {g ? (
                    <>
                      <span className="flex-1 truncate">{g.name}</span>
                      {g.dietary && <span className="truncate text-[10px] text-amber-700">{g.dietary}</span>}
                      <button onClick={() => seatGuest(g.id, undefined)} className="text-slate-400 hover:text-red-500" title="Unseat">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <span className="flex-1 text-xs text-slate-400">Empty — drag a guest here</span>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
      )}
    </>
  )
}

const Multi = ({ items }: { items: LayoutItem[] }) => {
  const ids = items.map((i) => i.id)
  const seats = items.filter(isSeating).reduce((s, i) => s + i.seats, 0)
  return (
    <Section title={`${items.length} selected`}>
      <p className="text-xs text-slate-500">{seats ? `${seats} seats` : 'No seating'}</p>
      <div className="flex flex-wrap gap-0.5">
        <IconButton title="Align left" onClick={() => align(ids, 'left')}>
          <AlignStartVertical size={16} />
        </IconButton>
        <IconButton title="Align centre" onClick={() => align(ids, 'hcenter')}>
          <AlignCenterVertical size={16} />
        </IconButton>
        <IconButton title="Align right" onClick={() => align(ids, 'right')}>
          <AlignEndVertical size={16} />
        </IconButton>
        <IconButton title="Align top" onClick={() => align(ids, 'top')}>
          <AlignStartHorizontal size={16} />
        </IconButton>
        <IconButton title="Align middle" onClick={() => align(ids, 'vcenter')}>
          <AlignCenterHorizontal size={16} />
        </IconButton>
        <IconButton title="Align bottom" onClick={() => align(ids, 'bottom')}>
          <AlignEndHorizontal size={16} />
        </IconButton>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => distribute(ids, 'x')} disabled={items.length < 3}>
          Space evenly ↔
        </Button>
        <Button size="sm" onClick={() => distribute(ids, 'y')} disabled={items.length < 3}>
          Space evenly ↕
        </Button>
      </div>
      <Row label="Colour">
        <div className="flex flex-wrap gap-1">
          {SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() =>
                update((d) => {
                  for (const i of d.layout.items) if (ids.includes(i.id)) i.color = c
                })
              }
              className="h-5 w-5 rounded-full border border-slate-300"
              style={{ background: c }}
            />
          ))}
        </div>
      </Row>
    </Section>
  )
}

const Nothing = ({ onImport }: { onImport: () => void }) => {
  const d = useEvent((s) => s.doc)!
  const { hidden, set, showSeats } = useLayoutView()
  const plan = usePlan(d.layout.basePlan?.planId)
  const issues = clearanceIssues(d.layout.items)
  const st = seatingStats(d)
  const name = (id: string) => {
    const i = d.layout.items.find((x) => x.id === id)
    return i ? i.label || KIND_LABEL[i.kind] : '?'
  }

  return (
    <>
      <Section title="Capacity">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums">{st.capacity}</span>
          <span className="text-xs text-slate-500">seats for {d.guestCount} guests</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${st.capacity >= d.guestCount ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (st.capacity / Math.max(1, d.guestCount)) * 100)}%` }} />
        </div>
        {st.capacity < d.guestCount && d.type !== 'festival' && (
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              const n = addTablesForShortfall()
              toast(`Added ${n} table${n === 1 ? '' : 's'} of 10`)
            }}
          >
            <Plus size={14} /> Add tables for the other {d.guestCount - st.capacity}
          </Button>
        )}
      </Section>

      <Section title={issues.length ? `Spacing · ${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Spacing'}>
        {issues.length ? (
          <ul className="space-y-1.5">
            {issues.slice(0, 8).map((x, k) => (
              <li key={k}>
                <button onClick={() => useLayoutView.getState().select([x.a, x.b])} className="flex w-full items-start gap-2 text-left text-xs text-slate-600 hover:text-slate-900">
                  <AlertTriangle size={14} className="mt-px shrink-0 text-red-500" />
                  <span>
                    {x.kind === 'exit'
                      ? `${name(x.b)} blocks ${name(x.a)}`
                      : x.kind === 'overlap'
                        ? `${name(x.a)} overlaps ${name(x.b)}`
                        : `${name(x.a)} ↔ ${name(x.b)}: ${x.gap.toFixed(2)} m gap (min ${WALKWAY_MIN} m)`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-emerald-700">Walkways and exits are clear.</p>
        )}
      </Section>

      <Section title="Venue drawing">
        {plan && d.layout.basePlan ? (
          <>
            <p className="truncate text-sm font-medium">{plan.name}</p>
            <p className="text-xs text-slate-500">
              {(plan.natW * plan.metersPerPx).toFixed(1)} × {(plan.natH * plan.metersPerPx).toFixed(1)} m ·{' '}
              {plan.calibratedBy === 'guess' ? <span className="text-amber-700">scale not set</span> : `scale from ${plan.calibratedBy === 'units' ? 'file' : 'you'}`}
            </p>
            <Row label="Opacity">
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={d.layout.basePlan.opacity}
                className="w-full accent-brand-600"
                onChange={(e) =>
                  update((dd) => {
                    if (dd.layout.basePlan) dd.layout.basePlan.opacity = parseFloat(e.target.value)
                  }, 'plan-opacity')
                }
              />
            </Row>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={plan.calibratedBy === 'guess' ? 'primary' : 'secondary'} onClick={() => set({ tool: 'calibrate', measure: null })}>
                <Ruler size={14} /> Set scale
              </Button>
              <Button size="sm" onClick={() => set({ tool: 'moveplan' })}>
                <Move size={14} /> Move
              </Button>
              <Button size="sm" variant="danger" onClick={() => update((dd) => void delete dd.layout.basePlan)}>
                Remove
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">Drop the venue's CAD file, PDF or a photo of the floor plan and design on top of it.</p>
            <Button size="sm" onClick={onImport}>
              <Upload size={14} /> Import venue drawing
            </Button>
          </>
        )}
      </Section>

      <Section
        title="Rooms"
        action={
          <IconButton
            title="Add room"
            onClick={() =>
              update((dd) => void dd.layout.spaces.push({ id: uid('s'), name: `Room ${dd.layout.spaces.length + 1}`, x: 10, y: 8, w: 20, h: 16 }))
            }
          >
            <Plus size={14} />
          </IconButton>
        }
      >
        {d.layout.spaces.map((s) => (
          <div key={s.id} className="space-y-1 rounded-lg bg-slate-50 p-2">
            <div className="flex items-center gap-1">
              <input
                className="cell font-medium"
                value={s.name}
                onChange={(e) =>
                  update((dd) => {
                    const x = dd.layout.spaces.find((y) => y.id === s.id)
                    if (x) x.name = e.target.value
                  }, `space-name-${s.id}`)
                }
              />
              <IconButton onClick={() => update((dd) => void (dd.layout.spaces = dd.layout.spaces.filter((y) => y.id !== s.id)))}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs text-slate-500">
              {(['w', 'h'] as const).map((k) => (
                <label key={k} className="flex items-center gap-1">
                  {k === 'w' ? 'W' : 'D'}
                  <NumberCell
                    value={s[k]}
                    format={(n) => `${n.toFixed(1)} m`}
                    onChange={(n) =>
                      update((dd) => {
                        const x = dd.layout.spaces.find((y) => y.id === s.id)
                        if (!x) return
                        const v = Math.max(1, n)
                        // Keep the top-left corner fixed.
                        if (k === 'w') x.x += (v - x.w) / 2
                        else x.y += (v - x.h) / 2
                        x[k] = v
                      }, `space-${k}-${s.id}`)
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        {!d.layout.spaces.length && <p className="text-xs text-slate-500">No room outline. Add one to show walls and dimensions.</p>}
      </Section>

      <Section title="Show">
        {LAYERS.map((l) => (
          <button
            key={l}
            onClick={() => set({ hidden: hidden.includes(l) ? hidden.filter((x) => x !== l) : [...hidden, l] })}
            className="flex w-full items-center justify-between rounded-md px-1 py-1 text-sm capitalize hover:bg-slate-50"
          >
            {l}
            {hidden.includes(l) ? <EyeOff size={14} className="text-slate-400" /> : <Eye size={14} />}
          </button>
        ))}
        <button onClick={() => set({ showSeats: !showSeats })} className="flex w-full items-center justify-between rounded-md px-1 py-1 text-sm hover:bg-slate-50">
          Chairs {showSeats ? <Eye size={14} /> : <EyeOff size={14} className="text-slate-400" />}
        </button>
      </Section>
    </>
  )
}

export const Inspector = ({ onImport }: { onImport: () => void }) => {
  const items = useEvent((s) => s.doc!.layout.items)
  const readOnly = useEvent((s) => s.readOnly)
  const selected = useLayoutView((s) => s.selected)
  const sel = items.filter((i) => selected.includes(i.id))
  const locked = sel.length > 0 && sel.every((i) => i.locked)

  return (
    <div className="flex h-full flex-col">
      {sel.length > 0 && !readOnly && (
        <div className="flex items-center gap-0.5 border-b border-slate-100 px-2 py-1.5">
          <IconButton title="Rotate 15° (R)" onClick={() => rotateBy(selected, 15)}>
            <RotateCw size={16} />
          </IconButton>
          <IconButton title="Duplicate (⌘D)" onClick={() => duplicateItems(selected)}>
            <Copy size={16} />
          </IconButton>
          <IconButton
            title={locked ? 'Unlock' : 'Lock in place'}
            onClick={() =>
              update((d) => {
                for (const i of d.layout.items) if (selected.includes(i.id)) i.locked = !locked
              })
            }
          >
            {locked ? <Lock size={16} /> : <Unlock size={16} />}
          </IconButton>
          <div className="flex-1" />
          <IconButton title="Delete (⌫)" onClick={() => deleteItems(selected)} className="hover:text-red-600">
            <Trash2 size={16} />
          </IconButton>
        </div>
      )}
      <div className={`scroll-thin flex-1 overflow-y-auto ${readOnly ? 'pointer-events-none opacity-80' : ''}`}>
        {sel.length === 1 ? <Single item={sel[0]} /> : sel.length > 1 ? <Multi items={sel} /> : <Nothing onImport={onImport} />}
      </div>
    </div>
  )
}
