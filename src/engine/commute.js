// Commute estimate = straight-line distance x road factor / typical city speed.
// It is an estimate, and it is labelled as one everywhere it is shown. To get
// real travel times, swap estimateCommute for a routing API.
import { config } from '../config.js';

const SPEED_KMH = { driving: 22, two_wheeler: 25, transit: 18, cycling: 12, walking: 4.5 };
const ROAD_FACTOR = 1.35;

export function haversineKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function estimateCommute(from, to, mode = 'driving') {
  const km = haversineKm(from, to) * ROAD_FACTOR;
  return { km: Math.round(km * 10) / 10, minutes: Math.round((km / (SPEED_KMH[mode] || 22)) * 60) };
}

const cache = new Map();
let last = 0;

// Nominatim allows 1 request/second and requires an identifying User-Agent.
export async function geocode(q) {
  if (!q || config.geocoder.kind !== 'nominatim') return null;
  const key = q.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { 'user-agent': `apartment-matchmaker (${config.geocoder.contact})` },
    });
    const [hit] = res.ok ? await res.json() : [];
    const point = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    cache.set(key, point);
    return point;
  } catch {
    return null;
  }
}

// Fill in coordinates for listings (by locality, deduplicated) and commute origins.
export async function resolveCoordinates(listings, origins, maxLookups = 15) {
  const originPoints = {};
  for (const o of origins) originPoints[o] = await geocode(o);
  const localities = [...new Set(listings.filter((l) => l.location.lat == null)
    .map((l) => [l.location.locality, l.location.city].filter(Boolean).join(', ')).filter(Boolean))].slice(0, maxLookups);
  const points = {};
  for (const loc of localities) points[loc] = await geocode(loc);
  for (const l of listings) {
    if (l.location.lat != null) continue;
    const p = points[[l.location.locality, l.location.city].filter(Boolean).join(', ')];
    if (p) Object.assign(l.location, p, { approximate: true });
  }
  return originPoints;
}
