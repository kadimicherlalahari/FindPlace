// Telegram Bot API integration.
//  - Posts each friend's private preferences link in the group chat.
//  - Posts progress ("2 of 3 done") and, once everyone submits, the results:
//    a summary + one message per Top 10 apartment.
//  - Apartment messages carry Yes/No buttons for each pending compromise;
//    only the affected person's taps count.
//  - Commands: /newhunt, /links, /search, /status, /help, /chatid
import { config } from '../config.js';
import { db, one } from '../db/index.js';
import { getRunView, latestRun, respondToCompromise } from './runs.js';
import { createGroup, latestGroupForChat, personByToken } from './groups.js';
import { background } from '../background.js';

export const telegramEnabled = () => Boolean(config.telegram.token);

async function api(method, body, attempt = 0) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.ok) return data.result;
  if (res.status === 429 && attempt < 3) {
    await sleep(((data.parameters?.retry_after ?? 3) + 1) * 1000);
    return api(method, body, attempt + 1);
  }
  throw new Error(`Telegram ${method}: ${data.description}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inr = (n) => (n == null ? '?' : `₹${Math.round(n).toLocaleString('en-IN')}`);
const STATUS = { agreed: '✅ Everyone agrees', pending: '⏳ Waiting on answers', rejected: '❌ Someone said no' };
const HEARTS = ['💜', '🧡', '💚'];
const send = (chatId, text, extra = {}) =>
  api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

export const personalLink = (person) => `${config.appUrl}/p/${person.access_token}`;
// Telegram only accepts public https URLs on buttons.
const canUseUrlButtons = () => /^https:\/\//.test(config.appUrl) && !/localhost|127\.0\.0\.1/.test(config.appUrl);

let botUsername = null;
export async function getBotUsername() {
  if (!botUsername && telegramEnabled()) botUsername = (await api('getMe', {})).username;
  return botUsername;
}

function mention(person) {
  if (person.telegram_user_id) return `<a href="tg://user?id=${person.telegram_user_id}">${esc(person.name)}</a>`;
  if (person.telegram_username) return `@${esc(person.telegram_username)}`;
  return `<b>${esc(person.name)}</b>`;
}

// ---------- Invites & progress ----------

export async function sendInvites(group, people) {
  if (!telegramEnabled()) return { sent: false, reason: 'TELEGRAM_BOT_TOKEN not set' };
  if (!group.telegram_chat_id) return { sent: false, reason: 'No Telegram chat ID' };
  const lines = [
    `🏡✨ <b>Flat hunt time: ${esc(group.name)}!</b>`,
    '',
    'Each of you gets your <b>own private link</b>. Tap <u>your</u> name and fill in your wishlist. Nobody else sees your answers 🤫',
    '',
    'Once all three of you submit, I\'ll match flats and post the shortlist here, with notes on who\'s compromising on what 💌',
  ];
  let reply_markup;
  if (canUseUrlButtons()) {
    reply_markup = { inline_keyboard: people.map((p, i) => [{ text: `${HEARTS[i]} ${p.name}'s wishlist`, url: personalLink(p) }]) };
  } else {
    lines.push('', ...people.map((p, i) => `${HEARTS[i]} ${esc(p.name)}: ${esc(personalLink(p))}`));
  }
  lines.push('', '<i>Please only open the link with your own name on it.</i>');
  await send(group.telegram_chat_id, lines.join('\n'), { reply_markup });
  return { sent: true };
}

export async function sendProgress(group, people, person, { wasSubmitted, allSubmitted }) {
  if (!telegramEnabled() || !group.telegram_chat_id) return;
  const done = people.filter((p) => p.submitted_at);
  const waiting = people.filter((p) => !p.submitted_at).map((p) => esc(p.name));
  let text;
  if (allSubmitted) {
    text = wasSubmitted
      ? `🔄 ${esc(person.name)} updated her wishlist. Re-matching flats…`
      : `🎉 <b>All 3 wishlists are in!</b> Matching flats now, results in a moment…`;
  } else {
    text = `✅ ${esc(person.name)} ${wasSubmitted ? 'updated' : 'submitted'} her wishlist! <b>${done.length}/3 done</b>, waiting on ${waiting.join(' & ')} 👀`;
  }
  await send(group.telegram_chat_id, text);
}

// ---------- Results ----------

export function formatSummary(view) {
  const { run } = view;
  const passed = run.evaluated_count - run.eliminated_count;
  const lines = [
    `🏡 <b>Your shortlist is here!</b>${view.group?.name ? ` · ${esc(view.group.name)}` : ''}`,
    '',
    `🔎 Listings checked: <b>${run.evaluated_count}</b>`,
    `🚫 Ruled out by someone's No Compromise: <b>${run.eliminated_count}</b>`,
    `💖 Passed everyone's must-haves: <b>${passed}</b>`,
  ];
  const reasons = (run.elimination_summary || []).slice(0, 5);
  if (reasons.length) {
    lines.push('', '<b>Main reasons flats were ruled out</b>');
    for (const r of reasons) lines.push(`• ${esc(r.personName)}'s ${esc(r.label.toLowerCase())}: ${r.count} flat${r.count > 1 ? 's' : ''}`);
  }
  lines.push('', view.top.length
    ? `Top ${view.top.length} below 👇 The group score rewards flats where <i>all three</i> of you are happy, not just two.`
    : 'No flat passed everyone\'s No Compromise rules 😕 Try switching one must-have to "Can compromise" on your personal page.');
  lines.push('', '💡 Answer compromise questions with the buttons, or on your personal page. Edit your wishlist there any time and I\'ll re-match.');
  return lines.join('\n');
}

export function formatApartment(item, people) {
  const l = item.listing;
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const scores = people.map((p, i) => `${HEARTS[i]} ${esc(p.name)} ${item.person_scores[p.id] ?? '–'}`).join('  ');
  const lines = [
    `<b>#${item.rank} ${esc(l.title)}</b>`,
    `📍 ${esc([l.location.locality, l.location.city].filter(Boolean).join(', ') || l.location.address || 'Location n/a')}`,
    `💰 ${inr(l.rent)}/mo · <b>${inr(l.rent / people.length)} each</b> · deposit ${inr(l.deposit)}`,
    `🛏 ${l.bhk ?? '?'} BHK · ${l.sizeSqft ?? '?'} sq ft · ${esc(l.furnishing || 'furnishing n/a')}`,
    l.availableFrom ? `📅 Available from ${esc(l.availableFrom)}` : null,
    '',
    `⭐ <b>Group score ${Math.round(item.overall_score)}</b>`,
    scores,
    `${STATUS[item.status] || item.status}`,
  ].filter((x) => x !== null);

  if (item.compromises.length) {
    lines.push('', '<b>🤝 Who\'s compromising</b>');
    for (const c of item.compromises) {
      const who = byId[c.person_id];
      if (c.status === 'pending') {
        lines.push(`❓ ${mention(who)}: this flat doesn't match your preference for <b>${esc(c.label.toLowerCase())}</b>. Are you okay compromising? <i>(details on your private page)</i>`);
      } else {
        lines.push(`${c.status === 'accepted' ? '✅' : '❌'} ${esc(who.name)}, ${esc(c.label.toLowerCase())}: ${c.status === 'accepted' ? 'okay to compromise' : 'not okay'}`);
      }
    }
  } else {
    lines.push('', '🎉 No compromises needed. It ticks everyone\'s boxes!');
  }
  if (item.unverified?.length) {
    lines.push('', '<b>🔍 Check on a visit</b>');
    for (const u of item.unverified.slice(0, 4)) lines.push(`• ${esc(u.personName)}: ${esc(u.label.toLowerCase())}`);
  }
  if (item.explanation) lines.push('', `<i>${esc(item.explanation)}</i>`);
  if (l.url) lines.push('', `🔗 <a href="${esc(l.url)}">View listing</a>`);

  const keyboard = item.compromises.filter((c) => c.status === 'pending').map((c) => [
    { text: `✅ ${byId[c.person_id].name}: OK on ${c.label.toLowerCase()}`.slice(0, 60), callback_data: `cp:${c.id}:y` },
    { text: `❌ ${byId[c.person_id].name}: No`.slice(0, 60), callback_data: `cp:${c.id}:n` },
  ]);
  let text = lines.join('\n');
  if (text.length > 4000) text = `${text.slice(0, 3990)}…`; // Telegram's limit is 4096
  return { text, reply_markup: keyboard.length ? { inline_keyboard: keyboard } : undefined };
}

export async function sendRunToTelegram(runId) {
  if (!telegramEnabled()) return { sent: false, reason: 'TELEGRAM_BOT_TOKEN not set' };
  const view = await getRunView(runId);
  const chatId = view.group.telegram_chat_id;
  if (!chatId) return { sent: false, reason: 'No Telegram chat ID for this hunt' };

  await send(chatId, formatSummary(view));
  for (const item of view.top) {
    await sleep(400); // a run is 11 messages, under Telegram's 20/minute group limit
    const { text, reply_markup } = formatApartment(item, view.people);
    const msg = await send(chatId, text, { reply_markup });
    await db.update('evaluations', { id: item.id }, { tg_message_id: msg.message_id });
  }
  return { sent: true, messages: view.top.length + 1 };
}

// Re-render one apartment's message after an answer (from Telegram or the web).
export async function refreshApartmentMessage(evaluationId) {
  if (!telegramEnabled()) return;
  const e = await one('evaluations', { id: evaluationId });
  if (!e?.tg_message_id) return;
  const view = await getRunView(e.run_id);
  const item = view.top.find((t) => t.id === evaluationId);
  if (!item || !view.group.telegram_chat_id) return;
  const { text, reply_markup } = formatApartment(item, view.people);
  await api('editMessageText', {
    chat_id: view.group.telegram_chat_id, message_id: e.tg_message_id, text, parse_mode: 'HTML',
    reply_markup: reply_markup || { inline_keyboard: [] }, link_preview_options: { is_disabled: true },
  }).catch((err) => { if (!/not modified/.test(err.message)) console.warn('[telegram]', err.message); });
}

// ---------- Incoming updates ----------

async function handleCallback(q) {
  const [, compromiseId, yn] = (q.data || '').split(':');
  const answer = (text, alert = false) => api('answerCallbackQuery', { callback_query_id: q.id, text, show_alert: alert });
  const c = await one('compromises', { id: compromiseId });
  if (!c) return answer('This question has expired.');
  const person = await one('people', { id: c.person_id });

  // Only the affected person may answer: matched by the Telegram account she
  // connected from her private page, or by the username given at setup.
  const username = (q.from.username || '').toLowerCase();
  const isHer = person.telegram_user_id
    ? Number(person.telegram_user_id) === q.from.id
    : Boolean(person.telegram_username) && person.telegram_username.toLowerCase() === username;
  if (!isHer) {
    return answer(person.telegram_user_id || person.telegram_username
      ? `Only ${person.name} can answer this one 🙂`
      : `${person.name}, open your private link and tap "Connect Telegram" first, or answer right there on the page.`, true);
  }
  if (!person.telegram_user_id) await db.update('people', { id: person.id }, { telegram_user_id: q.from.id });

  const { evaluation } = await respondToCompromise(compromiseId, yn === 'y' ? 'accepted' : 'rejected', 'telegram');
  await answer(yn === 'y' ? 'Thanks! Marked as okay 💚' : 'Got it, marked as not okay.');
  await refreshApartmentMessage(evaluation.id);
}

function parseFriends(text) {
  return text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const username = (s.match(/@(\w{3,})/) || [])[1] || null;
    return { name: s.replace(/@\w+/, '').trim(), telegram_username: username };
  });
}

async function handleMessage(m) {
  const text = (m.text || '').trim();
  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = rawCmd?.toLowerCase().replace(/@\w+$/, '');
  if (!cmd?.startsWith('/')) return;
  const reply = (t, extra) => send(m.chat.id, t, extra);
  const isPrivate = m.chat.type === 'private';

  // Deep link from a private page: t.me/<bot>?start=L<token>
  if (cmd === '/start' && isPrivate && args[0]?.startsWith('L')) {
    const person = await personByToken(args[0].slice(1));
    if (!person) return reply('That link has expired. Open your private page again and tap "Connect Telegram".');
    const others = await db.select('people', { group_id: person.group_id });
    for (const o of others) {
      if (o.id !== person.id && Number(o.telegram_user_id) === m.from.id) await db.update('people', { id: o.id }, { telegram_user_id: null });
    }
    await db.update('people', { id: person.id }, { telegram_user_id: m.from.id, telegram_username: m.from.username || person.telegram_username });
    return reply(`💜 Connected! Hi ${esc(person.name)}, you can now answer compromise questions with the buttons in your group chat.`);
  }

  if (isPrivate) {
    return reply('👋 Hi! I work inside your group chat. Add me to the group with your two friends, then send:\n<code>/newhunt Name1, Name2, Name3</code>');
  }

  if (cmd === '/chatid') return reply(`This chat's ID is <code>${m.chat.id}</code>`);

  if (cmd === '/newhunt') {
    const friends = parseFriends(args.join(' '));
    if (friends.length !== 3) {
      return reply('Tell me the three names, separated by commas 💜\n<code>/newhunt Asha, Priya, Meera</code>\n(Optionally add usernames: <code>Asha @asha_k, Priya, Meera</code>)');
    }
    try {
      const g = await createGroup({ name: m.chat.title || 'Our flat hunt', telegram_chat_id: m.chat.id, people: friends });
      await sendInvites(g.group, g.people);
    } catch (err) {
      await reply(`⚠️ ${esc(err.message)}`);
    }
    return;
  }

  const group = await latestGroupForChat(m.chat.id);
  if (!group) {
    return reply('No flat hunt here yet! Start one with:\n<code>/newhunt Asha, Priya, Meera</code>');
  }
  const people = await db.select('people', { group_id: group.id }, { order: { column: 'slot' } });

  if (cmd === '/start' || cmd === '/help') {
    return reply([
      '🏡 <b>Apartment Matchmaker</b>',
      '/links: re-post everyone\'s private wishlist links',
      '/status: who has submitted, and where the shortlist stands',
      '/search: re-match now with everyone\'s latest wishlists',
      '/newhunt A, B, C: start a fresh hunt',
    ].join('\n'));
  }

  if (cmd === '/links') return sendInvites(group, people);

  if (cmd === '/status') {
    const lines = [`<b>${esc(group.name)}</b>`, ...people.map((p, i) => `${HEARTS[i]} ${esc(p.name)}: ${p.submitted_at ? 'submitted ✅' : 'not yet ⏳'}`)];
    const run = await latestRun(group.id);
    if (run?.status === 'done') {
      const view = await getRunView(run.id);
      lines.push('', '<b>Shortlist</b>');
      for (const t of view.top) {
        const waiting = [...new Set(t.compromises.filter((c) => c.status === 'pending').map((c) => people.find((p) => p.id === c.person_id)?.name))];
        lines.push(`#${t.rank} ${esc(t.listing.title)}: ${STATUS[t.status]}${waiting.length ? ` (${esc(waiting.join(', '))})` : ''}`);
      }
    }
    return reply(lines.join('\n'));
  }

  if (cmd === '/search') {
    const missing = people.filter((p) => !p.submitted_at).map((p) => esc(p.name));
    if (missing.length === 3) return reply('Nobody has submitted a wishlist yet 🙈 Send /links to get your private links.');
    await reply(`🔎 Matching now${missing.length ? ` (without ${missing.join(' & ')}'s wishlist, not submitted yet)` : ''}…`);
    const { runSearch } = await import('./search.js');
    try {
      await runSearch(group.id, { notify: true });
    } catch (err) {
      await reply(`⚠️ ${esc(err.message)}`);
    }
  }
}

export async function handleUpdate(update) {
  try {
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleMessage(update.message);
  } catch (err) {
    console.error('[telegram] update failed:', err);
  }
}

// Local development: long-poll for updates (no public URL needed).
// On Vercel the webhook is used instead; see scripts/set-webhook.js.
export async function startPolling() {
  if (!telegramEnabled()) return console.log('[telegram] TELEGRAM_BOT_TOKEN not set; Telegram disabled');
  if (config.telegram.mode !== 'polling') return console.log('[telegram] webhook mode; not polling');
  await api('deleteWebhook', {});
  console.log('[telegram] polling for updates (this disables any webhook; re-run `npm run telegram:webhook` after)');
  let offset = 0;
  for (;;) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        background('telegram', () => handleUpdate(u));
      }
    } catch (err) {
      console.warn('[telegram] polling error:', err.message);
      await sleep(5000);
    }
  }
}

export async function setWebhook() {
  if (!config.telegram.webhookSecret) throw new Error('Set TELEGRAM_WEBHOOK_SECRET first');
  if (!canUseUrlButtons()) throw new Error(`APP_URL must be your public https URL (got ${config.appUrl})`);
  await api('setWebhook', {
    url: `${config.appUrl}/api/telegram/webhook`,
    secret_token: config.telegram.webhookSecret,
    allowed_updates: ['message', 'callback_query'],
  });
  return api('getWebhookInfo', {});
}
