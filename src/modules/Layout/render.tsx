import { memo } from 'react'
import type { Guest, LayoutItem, Space, VenuePlan, BasePlanPlacement } from '../../types/event'
import { CHAIR, bbox, footprint, seatsLocal, tentPoles, POLE_R } from '../../lib/geometry'
import { tentName } from '../../data/tents'
import { KIND_LABEL } from '../../data/furniture'
import { initials, seatKey } from '../../lib/derived'
import { deckDims } from '../../lib/staging'
import { ASSET_ICONS } from '../../data/assetIcons'

/** A lucide icon (24-unit box, stroked) scaled to `size` metres and centred on the origin. */
export const Glyph = ({ name, size, color = '#334155' }: { name?: string; size: number; color?: string }) => {
  const node = name ? ASSET_ICONS[name] : undefined
  if (!node) return null
  return (
    <g transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 24})`} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
      {node.map(([tag, attrs], i) => {
        const Tag = tag as 'path'
        return <Tag key={i} {...(attrs as Record<string, string>)} />
      })}
    </g>
  )
}

const STROKE = '#475569'
const SW = 0.025

const Chair = ({ x, y, angle, guest, highlight, blocked }: { x: number; y: number; angle: number; guest?: Guest; highlight?: boolean; blocked?: boolean }) => (
  <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <rect
      x={-CHAIR / 2}
      y={-CHAIR / 2}
      width={CHAIR}
      height={CHAIR}
      rx={0.09}
      fill={guest ? (guest.rsvp === 'yes' ? '#4f46e5' : '#818cf8') : highlight ? '#c7d2fe' : blocked ? '#fde68a' : '#f1f5f9'}
      stroke={blocked ? '#d97706' : guest ? '#3730a3' : '#94a3b8'}
      strokeWidth={blocked ? 0.04 : 0.018}
    />
    {guest && (
      <text transform={`rotate(${-angle})`} textAnchor="middle" dominantBaseline="central" fontSize={0.17} fontWeight={600} fill="#fff" style={{ pointerEvents: 'none' }}>
        {initials(guest.name)}
      </text>
    )}
  </g>
)

const labelFor = (i: LayoutItem) => {
  if (i.label) return i.label
  // Library items show their name when there's room; trestles in a run stay unlabelled.
  if (i.kind === 'asset') return Math.min(i.w, i.h) >= 0.8 && Math.max(i.w, i.h) >= 1.4 ? (i.asset?.name ?? '') : ''
  if (i.joinable || i.kind === 'chair' || i.kind === 'plant' || i.kind === 'pillar') return ''
  return KIND_LABEL[i.kind]
}

/** Keeps text upright however the item is rotated. */
const Upright = ({ rotation, children }: { rotation: number; children: React.ReactNode }) => <g transform={`rotate(${-rotation})`}>{children}</g>

const WALL_STYLE = {
  open: { stroke: '#94a3b8', width: 0.05, dash: '0.35 0.25' },
  clear: { stroke: '#38bdf8', width: 0.09, dash: undefined },
  white: { stroke: '#334155', width: 0.11, dash: undefined },
} as const

/** Side segments of a rectangle tent with doorway gaps cut out. Sides: 0 −y, 1 +x, 2 +y, 3 −x. */
const wallSegments = (w: number, h: number, doors: NonNullable<LayoutItem['tent']>['doors']) => {
  const sides: [number, number, number, number, number][] = [
    [-w / 2, -h / 2, w / 2, -h / 2, w],
    [w / 2, -h / 2, w / 2, h / 2, h],
    [-w / 2, h / 2, w / 2, h / 2, w],
    [-w / 2, -h / 2, -w / 2, h / 2, h],
  ]
  return sides.flatMap(([x1, y1, x2, y2, len], side) => {
    const gaps = doors
      .filter((d) => d.side === side)
      .map((d) => [len / 2 + d.at - d.w / 2, len / 2 + d.at + d.w / 2] as const)
      .sort((a, b) => a[0] - b[0])
    const out: [number, number, number, number][] = []
    let from = 0
    for (const [a, b] of gaps) {
      if (a > from) out.push([from, a, 0, 0])
      from = Math.max(from, b)
    }
    if (from < len) out.push([from, len, 0, 0])
    const at = (t: number) => [x1 + ((x2 - x1) * t) / len, y1 + ((y2 - y1) * t) / len]
    return out.map(([a, b]) => [...at(a), ...at(b)] as [number, number, number, number])
  })
}

/** A marquee: canopy outline in its wall style, bay lines, doorways and poles. */
const TentShape = ({ item }: { item: LayoutItem }) => {
  const t = item.tent!
  const { w, h } = item
  const style = WALL_STYLE[t.walls]
  const poles = tentPoles(item)
  let outline: React.ReactNode
  if (t.type === 'tipi') outline = <circle r={w / 2} fill="#fffbeb" fillOpacity={0.55} stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} />
  else if (t.type === 'sailcloth') {
    const r = w / 2
    const s = Math.max(0, h / 2 - r)
    outline = <path d={`M ${-r} ${-s} L ${-r} ${s} A ${r} ${r} 0 0 0 ${r} ${s} L ${r} ${-s} A ${r} ${r} 0 0 0 ${-r} ${-s} Z`} fill="#fffbeb" fillOpacity={0.55} stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} />
  } else if (t.type === 'stretch') {
    const k = Math.min(w, h) * 0.08
    outline = (
      <path
        d={`M ${-w / 2} ${-h / 2} Q 0 ${-h / 2 + k} ${w / 2} ${-h / 2} Q ${w / 2 - k} 0 ${w / 2} ${h / 2} Q 0 ${h / 2 - k} ${-w / 2} ${h / 2} Q ${-w / 2 + k} 0 ${-w / 2} ${-h / 2} Z`}
        fill="#f5f5f4"
        fillOpacity={0.55}
        stroke={style.stroke}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
      />
    )
  } else
    outline = (
      <>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#f8fafc" fillOpacity={0.55} />
        <g stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} strokeLinecap="square">
          {wallSegments(w, h, t.doors).map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
      </>
    )
  // Bay lines across the roof (frame, clearspan, pole tents).
  const bays: React.ReactNode[] = []
  if (t.bay && (t.type === 'frame' || t.type === 'clearspan' || t.type === 'pole')) {
    const n = Math.round(h / t.bay)
    for (let k = 1; k < n; k++) bays.push(<line key={k} x1={-w / 2} x2={w / 2} y1={-h / 2 + (h * k) / n} y2={-h / 2 + (h * k) / n} />)
  }
  return (
    <>
      {outline}
      <g stroke="#cbd5e1" strokeWidth={0.02} strokeDasharray="0.12 0.12">
        {bays}
        {(t.type === 'frame' || t.type === 'clearspan') && <line x1={0} x2={0} y1={-h / 2} y2={h / 2} />}
      </g>
      {poles.map((q, i) => (
        <circle key={i} cx={q.x} cy={q.y} r={POLE_R} fill="#334155" />
      ))}
      <Upright rotation={item.rotation}>
        <text x={0} y={-(t.type === 'tipi' ? w : h) / 2 - 0.3} textAnchor="middle" fontSize={Math.min(0.42, Math.max(0.22, w * 0.03))} fontWeight={600} fill="#64748b" style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {item.label || tentName(t.type, w, h)}
        </text>
      </Upright>
    </>
  )
}

export const ItemShape = memo(function ItemShape({
  item,
  seats,
  showSeats = true,
  highlightSeat,
  blocked,
}: {
  item: LayoutItem
  seats?: Map<string, Guest>
  showSeats?: boolean
  highlightSeat?: number
  /** Seat indices with a blocked view of the stage or screen. */
  blocked?: Set<number>
}) {
  const { w, h, kind } = item
  if (kind === 'tent' && item.tent)
    return (
      <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        <TentShape item={item} />
      </g>
    )
  const fill = item.color ?? '#fff'
  const label = labelFor(item)
  // Fit the label inside the item: cap by size, then by how long the text is.
  const room = kind === 'round-table' || kind === 'cocktail-table' ? w * 0.82 : w * 0.9
  const fs = Math.max(0.1, Math.min(0.3, Math.min(w, h) * 0.2, label ? room / (label.length * 0.56) : 1))
  const local = showSeats ? seatsLocal(item) : []
  const guestAt = (i: number) => seats?.get(seatKey(item.id, i))

  let body: React.ReactNode
  switch (kind) {
    case 'round-table':
    case 'cocktail-table':
      body = <circle r={w / 2} fill={fill} stroke={STROKE} strokeWidth={SW} />
      break
    case 'pillar':
      body = <circle r={w / 2} fill={fill} stroke="#334155" strokeWidth={SW} />
      break
    case 'plant':
      body = (
        <>
          <circle r={w / 2} fill={fill} stroke="#16a34a" strokeWidth={SW} />
          <circle r={w / 4} fill="#4ade80" opacity={0.6} />
        </>
      )
      break
    case 'chair-block':
      body = <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" stroke="#cbd5e1" strokeWidth={0.02} strokeDasharray="0.15 0.1" />
      break
    case 'chair':
      body = null
      break
    case 'stage': {
      const seams: React.ReactNode[] = []
      if (item.decks) {
        const k = deckDims(item.decks)
        for (let i = 1; i < item.decks.across; i++) seams.push(<line key={`x${i}`} x1={-w / 2 + i * k.x} y1={-h / 2} x2={-w / 2 + i * k.x} y2={h / 2} />)
        for (let j = 1; j < item.decks.deep; j++) seams.push(<line key={`y${j}`} x1={-w / 2} y1={-h / 2 + j * k.y} x2={w / 2} y2={-h / 2 + j * k.y} />)
      }
      body = (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={fill} stroke={STROKE} strokeWidth={SW * 1.6} />
          <g stroke="#94a3b8" strokeWidth={0.015}>{seams}</g>
          {/* Front edge — the audience side. */}
          <line x1={-w / 2} y1={h / 2} x2={w / 2} y2={h / 2} stroke="#334155" strokeWidth={0.07} />
        </>
      )
      break
    }
    case 'dancefloor':
      body = (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="url(#parquet)" stroke={STROKE} strokeWidth={SW} />
        </>
      )
      break
    case 'wall':
      body = <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={fill} />
      break
    case 'door':
      body = (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#fff" stroke={fill} strokeWidth={0.03} />
          <path d={`M ${-w / 2} ${-h / 2} A ${w} ${w} 0 0 1 ${w / 2} ${-h / 2 - w}`} fill="none" stroke={fill} strokeWidth={0.02} strokeDasharray="0.08 0.06" />
        </>
      )
      break
    case 'exit':
      body = (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={fill} />
          <rect x={-w / 2} y={h / 2} width={w} height={1.2} fill="#22c55e" opacity={0.08} stroke="#22c55e" strokeWidth={0.015} strokeDasharray="0.1 0.08" />
        </>
      )
      break
    case 'label':
      body = <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" />
      break
    case 'screen':
      body = <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={fill} rx={0.03} />
      break
    case 'asset': {
      const round = item.asset?.shape === 'round'
      const g = Math.min(0.7, Math.min(w, h) * (label ? 0.42 : 0.62))
      const dark = /^#(?:[0-3][0-9a-f]|4[0-7])/i.test(fill)
      body = (
        <>
          {round ? (
            <ellipse rx={w / 2} ry={h / 2} fill={fill} stroke={STROKE} strokeWidth={SW} />
          ) : (
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(0.06, Math.min(w, h) / 6)} fill={fill} stroke={STROKE} strokeWidth={SW} />
          )}
          {g >= 0.08 && (
            <Upright rotation={item.rotation}>
              <g transform={label ? `translate(0 ${-g * 0.45})` : undefined}>
                <Glyph name={item.asset?.icon} size={g} color={dark ? '#e2e8f0' : '#475569'} />
              </g>
            </Upright>
          )}
        </>
      )
      break
    }
    default:
      body = <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={0.06} fill={fill} stroke={STROKE} strokeWidth={SW} />
  }

  const chairAngle = (p: { x: number; y: number }) => {
    if (kind === 'round-table') return (Math.atan2(p.y, p.x) * 180) / Math.PI + 90
    if (kind === 'banquet-table') {
      const long = w >= h
      if (long) return Math.abs(p.y) > h / 2 ? (p.y < 0 ? 0 : 180) : p.x < 0 ? -90 : 90
      return Math.abs(p.x) > w / 2 ? (p.x < 0 ? -90 : 90) : p.y < 0 ? 0 : 180
    }
    return 0
  }

  return (
    <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
      {body}
      {local.map((p, i) => (
        <Chair key={i} x={p.x} y={p.y} angle={chairAngle(p)} guest={guestAt(i)} highlight={highlightSeat === i} blocked={blocked?.has(i)} />
      ))}
      {label && kind !== 'exit' && (
        <Upright rotation={item.rotation}>
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={kind === 'label' ? Math.min(h * 0.7, 0.6) : fs}
            fontWeight={kind === 'label' ? 600 : 500}
            fill={kind === 'screen' || kind === 'wall' ? '#fff' : kind === 'label' ? '#0f172a' : '#334155'}
            y={kind === 'chair-block' ? -h / 2 - 0.3 : kind === 'asset' ? Math.min(0.7, Math.min(w, h) * 0.42) * 0.45 : 0}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {label}
          </text>
          {kind === 'stage' && item.height != null && (
            <text textAnchor="middle" dominantBaseline="central" y={fs * 1.3} fontSize={fs * 0.75} fill="#475569" style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {Math.round(item.height * 1000)} mm high
            </text>
          )}
        </Upright>
      )}
      {kind === 'exit' && (
        <Upright rotation={item.rotation}>
          <text textAnchor="middle" dominantBaseline="central" y={-0.35} fontSize={0.22} fontWeight={700} fill="#15803d" style={{ pointerEvents: 'none' }}>
            EXIT
          </text>
        </Upright>
      )}
    </g>
  )
})

export const SpaceOutline = ({ space }: { space: Space }) => (
  <g>
    <rect x={space.x - space.w / 2} y={space.y - space.h / 2} width={space.w} height={space.h} fill="#fff" stroke="#334155" strokeWidth={0.12} />
    <text x={space.x - space.w / 2 + 0.2} y={space.y - space.h / 2 - 0.25} fontSize={0.35} fontWeight={600} fill="#64748b">
      {space.name} · {space.w.toFixed(1)} × {space.h.toFixed(1)} m
    </text>
  </g>
)

export const BasePlanImage = ({ plan, placement }: { plan: VenuePlan; placement: BasePlanPlacement }) => (
  <image
    href={plan.image}
    x={placement.x}
    y={placement.y}
    width={plan.natW * plan.metersPerPx}
    height={plan.natH * plan.metersPerPx}
    opacity={placement.opacity}
    preserveAspectRatio="none"
    style={{ pointerEvents: 'none' }}
  />
)

export const Defs = () => (
  <defs>
    <pattern id="parquet" width={1} height={1} patternUnits="userSpaceOnUse">
      <rect width={1} height={1} fill="#f8fafc" />
      <rect width={0.5} height={0.5} fill="#e2e8f0" />
      <rect x={0.5} y={0.5} width={0.5} height={0.5} fill="#e2e8f0" />
    </pattern>
  </defs>
)

/** Paint order: marquees under everything, then structure, furniture, décor. */
export const drawOrder = <T extends Pick<LayoutItem, 'layer' | 'kind'>>(items: T[]) => {
  const rank = (i: T) => (i.kind === 'tent' ? -1 : ['structure', 'furniture', 'decor'].indexOf(i.layer))
  return [...items].sort((a, b) => rank(a) - rank(b))
}

/** Everything's extent, for fitting to screen and export. */
export const planBounds = (items: LayoutItem[], spaces: Space[], base?: { plan: VenuePlan; placement: BasePlanPlacement }) => {
  const pts = items.flatMap(footprint)
  for (const s of spaces)
    pts.push({ x: s.x - s.w / 2, y: s.y - s.h / 2 - 0.8 }, { x: s.x + s.w / 2, y: s.y + s.h / 2 })
  if (base) pts.push({ x: base.placement.x, y: base.placement.y }, { x: base.placement.x + base.plan.natW * base.plan.metersPerPx, y: base.placement.y + base.plan.natH * base.plan.metersPerPx })
  if (!pts.length) return { minX: 0, minY: 0, maxX: 20, maxY: 15, w: 20, h: 15 }
  return bbox(pts)
}

/** Non-interactive plan — used for thumbnails and PDF export. */
export const StaticPlan = ({
  items,
  spaces,
  guests,
  base,
  pad = 1,
  className,
  width,
  height,
}: {
  items: LayoutItem[]
  spaces: Space[]
  guests: Guest[]
  base?: { plan: VenuePlan; placement: BasePlanPlacement }
  pad?: number
  className?: string
  width?: number
  height?: number
}) => {
  const b = planBounds(items, spaces, base)
  const seats = new Map<string, Guest>()
  for (const g of guests) if (g.seat) seats.set(seatKey(g.seat.itemId, g.seat.index), g)
  const sorted = drawOrder(items)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${b.minX - pad} ${b.minY - pad} ${b.w + pad * 2} ${b.h + pad * 2}`}
      className={className}
      width={width}
      height={height}
      fontFamily="Helvetica, Arial, sans-serif"
    >
      <Defs />
      {spaces.map((s) => (
        <SpaceOutline key={s.id} space={s} />
      ))}
      {base && <BasePlanImage {...base} />}
      {sorted.map((i) => (
        <ItemShape key={i.id} item={i} seats={seats} />
      ))}
    </svg>
  )
}
