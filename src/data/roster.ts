import type { EventType } from '../types/event'

/** Roster sections, in the order work usually happens, each with a colour for the roster. */
export const SECTIONS: { name: string; color: string }[] = [
  { name: 'Site prep & grounds', color: '#65a30d' },
  { name: 'Marquee & structures', color: '#0d9488' },
  { name: 'Bump in', color: '#0284c7' },
  { name: 'Equipment setup', color: '#2563eb' },
  { name: 'Table setup', color: '#4f46e5' },
  { name: 'Styling & décor', color: '#c026d3' },
  { name: 'AV & lighting', color: '#7c3aed' },
  { name: 'Registration', color: '#0891b2' },
  { name: 'Event management', color: '#334155' },
  { name: 'Service', color: '#ea580c' },
  { name: 'Bar', color: '#d97706' },
  { name: 'Kitchen', color: '#dc2626' },
  { name: 'Security', color: '#1e293b' },
  { name: 'Parking & traffic', color: '#57534e' },
  { name: 'First aid', color: '#e11d48' },
  { name: 'Runner', color: '#64748b' },
  { name: 'Pack down', color: '#9333ea' },
  { name: 'Bump out', color: '#0369a1' },
  { name: 'Cleaning', color: '#16a34a' },
  { name: 'General', color: '#94a3b8' },
]

export const sectionColor = (name: string) => SECTIONS.find((s) => s.name === name)?.color ?? '#94a3b8'

/**
 * Suggested roster per event type.
 * [section, task, day, start, hours, people needed, supplier category (if a supplier's team does it)]
 * `start` is "HH:MM", or a number of minutes relative to the event start time.
 */
export type RosterSeed = [string, string, number, string | number, number, number, string?]

export const ROSTER_TEMPLATES: Record<EventType, RosterSeed[]> = {
  wedding: [
    ['Site prep & grounds', 'Mow lawns and tidy the grounds', -3, '08:00', 4, 1],
    ['Marquee & structures', 'Marquee and flooring build', -1, '07:00', 8, 4, 'Rentals'],
    ['Event management', 'Run the day', 0, -360, 15, 1],
    ['Bump in', 'Deliveries in, unload furniture', 0, -360, 2, 3],
    ['Table setup', 'Tables, chairs and linen per floor plan', 0, -270, 2.5, 3],
    ['Styling & décor', 'Florals, centrepieces and signage', 0, -180, 3, 2, 'Florals & decor'],
    ['AV & lighting', 'Sound check, lighting and DJ setup', 0, -120, 1.5, 1, 'Music'],
    ['Service', 'Food service', 0, -30, 8.5, 8, 'Catering'],
    ['Bar', 'Bar service', 0, -30, 8.5, 2],
    ['Pack down', 'Clear tables, stack furniture', 0, 480, 2, 4],
    ['Bump out', 'Marquee and rentals collection', 1, '09:00', 4, 4, 'Rentals'],
    ['Cleaning', 'Post-event clean', 1, '10:00', 3, 2],
  ],
  corporate: [
    ['Bump in', 'AV load-in, stage and screens', -1, '14:00', 5, 4, 'AV & production'],
    ['Event management', 'Run the day', 0, -150, 11, 1],
    ['Equipment setup', 'Tech rehearsal and AV checks', 0, -150, 2, 2, 'AV & production'],
    ['Registration', 'Registration desk and badges', 0, -90, 4, 3],
    ['Service', 'Coffee, breaks and lunch service', 0, -60, 8, 6, 'Catering'],
    ['Runner', 'Speaker and room support', 0, -30, 8, 2],
    ['Bump out', 'AV and stage load-out', 0, 495, 2, 4, 'AV & production'],
    ['Cleaning', 'Room reset and clean', 0, 600, 2, 2],
  ],
  festival: [
    ['Site prep & grounds', 'Mow and mark out the site', -5, '08:00', 6, 2],
    ['Marquee & structures', 'Fencing, marquees and power', -3, '07:00', 10, 8, 'Infrastructure'],
    ['Equipment setup', 'Stage, sound and lighting build', -2, '07:00', 10, 6, 'Production'],
    ['Bump in', 'Toilets, water and waste delivered', -1, '08:00', 6, 3, 'Welfare'],
    ['Event management', 'Site management', 0, -720, 20, 2],
    ['Security', 'Gates, perimeter and stewarding', 0, -60, 10, 12, 'Security & medical'],
    ['First aid', 'Medical cover', 0, -60, 10, 3, 'Security & medical'],
    ['Parking & traffic', 'Car park and traffic control', 0, -60, 10, 4],
    ['Bar', 'Bar service', 0, 0, 9, 8],
    ['Pack down', 'Clear the arena, rubbish sweep', 1, '06:00', 8, 10],
    ['Bump out', 'Stage and production de-rig', 1, '08:00', 10, 6, 'Production'],
    ['Cleaning', 'Final site clean', 2, '08:00', 6, 6],
    ['Bump out', 'Fencing and marquee removal', 3, '07:00', 8, 8, 'Infrastructure'],
  ],
  private: [
    ['Event management', 'Host and run the night', 0, -180, 8, 1],
    ['Bump in', 'Rentals delivered and unloaded', 0, -180, 1.5, 2, 'Rentals'],
    ['Table setup', 'Furniture and styling', 0, -150, 2, 2],
    ['Service', 'Food service', 0, 0, 5, 4, 'Catering'],
    ['Bar', 'Bar service', 0, 0, 5.5, 2],
    ['Pack down', 'Clear and stack', 0, 330, 1.5, 3],
    ['Cleaning', 'Post-party clean', 1, '10:00', 3, 2],
  ],
}
