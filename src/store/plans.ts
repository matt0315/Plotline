import { useEffect } from 'react'
import { create } from 'zustand'
import type { VenuePlan } from '../types/event'
import { storage } from './persistence'

interface PlansState {
  cache: Record<string, VenuePlan>
  list: VenuePlan[]
}

export const usePlans = create<PlansState>(() => ({ cache: {}, list: [] }))

const put = (p: VenuePlan) => usePlans.setState((s) => ({ cache: { ...s.cache, [p.id]: p } }))

/** Seed a plan that didn't come from our own storage (e.g. a shared link). */
export const seedPlan = put

export const refreshPlans = async () => {
  const list = await storage().listPlans()
  usePlans.setState((s) => ({ list, cache: { ...s.cache, ...Object.fromEntries(list.map((p) => [p.id, p])) } }))
}

export const savePlan = async (p: VenuePlan) => {
  put(p)
  usePlans.setState((s) => ({ list: [p, ...s.list.filter((x) => x.id !== p.id)] }))
  await storage().savePlan(p)
}

export const removePlan = async (id: string) => {
  usePlans.setState((s) => ({ list: s.list.filter((x) => x.id !== id) }))
  await storage().deletePlan(id)
}

export const usePlan = (id?: string): VenuePlan | undefined => {
  const p = usePlans((s) => (id ? s.cache[id] : undefined))
  useEffect(() => {
    if (!id || p) return
    storage()
      .loadPlan(id)
      .then((x) => x && put(x))
  }, [id, p])
  return p
}
