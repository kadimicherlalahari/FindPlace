// Deterministic sample listings for development without a RapidAPI key.
// Known Bengaluru localities come with coordinates; any other location the
// group types gets listings too (without coordinates).
import { makeListing } from './normalize.js';

const LOCALITIES = {
  indiranagar: [12.9719, 77.6412], koramangala: [12.9352, 77.6245], 'hsr layout': [12.9116, 77.6474],
  whitefield: [12.9698, 77.75], 'electronic city': [12.8456, 77.6603], hebbal: [13.0358, 77.597],
  jayanagar: [12.925, 77.5938], bellandur: [12.9304, 77.6784], marathahalli: [12.9569, 77.7011],
  'btm layout': [12.9166, 77.6101], 'jp nagar': [12.9063, 77.5857], yelahanka: [13.1005, 77.5963],
  domlur: [12.961, 77.6387], ulsoor: [12.9817, 77.6285], 'mg road': [12.9756, 77.6069],
  'frazer town': [12.9982, 77.6146], malleshwaram: [13.0031, 77.5643], rajajinagar: [12.9913, 77.5543],
  basavanagudi: [12.9417, 77.5755], banashankari: [12.9255, 77.5468], 'sarjapur road': [12.9107, 77.6863],
  'kr puram': [13.0077, 77.6958], 'kalyan nagar': [13.0246, 77.6397], hennur: [13.0359, 77.6434],
  'rt nagar': [13.0213, 77.5946], yeshwanthpur: [13.0285, 77.5409], banaswadi: [13.0141, 77.6518],
  'cv raman nagar': [12.9855, 77.6632], 'bannerghatta road': [12.8876, 77.5973], bommanahalli: [12.9089, 77.6239],
  'richmond town': [12.9602, 77.6006], vijayanagar: [12.9719, 77.5329], 'rr nagar': [12.9274, 77.5155],
};
// "HSR" -> "hsr layout", "Koramangala 5th Block" -> "koramangala".
const findLocality = (key) => (key in LOCALITIES ? key
  : key.length >= 3 ? Object.keys(LOCALITIES).find((k) => k.startsWith(key) || key.startsWith(k)) : undefined);
const AMENITY_POOL = ['Car parking', 'Bike parking', 'Lift', 'Power backup', '24x7 water supply', 'Security guard',
  'CCTV', 'Gym', 'Swimming pool', 'Clubhouse', 'Play area', 'Garden', 'Balcony', 'Pet friendly', 'Wi-Fi',
  'Piped gas', 'Intercom', 'Maintenance staff'];
const FURNISH = ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'];
const PHOTOS = [
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800',
];

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

function rng(seed) {
  let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function generate(location, count) {
  const key = location.trim().toLowerCase();
  const known = findLocality(key);
  const coords = known && LOCALITIES[known];
  const r = rng(key);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const out = [];
  for (let i = 0; i < count; i++) {
    const bhk = pick([2, 3, 3, 3, 4]);
    const kind = pick(['apartment', 'flat', 'gated-community flat', 'independent floor']);
    // Independent floors are usually walk-ups of 2-4 storeys; apartments mostly have lifts.
    const walkUp = kind === 'independent floor';
    const floor = walkUp ? Math.floor(r() * 5) : Math.floor(r() * 14);
    const baths = Math.max(1, bhk - (r() < 0.45 ? 1 : 0));
    const size = Math.round((bhk * 420 + r() * 500) / 10) * 10;
    const rent = Math.round((bhk * 14000 + r() * 30000) / 500) * 500;
    const amenities = AMENITY_POOL.filter((a) => (a === 'Lift' ? (walkUp ? r() > 0.85 : r() > 0.15) : r() > 0.45));
    const days = Math.floor(r() * 60) - 10;
    const available = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    const name = known ? known.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Hsr|Btm|Jp|Mg|Kr|Rt|Cv|Rr)\b/g, (m) => m.toUpperCase())
      : location.trim().replace(/\b\w/g, (c) => c.toUpperCase());
    const floorName = floor === 0 ? 'ground floor' : `${ordinal(floor)} floor`;
    out.push(makeListing('mock', {
      externalId: `${key.replace(/\W+/g, '-')}-${i + 1}`,
      title: `${bhk} BHK ${kind} in ${name}`,
      locality: name,
      city: coords ? 'Bengaluru' : null,
      lat: coords ? coords[0] + (r() - 0.5) * 0.02 : null,
      lng: coords ? coords[1] + (r() - 0.5) * 0.02 : null,
      rent,
      deposit: rent * pick([2, 3, 5, 6, 10]),
      bhk,
      bathrooms: baths,
      floor,
      sizeSqft: size,
      furnishing: pick(FURNISH),
      amenities,
      photos: [pick(PHOTOS), pick(PHOTOS)],
      availableFrom: available,
      url: `https://example.com/listings/${key.replace(/\W+/g, '-')}-${i + 1}`,
      description: `${pick(['Spacious', 'Well-lit', 'Newly painted', 'Quiet'])} ${bhk} BHK, ${baths} bath, on the ${floorName} with ${amenities.slice(0, 3).join(', ').toLowerCase() || 'basic facilities'}. ${r() > 0.7 ? 'Close to metro station.' : ''} ${r() > 0.8 ? 'No brokerage.' : ''}`,
    }));
  }
  return out;
}

export const mockProvider = {
  name: 'mock',
  async search(query) {
    const locations = query.locations.length ? query.locations : Object.keys(LOCALITIES).slice(0, 4);
    return locations.flatMap((loc) => generate(loc, 12));
  },
};
