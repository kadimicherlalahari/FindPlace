// The common listing format every provider must return. The recommendation
// engine only ever sees this shape.
//
// {
//   id, externalId, source, title,
//   location: { address, locality, city, lat, lng },
//   rent, deposit, bhk, sizeSqft, furnishing,  // furnishing: unfurnished|semi-furnished|furnished|null
//   amenities: [token],     // normalized tokens, see FEATURE_PATTERNS
//   amenitiesKnown: bool,   // true when the source gave a structured amenity list
//   photos: [url], availableFrom: 'YYYY-MM-DD' | null, url, description
// }

// Regexes that map free-form amenity names / descriptions to tokens.
const FEATURE_PATTERNS = {
  parking_car: /car\s*parking|covered\s*parking|4[\s-]?wheeler|garage/i,
  parking_bike: /bike\s*parking|two[\s-]?wheeler|2[\s-]?wheeler/i,
  parking: /parking/i,
  pets_allowed: /pets?[\s-]?(friendly|allowed)|pet\s*ok/i,
  no_pets: /no\s*pets|pets?\s*not\s*allowed/i,
  balcony: /balcon/i,
  lift: /\blifts?\b|elevator/i,
  power_backup: /power\s*back\s*up|generator|\bdg\b|inverter/i,
  water_24x7: /24\s*[x×\/*]\s*7\s*water|24\s*hours?\s*water|water\s*supply|borewell|water\s*storage/i,
  security: /security|guard|cctv|gated/i,
  gym: /\bgym|fitness/i,
  pool: /pool/i,
  clubhouse: /club\s*house/i,
  play_area: /play\s*(area|ground)|kids/i,
  garden: /garden|park\b|landscap/i,
  wifi: /wi-?fi|broadband|internet/i,
  ac: /\bac\b|air\s*condition/i,
  washing_machine: /washing\s*machine/i,
  fridge: /fridge|refrigerator/i,
  gas_pipeline: /piped\s*gas|gas\s*pipeline|png\b/i,
  maintenance_staff: /maintenance\s*staff|housekeeping/i,
  intercom: /intercom/i,
};

export function detectFeatures(texts) {
  const joined = texts.filter(Boolean).join(' | ');
  const tokens = Object.entries(FEATURE_PATTERNS).filter(([, re]) => re.test(joined)).map(([t]) => t);
  if (tokens.includes('no_pets')) return tokens.filter((t) => t !== 'pets_allowed');
  return tokens;
}

export function normalizeFurnishing(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (/semi/.test(s)) return 'semi-furnished';
  if (/un\s*-?furnish|not\s*furnished|bare/.test(s)) return 'unfurnished';
  if (/furnish/.test(s)) return 'furnished';
  return null;
}

export const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).toLowerCase().replace(/,/g, '');
  const m = s.match(/([\d.]+)\s*(k|l|lakh|lac|cr)?/);
  if (!m) return null;
  const mult = { k: 1e3, l: 1e5, lakh: 1e5, lac: 1e5, cr: 1e7 }[m[2]] || 1;
  return Number(m[1]) * mult;
};

export function toISODate(v) {
  if (!v) return null;
  if (/immediate|ready|now/i.test(String(v))) return new Date().toISOString().slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Build a complete normalized listing from partial provider data.
export function makeListing(source, p) {
  const amenityNames = (p.amenities || []).map(String);
  const amenities = detectFeatures([...amenityNames, p.description, p.title]);
  return {
    id: `${source}:${p.externalId}`,
    externalId: String(p.externalId),
    source,
    title: p.title || `${p.bhk ?? ''} BHK in ${p.locality || p.city || 'unknown area'}`.trim(),
    location: {
      address: p.address || null,
      locality: p.locality || null,
      city: p.city || null,
      lat: toNumber(p.lat),
      lng: toNumber(p.lng),
    },
    rent: toNumber(p.rent),
    deposit: toNumber(p.deposit),
    bhk: toNumber(p.bhk),
    sizeSqft: toNumber(p.sizeSqft),
    furnishing: normalizeFurnishing(p.furnishing),
    amenities,
    amenitiesKnown: amenityNames.length > 0,
    photos: (p.photos || []).filter(Boolean).slice(0, 10),
    availableFrom: toISODate(p.availableFrom),
    url: p.url || null,
    description: p.description || '',
  };
}
