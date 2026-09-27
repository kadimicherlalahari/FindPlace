// One check per preference key. Each returns
//   { status: 'pass' | 'partial' | 'fail' | 'unknown', degree: 0..1, reason }
// where degree is how well the listing satisfies the preference (used for
// scoring flex preferences) and reason is a human-readable explanation.
//
// 'unknown' means the listing data doesn't say. A No Compromise preference
// that is unknown does NOT eliminate the listing; it is flagged "verify
// before visiting" instead, so missing data never silently hides a good flat.
import { AMENITIES, FURNISHING, COMMUTE_MODES, commuteTrips } from '../preferences.js';
import { estimateCommute } from './commute.js';

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const label = (list, v) => (list.find(([k]) => k === v) || [v, v])[1];
const pass = (reason) => ({ status: 'pass', degree: 1, reason });
const fail = (reason, degree = 0) => ({ status: degree > 0 ? 'partial' : 'fail', degree, reason });
const unknown = (reason) => ({ status: 'unknown', degree: 0.5, reason });
// Linear falloff: at `limit` degree=1, at limit*(1+tolerance) degree=0.
const falloff = (actual, limit, tolerance) => Math.max(0, Math.min(1, 1 - (actual - limit) / (limit * tolerance)));

const has = (l, token) => l.amenities.includes(token);
const splitAreas = (v) => String(v || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
const whereText = (l) => [l.location.locality, l.location.address, l.location.city, l.title].filter(Boolean).join(' ').toLowerCase();
const floorName = (f) => (f === 0 ? 'Ground floor' : `Floor ${f}`);
const text = (l) => `${l.title} ${l.description} ${l.location.address || ''} ${l.location.locality || ''}`.toLowerCase();

function amenityCheck(l, token, name) {
  if (has(l, token)) return pass(`Has ${name}`);
  if (l.amenitiesKnown) return fail(`No ${name} listed`);
  return unknown(`Listing doesn't say whether it has ${name}`);
}

export const CHECKS = {
  locations(l, v) {
    const areas = splitAreas(v.areas);
    const hit = areas.find((a) => whereText(l).includes(a.toLowerCase()));
    return hit ? pass(`In ${l.location.locality || hit}`)
      : fail(`In ${l.location.locality || l.location.city || 'another area'}, not in ${areas.join(', ')}`);
  },

  avoidAreas(l, v) {
    const hit = splitAreas(v.areas).find((a) => whereText(l).includes(a.toLowerCase()));
    return hit ? fail(`In ${l.location.locality || hit}, an area you ruled out`)
      : pass(`Not in ${splitAreas(v.areas).join(', ')}`);
  },

  maxRent(l, v, ctx) {
    if (l.rent == null) return unknown('Rent not listed');
    const share = l.rent / ctx.groupSize;
    return share <= v.amount ? pass(`Your share ${inr(share)} is within ${inr(v.amount)}`)
      : fail(`Your share ${inr(share)} is ${inr(share - v.amount)} over your ${inr(v.amount)} budget`, falloff(share, v.amount, 0.3));
  },

  maxDeposit(l, v, ctx) {
    if (l.deposit == null) return unknown('Deposit not listed');
    const share = l.deposit / ctx.groupSize;
    return share <= v.amount ? pass(`Deposit share ${inr(share)} is within ${inr(v.amount)}`)
      : fail(`Deposit share ${inr(share)} is ${inr(share - v.amount)} over your ${inr(v.amount)} limit`, falloff(share, v.amount, 0.5));
  },

  bhk(l, v) {
    if (l.bhk == null) return unknown('BHK not listed');
    return l.bhk >= v.min ? pass(`${l.bhk} BHK`) : fail(`Only ${l.bhk} BHK, you want ${v.min}+`, Math.max(0, (l.bhk - (v.min - 2)) / 2) * 0.5);
  },

  bathrooms(l, v) {
    if (l.bathrooms == null) return unknown('Bathrooms not listed');
    const n = (x) => `${x} bathroom${x === 1 ? '' : 's'}`;
    return l.bathrooms >= v.min ? pass(n(l.bathrooms)) : fail(`Only ${n(l.bathrooms)}, you want ${v.min}+`, l.bathrooms / v.min * 0.5);
  },

  furnishing(l, v) {
    if (!l.furnishing) return unknown('Furnishing not listed');
    const ok = v.accepted.includes(l.furnishing);
    const names = v.accepted.map((x) => label(FURNISHING, x)).join(' / ');
    return ok ? pass(label(FURNISHING, l.furnishing))
      : fail(`${label(FURNISHING, l.furnishing)}, you want ${names}`);
  },

  minSize(l, v) {
    if (l.sizeSqft == null) return unknown('Size not listed');
    return l.sizeSqft >= v.sqft ? pass(`${l.sizeSqft} sq ft`)
      : fail(`${l.sizeSqft} sq ft, ${v.sqft - l.sizeSqft} sq ft smaller than your ${v.sqft}`, Math.max(0, 1 - (v.sqft - l.sizeSqft) / (v.sqft * 0.3)));
  },

  // Up to three trips (office, gym, family). The preference passes only when
  // every trip is within its limit; degree is the average across trips.
  commute(l, v, ctx) {
    const trips = commuteTrips(v).map((t) => ({ t, r: checkTrip(l, t, ctx) }));
    if (!trips.length) return pass('No commute set');
    if (trips.length === 1) return trips[0].r;
    const degree = trips.reduce((s, x) => s + x.r.degree, 0) / trips.length;
    const reason = trips.map((x) => x.r.reason).join('; ');
    if (trips.some((x) => x.r.status === 'fail' || x.r.status === 'partial')) return fail(reason, degree);
    if (trips.some((x) => x.r.status === 'unknown')) return { ...unknown(reason), degree };
    return pass(reason);
  },

  parking(l, v) {
    if (v.type === 'car') {
      if (has(l, 'parking_car')) return pass('Car parking');
      if (has(l, 'parking')) return unknown('Parking listed, but not clear if it fits a car');
    } else if (has(l, 'parking_bike') || has(l, 'parking_car') || has(l, 'parking')) {
      return pass('Two-wheeler parking');
    }
    const what = v.type === 'car' ? 'car parking' : 'two-wheeler parking';
    return l.amenitiesKnown ? fail(`No ${what} listed`) : unknown(`Listing doesn't mention ${what}`);
  },

  pets(l) {
    if (has(l, 'pets_allowed')) return pass('Pet-friendly');
    if (has(l, 'no_pets')) return fail('Pets not allowed');
    return unknown('Pet policy not stated, ask the owner');
  },

  balcony: (l) => amenityCheck(l, 'balcony', 'balcony'),
  // "Needs a lift above floor N": a low floor is fine without one.
  lift(l, v) {
    if (has(l, 'lift')) return pass(l.floor != null ? `Has a lift (${floorName(l.floor).toLowerCase()})` : 'Has a lift');
    const limit = v.aboveFloor == null || v.aboveFloor === '' ? null : Number(v.aboveFloor);
    if (limit != null && l.floor != null && l.floor <= limit) return pass(`${floorName(l.floor)}, no lift needed`);
    const where = l.floor != null ? `${floorName(l.floor)}` : 'Floor not listed';
    if (l.amenitiesKnown) return fail(`${where} and no lift listed`);
    return unknown(`${where}; listing doesn't say whether it has a lift`);
  },
  powerBackup: (l) => amenityCheck(l, 'power_backup', 'power backup'),
  water: (l) => amenityCheck(l, 'water_24x7', '24×7 water'),
  security: (l) => amenityCheck(l, 'security', 'security'),

  amenities(l, v, ctx, pref) {
    const wanted = v.items || [];
    const extra = pref.interpreted?.checks || [];
    const results = [
      ...wanted.map((t) => ({ name: label(AMENITIES, t), ok: has(l, t) ? true : l.amenitiesKnown ? false : null })),
      ...extra.map((c) => ({ name: c.label, ok: keywordCheck(l, c) })),
    ];
    if (!results.length) return pass('No specific amenities');
    const missing = results.filter((r) => r.ok === false).map((r) => r.name);
    const unclear = results.filter((r) => r.ok === null).map((r) => r.name);
    const degree = results.reduce((s, r) => s + (r.ok === true ? 1 : r.ok === null ? 0.5 : 0), 0) / results.length;
    if (!missing.length && !unclear.length) return pass(`Has ${results.map((r) => r.name).join(', ')}`);
    if (!missing.length) return { ...unknown(`Not listed: ${unclear.join(', ')}`), degree };
    return fail(`Missing ${missing.join(', ')}${unclear.length ? `; unclear: ${unclear.join(', ')}` : ''}`, degree);
  },

  moveIn(l, v) {
    if (!l.availableFrom) return unknown('Availability date not listed');
    const want = new Date(v.date).getTime() + (Number(v.flexDays) || 0) * 864e5;
    const lateDays = Math.ceil((new Date(l.availableFrom).getTime() - want) / 864e5);
    return lateDays <= 0 ? pass(`Available from ${l.availableFrom}`)
      : fail(`Available from ${l.availableFrom}, ${lateDays} day${lateDays > 1 ? 's' : ''} after your move-in date`, falloff(lateDays, 1, 30));
  },

  other(l, v, ctx, pref) {
    const checks = pref.interpreted?.checks || [];
    if (!checks.length) return unknown(`Couldn't check "${v.text}" automatically`);
    const results = checks.map((c) => ({ c, ok: keywordCheck(l, c) }));
    const failed = results.filter((r) => r.ok === false).map((r) => r.c.label);
    const unclear = results.filter((r) => r.ok === null).map((r) => r.c.label);
    const degree = results.reduce((s, r) => s + (r.ok === true ? 1 : r.ok === null ? 0.5 : 0), 0) / results.length;
    if (failed.length) return fail(`Doesn't meet: ${failed.join(', ')}`, degree);
    if (unclear.length) return { ...unknown(`Couldn't verify: ${unclear.join(', ')}`), degree };
    return pass(`Meets: ${checks.map((c) => c.label).join(', ')}`);
  },
};

// Gemini turns free text into { label, keywords, avoid } checks.
//   avoid=false: pass if any keyword appears, otherwise unknown
//   avoid=true:  fail if any keyword appears, otherwise pass
//   Listing text like "no brokerage" doesn't count as mentioning "brokerage".
export function keywordCheck(l, c) {
  const t = text(l);
  const found = (c.keywords || []).some((k) => mentions(t, String(k).toLowerCase()));
  if (c.avoid) return found ? false : true;
  return found ? true : null;
}

function mentions(t, k) {
  if (!k) return false;
  for (let i = t.indexOf(k); i !== -1; i = t.indexOf(k, i + 1)) {
    if (/^(no|not|without|zero|non)\b/.test(k) || !/\b(no|not|without|zero|non)([\s-]+(on|a|the|in|any))?[\s-]+$/.test(t.slice(Math.max(0, i - 16), i))) return true;
  }
  return false;
}

function checkTrip(l, v, ctx) {
  const to = v.name ? `${v.name} (${v.from})` : v.from;
  const origin = ctx.origins[v.from];
  if (!origin) return unknown(`Couldn't locate "${v.from}" to estimate commute`);
  if (l.location.lat == null) return unknown('Listing has no location coordinates');
  const mode = v.mode || 'driving';
  const est = estimateCommute(origin, l.location, mode);
  const desc = `~${est.minutes} min / ${est.km} km to ${to} by ${label(COMMUTE_MODES, mode).toLowerCase()} (estimate)`;
  if (!v.maxMinutes && !v.maxKm) return pass(desc);
  const ratio = Math.max(v.maxMinutes ? est.minutes / v.maxMinutes : 0, v.maxKm ? est.km / v.maxKm : 0);
  return ratio <= 1 ? pass(desc) : fail(`${desc}, over your ${v.maxMinutes ? `${v.maxMinutes} min` : `${v.maxKm} km`} limit`, falloff(ratio, 1, 0.5));
}

export function evaluatePreference(listing, pref, ctx) {
  const check = CHECKS[pref.key];
  if (!check) return unknown(`No check for ${pref.key}`);
  return check(listing, pref.value, ctx, pref);
}
