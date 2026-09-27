// One check per preference key. Each returns
//   { status: 'pass' | 'partial' | 'fail' | 'unknown', degree: 0..1, reason }
// where degree is how well the listing satisfies the preference (used for
// scoring flex preferences) and reason is a human-readable explanation.
//
// 'unknown' means the listing data doesn't say. A No Compromise preference
// that is unknown does NOT eliminate the listing; it is flagged "verify
// before visiting" instead, so missing data never silently hides a good flat.
import { AMENITIES, FURNISHING, COMMUTE_MODES } from '../preferences.js';
import { estimateCommute } from './commute.js';

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const label = (list, v) => (list.find(([k]) => k === v) || [v, v])[1];
const pass = (reason) => ({ status: 'pass', degree: 1, reason });
const fail = (reason, degree = 0) => ({ status: degree > 0 ? 'partial' : 'fail', degree, reason });
const unknown = (reason) => ({ status: 'unknown', degree: 0.5, reason });
// Linear falloff: at `limit` degree=1, at limit*(1+tolerance) degree=0.
const falloff = (actual, limit, tolerance) => Math.max(0, Math.min(1, 1 - (actual - limit) / (limit * tolerance)));

const has = (l, token) => l.amenities.includes(token);
const text = (l) => `${l.title} ${l.description} ${l.location.address || ''} ${l.location.locality || ''}`.toLowerCase();

function amenityCheck(l, token, name) {
  if (has(l, token)) return pass(`Has ${name}`);
  if (l.amenitiesKnown) return fail(`No ${name} listed`);
  return unknown(`Listing doesn't say whether it has ${name}`);
}

export const CHECKS = {
  locations(l, v) {
    const areas = String(v.areas).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const where = [l.location.locality, l.location.address, l.location.city, l.title].filter(Boolean).join(' ').toLowerCase();
    const hit = areas.find((a) => where.includes(a.toLowerCase()));
    return hit ? pass(`In ${l.location.locality || hit}`)
      : fail(`In ${l.location.locality || l.location.city || 'another area'}, not in ${areas.join(', ')}`);
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

  commute(l, v, ctx) {
    const origin = ctx.origins[v.from];
    if (!origin) return unknown(`Couldn't locate "${v.from}" to estimate commute`);
    if (l.location.lat == null) return unknown('Listing has no location coordinates');
    const mode = v.mode || 'driving';
    const est = estimateCommute(origin, l.location, mode);
    const desc = `~${est.minutes} min / ${est.km} km to ${v.from} by ${label(COMMUTE_MODES, mode).toLowerCase()} (estimate)`;
    const overMin = v.maxMinutes ? est.minutes / v.maxMinutes : 0;
    const overKm = v.maxKm ? est.km / v.maxKm : 0;
    if (!v.maxMinutes && !v.maxKm) return pass(desc);
    const ratio = Math.max(overMin, overKm);
    return ratio <= 1 ? pass(desc) : fail(`${desc}, over your ${v.maxMinutes ? `${v.maxMinutes} min` : `${v.maxKm} km`} limit`, falloff(ratio, 1, 0.5));
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
  lift: (l) => amenityCheck(l, 'lift', 'lift'),
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

export function evaluatePreference(listing, pref, ctx) {
  const check = CHECKS[pref.key];
  if (!check) return unknown(`No check for ${pref.key}`);
  return check(listing, pref.value, ctx, pref);
}
