export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export interface Place {
  name: string
  address: string
  lat: number
  lng: number
}

/**
 * Venue search. Mapbox when a token is configured (commercial-safe);
 * otherwise OpenStreetMap Nominatim, which allows light, user-initiated use.
 */
export const searchPlaces = async (q: string, signal?: AbortSignal): Promise<Place[]> => {
  if (!q.trim()) return []
  if (MAPBOX_TOKEN) {
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&limit=6&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url, { signal })
    const json = await res.json()
    return (json.features ?? []).map((f: { properties: { name: string; full_address?: string; place_formatted?: string; coordinates: { latitude: number; longitude: number } } }) => ({
      name: f.properties.name,
      address: f.properties.full_address ?? f.properties.place_formatted ?? '',
      lat: f.properties.coordinates.latitude,
      lng: f.properties.coordinates.longitude,
    }))
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  const json = (await res.json()) as { name: string; display_name: string; lat: string; lon: string }[]
  return json.map((r) => ({
    name: r.name || r.display_name.split(',')[0],
    address: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }))
}
