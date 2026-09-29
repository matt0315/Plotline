import type { EventType, Phase } from '../types/event'

/** [minutes relative to start, duration, title, phase, owner] */
export type Beat = [number, number, string, Phase, string?]

/** [category, name, cost fn(guests)] — typical US costs, used as starting estimates. */
export type BudgetSeed = [string, string, (g: number) => number]

export interface EventTemplate {
  label: string
  blurb: string
  startTime: string
  beats: Beat[]
  budget: BudgetSeed[]
  /** [category, placeholder name, arrival offset from start in minutes, departure offset] */
  suppliers: [string, string, number, number][]
  docs: string[]
  crew: [string, number, number][] // role, call offset, finish offset
}

const round = (n: number, to = 50) => Math.round(n / to) * to

export const EVENT_TEMPLATES: Record<EventType, EventTemplate> = {
  wedding: {
    label: 'Wedding',
    blurb: 'Ceremony, reception, seating',
    startTime: '15:00',
    beats: [
      [-360, 60, 'Venue access — rentals and marquee crew arrive', 'setup'],
      [-270, 90, 'Tables, linen and chairs set per floor plan', 'setup'],
      [-180, 90, 'Florist and styling', 'setup'],
      [-90, 45, 'AV and music sound-check', 'setup'],
      [-30, 30, 'Guests arrive — welcome drinks', 'event'],
      [0, 30, 'Ceremony', 'event'],
      [30, 90, 'Cocktail hour and photos', 'event'],
      [120, 15, 'Guests seated for reception', 'event'],
      [135, 10, 'Grand entrance', 'event'],
      [145, 75, 'Dinner service', 'event'],
      [220, 30, 'Speeches and toasts', 'event'],
      [250, 15, 'Cake cutting', 'event'],
      [265, 10, 'First dance', 'event'],
      [275, 185, 'Dancing and open bar', 'event'],
      [460, 15, 'Last dance and send-off', 'event'],
      [480, 120, 'Pack-down and venue handover', 'breakdown'],
    ],
    budget: [
      ['Venue', 'Venue hire', (g) => round(4000 + g * 25, 100)],
      ['Catering', 'Food', (g) => round(g * 85)],
      ['Catering', 'Bar and drinks', (g) => round(g * 32)],
      ['Photo & video', 'Photographer', () => 3200],
      ['Photo & video', 'Videographer', () => 2400],
      ['Florals & decor', 'Florist', (g) => round(1500 + g * 12, 100)],
      ['Music', 'DJ / band', () => 1800],
      ['Rentals', 'Tables, chairs, linen', (g) => round(g * 18)],
      ['Cake', 'Wedding cake', (g) => round(g * 6)],
      ['Stationery', 'Invitations and place cards', (g) => round(200 + g * 4)],
      ['Attire', 'Attire and beauty', () => 3000],
      ['Contingency', 'Contingency (8%)', () => 0],
    ],
    suppliers: [
      ['Venue', 'Venue', -360, 600],
      ['Catering', 'Caterer', -240, 540],
      ['Photo & video', 'Photographer', -120, 300],
      ['Florals & decor', 'Florist', -180, 480],
      ['Music', 'DJ / band', -90, 480],
      ['Rentals', 'Rental company', -360, 600],
      ['Cake', 'Baker', -60, -45],
    ],
    docs: ['pre-event', 'client-signoff', 'post-event'],
    crew: [
      ['Event coordinator', -360, 540],
      ['Venue manager', -360, 600],
    ],
  },
  corporate: {
    label: 'Corporate',
    blurb: 'Conference, dinner, launch',
    startTime: '09:00',
    beats: [
      [-150, 60, 'AV crew load-in, stage and screens', 'setup'],
      [-90, 45, 'Rooms set, registration desk ready', 'setup'],
      [-45, 30, 'Tech rehearsal with speakers', 'setup'],
      [-30, 30, 'Registration and coffee', 'event'],
      [0, 15, 'Welcome and opening remarks', 'event'],
      [15, 45, 'Keynote', 'event'],
      [60, 60, 'Session one', 'event'],
      [120, 30, 'Break', 'event'],
      [150, 90, 'Session two / breakouts', 'event'],
      [240, 60, 'Lunch and networking', 'event'],
      [300, 90, 'Afternoon sessions', 'event'],
      [390, 15, 'Close and thanks', 'event'],
      [405, 90, 'Networking drinks', 'event'],
      [495, 90, 'Load-out', 'breakdown'],
    ],
    budget: [
      ['Venue', 'Venue hire', (g) => round(3000 + g * 20, 100)],
      ['Catering', 'Coffee, lunch, breaks', (g) => round(g * 65)],
      ['Catering', 'Drinks reception', (g) => round(g * 25)],
      ['AV & production', 'AV, stage, screens', (g) => round(4500 + g * 10, 100)],
      ['Speakers', 'Speaker fees and travel', () => 5000],
      ['Print & branding', 'Signage, badges, lanyards', (g) => round(800 + g * 6, 100)],
      ['Photo & video', 'Photographer', () => 1800],
      ['Staffing', 'Registration staff', () => 900],
      ['Contingency', 'Contingency (8%)', () => 0],
    ],
    suppliers: [
      ['Venue', 'Venue', -150, 585],
      ['AV & production', 'AV company', -150, 585],
      ['Catering', 'Caterer', -60, 495],
      ['Print & branding', 'Printer', -120, -90],
      ['Photo & video', 'Photographer', -15, 420],
    ],
    docs: ['risk', 'crew-signin', 'pre-event', 'post-event'],
    crew: [
      ['Event manager', -150, 585],
      ['Registration lead', -60, 240],
      ['Stage manager', -150, 495],
    ],
  },
  festival: {
    label: 'Festival',
    blurb: 'Outdoor site, stages, crowds',
    startTime: '12:00',
    beats: [
      [-720, 240, 'Site build — fencing, marquees, stages', 'setup'],
      [-480, 180, 'Power, toilets, water, bins', 'setup'],
      [-300, 120, 'Vendors arrive and set up', 'setup'],
      [-120, 60, 'Line checks and sound-checks', 'setup'],
      [-60, 45, 'Safety walk and sign-off', 'setup'],
      [-15, 15, 'Staff and security briefing', 'setup'],
      [0, 60, 'Gates open', 'event'],
      [60, 360, 'Programme — all stages', 'event'],
      [420, 90, 'Headliner', 'event'],
      [510, 30, 'Curfew — music stops', 'event'],
      [540, 60, 'Egress and crowd dispersal', 'event'],
      [600, 480, 'Site de-rig', 'breakdown'],
    ],
    budget: [
      ['Site', 'Site hire and permits', (g) => round(5000 + g * 3, 500)],
      ['Production', 'Stages, sound, lighting', (g) => round(15000 + g * 6, 500)],
      ['Artists', 'Artist fees', (g) => round(20000 + g * 8, 500)],
      ['Infrastructure', 'Fencing, marquees, power', (g) => round(8000 + g * 4, 500)],
      ['Welfare', 'Toilets, water, waste', (g) => round(2500 + g * 3, 250)],
      ['Security & medical', 'Security and first aid', (g) => round(4000 + g * 5, 250)],
      ['Marketing', 'Marketing and ticketing', (g) => round(3000 + g * 2, 250)],
      ['Staffing', 'Stewards and crew', (g) => round(g * 4, 250)],
      ['Contingency', 'Contingency (10%)', () => 0],
    ],
    suppliers: [
      ['Production', 'Production company', -720, 900],
      ['Infrastructure', 'Fencing and marquees', -720, 1080],
      ['Welfare', 'Toilet hire', -480, 900],
      ['Security & medical', 'Security company', -60, 600],
      ['Security & medical', 'Medical provider', -60, 600],
      ['Catering', 'Food vendors', -300, 570],
    ],
    docs: ['risk', 'site-safety', 'crew-signin', 'delivery', 'post-event'],
    crew: [
      ['Site manager', -720, 1080],
      ['Production manager', -720, 900],
      ['Safety officer', -120, 600],
      ['Steward lead', -60, 600],
    ],
  },
  private: {
    label: 'Party',
    blurb: 'Birthday, anniversary, gala',
    startTime: '19:00',
    beats: [
      [-180, 90, 'Rentals and styling set-up', 'setup'],
      [-60, 45, 'Music and lighting check', 'setup'],
      [0, 60, 'Guests arrive — drinks and canapés', 'event'],
      [60, 15, 'Welcome toast', 'event'],
      [75, 90, 'Food service', 'event'],
      [165, 15, 'Speeches / cake', 'event'],
      [180, 150, 'Music and dancing', 'event'],
      [330, 90, 'Pack-down', 'breakdown'],
    ],
    budget: [
      ['Venue', 'Venue hire', (g) => round(1000 + g * 15, 100)],
      ['Catering', 'Food', (g) => round(g * 45)],
      ['Catering', 'Drinks', (g) => round(g * 28)],
      ['Music', 'DJ', () => 900],
      ['Decor', 'Styling and florals', (g) => round(400 + g * 6, 50)],
      ['Rentals', 'Furniture and linen', (g) => round(g * 10)],
      ['Contingency', 'Contingency (8%)', () => 0],
    ],
    suppliers: [
      ['Venue', 'Venue', -180, 420],
      ['Catering', 'Caterer', -120, 330],
      ['Music', 'DJ', -60, 330],
      ['Rentals', 'Rental company', -180, 420],
    ],
    docs: ['pre-event'],
    crew: [['Host / coordinator', -180, 420]],
  },
}
