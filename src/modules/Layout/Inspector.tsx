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
  Map as MapIcon,
} from 'lucide-react'
import type { Layer, LayoutItem, TentType } from '../../types/event'
import { useEvent, update } from '../../store/event'
import { usePlan } from '../../store/plans'
import { KIND_LABEL } from '../../data/furniture'
import { clearanceIssues, isSeating, chairBlockSize, fmtArea, fmtFt, seatsLocal, tentPoles, tentWallLength, WALKWAY_MIN } from '../../lib/geometry'
import { TENT_TYPES, tentName, tentSpec } from '../../data/tents'
import { zones } from '../../lib/capacity'
import { sightlineSummary } from '../../lib/sightlines'
import { runOf } from '../../lib/runs'
import { seatMap, seatKey, seatingStats } from '../../lib/derived'
import { uid } from '../../lib/id'
import { STAGE_HEIGHTS, deckDims, isDeckStage, stageKit, stageSize } from '../../lib/staging'
import { useLayoutView } from './viewStore'
import { addTablesForShortfall, align, deleteItems, distribute, duplicateItems, extendRun, rotateBy, tentToSite } from './layoutActions'
import { seatGuest } from '../Guests/guestActions'
import { Button, IconButton, NumberCell, Select, toast } from '../../components/ui'

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
/** Edit a marquee and keep its site-map twin (if linked) the same size. */
const editTent = (id: string, fn: (i: LayoutItem) => void, key: string) =>
  update((d) => {
    const i = d.layout.items.find((x) => x.id === id)
    if (!i?.tent) return
    fn(i)
    const s = i.tent.siteId ? d.site.items.find((x) => x.id === i.tent!.siteId) : undefined
    if (s) Object.assign(s, { w: i.w, h: i.h, rotation: i.rotation, label: i.label || tentName(i.tent.type, i.w, i.h) })
  }, key)

const SIDES = [
  { value: '2', label: 'Front' },
  { value: '1', label: 'Right' },
  { value: '0', label: 'Back' },
  { value: '3', label: 'Left' },
]

const TentControls = ({ item }: { item: LayoutItem }) => {
  const t = item.tent!
  const def = TENT_TYPES[t.type]
  const site = useEvent((s) => (t.siteId ? s.doc!.site.items.find((x) => x.id === t.siteId) : undefined))
  const bays = t.bay ? Math.max(1, Math.round(item.h / t.bay)) : 0
  const sideLen = (side: number) => (side % 2 === 0 ? item.w : item.h)
  const setType = (type: TentType) =>
    editTent(
      item.id,
      (i) => {
        const nd = TENT_TYPES[type]
        const w = nd.widths ? nd.widths.reduce((a, b) => (Math.abs(b - i.w) < Math.abs(a - i.w) ? b : a)) : i.w
        const spec = tentSpec(type, w)
        i.w = w
        i.h = type === 'tipi' ? w : spec.bay ? Math.max(1, Math.round(i.h / spec.bay)) * spec.bay : i.h
        i.tent = { ...spec, walls: i.tent!.walls, doors: i.tent!.doors, siteId: i.tent!.siteId }
      },
      'tent-type',
    )
  const setWidth = (w: number) =>
    editTent(
      item.id,
      (i) => {
        i.w = w
        if (i.tent!.type === 'tipi') i.h = w
        i.tent!.ridge = +TENT_TYPES[i.tent!.type].ridge(w).toFixed(1)
      },
      'tent-w',
    )
  return (
    <div className="space-y-2.5">
      <Row label="Type">
        <Select<TentType> value={t.type} options={(Object.keys(TENT_TYPES) as TentType[]).map((k) => ({ value: k, label: TENT_TYPES[k].label }))} onChange={setType} />
      </Row>
      <p className="-mt-1 text-[11px] text-slate-500">{def.blurb}</p>
      <Row label={t.type === 'tipi' ? 'Diameter' : 'Span'}>
        {def.widths ? (
          <Select value={String(item.w)} options={def.widths.map((w) => ({ value: String(w), label: `${w} m` }))} onChange={(v) => setWidth(parseFloat(v))} />
        ) : (
          <div className="input w-24 p-0">
            <NumberCell value={item.w} format={(n) => `${n.toFixed(1)} m`} onChange={(n) => setWidth(Math.max(3, Math.min(60, n)))} />
          </div>
        )}
      </Row>
      {t.type !== 'tipi' &&
        (t.bay ? (
          <Row label="Length">
            <div className="flex items-center gap-1">
              <IconButton onClick={() => editTent(item.id, (i) => void (i.h = Math.max(1, bays - 1) * t.bay), 'tent-h')}>−</IconButton>
              <span className="w-24 text-center text-xs tabular-nums">
                {bays} × {t.bay} m = <strong className="text-sm">{+(bays * t.bay).toFixed(1)} m</strong>
              </span>
              <IconButton onClick={() => editTent(item.id, (i) => void (i.h = Math.min(40, bays + 1) * t.bay), 'tent-h')}>+</IconButton>
            </div>
          </Row>
        ) : (
          <Row label="Length">
            <div className="input w-24 p-0">
              <NumberCell value={item.h} format={(n) => `${n.toFixed(1)} m`} onChange={(n) => editTent(item.id, (i) => void (i.h = Math.max(3, Math.min(80, n))), 'tent-h')} />
            </div>
          </Row>
        ))}
      <Row label="Walls">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
          {(['open', 'clear', 'white'] as const).map((w) => (
            <button key={w} onClick={() => editTent(item.id, (i) => void (i.tent!.walls = w), 'tent-walls')} className={`rounded-md px-2 py-1 capitalize ${t.walls === w ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600'}`}>
              {w}
            </button>
          ))}
        </div>
      </Row>
      {t.type !== 'tipi' && t.walls !== 'open' && (
        <div className="space-y-1.5">
          {t.doors.map((door, k) => (
            <div key={k} className="flex items-center gap-1.5 text-xs">
              <Select value={String(door.side)} options={SIDES} onChange={(v) => editTent(item.id, (i) => void Object.assign(i.tent!.doors[k], { side: +v, at: 0 }), `door-${k}`)} />
              <Select value={String(door.w)} options={['1.5', '2', '3', '4', '5'].map((w) => ({ value: w, label: `${w} m` }))} onChange={(v) => editTent(item.id, (i) => void (i.tent!.doors[k].w = +v), `door-${k}`)} />
              <input
                type="range"
                className="min-w-0 flex-1 accent-brand-600"
                min={-(sideLen(door.side) - door.w) / 2}
                max={(sideLen(door.side) - door.w) / 2}
                step={0.5}
                value={door.at}
                onChange={(e) => editTent(item.id, (i) => void (i.tent!.doors[k].at = +e.target.value), `door-at-${k}`)}
              />
              <IconButton onClick={() => editTent(item.id, (i) => void i.tent!.doors.splice(k, 1), 'door-del')} aria-label="Remove doorway">
                <X size={14} />
              </IconButton>
            </div>
          ))}
          <Button size="sm" className="w-full" onClick={() => editTent(item.id, (i) => void i.tent!.doors.push({ side: 2, at: 0, w: Math.min(3, item.w) }), 'door-add')}>
            <Plus size={14} /> Add a doorway
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-500">
          Wall height
          <div className="input mt-1 p-0">
            <NumberCell value={t.eave} format={(n) => `${n.toFixed(1)} m`} onChange={(n) => editTent(item.id, (i) => void (i.tent!.eave = Math.max(1, Math.min(12, n))), 'tent-eave')} />
          </div>
        </label>
        <label className="text-xs text-slate-500">
          Peak height
          <div className="input mt-1 p-0">
            <NumberCell value={t.ridge} format={(n) => `${n.toFixed(1)} m`} onChange={(n) => editTent(item.id, (i) => void (i.tent!.ridge = Math.max(i.tent!.eave, Math.min(20, n))), 'tent-ridge')} />
          </div>
        </label>
      </div>
      <p className="text-[11px] text-slate-500">
        {fmtArea(t.type === 'tipi' ? Math.PI * (item.w / 2) ** 2 : item.w * item.h)} · {tentPoles(item).length} legs/poles{tentWallLength(item) ? ` · ${Math.round(tentWallLength(item))} m of wall` : ''}
      </p>
      <Button size="sm" className="w-full" onClick={() => tentToSite(item.id)}>
        <MapIcon size={14} /> {site ? 'On the site map — update it' : 'Show on the site map'}
      </Button>
    </div>
  )
}

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
      <Section title={item.tent ? tentName(item.tent.type, item.w, item.h) : (item.asset?.name ?? (item.joinable ? 'Trestle' : KIND_LABEL[item.kind]))}>
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
        {item.kind === 'tent' && item.tent && <TentControls item={item} />}
        {item.kind === 'asset' && (
          <Row label="Height">
            <div className="input w-24 p-0">
              <NumberCell value={item.height ?? 1} format={(n) => `${n.toFixed(2)} m`} onChange={(n) => edit(item.id, (i) => void (i.height = Math.max(0, Math.min(30, n))), 'height')} />
            </div>
          </Row>
        )}
        {item.kind !== 'chair-block' && item.kind !== 'tent' && !isDeckStage(item) && (
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
        {item.kind !== 'label' && item.kind !== 'tent' && (
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
                      <button onClick={() => useLayoutView.getState().set({ mode: '3d', seatView: { itemId: item.id, index: i } })} className="text-slate-400 hover:text-brand-600" title={`See ${g.name}’s view in 3D`}>
                        <Eye size={14} />
                      </button>
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

/** Seats that can't see the main focus, grouped by table, with a way to look from one of them. */
const SightlineSection = () => {
  const items = useEvent((s) => s.doc!.layout.items)
  const { focus, blocked, byTable } = sightlineSummary(items)
  if (!focus) return null
  const label = (id: string) => items.find((i) => i.id === id)?.label || 'Table'
  return (
    <Section title={blocked.length ? `Sightlines · ${blocked.length} seat${blocked.length === 1 ? '' : 's'}` : 'Sightlines'}>
      {blocked.length ? (
        <>
          <p className="mb-1.5 text-xs text-amber-700">
            {blocked.length} seat{blocked.length === 1 ? ' has' : 's have'} a blocked view of {focus.label}:
          </p>
          <ul className="space-y-1">
            {[...byTable.entries()].map(([id, n]) => {
              const first = blocked.find((b) => b.itemId === id)!
              return (
                <li key={id} className="flex items-center gap-2 text-xs text-slate-600">
                  <button onClick={() => useLayoutView.getState().select([id])} className="flex-1 text-left hover:text-slate-900">
                    {label(id)} · {n} seat{n === 1 ? '' : 's'}
                  </button>
                  <button onClick={() => useLayoutView.getState().set({ mode: '3d', seatView: { itemId: id, index: first.index } })} className="flex items-center gap-1 text-brand-600" title="See the view from one of these seats in 3D">
                    <Eye size={12} /> View
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="text-xs text-emerald-700">Every seat can see {focus.label}.</p>
      )}
    </Section>
  )
}

/** Each room and marquee: seats now, rough capacity by layout, and whether the exits cover the people in it. */
const CapacitySection = () => {
  const d = useEvent((s) => s.doc!)
  const list = zones(d)
  if (!list.length) return null
  return (
    <Section title="Capacity guide">
      <ul className="space-y-3">
        {list.map((z) => (
          <li key={z.id} className="text-xs text-slate-600">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-slate-800">{z.name}</span>
              <span className="shrink-0 text-slate-400">{fmtArea(z.area)}</span>
            </div>
            <div className="mt-0.5">
              {z.seated} seated · fits about {z.capacity.map((c) => `${c.people} ${c.label.toLowerCase()}`).join(', ')}
            </div>
            <div className={`mt-0.5 flex items-start gap-1 ${z.short ? 'text-amber-700' : 'text-emerald-700'}`}>
              {z.short ? <AlertTriangle size={12} className="mt-px shrink-0" /> : null}
              {z.short ?? (z.seated ? `Exits OK · ${z.exits.count} × ${z.exits.width.toFixed(1)} m for ${z.seated}` : `${z.exits.count} exit${z.exits.count === 1 ? '' : 's'} marked`)}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-400">A planning guide (banquet 1.2 m², theatre 0.7 m², cocktail 0.5 m² per person; 5 mm of exit per person). Your venue licence and local code decide the real numbers.</p>
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
                        : x.kind === 'pole'
                          ? `${name(x.a)} sits on a pole of ${name(x.b)}`
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

      <SightlineSection />

      <CapacitySection />

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
