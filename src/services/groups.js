import { randomBytes } from 'node:crypto';
import { db, one } from '../db/index.js';
import { PREF_BY_KEY, commuteTrips, isPreferenceSet } from '../preferences.js';
import { interpretFreeText } from './gemini.js';

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const newToken = () => randomBytes(18).toString('base64url');
const cleanUsername = (u) => (u ? String(u).trim().replace(/^@/, '') || null : null);

export async function getGroup(groupId) {
  const group = await one('groups', { id: groupId });
  if (!group) return null;
  const people = await db.select('people', { group_id: groupId }, { order: { column: 'slot' } });
  const prefs = people.length ? await db.select('preferences', { person_id: people.map((p) => p.id) }) : [];
  return { group, people, prefs };
}

// The most recent hunt started in a Telegram chat.
export async function latestGroupForChat(chatId) {
  return (await db.select('groups', { telegram_chat_id: String(chatId) }, { order: { column: 'created_at', ascending: false }, limit: 1 }))[0] || null;
}

export async function createGroup({ name, telegram_chat_id, people }) {
  if (!Array.isArray(people) || people.length !== 3 || people.some((p) => !p.name?.trim())) {
    throw httpError(400, 'A hunt needs exactly 3 friends with names.');
  }
  const names = people.map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== 3) throw httpError(400, 'Each friend needs a different name.');
  const [group] = await db.insert('groups', {
    name: name?.trim() || 'Our flat hunt',
    telegram_chat_id: telegram_chat_id ? String(telegram_chat_id).trim() : null,
  });
  await db.insert('people', people.map((p, slot) => ({
    group_id: group.id, slot, name: p.name.trim(),
    telegram_username: cleanUsername(p.telegram_username), telegram_user_id: p.telegram_user_id ?? null,
    access_token: newToken(), submitted_at: null,
  })));
  return getGroup(group.id);
}

// A private link identifies exactly one person. Returns null for bad tokens.
export async function personByToken(token) {
  if (!token || !/^[\w-]{16,64}$/.test(token)) return null;
  return one('people', { access_token: token });
}

// prefs: { key: { value, priority: 'must'|'flex', note } }. Keys that are
// missing or empty are removed ("doesn't matter to me"). `strict` validates
// fully (used on submit); drafts are saved leniently.
export async function savePreferences(personId, prefs, { strict = false } = {}) {
  const existing = Object.fromEntries((await db.select('preferences', { person_id: personId })).map((p) => [p.key, p]));
  const errors = [];
  const rows = [];
  for (const [key, input] of Object.entries(prefs || {})) {
    const def = PREF_BY_KEY[key];
    if (!def || !isPreferenceSet(key, input?.value)) continue;
    const priority = ['must', 'flex'].includes(input.priority) ? input.priority : 'flex';
    if (key === 'commute' && commuteTrips(input.value).some((t) => !t.maxMinutes && !t.maxKm)) {
      errors.push('Commutes: add a max time or a max distance for each place');
      if (!strict) continue;
    }
    const value = coerce(def, input.value);
    const freeText = key === 'other' ? value.text : key === 'amenities' ? value.other : null;
    const prev = existing[key];
    const field = key === 'other' ? 'text' : 'other';
    const interpreted = freeText
      ? (prev?.interpreted && prev.value?.[field] === freeText ? prev.interpreted : await interpretFreeText(freeText))
      : null;
    rows.push({ person_id: personId, key, value, priority, note: input.note?.trim() || null, interpreted, updated_at: new Date().toISOString() });
  }
  if (strict && errors.length) throw httpError(400, errors.join('\n'));
  const keep = new Set(rows.map((r) => r.key));
  for (const key of Object.keys(existing)) if (!keep.has(key)) await db.remove('preferences', { person_id: personId, key });
  if (rows.length) await db.upsert('preferences', rows, 'person_id,key');
  return db.select('preferences', { person_id: personId });
}

// Save + mark submitted. Returns the group's people so the caller can tell
// whether everyone is done.
export async function submitPreferences(person, prefs) {
  const saved = await savePreferences(person.id, prefs, { strict: true });
  if (!saved.length) throw httpError(400, 'Add at least one preference before submitting.');
  const wasSubmitted = Boolean(person.submitted_at);
  await db.update('people', { id: person.id }, { submitted_at: new Date().toISOString() });
  const people = await db.select('people', { group_id: person.group_id }, { order: { column: 'slot' } });
  return { saved, people, wasSubmitted, allSubmitted: people.every((p) => p.submitted_at) };
}

function coerce(def, value) {
  if (def.key === 'commute') {
    const trip = def.fields[0];
    return { trips: commuteTrips(value).slice(0, trip.max).map((t) => coerceFields(trip.itemFields, t)) };
  }
  return coerceFields(def.fields, value);
}

function coerceFields(fields, value) {
  const out = {};
  for (const f of fields) {
    const v = value[f.name];
    if (v === undefined || v === '' || v === null) continue;
    out[f.name] = f.type === 'number' ? Number(v) : f.type === 'toggle' ? Boolean(v) : f.type === 'multi' ? [].concat(v) : String(v).trim();
  }
  return out;
}
