// Pure ranking logic: no I/O, so it can be unit-tested and reused regardless
// of which listings provider or database is in use.
//
// 1. Hard filter: any No Compromise preference that fails eliminates the
//    listing, and we record whose requirement it violated and why.
// 2. Score survivors per person (0-100), weighted by preference importance.
// 3. Group score blends the average with the lowest individual score, so a
//    flat that is great for two people and bad for the third ranks below one
//    that everyone finds decent. The aim is agreement, not a single "best".
import { PREF_BY_KEY } from '../preferences.js';
import { evaluatePreference } from './evaluate.js';

export const MEAN_WEIGHT = 0.6;
export const MIN_WEIGHT = 0.4;
const UNKNOWN_CREDIT = 0.7;

export function scoreGroup(personScores) {
  const vals = Object.values(personScores);
  if (!vals.length) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(MEAN_WEIGHT * mean + MIN_WEIGHT * Math.min(...vals));
}

// people: [{id, name}], prefs: [{person_id, key, value, priority, note, interpreted}]
export function evaluateListing(listing, people, prefs, ctx) {
  const eliminations = [], unmet = [], unverified = [], met = [], personScores = {}, details = [];
  for (const person of people) {
    let total = 0, weightSum = 0;
    for (const pref of prefs.filter((p) => p.person_id === person.id)) {
      const def = PREF_BY_KEY[pref.key];
      const r = evaluatePreference(listing, pref, ctx);
      const entry = { personId: person.id, personName: person.name, key: pref.key, label: def.label, priority: pref.priority, reason: r.reason, status: r.status };
      details.push(entry);
      if (r.status === 'pass') met.push(entry);
      if (pref.priority === 'must') {
        if (r.status === 'fail' || r.status === 'partial') eliminations.push(entry);
        if (r.status === 'unknown') unverified.push(entry);
        total += def.weight * (r.status === 'unknown' ? UNKNOWN_CREDIT : 1);
      } else {
        if (r.status === 'fail' || r.status === 'partial') unmet.push({ ...entry, degree: r.degree });
        if (r.status === 'unknown') unverified.push(entry);
        total += def.weight * (r.status === 'unknown' ? Math.max(r.degree, UNKNOWN_CREDIT) : r.degree);
      }
      weightSum += def.weight;
    }
    personScores[person.id] = weightSum ? Math.round((100 * total) / weightSum) : 100;
  }
  return {
    listing,
    eliminated: eliminations.length > 0,
    eliminations,
    personScores,
    overall: eliminations.length ? null : scoreGroup(personScores),
    unmet,
    unverified,
    met,
    details,
  };
}

export function rankListings(listings, people, prefs, ctx, topN = 10) {
  const results = listings.map((l) => evaluateListing(l, people, prefs, ctx));
  const survivors = results.filter((r) => !r.eliminated).sort((a, b) =>
    b.overall - a.overall
    || Math.min(...Object.values(b.personScores)) - Math.min(...Object.values(a.personScores))
    || a.unmet.length - b.unmet.length
    || (a.listing.rent ?? Infinity) - (b.listing.rent ?? Infinity));
  const eliminated = results.filter((r) => r.eliminated);
  return {
    results,
    top: survivors.slice(0, topN),
    survivorsCount: survivors.length,
    eliminated,
    summary: summarizeEliminations(eliminated),
  };
}

// "Main reasons for elimination": each (person, preference) pair and how many
// listings it knocked out. One listing can be knocked out by several.
export function summarizeEliminations(eliminated) {
  const byReason = new Map();
  for (const r of eliminated) {
    for (const e of r.eliminations) {
      const k = `${e.personId}|${e.key}`;
      const cur = byReason.get(k) || { personId: e.personId, personName: e.personName, key: e.key, label: e.label, count: 0, example: e.reason };
      cur.count++;
      byReason.set(k, cur);
    }
  }
  return [...byReason.values()].sort((a, b) => b.count - a.count);
}
