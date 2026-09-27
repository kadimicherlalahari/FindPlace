import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeListing } from '../src/providers/normalize.js';
import { rankListings, scoreGroup } from '../src/engine/rank.js';
import { getPath } from '../src/providers/rapidapi.js';

const people = [{ id: 'a', name: 'Asha' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Chen' }];
const flat = (id, p) => makeListing('t', { externalId: id, locality: 'Koramangala', city: 'Bengaluru', lat: 12.93, lng: 77.62, ...p });
const pref = (person_id, key, value, priority = 'flex') => ({ person_id, key, value, priority });
const ctx = { groupSize: 3, origins: { Office: { lat: 12.97, lng: 77.64 } } };

test('No Compromise violation eliminates and records whose rule and why', () => {
  const listings = [flat('1', { rent: 60000, bhk: 3 }), flat('2', { rent: 90000, bhk: 3 })];
  const prefs = [pref('a', 'maxRent', { amount: 25000 }, 'must')];
  const r = rankListings(listings, people, prefs, ctx);
  assert.equal(r.top.length, 1);
  assert.equal(r.eliminated.length, 1);
  const e = r.eliminated[0].eliminations[0];
  assert.equal(e.personName, 'Asha');
  assert.equal(e.key, 'maxRent');
  assert.match(e.reason, /₹30,000.*₹5,000 over/);
  assert.equal(r.summary[0].count, 1);
});

test('Can Compromise shortfall lowers only that person\'s score and is listed as unmet', () => {
  const listings = [flat('1', { rent: 81000, bhk: 3 })];
  const prefs = [pref('a', 'maxRent', { amount: 25000 }), pref('b', 'bhk', { min: 3 })];
  const [top] = rankListings(listings, people, prefs, ctx).top;
  assert.ok(top.personScores.a < 100);
  assert.equal(top.personScores.b, 100);
  assert.equal(top.personScores.c, 100);
  assert.deepEqual(top.unmet.map((u) => [u.personId, u.key]), [['a', 'maxRent']]);
});

test('unknown data never eliminates, it is flagged for verification', () => {
  const listings = [flat('1', { rent: 60000 })]; // no amenity list, pet policy unknown
  const prefs = [pref('c', 'pets', { needed: true }, 'must')];
  const r = rankListings(listings, people, prefs, ctx);
  assert.equal(r.top.length, 1);
  assert.equal(r.top[0].unverified[0].personName, 'Chen');
});

test('explicit "no pets" does eliminate', () => {
  const r = rankListings([flat('1', { description: 'Sorry, no pets.' })], people, [pref('c', 'pets', { needed: true }, 'must')], ctx);
  assert.equal(r.top.length, 0);
});

test('group score favours balanced flats over lopsided ones', () => {
  assert.ok(scoreGroup({ a: 80, b: 80, c: 80 }) > scoreGroup({ a: 100, b: 100, c: 45 }));
});

test('commute check uses estimated time against the limit', () => {
  const near = flat('near', { lat: 12.968, lng: 77.641 });
  const far = flat('far', { lat: 12.84, lng: 77.66 });
  const prefs = [pref('a', 'commute', { from: 'Office', maxMinutes: 20, mode: 'driving' }, 'must')];
  const r = rankListings([near, far], people, prefs, ctx);
  assert.deepEqual(r.top.map((t) => t.listing.externalId), ['near']);
  assert.match(r.eliminated[0].eliminations[0].reason, /min.*over your 20 min limit/);
});

test('free-text checks from Gemini: avoid keywords eliminate', () => {
  const l = flat('1', { description: 'Ground floor unit near metro' });
  const p = { ...pref('b', 'other', { text: 'not ground floor' }, 'must'), interpreted: { checks: [{ label: 'Not ground floor', keywords: ['ground floor'], avoid: true }] } };
  assert.equal(rankListings([l], people, [p], ctx).top.length, 0);
});

test('normalizer detects amenities and furnishing', () => {
  const l = makeListing('t', { externalId: 1, furnishing: 'Semi Furnished', amenities: ['Lift', 'Covered car parking', 'DG power backup'], rent: '45,000' });
  assert.equal(l.furnishing, 'semi-furnished');
  assert.equal(l.rent, 45000);
  for (const t of ['lift', 'parking_car', 'power_backup']) assert.ok(l.amenities.includes(t), t);
});

test('rapidapi path mapping handles nested arrays', () => {
  assert.deepEqual(getPath({ images: [{ url: 'x' }, { url: 'y' }] }, 'images[].url'), ['x', 'y']);
  assert.equal(getPath({ a: { b: 3 } }, 'a.b'), 3);
});

test('negated mentions in a listing do not trigger avoid checks', () => {
  const l = flat('1', { description: 'Semi-furnished, no brokerage, not on ground floor' });
  const avoid = { ...pref('b', 'other', { text: 'x' }, 'must'), interpreted: { checks: [{ label: 'No ground floor', keywords: ['ground floor'], avoid: true }] } };
  assert.equal(rankListings([l], people, [avoid], ctx).top.length, 1);
  const want = { ...pref('b', 'other', { text: 'x' }), interpreted: { checks: [{ label: 'No brokerage', keywords: ['no brokerage'], avoid: false }] } };
  assert.equal(rankListings([l], people, [want], ctx).top[0].unmet.length, 0);
});

test('areas someone won\'t consider eliminate when No Compromise', () => {
  const listings = [flat('1', { locality: 'Whitefield' }), flat('2', { locality: 'Indiranagar' })];
  const prefs = [pref('a', 'avoidAreas', { areas: 'Whitefield, Electronic City' }, 'must')];
  const r = rankListings(listings, people, prefs, ctx);
  assert.deepEqual(r.top.map((t) => t.listing.location.locality), ['Indiranagar']);
  assert.match(r.eliminated[0].eliminations[0].reason, /Whitefield, an area you ruled out/);
});

test('bathrooms below the minimum is unmet, unknown is flagged', () => {
  const [few, unknownBaths] = [flat('1', { bathrooms: 1 }), flat('2', {})];
  const r = rankListings([few, unknownBaths], people, [pref('b', 'bathrooms', { min: 2 })], ctx);
  const byId = Object.fromEntries(r.top.map((t) => [t.listing.externalId, t]));
  assert.match(byId['1'].unmet[0].reason, /Only 1 bathroom, you want 2\+/);
  assert.equal(byId['2'].unverified[0].key, 'bathrooms');
});

test('every commute trip must be within its own limit', () => {
  const l = flat('1', { lat: 12.968, lng: 77.641 });
  const c = { ...ctx, origins: { Office: { lat: 12.97, lng: 77.64 }, Gym: { lat: 13.10, lng: 77.59 } } };
  const trips = [{ name: 'Office', from: 'Office', maxMinutes: 20 }, { name: 'Gym', from: 'Gym', maxMinutes: 20 }];
  const r = rankListings([l], people, [pref('a', 'commute', { trips }, 'must')], c);
  assert.equal(r.top.length, 0);
  assert.match(r.eliminated[0].eliminations[0].reason, /to Office.*; ~\d+ min.*to Gym.*over your 20 min limit/);
  // Only the office trip: passes.
  assert.equal(rankListings([l], people, [pref('a', 'commute', { trips: [trips[0]] }, 'must')], c).top.length, 1);
});

test('legacy single-trip commute values still work', () => {
  const l = flat('1', { lat: 12.968, lng: 77.641 });
  const r = rankListings([l], people, [pref('a', 'commute', { from: 'Office', maxMinutes: 20 }, 'must')], ctx);
  assert.equal(r.top.length, 1);
});

test('lift is only needed above the chosen floor', () => {
  const walkUp = (id, floor) => flat(id, { floor, amenities: ['Power backup'] });
  const prefs = [pref('b', 'lift', { needed: true, aboveFloor: 1 }, 'must')];
  const r = rankListings([walkUp('first', 1), walkUp('fifth', 5), flat('lifted', { floor: 5, amenities: ['Lift'] })], people, prefs, ctx);
  assert.deepEqual(r.top.map((t) => t.listing.externalId).sort(), ['first', 'lifted']);
  assert.match(r.eliminated[0].eliminations[0].reason, /Floor 5 and no lift listed/);
});

test('floor is read from structured data or the description', () => {
  assert.equal(makeListing('t', { externalId: 1, floor: '3' }).floor, 3);
  assert.equal(makeListing('t', { externalId: 1, description: 'Bright flat on the 5th floor' }).floor, 5);
  assert.equal(makeListing('t', { externalId: 1, description: 'Ground floor unit' }).floor, 0);
  assert.equal(makeListing('t', { externalId: 1, description: 'Near metro' }).floor, null);
});

test('met lists what each person gets, alongside what they give up', () => {
  const l = flat('1', { rent: 60000, bhk: 2 });
  const prefs = [pref('a', 'maxRent', { amount: 25000 }), pref('a', 'bhk', { min: 3 })];
  const [top] = rankListings([l], people, prefs, ctx).top;
  assert.deepEqual(top.met.map((m) => [m.personId, m.key]), [['a', 'maxRent']]);
  assert.deepEqual(top.unmet.map((m) => [m.personId, m.key]), [['a', 'bhk']]);
});
