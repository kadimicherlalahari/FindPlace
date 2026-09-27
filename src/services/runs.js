import { db, one } from '../db/index.js';
import { httpError } from './groups.js';
import { config } from '../config.js';

// agreed:   every compromise question answered "yes" (or none needed)
// pending:  someone hasn't answered yet
// rejected: at least one person said "no"
export function deriveStatus(compromises) {
  if (compromises.some((c) => c.status === 'rejected')) return 'rejected';
  if (compromises.some((c) => c.status === 'pending')) return 'pending';
  return 'agreed';
}

export async function latestRun(groupId) {
  return (await db.select('search_runs', { group_id: groupId }, { order: { column: 'created_at', ascending: false }, limit: 1 }))[0] || null;
}

// Everything the web UI and Telegram need to render a run.
export async function getRunView(runId, { includeEliminated = false } = {}) {
  const run = await one('search_runs', { id: runId });
  if (!run) throw httpError(404, 'Run not found');
  const group = await one('groups', { id: run.group_id });
  const people = await db.select('people', { group_id: run.group_id }, { order: { column: 'slot' } });
  const evals = await db.select('evaluations', { run_id: runId });
  const ranked = evals.filter((e) => e.rank).sort((a, b) => a.rank - b.rank);
  const top = ranked.filter((e) => e.rank <= config.shortlistSize);
  const wanted = includeEliminated ? evals : ranked;
  const listings = wanted.length ? await db.select('listings', { id: [...new Set(wanted.map((e) => e.listing_id))] }) : [];
  const listingById = Object.fromEntries(listings.map((l) => [l.id, l.data]));
  const compromises = await db.select('compromises', { run_id: runId });

  const view = {
    run, group, people,
    top: top.map((e) => ({
      ...e,
      listing: listingById[e.listing_id],
      compromises: compromises.filter((c) => c.evaluation_id === e.id),
    })),
    runnersUp: ranked.filter((e) => e.rank > config.shortlistSize).map((e) => ({ ...e, listing: listingById[e.listing_id] })),
  };
  if (includeEliminated) {
    view.eliminated = evals.filter((e) => e.eliminated).map((e) => ({ listing: listingById[e.listing_id], eliminations: e.eliminations }));
  }
  return view;
}

// What a run looks like to one friend (viewerId) or to the whole group (null).
// Friends see *which* preference someone meets or gives up on, never the
// numbers behind it: reasons ("₹833 over your ₹21,500 budget") stay with
// their owner. Raw preferences and the run snapshot never leave the server.
export function shareableView(view, viewerId = null) {
  const { preferences_snapshot, elimination_summary, ...run } = view.run;
  const mine = (x) => viewerId && (x.personId === viewerId || x.person_id === viewerId);
  const labelOnly = (x) => (mine(x) ? x : { ...x, reason: null });
  return {
    run: { ...run, elimination_summary: (elimination_summary || []).map(({ example, ...r }) => r) },
    top: view.top.map(({ unmet, eliminations, ...t }) => ({
      ...t,
      met: (t.met || []).map(labelOnly),
      unverified: (t.unverified || []).map(labelOnly),
      compromises: t.compromises.map((c) => (mine(c) ? c : { ...c, detail: null })),
    })),
    runnersUp: (view.runnersUp || []).map((t) => ({
      id: t.id, rank: t.rank, listing: t.listing, overall_score: t.overall_score, person_scores: t.person_scores,
      givesUp: (t.unmet || []).map((u) => ({ personId: u.personId, label: u.label })),
    })),
  };
}

// Record a person's answer to "are you okay compromising?".
export async function respondToCompromise(compromiseId, answer, via, actingPersonId) {
  const c = await one('compromises', { id: compromiseId });
  if (!c) throw httpError(404, 'Compromise not found');
  if (actingPersonId && actingPersonId !== c.person_id) throw httpError(403, 'Only the person affected can answer this.');
  if (!['accepted', 'rejected'].includes(answer)) throw httpError(400, 'answer must be accepted or rejected');
  await db.update('compromises', { id: compromiseId }, { status: answer, responded_via: via, responded_at: new Date().toISOString() });
  const siblings = await db.select('compromises', { evaluation_id: c.evaluation_id });
  const status = deriveStatus(siblings);
  const [evaluation] = await db.update('evaluations', { id: c.evaluation_id }, { status });
  return { compromise: { ...c, status: answer }, evaluation };
}
