// Single source of truth for every preference a person can set.
// The web form is rendered from this list (served at /api/schema) and the
// evaluator in engine/evaluate.js has one check per key.
//
// Each person marks every preference as:
//   must -> "No Compromise"  (hard filter: violating listings are eliminated)
//   flex -> "Can Compromise" (scoring factor: shortfalls lower the score)
//
// `weight` is how much a flex preference counts in that person's score.

export const AMENITIES = [
  ['gym', 'Gym'],
  ['pool', 'Swimming pool'],
  ['clubhouse', 'Clubhouse'],
  ['play_area', "Play area"],
  ['garden', 'Garden / park'],
  ['wifi', 'Wi-Fi / broadband'],
  ['ac', 'Air conditioning'],
  ['washing_machine', 'Washing machine'],
  ['fridge', 'Refrigerator'],
  ['gas_pipeline', 'Piped gas'],
  ['maintenance_staff', 'Maintenance staff'],
  ['intercom', 'Intercom'],
];

export const FURNISHING = [
  ['unfurnished', 'Unfurnished'],
  ['semi-furnished', 'Semi-furnished'],
  ['furnished', 'Fully furnished'],
];

export const COMMUTE_MODES = [
  ['driving', 'Car'],
  ['two_wheeler', 'Two-wheeler'],
  ['transit', 'Public transport'],
  ['cycling', 'Cycling'],
  ['walking', 'Walking'],
];

export const PREFERENCES = [
  {
    key: 'locations', label: 'Preferred areas', weight: 1.5,
    fields: [{ name: 'areas', type: 'text', label: 'Areas / neighbourhoods', placeholder: 'e.g. Indiranagar, Koramangala, HSR Layout', required: true }],
    notePlaceholder: 'Why these areas? Anything to avoid?',
  },
  {
    key: 'maxRent', label: 'Rent budget', weight: 2,
    fields: [{ name: 'amount', type: 'number', label: 'Max rent per month, your share (₹)', placeholder: '20000', required: true }],
    notePlaceholder: 'e.g. could stretch a little for a great place',
    help: 'We split the total rent three ways when comparing.',
  },
  {
    key: 'maxDeposit', label: 'Deposit budget', weight: 1,
    fields: [{ name: 'amount', type: 'number', label: 'Max deposit, your share (₹)', placeholder: '60000', required: true }],
  },
  {
    key: 'bhk', label: 'Bedrooms', weight: 1.5,
    fields: [{ name: 'min', type: 'number', label: 'Minimum BHK (bedrooms)', placeholder: '3', required: true }],
    notePlaceholder: 'e.g. need a room for a home office',
  },
  {
    key: 'furnishing', label: 'Furnishing', weight: 1,
    fields: [{ name: 'accepted', type: 'multi', label: 'Acceptable furnishing', options: FURNISHING, required: true }],
    notePlaceholder: 'Specific furniture you need?',
  },
  {
    key: 'minSize', label: 'Size', weight: 1,
    fields: [{ name: 'sqft', type: 'number', label: 'Minimum carpet area (sq ft)', placeholder: '1200', required: true }],
  },
  {
    key: 'commute', label: 'Commute', weight: 1.5,
    fields: [
      { name: 'from', type: 'text', label: 'Commuting to (office / college address)', placeholder: 'e.g. Manyata Tech Park, Bengaluru', required: true },
      { name: 'maxMinutes', type: 'number', label: 'Max one-way time (minutes)', placeholder: '40' },
      { name: 'maxKm', type: 'number', label: 'or max distance (km)', placeholder: '10' },
      { name: 'mode', type: 'select', label: 'How you travel', options: COMMUTE_MODES },
    ],
    notePlaceholder: 'Days per week in office, travel times, etc.',
  },
  {
    key: 'parking', label: 'Parking', weight: 1,
    fields: [{ name: 'type', type: 'select', label: 'Parking needed for', options: [['two_wheeler', 'Two-wheeler'], ['car', 'Car']], required: true }],
    notePlaceholder: 'Covered? How many vehicles?',
  },
  {
    key: 'pets', label: 'Pets', weight: 1,
    fields: [{ name: 'needed', type: 'toggle', label: 'I have / want a pet' }],
    notePlaceholder: 'What pet(s)? Size / breed?',
    noteRequired: true,
  },
  { key: 'balcony', label: 'Balcony', weight: 0.75, fields: [{ name: 'needed', type: 'toggle', label: 'Needs a balcony' }], notePlaceholder: 'Private balcony? For plants, drying clothes?' },
  { key: 'lift', label: 'Lift', weight: 0.75, fields: [{ name: 'needed', type: 'toggle', label: 'Needs a lift' }], notePlaceholder: 'e.g. only if above 2nd floor' },
  { key: 'powerBackup', label: 'Power backup', weight: 1, fields: [{ name: 'needed', type: 'toggle', label: 'Needs power backup' }], notePlaceholder: 'Full backup or lifts & lights only?' },
  { key: 'water', label: 'Water supply', weight: 1, fields: [{ name: 'needed', type: 'toggle', label: 'Needs 24×7 water' }], notePlaceholder: 'Borewell / municipal / tanker concerns?' },
  { key: 'security', label: 'Security', weight: 1, fields: [{ name: 'needed', type: 'toggle', label: 'Needs security (guard / gated / CCTV)' }], notePlaceholder: 'What level of security matters to you?' },
  {
    key: 'amenities', label: 'Amenities', weight: 1,
    fields: [
      { name: 'items', type: 'multi', label: 'Amenities you want', options: AMENITIES },
      { name: 'other', type: 'text', label: 'Other amenities', placeholder: 'e.g. near a metro station, co-working space' },
    ],
  },
  {
    key: 'moveIn', label: 'Move-in date', weight: 1,
    fields: [
      { name: 'date', type: 'date', label: 'Want to move in by', required: true },
      { name: 'flexDays', type: 'number', label: 'Days of flexibility', placeholder: '15' },
    ],
    notePlaceholder: 'Notice period, lease ending, etc.',
  },
  {
    key: 'other', label: 'Anything else', weight: 1,
    fields: [{ name: 'text', type: 'textarea', label: 'Describe it in your own words', placeholder: 'e.g. not a ground floor, quiet street, close to a supermarket, no brokerage', required: true }],
    help: 'We turn this into checks against every listing.',
    noNote: true,
  },
];

export const PREF_BY_KEY = Object.fromEntries(PREFERENCES.map((p) => [p.key, p]));

// A preference is "set" when all its required fields have a value.
export function isPreferenceSet(key, value) {
  const def = PREF_BY_KEY[key];
  if (!def || !value) return false;
  const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || v === false;
  const required = def.fields.filter((f) => f.required);
  if (required.length) return required.every((f) => !empty(value[f.name]));
  return def.fields.some((f) => !empty(value[f.name]));
}

// Presentation: an emoji per preference and the wizard steps they appear in.
const EMOJI = {
  locations: '📍', commute: '🚌', moveIn: '📅', maxRent: '💸', maxDeposit: '🔐',
  bhk: '🛏️', minSize: '📐', furnishing: '🛋️', balcony: '🪴', lift: '🛗',
  parking: '🛵', pets: '🐾', water: '🚿', powerBackup: '🔌', security: '🛡️',
  amenities: '🏋️‍♀️', other: '✨',
};
for (const p of PREFERENCES) p.emoji = EMOJI[p.key];

export const STEPS = [
  { title: 'Where & when', emoji: '🗺️', blurb: 'Neighbourhoods, your commute and when you want to move.', keys: ['locations', 'commute', 'moveIn'] },
  { title: 'Money talk', emoji: '💰', blurb: 'Your share only. Rent is split three ways.', keys: ['maxRent', 'maxDeposit'] },
  { title: 'The flat', emoji: '🏡', blurb: 'Size, rooms and the little things.', keys: ['bhk', 'minSize', 'furnishing', 'balcony', 'lift'] },
  { title: 'Daily life', emoji: '☕', blurb: 'What makes a place work day to day.', keys: ['parking', 'pets', 'water', 'powerBackup', 'security', 'amenities'] },
  { title: 'Anything else?', emoji: '💭', blurb: 'Say it in your own words. We\'ll figure it out.', keys: ['other'] },
];
