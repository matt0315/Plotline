/**
 * The wider item library: things you place but don't seat guests at.
 * Sizes are typical hire-catalogue sizes in metres — w across, d deep, z tall (for 3D and sightlines).
 */
export interface AssetDef {
  key: string
  name: string
  group: AssetGroup
  w: number
  d: number
  z: number
  shape: 'rect' | 'round'
  icon: string
  color: string
  tags?: string
  resizable?: boolean
}

export const ASSET_GROUPS = ['Tables', 'Seating', 'AV & lighting', 'Bars & catering', 'Décor', 'Facilities', 'Barriers & structure', 'Games & kids', 'Vehicles'] as const
export type AssetGroup = (typeof ASSET_GROUPS)[number]

type Row = [key: string, name: string, w: number, d: number, z: number, shape: 'r' | 'o', icon: string, color: string, tags?: string, resizable?: boolean]

const C = {
  wood: '#e7d3b1',
  white: '#ffffff',
  linen: '#f8fafc',
  soft: '#e2e8f0',
  av: '#cbd5e1',
  dark: '#334155',
  bar: '#fde68a',
  food: '#fed7aa',
  green: '#bbf7d0',
  pink: '#fbcfe8',
  lilac: '#ddd6fe',
  sky: '#bae6fd',
  red: '#fecaca',
  amber: '#fef3c7',
  steel: '#94a3b8',
}

const ROWS: Record<AssetGroup, Row[]> = {
  Tables: [
    ['table-square-90', 'Square table 90cm', 0.9, 0.9, 0.76, 'r', 'Square', C.white, 'four'],
    ['table-square-120', 'Square table 1.2m', 1.2, 1.2, 0.76, 'r', 'Square', C.white, 'eight'],
    ['table-oval', 'Oval table 2.4m', 2.4, 1.2, 0.76, 'o', 'Circle', C.white],
    ['table-serpentine', 'Serpentine table', 1.8, 0.75, 0.76, 'r', 'Waves', C.white, 'crescent curved buffet'],
    ['table-crescent', 'Crescent table', 1.8, 0.6, 0.76, 'r', 'Moon', C.white, 'half moon'],
    ['table-kids', 'Kids table', 1.2, 0.6, 0.55, 'r', 'Baby', C.amber, 'children'],
    ['table-high-bar', 'Bar leaner 60cm', 0.6, 0.6, 1.1, 'o', 'Circle', C.white, 'poseur high cocktail'],
    ['table-low-coffee', 'Coffee table', 1.0, 0.5, 0.45, 'r', 'Coffee', C.wood, 'lounge'],
    ['table-side', 'Side table', 0.5, 0.5, 0.55, 'o', 'Circle', C.wood],
    ['table-wine-barrel', 'Wine barrel table', 0.6, 0.6, 1.0, 'o', 'Wine', C.wood, 'rustic poseur'],
    ['table-picnic', 'Picnic bench set', 1.8, 1.5, 0.75, 'r', 'TreePine', C.wood, 'outdoor festival'],
    ['table-trestle-harvest', 'Harvest table 2.4m', 2.4, 1.0, 0.76, 'r', 'Wheat', C.wood, 'rustic farm'],
  ],
  Seating: [
    ['chair-chiavari', 'Chiavari chair', 0.42, 0.42, 0.9, 'r', 'Armchair', '#fde68a', 'tiffany gold'],
    ['chair-folding', 'Folding chair', 0.45, 0.45, 0.85, 'r', 'Armchair', C.soft],
    ['chair-ghost', 'Ghost chair', 0.45, 0.45, 0.9, 'r', 'Armchair', '#f1f5f9', 'clear acrylic'],
    ['stool-bar', 'Bar stool', 0.4, 0.4, 0.75, 'o', 'Circle', C.soft],
    ['bench-18', 'Bench 1.8m', 1.8, 0.35, 0.45, 'r', 'RectangleHorizontal', C.wood, 'form', true],
    ['pew', 'Church pew 2.4m', 2.4, 0.6, 0.9, 'r', 'Church', C.wood, 'ceremony'],
    ['sofa-2', 'Sofa 2-seat', 1.6, 0.85, 0.8, 'r', 'Sofa', '#ede9fe', 'couch lounge'],
    ['sofa-3', 'Sofa 3-seat', 2.1, 0.85, 0.8, 'r', 'Sofa', '#ede9fe', 'couch lounge chesterfield'],
    ['armchair', 'Armchair', 0.85, 0.8, 0.8, 'r', 'Armchair', '#ede9fe', 'lounge'],
    ['ottoman', 'Ottoman', 0.6, 0.6, 0.45, 'o', 'Circle', '#ede9fe', 'pouf'],
    ['daybed', 'Daybed', 2.0, 1.0, 0.45, 'r', 'Bed', '#ede9fe', 'lounge chill'],
    ['bean-bag', 'Bean bag', 0.9, 0.9, 0.6, 'o', 'Circle', '#fcd34d', 'festival chill'],
    ['hay-bale', 'Hay bale seat', 1.0, 0.45, 0.4, 'r', 'Wheat', '#fde68a', 'rustic barn'],
  ],
  'AV & lighting': [
    ['speaker-stand', 'Speaker on stand', 0.6, 0.6, 2.0, 'o', 'Speaker', C.dark, 'pa audio'],
    ['speaker-sub', 'Subwoofer', 0.6, 0.7, 0.6, 'r', 'Speaker', C.dark, 'bass audio'],
    ['line-array', 'Line array (flown)', 1.2, 0.8, 0.8, 'r', 'Speaker', C.dark, 'pa audio hang'],
    ['foh-desk', 'Sound desk (FOH)', 2.0, 1.0, 1.1, 'r', 'SlidersHorizontal', C.av, 'mixer front of house tech'],
    ['dj-booth', 'DJ booth', 1.8, 0.8, 1.1, 'r', 'Disc3', '#c7d2fe', 'decks'],
    ['led-wall-3x2', 'LED wall 3×2m', 3.0, 0.6, 2.5, 'r', 'Monitor', '#1e293b', 'screen video', true],
    ['led-wall-5x3', 'LED wall 5×3m', 5.0, 0.8, 3.5, 'r', 'Monitor', '#1e293b', 'screen video', true],
    ['projector', 'Projector & screen', 2.4, 0.4, 2.2, 'r', 'Projector', '#1e293b', 'presentation'],
    ['tv-stand', 'TV on stand', 1.2, 0.6, 1.7, 'r', 'Tv', C.dark, 'screen display'],
    ['lectern', 'Lectern', 0.6, 0.5, 1.2, 'r', 'Presentation', C.wood, 'podium speech'],
    ['mic-stand', 'Microphone', 0.4, 0.4, 1.6, 'o', 'Mic', C.dark, 'speech'],
    ['truss-3', 'Truss 3m', 3.0, 0.3, 0.3, 'r', 'Grid3x3', C.steel, 'rig', true],
    ['truss-goalpost', 'Goalpost truss 6m', 6.0, 0.4, 4.0, 'r', 'Grid3x3', C.steel, 'rig', true],
    ['uplight', 'Uplight', 0.3, 0.3, 0.3, 'o', 'Lightbulb', '#c4b5fd', 'wash par'],
    ['moving-head', 'Moving head light', 0.4, 0.4, 0.5, 'o', 'Spotlight', C.av, 'lighting'],
    ['lighting-tower', 'Lighting tower', 1.5, 1.5, 6.0, 'r', 'Lamp', '#fde047', 'flood outdoor'],
    ['festoon', 'Festoon run 10m', 10, 0.1, 3.0, 'r', 'Lightbulb', '#fef08a', 'string lights', true],
    ['floor-lamp', 'Floor lamp', 0.5, 0.5, 1.7, 'o', 'LampFloor', '#fef3c7'],
    ['chandelier', 'Chandelier', 1.0, 1.0, 1.0, 'o', 'LampCeiling', '#fef3c7', 'hung ceiling'],
    ['camera-pos', 'Camera position', 1.0, 1.0, 1.7, 'r', 'Video', C.av, 'filming videographer'],
    ['stage-stairs', 'Stage stairs', 1.2, 0.9, 0.6, 'r', 'Footprints', C.av, 'treads steps'],
  ],
  'Bars & catering': [
    ['bar-l', 'L-shaped bar', 3.0, 2.0, 1.1, 'r', 'Martini', C.bar, 'corner'],
    ['bar-round', 'Island bar', 3.0, 3.0, 1.1, 'o', 'Martini', C.bar, 'circular round'],
    ['back-bar', 'Back bar', 2.4, 0.6, 0.9, 'r', 'Wine', C.bar, 'fridge shelf', true],
    ['bar-mobile', 'Mobile bar cart', 1.5, 0.7, 1.0, 'r', 'Beer', C.bar, 'horsebox caravan'],
    ['coffee-cart', 'Coffee cart', 1.8, 0.8, 1.2, 'r', 'Coffee', C.food, 'espresso barista'],
    ['carving', 'Carving station', 1.8, 0.8, 0.9, 'r', 'ChefHat', C.food, 'chef'],
    ['dessert', 'Dessert table', 2.4, 0.8, 0.9, 'r', 'CakeSlice', C.pink, 'sweets candy'],
    ['grazing', 'Grazing table', 3.0, 1.2, 0.9, 'r', 'Salad', C.food, 'cheese platter'],
    ['drinks-station', 'Drinks station', 1.8, 0.75, 0.9, 'r', 'GlassWater', C.sky, 'water self serve'],
    ['fridge', 'Drinks fridge', 0.6, 0.6, 1.8, 'r', 'Refrigerator', C.av, 'cooler'],
    ['ice-tub', 'Ice tub', 0.6, 0.6, 0.8, 'o', 'Snowflake', C.sky, 'beer bucket'],
    ['food-truck', 'Food truck', 6.0, 2.4, 3.0, 'r', 'Truck', C.food, 'van catering'],
    ['food-stall', 'Food stall 3×3', 3.0, 3.0, 2.8, 'r', 'Store', C.food, 'gazebo vendor market'],
    ['kitchen-tent', 'Catering prep area', 6.0, 3.0, 2.8, 'r', 'ChefHat', '#e2e8f0', 'back of house', true],
    ['waiter-station', 'Waiter station', 1.2, 0.6, 0.9, 'r', 'HandPlatter', C.soft, 'service'],
    ['bin-station', 'Bin station', 1.2, 0.6, 1.0, 'r', 'Trash2', '#d1fae5', 'waste recycling rubbish'],
  ],
  Décor: [
    ['flower-wall', 'Flower wall', 2.4, 0.4, 2.4, 'r', 'Flower2', C.pink, 'floral backdrop', true],
    ['arch', 'Ceremony arch', 2.0, 0.6, 2.4, 'r', 'Heart', C.pink, 'arbour floral'],
    ['backdrop', 'Backdrop', 3.0, 0.4, 2.4, 'r', 'Frame', C.lilac, 'photo wall step repeat', true],
    ['balloon-arch', 'Balloon arch', 3.0, 0.8, 2.8, 'r', 'PartyPopper', '#fecdd3', 'party'],
    ['tree-potted', 'Potted tree', 1.0, 1.0, 2.5, 'o', 'TreeDeciduous', C.green, 'olive ficus'],
    ['hedge', 'Hedge 2m', 2.0, 0.5, 1.2, 'r', 'Sprout', C.green, 'greenery screen', true],
    ['flower-urn', 'Floral urn', 0.6, 0.6, 1.2, 'o', 'Flower', C.pink, 'arrangement'],
    ['candelabra', 'Candelabra', 0.4, 0.4, 1.0, 'o', 'Flame', '#fef3c7', 'candles'],
    ['welcome-sign', 'Welcome sign', 1.0, 0.6, 1.8, 'r', 'Signpost', C.wood, 'easel signage'],
    ['seating-chart', 'Seating chart board', 1.2, 0.6, 1.9, 'r', 'ClipboardList', C.wood, 'table plan escort'],
    ['rug', 'Rug 3×2m', 3.0, 2.0, 0.02, 'r', 'RectangleHorizontal', '#fde2e4', 'carpet persian', true],
    ['drape', 'Drape panel', 3.0, 0.2, 3.0, 'r', 'Theater', '#f5f5f4', 'curtain pipe and drape', true],
    ['photo-wall', 'Photo display', 1.5, 0.5, 1.8, 'r', 'Image', C.lilac, 'memory table'],
    ['card-box', 'Card box table', 0.8, 0.6, 0.8, 'r', 'Gift', C.lilac, 'wishing well'],
    ['red-carpet', 'Red carpet 10m', 1.5, 10, 0.02, 'r', 'Crown', '#fecaca', 'runner aisle', true],
  ],
  Facilities: [
    ['toilet-block', 'Toilet trailer', 6.0, 2.5, 3.0, 'r', 'Toilet', C.sky, 'restroom portaloo luxury'],
    ['toilet-single', 'Portable toilet', 1.2, 1.2, 2.3, 'r', 'Toilet', C.sky, 'portaloo'],
    ['toilet-accessible', 'Accessible toilet', 1.6, 1.6, 2.3, 'r', 'Accessibility', C.sky, 'disabled ada'],
    ['handwash', 'Handwash station', 1.0, 0.6, 1.2, 'r', 'Droplets', C.sky, 'sink'],
    ['first-aid', 'First aid point', 3.0, 3.0, 2.8, 'r', 'BriefcaseMedical', C.red, 'medical'],
    ['info-desk', 'Info desk', 2.0, 0.8, 1.0, 'r', 'Info', C.sky, 'help'],
    ['cloakroom', 'Cloakroom rail', 2.0, 0.6, 1.7, 'r', 'Shirt', C.soft, 'coat check'],
    ['charging', 'Phone charging', 0.6, 0.6, 1.5, 'r', 'BatteryCharging', C.soft, 'station'],
    ['heater', 'Patio heater', 0.8, 0.8, 2.3, 'o', 'Heater', '#fdba74', 'gas outdoor'],
    ['fan', 'Fan / cooler', 0.6, 0.6, 1.5, 'o', 'Fan', C.sky, 'misting'],
    ['generator', 'Generator', 2.5, 1.2, 1.5, 'r', 'Zap', '#fde047', 'power'],
    ['power-distro', 'Power distro', 0.6, 0.4, 0.8, 'r', 'Plug', '#fde047', 'board electrical'],
    ['ticket-booth', 'Ticket booth', 2.0, 2.0, 2.4, 'r', 'Ticket', C.sky, 'box office entry'],
    ['security-post', 'Security post', 1.5, 1.5, 2.4, 'r', 'Shield', C.soft, 'bag check'],
    ['parents-room', 'Parents room', 3.0, 3.0, 2.4, 'r', 'Baby', C.amber, 'baby change'],
    ['water-station', 'Water refill', 1.2, 0.6, 1.2, 'r', 'GlassWater', C.sky, 'drinking'],
  ],
  'Barriers & structure': [
    ['window', 'Window', 1.5, 0.15, 1.2, 'r', 'RectangleHorizontal', '#bae6fd', 'glass', true],
    ['column-square', 'Square column', 0.6, 0.6, 3.5, 'r', 'Square', '#64748b', 'pillar post'],
    ['crowd-barrier', 'Crowd barrier 2.3m', 2.3, 0.6, 1.1, 'r', 'Fence', C.steel, 'pit mojo', true],
    ['bike-rack', 'Bike-rack barrier 2.5m', 2.5, 0.5, 1.1, 'r', 'Fence', C.steel, 'pedestrian', true],
    ['fence-panel', 'Fence panel 3.5m', 3.5, 0.6, 2.1, 'r', 'Fence', C.steel, 'temporary heras', true],
    ['stanchion', 'Rope & post', 1.5, 0.3, 1.0, 'r', 'Fence', '#fcd34d', 'queue vip', true],
    ['ramp', 'Access ramp', 1.2, 3.0, 0.3, 'r', 'Accessibility', C.av, 'wheelchair accessible'],
    ['steps', 'Steps', 1.2, 1.0, 0.6, 'r', 'Footprints', C.av, 'stairs'],
    ['flooring', 'Flooring panel 3×3', 3.0, 3.0, 0.05, 'r', 'Grid3x3', '#e7e5e4', 'ground protection', true],
    ['trackway', 'Trackway 3m', 3.0, 1.0, 0.03, 'r', 'Rows3', '#a8a29e', 'roadway mats', true],
    ['shade-sail', 'Shade sail', 5.0, 5.0, 3.0, 'r', 'Sun', '#fef9c3', 'umbrella', true],
    ['umbrella', 'Market umbrella', 2.7, 2.7, 2.5, 'o', 'Umbrella', '#fef9c3', 'parasol shade'],
    ['gazebo-3', 'Gazebo 3×3m', 3.0, 3.0, 2.6, 'r', 'Tent', '#f1f5f9', 'popup marquee'],
    ['gazebo-6', 'Gazebo 6×3m', 6.0, 3.0, 2.6, 'r', 'Tent', '#f1f5f9', 'popup marquee'],
    ['flag', 'Flag', 0.5, 0.5, 4.0, 'o', 'Flag', '#fecaca', 'feather banner'],
    ['signpost', 'Wayfinding sign', 0.8, 0.5, 2.0, 'r', 'Signpost', C.wood, 'direction'],
  ],
  'Games & kids': [
    ['lawn-games', 'Lawn games area', 4.0, 3.0, 0.5, 'r', 'Dices', C.green, 'giant jenga connect four'],
    ['cornhole', 'Cornhole', 3.0, 1.2, 0.3, 'r', 'Target', C.green, 'bean bag toss'],
    ['bouncy-castle', 'Bouncy castle', 5.0, 5.0, 3.5, 'r', 'Castle', '#fecdd3', 'jumping inflatable'],
    ['kids-corner', 'Kids corner', 3.0, 3.0, 0.8, 'r', 'Puzzle', C.amber, 'play crafts'],
    ['photo-props', 'Selfie station', 2.0, 1.5, 2.2, 'r', 'Camera', '#fecdd3', 'photobooth props'],
    ['casino-table', 'Casino table', 2.4, 1.2, 0.9, 'r', 'Dices', '#bbf7d0', 'blackjack roulette'],
    ['pool-table', 'Pool table', 2.6, 1.5, 0.8, 'r', 'CircleDot', '#86efac', 'billiards'],
    ['arcade', 'Arcade machine', 0.8, 0.9, 1.8, 'r', 'Gamepad2', C.lilac, 'games'],
  ],
  Vehicles: [
    ['car', 'Car', 4.6, 1.9, 1.5, 'r', 'Car', C.soft, 'getaway wedding'],
    ['van', 'Van', 5.5, 2.1, 2.5, 'r', 'Truck', C.soft, 'delivery'],
    ['truck', 'Truck', 8.0, 2.5, 3.5, 'r', 'Truck', C.soft, 'lorry delivery'],
    ['caravan', 'Caravan / horsebox', 5.0, 2.2, 2.6, 'r', 'Caravan', C.soft, 'bar trailer'],
    ['bus', 'Coach', 12.0, 2.5, 3.5, 'r', 'Bus', C.soft, 'shuttle'],
    ['golf-cart', 'Golf cart', 2.4, 1.2, 1.8, 'r', 'Car', C.soft, 'buggy'],
    ['bike', 'Bike parking', 2.0, 1.0, 1.0, 'r', 'Bike', C.soft, 'bicycle rack'],
  ],
}

export const ASSETS: AssetDef[] = (Object.entries(ROWS) as [AssetGroup, Row[]][]).flatMap(([group, rows]) =>
  rows.map(([key, name, w, d, z, shape, icon, color, tags, resizable]) => ({ key, name, group, w, d, z, shape: shape === 'o' ? 'round' : 'rect', icon, color, tags, resizable })),
)

export const ASSETS_BY_KEY: Record<string, AssetDef> = Object.fromEntries(ASSETS.map((a) => [a.key, a]))
