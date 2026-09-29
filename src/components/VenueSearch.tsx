import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Search } from 'lucide-react'
import { searchPlaces, type Place } from '../lib/geocode'

/** Searches as you type, debounced to respect geocoder rate limits. */
export const VenueSearch = ({ value, onPick, autoFocus }: { value: string; onPick: (p: Place) => void; autoFocus?: boolean }) => {
  const [q, setQ] = useState(value)
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [none, setNone] = useState(false)
  const picked = useRef(value)

  useEffect(() => {
    if (!q.trim() || q === picked.current) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await searchPlaces(q, ctrl.signal)
        setResults(r)
        setNone(!r.length)
        setOpen(true)
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false)
      }
    }, 650)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
      <input
        className="input pl-9"
        autoFocus={autoFocus}
        value={q}
        placeholder="Venue name or address"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && <Loader2 size={16} className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-slate-400" />}
      {open && none && !loading && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">No places found — try the venue name plus the city, or a street address.</div>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  picked.current = r.name
                  setQ(r.name)
                  setOpen(false)
                  onPick(r)
                }}
              >
                <MapPin size={16} className="mt-0.5 shrink-0 text-brand-600" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-slate-500">{r.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
