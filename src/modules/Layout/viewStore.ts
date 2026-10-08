import { create } from 'zustand'
import type { Layer, LayoutItem } from '../../types/event'
import { DEFAULT_FILL, type FillOptions, type FillRegion } from '../../lib/fill'

export type Tool = 'select' | 'pan' | 'measure' | 'calibrate' | 'moveplan' | 'fill'

export interface View {
  /** World coordinate (metres) at the top-left of the canvas. */
  x: number
  y: number
  /** Pixels per metre. */
  s: number
}

interface LayoutViewState {
  view: View
  size: { w: number; h: number }
  selected: string[]
  tool: Tool
  snap: boolean
  hidden: Layer[]
  showSeats: boolean
  measure: { a: { x: number; y: number }; b: { x: number; y: number } } | null
  panel: 'inspector' | 'guests' | 'library' | null
  /** Tap-to-seat on touch: a guest waiting for a table tap. */
  armed: string | null
  /** Fill tool: the area picked, and the ghost layout it would place. */
  fill: FillRegion | null
  fillOpts: FillOptions
  fillPreview: LayoutItem[]
  /** 2D plan or 3D view, and the seat to look from when it was opened that way. */
  mode: '2d' | '3d'
  seatView: { itemId: string; index: number } | null
  set: (p: Partial<LayoutViewState>) => void
  select: (ids: string[]) => void
}

export const useLayoutView = create<LayoutViewState>((set) => ({
  view: { x: -2, y: -2, s: 20 },
  size: { w: 800, h: 600 },
  selected: [],
  tool: 'select',
  snap: true,
  hidden: [],
  showSeats: true,
  measure: null,
  armed: null,
  fill: null,
  fillOpts: DEFAULT_FILL,
  fillPreview: [],
  mode: '2d',
  seatView: null,
  panel: typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'inspector' : null,
  set: (p) => set(p),
  select: (selected) => set({ selected }),
}))

export const SNAP = 0.25

/** Centre of whatever the user is currently looking at, in metres. */
export const viewCenter = () => {
  const { view, size } = useLayoutView.getState()
  return { x: view.x + size.w / 2 / view.s, y: view.y + size.h / 2 / view.s }
}
