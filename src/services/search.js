// Orchestrates one search run: fetch -> normalize -> filter -> rank ->
// explain -> store -> ask for compromises -> notify Telegram.
import { db } from '../db/index.js';
import { config } from '../config.js';
import { commuteTrips } from '../preferences.js';
import { fetchListings } from '../providers/index.js';
import { resolveCoordinates } from '../engine/commute.js';
import { rankListings } from '../engine/rank.js';
import { explainTop } from './gemini.js';
import { getGroup, httpError } from './groups.js';
import { deriveStatus, latestRun } from './runs.js';

// In-process lock plus a DB check, since on Vercel two submissions can land
// on different instances. A run stuck "running" for 5+ minutes is ignored.
const running = new Set();
const STALE_MS = 5 * 60 * 1000;

const areasOf = (p) => String(p.value.areas).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

export function buildQuery(people, prefs) {
  const of = (key) => prefs.filter((p) => p.key === key);
  // Don't fetch an area someone has ruled out as a No Compromise: nothing there can make the shortlist.
  const banned = new Set(of('avoidAreas').filter((p) => p.priority === 'must').flatMap(areasOf).map((a) => a.toLowerCase()));
  const locations = [...new Set(of('locations').flatMap(areasOf))].filter((a) => !banned.has(a.toLowerCase()));
  const bhks = of('bhk').map((p) => p.value.min);
  const rents = of('maxRent').map((p) => p.value.amount);
  return {
    locations,
    minBhk: bhks.length ? Math.min(...bhks) : undefined,
    // Only cap rent at the API if everyone set a budget; leave 30% headroom for Can Compromise budgets.
    maxRent: rents.length === people.length ? Math.round(Math.max(...rents) * people.length * 1.3) : undefined,
  };
}

export async function runSearch(groupId, { notify = true } = {}) {
  const last = await latestRun(groupId);
  const busy = running.has(groupId) || (last?.status === 'running' && Date.now() - new Date(last.created_at).getTime() < STALE_MS);
  if (busy) throw httpError(409, 'A search is already running for this group.');
  running.add(groupId);
  try {
    return await doRun(groupId, notify);
  } finally {
    running.delete(groupId);
  }
}

async function doRun(groupId, notify) {
  const g = await getGroup(groupId);
  if (!g) throw httpError(404, 'Group not found');
  const { group, people, prefs } = g;
  if (!prefs.length) throw httpError(400, 'Nobody has entered preferences yet.');

  const [run] = await db.insert('search_runs', {
    group_id: groupId, status: 'running', provider: config.listings.provider,
    preferences_snapshot: prefs.map(({ person_id, key, value, priority, note }) => ({ person_id, key, value, priority, note })),
  });

  try {
    const { provider, listings } = await fetchListings(buildQuery(people, prefs));
    if (listings.length) {
      await db.upsert('listings', listings.map((l) => ({ id: l.id, source: l.source, external_id: l.externalId, data: l, fetched_at: new Date().toISOString() })), 'id');
    }

    const origins = [...new Set(prefs.filter((p) => p.key === 'commute').flatMap((p) => commuteTrips(p.value).map((t) => t.from)))];
    const originPoints = origins.length ? await resolveCoordinates(listings, origins) : {};
    const ranking = rankListings(listings, people, prefs, { groupSize: people.length, origins: originPoints }, config.topN);

    // Ranks 1..shortlistSize are the shortlist (explained, with compromise
    // questions); the rest of the top N are kept as runners-up.
    const shortlist = ranking.top.slice(0, config.shortlistSize);
    const explanations = await explainTop(shortlist, people);

    const topIds = new Map(ranking.top.map((r, i) => [r.listing.id, i]));
    const rows = ranking.results.map((r) => {
      const idx = topIds.get(r.listing.id);
      const listed = idx !== undefined && idx < config.shortlistSize;
      return {
        run_id: run.id,
        listing_id: r.listing.id,
        eliminated: r.eliminated,
        eliminations: r.eliminations,
        overall_score: r.overall,
        person_scores: r.personScores,
        unmet: r.unmet,
        unverified: r.unverified,
        met: idx === undefined ? null : r.met,
        rank: idx === undefined ? null : idx + 1,
        status: listed ? deriveStatus(r.unmet.map(() => ({ status: 'pending' }))) : null,
        explanation: listed ? explanations[idx] : null,
      };
    });
    const saved = rows.length ? await db.insert('evaluations', rows) : [];

    // One compromise question per unmet Can Compromise preference, per top apartment.
    const compromises = saved.filter((e) => e.rank && e.rank <= config.shortlistSize).flatMap((e) => e.unmet.map((u) => ({
      run_id: run.id, evaluation_id: e.id, person_id: u.personId, pref_key: u.key, label: u.label, detail: u.reason, status: 'pending',
    })));
    if (compromises.length) await db.insert('compromises', compromises);

    await db.update('search_runs', { id: run.id }, {
      status: 'done', provider,
      evaluated_count: listings.length,
      eliminated_count: ranking.eliminated.length,
      elimination_summary: ranking.summary,
    });

    let telegram = { sent: false, reason: 'notify disabled' };
    if (notify) {
      const { sendRunToTelegram } = await import('./telegram.js');
      telegram = await sendRunToTelegram(run.id).catch((err) => ({ sent: false, reason: err.message }));
    }
    return { runId: run.id, telegram };
  } catch (err) {
    await db.update('search_runs', { id: run.id }, { status: 'failed', error: err.message });
    throw err;
  }
}
