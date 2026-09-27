// Deterministic sample listings for development without a RapidAPI key.
// Known Bengaluru localities come with coordinates; any other location the
// group types gets listings too (without coordinates).
import { makeListing } from './normalize.js';

const LOCALITIES = {
  indiranagar: [12.9719, 77.6412], koramangala: [12.9352, 77.6245], 'hsr layout': [12.9116, 77.6474],
  whitefield: [12.9698, 77.75], 'electronic city': [12.8456, 77.6603], hebbal: [13.0358, 77.597],
  jayanagar: [12.925, 77.5938], 'bellandur': [12.9304, 77.6784], marathahalli: [12.9569, 77.7011],
  'btm layout': [12.9166, 77.6101], 'jp nagar': [12.9063, 77.5857], yelahanka: [13.1005, 77.5963],
};
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

function rng(seed) {
  let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function generate(location, count) {
  const key = location.trim().toLowerCase();
  const coords = LOCALITIES[key];
  const r = rng(key);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const out = [];
  for (let i = 0; i < count; i++) {
    const bhk = pick([2, 3, 3, 3, 4]);
    const size = Math.round((bhk * 420 + r() * 500) / 10) * 10;
    const rent = Math.round((bhk * 14000 + r() * 30000) / 500) * 500;
    const amenities = AMENITY_POOL.filter(() => r() > 0.45);
    const days = Math.floor(r() * 60) - 10;
    const available = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    const name = location.trim().replace(/\b\w/g, (c) => c.toUpperCase());
    out.push(makeListing('mock', {
      externalId: `${key.replace(/\W+/g, '-')}-${i + 1}`,
      title: `${bhk} BHK ${pick(['apartment', 'flat', 'gated-community flat', 'independent floor'])} in ${name}`,
      locality: name,
      city: coords ? 'Bengaluru' : null,
      lat: coords ? coords[0] + (r() - 0.5) * 0.02 : null,
      lng: coords ? coords[1] + (r() - 0.5) * 0.02 : null,
      rent,
      deposit: rent * pick([2, 3, 5, 6, 10]),
      bhk,
      sizeSqft: size,
      furnishing: pick(FURNISH),
      amenities,
      photos: [pick(PHOTOS), pick(PHOTOS)],
      availableFrom: available,
      url: `https://example.com/listings/${key.replace(/\W+/g, '-')}-${i + 1}`,
      description: `${pick(['Spacious', 'Well-lit', 'Newly painted', 'Quiet'])} ${bhk} BHK on floor ${Math.floor(r() * 12)} with ${amenities.slice(0, 3).join(', ').toLowerCase() || 'basic facilities'}. ${r() > 0.7 ? 'Close to metro station.' : ''} ${r() > 0.8 ? 'No brokerage.' : ''}`,
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
