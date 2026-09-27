// The HTTP app, shared by the local server (src/server.js) and Vercel (api/index.js).
//
// Privacy model: there is no "group page". Everything a friend sees comes
// through her private link token, which only reveals her own preferences plus
// the shared shortlist. Links are only ever delivered to the Telegram group.
import express from 'express';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { db } from './db/index.js';
import { PREFERENCES, STEPS } from './preferences.js';
import { createGroup, httpError, personByToken, savePreferences, submitPreferences } from './services/groups.js';
import { runSearch } from './services/search.js';
import { getRunView, latestRun, respondToCompromise } from './services/runs.js';
import { getBotUsername, handleUpdate, personalLink, refreshApartmentMessage, sendInvites, sendProgress, telegramEnabled } from './services/telegram.js';
import { geminiEnabled } from './services/gemini.js';
import { background } from './background.js';

export const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.resolve('public')));
app.get('/p/:token', (req, res) => res.sendFile(path.resolve('public/me.html')));

const route = (fn) => (req, res) => Promise.resolve(fn(req, res)).then((out) => res.json(out ?? null)).catch((err) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong. Please try again.' });
});

async function requirePerson(req) {
  const person = await personByToken(req.params.token);
  if (!person) throw httpError(404, 'This link isn\'t valid. Ask the group chat bot for /links.');
  return person;
}

app.get('/api/schema', route(() => ({
  preferences: PREFERENCES,
  steps: STEPS,
  status: { db: db.kind, listings: config.listings.provider, telegram: telegramEnabled(), gemini: geminiEnabled() },
})));

// Start a hunt from the web. The private links are posted to the Telegram
// group, never returned here (except in local dev without Telegram).
app.post('/api/hunts', route(async (req) => {
  const { name, telegram_chat_id, people } = req.body || {};
  if (telegramEnabled() && !String(telegram_chat_id || '').trim()) throw httpError(400, 'Add your Telegram group chat ID (send /chatid in the group).');
  const g = await createGroup({ name, telegram_chat_id, people });
  if (!telegramEnabled()) {
    return { sent: false, devLinks: g.people.map((p) => ({ name: p.name, url: personalLink(p) })) };
  }
  try {
    await sendInvites(g.group, g.people);
  } catch (err) {
    await db.remove('people', { group_id: g.group.id });
    await db.remove('groups', { id: g.group.id });
    throw httpError(400, `Couldn't post to that Telegram chat. Is the bot added to the group, and is the ID right? (${err.message})`);
  }
  return { sent: true };
}));

// Everything one friend's page needs.
app.get('/api/me/:token', route(async (req) => {
  const me = await requirePerson(req);
  const group = await db.select('groups', { id: me.group_id });
  const people = await db.select('people', { group_id: me.group_id }, { order: { column: 'slot' } });
  const prefs = await db.select('preferences', { person_id: me.id });
  const run = await latestRun(me.group_id);
  let results = null;
  if (run?.status === 'done') {
    const v = await getRunView(run.id);
    // Only share what the shortlist needs. Other friends' raw preferences
    // (the run snapshot, unmet details) stay private.
    const { preferences_snapshot, elimination_summary, ...publicRun } = v.run;
    const mine = (x) => x.personId === me.id || x.person_id === me.id;
    results = {
      run: { ...publicRun, elimination_summary: (elimination_summary || []).map(({ example, ...r }) => r) },
      top: v.top.map(({ unmet, eliminations, ...t }) => ({
        ...t,
        compromises: t.compromises.map((c) => (mine(c) ? c : { ...c, detail: null })),
        unverified: (t.unverified || []).map((u) => (mine(u) ? u : { ...u, reason: null })),
      })),
    };
  }
  return {
    me: { id: me.id, name: me.name, slot: me.slot, submitted_at: me.submitted_at, telegramConnected: Boolean(me.telegram_user_id) },
    group: { name: group[0]?.name },
    friends: people.map((p) => ({ id: p.id, name: p.name, slot: p.slot, submitted: Boolean(p.submitted_at) })),
    prefs: prefs.map(({ key, value, priority, note, interpreted }) => ({ key, value, priority, note, interpreted })),
    matching: run?.status === 'running',
    results,
    botUsername: await getBotUsername().catch(() => null),
  };
}));

app.put('/api/me/:token/preferences', route(async (req) => {
  const me = await requirePerson(req);
  await savePreferences(me.id, req.body?.preferences);
  return { ok: true };
}));

app.post('/api/me/:token/submit', route(async (req) => {
  const me = await requirePerson(req);
  const result = await submitPreferences(me, req.body?.preferences);
  const [group] = await db.select('groups', { id: me.group_id });
  background('submit', async () => {
    await sendProgress(group, result.people, me, result).catch((err) => console.warn('[telegram]', err.message));
    if (result.allSubmitted) await runSearch(me.group_id, { notify: true });
  });
  return { ok: true, allSubmitted: result.allSubmitted, waitingOn: result.people.filter((p) => !p.submitted_at).map((p) => p.name) };
}));

app.post('/api/me/:token/compromises/:id', route(async (req) => {
  const me = await requirePerson(req);
  const result = await respondToCompromise(req.params.id, req.body?.answer, 'web', me.id);
  background('telegram', () => refreshApartmentMessage(result.evaluation.id));
  return { status: result.evaluation.status };
}));

app.post('/api/telegram/webhook', (req, res) => {
  const got = Buffer.from(req.get('x-telegram-bot-api-secret-token') || '');
  const want = Buffer.from(config.telegram.webhookSecret);
  if (!want.length || got.length !== want.length || !timingSafeEqual(got, want)) return res.sendStatus(401);
  // Reply to Telegram right away; the work (maybe a full search) continues in the background.
  background('telegram', () => handleUpdate(req.body));
  res.sendStatus(200);
});
