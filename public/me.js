import { $, api, esc, inr, toast, confetti } from './shared.js';

const token = location.pathname.split('/').pop();
const HEARTS = ['💜', '🧡', '💚'];
const app = $('#app');

const state = {
  schema: null, data: null,
  view: 'wishlist',          // wishlist | shortlist | done
  step: 0,
  draft: {},                 // key -> { value, priority, note }
  open: new Set(),
  polling: null,
};

const def = (key) => state.schema.preferences.find((p) => p.key === key);
const me = () => state.data.me;
const myPending = () => (state.data.results?.top || []).flatMap((t) => t.compromises).filter((c) => c.person_id === me().id && c.status === 'pending');

// ---------- boot ----------
async function load() {
  state.data = await api(`/api/me/${token}`);
  document.body.className = `f${me().slot}`;
  document.title = `${me().name}'s wishlist`;
}

async function boot() {
  try {
    [state.schema] = await Promise.all([api('/api/schema'), load()]);
  } catch (err) {
    app.innerHTML = `<div class="card celebrate"><div class="big">🙈</div><h2 style="margin-top:12px">Hmm, that link didn't work</h2><p class="muted" style="margin-top:6px">${esc(err.message)}</p></div>`;
    return;
  }
  for (const p of state.data.prefs) state.draft[p.key] = { value: p.value, priority: p.priority, note: p.note || '', interpreted: p.interpreted };
  state.view = state.data.results ? 'shortlist' : 'wishlist';
  if (state.data.matching) startPolling();
  render();
}

// ---------- layout ----------
function render() {
  const d = state.data;
  const pending = myPending().length;
  app.innerHTML = `
    <section class="stack">
      <h1>Hey ${esc(me().name)}! ${HEARTS[me().slot]}</h1>
      <p class="muted">${esc(d.group.name)} · your answers are private to you</p>
      <div class="friends">${d.friends.map((f) => `
        <span class="friend f${f.slot} ${f.submitted ? 'done' : ''}"><span class="avatar">${esc(f.name[0].toUpperCase())}</span>${f.id === me().id ? 'You' : esc(f.name)} ${f.submitted ? '✅' : '⏳'}</span>`).join('')}
      </div>
    </section>
    ${d.results && state.view !== 'done' ? `
      <div class="tabs" role="tablist">
        <button role="tab" class="${state.view === 'shortlist' ? 'on' : ''}" data-view="shortlist">🏡 Shortlist${pending ? `<span class="dot">${pending}</span>` : ''}</button>
        <button role="tab" class="${state.view === 'wishlist' ? 'on' : ''}" data-view="wishlist">📝 My wishlist</button>
      </div>` : ''}
    <div id="content" class="stack"></div>`;
  app.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { collectStep(); state.view = b.dataset.view; render(); scrollTo(0, 0); });
  document.querySelector('.bar')?.remove();
  ({ wishlist: renderWishlist, shortlist: renderShortlist, done: renderDone })[state.view]();
}

// ---------- wishlist wizard ----------
function isSet(key, value) {
  const dd = def(key);
  if (!value) return false;
  const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || v === false;
  const req = dd.fields.filter((f) => f.required);
  return req.length ? req.every((f) => !empty(value[f.name])) : dd.fields.some((f) => !empty(value[f.name]));
}

function optLabel(options, v) { return (options.find(([k]) => k === v) || [v, v])[1]; }

function summary(key, v) {
  const f = (n) => def(key).fields.find((x) => x.name === n);
  switch (key) {
    case 'locations': return v.areas;
    case 'maxRent': return `Up to ${inr(v.amount)}/month`;
    case 'maxDeposit': return `Up to ${inr(v.amount)}`;
    case 'bhk': return `${v.min}+ BHK`;
    case 'minSize': return `${v.sqft}+ sq ft`;
    case 'furnishing': return v.accepted.map((x) => optLabel(f('accepted').options, x)).join(', ');
    case 'commute': return `${v.maxMinutes ? `≤ ${v.maxMinutes} min` : `≤ ${v.maxKm} km`} to ${v.from}`;
    case 'parking': return `For a ${optLabel(f('type').options, v.type).toLowerCase()}`;
    case 'amenities': return [...(v.items || []).map((x) => optLabel(f('items').options, x)), v.other].filter(Boolean).join(', ');
    case 'moveIn': return `By ${new Date(v.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${v.flexDays ? ` ± ${v.flexDays} days` : ''}`;
    case 'other': return v.text;
    default: return 'Yes please';
  }
}

function fieldHtml(key, f, v) {
  const id = `${key}-${f.name}`;
  const val = v?.[f.name];
  const lbl = `<label class="lbl" for="${id}">${esc(f.label)}</label>`;
  switch (f.type) {
    case 'number': return `<div class="field">${lbl}<input id="${id}" data-f="${f.name}" type="number" inputmode="numeric" min="0" value="${esc(val ?? '')}" placeholder="${esc(f.placeholder || '')}"></div>`;
    case 'date': return `<div class="field">${lbl}<input id="${id}" data-f="${f.name}" type="date" value="${esc(val ?? '')}"></div>`;
    case 'textarea': return `<div class="field">${lbl}<textarea id="${id}" data-f="${f.name}" placeholder="${esc(f.placeholder || '')}">${esc(val ?? '')}</textarea></div>`;
    case 'select': return `<div class="field">${lbl}<select id="${id}" data-f="${f.name}"><option value="">Choose…</option>${f.options.map(([k, l]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    case 'multi': return `<div class="field"><span class="lbl">${esc(f.label)}</span><div class="chips">${f.options.map(([k, l]) => `<label class="chip"><input type="checkbox" data-f="${f.name}" value="${k}" ${(val || []).includes(k) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></div>`;
    case 'toggle': return `<div class="field"><label class="switch">${esc(f.label)}<input type="checkbox" data-f="${f.name}" ${val ? 'checked' : ''}></label></div>`;
    default: return `<div class="field">${lbl}<input id="${id}" data-f="${f.name}" value="${esc(val ?? '')}" placeholder="${esc(f.placeholder || '')}"></div>`;
  }
}

function prefCard(key) {
  const d = def(key);
  const entry = state.draft[key];
  const set = isSet(key, entry?.value);
  const priority = entry?.priority || 'flex';
  const open = state.open.has(key);
  const checks = entry?.interpreted?.checks || [];
  return `
    <article class="pref ${set ? 'set' : ''} ${open ? 'open' : ''}" data-key="${key}">
      <button type="button" class="pref-head" aria-expanded="${open}">
        <span class="pref-emoji" aria-hidden="true">${d.emoji}</span>
        <span class="pref-title"><b>${esc(d.label)}</b><small>${set ? esc(summary(key, entry.value)) : 'Tap to add'}</small></span>
        ${tagHtml(set, priority)}
      </button>
      <div class="pref-body">
        ${d.help ? `<p class="hint" style="margin:0 0 12px">${esc(d.help)}</p>` : ''}
        ${d.fields.map((f) => fieldHtml(key, f, entry?.value)).join('')}
        <div class="prio" role="radiogroup" aria-label="How important is this?">
          <button type="button" class="must ${priority === 'must' ? 'on' : ''}" data-p="must" role="radio" aria-checked="${priority === 'must'}">💯 No compromise<small>Must-have. Rule out flats without it</small></button>
          <button type="button" class="flex ${priority === 'flex' ? 'on' : ''}" data-p="flex" role="radio" aria-checked="${priority === 'flex'}">🤝 Can compromise<small>Nice to have. Ask me first</small></button>
        </div>
        ${d.noNote ? '' : `<div class="field" style="margin-top:12px"><label class="lbl" for="${key}-note">${d.noteRequired ? 'Tell us more' : 'Anything we should know?'} <span class="muted">(optional)</span></label><textarea id="${key}-note" data-note placeholder="${esc(d.notePlaceholder || '')}">${esc(entry?.note || '')}</textarea></div>`}
        ${checks.length ? `<div class="interp">✨ We'll check for: ${checks.map((c) => `${c.avoid ? 'no ' : ''}${esc(c.label)}`).join(' · ')}</div>` : ''}
        <button type="button" class="clear" data-clear>Doesn't matter to me</button>
      </div>
    </article>`;
}

const tagHtml = (set, priority) => set
  ? `<span class="tag ${priority}">${priority === 'must' ? '💯 Must' : '🤝 Flexible'}</span>`
  : '<span class="tag add">+ Add</span>';

function readCard(card) {
  const d = def(card.dataset.key);
  const value = {};
  for (const f of d.fields) {
    const els = card.querySelectorAll(`[data-f="${f.name}"]`);
    if (f.type === 'multi') value[f.name] = [...els].filter((e) => e.checked).map((e) => e.value);
    else if (f.type === 'toggle') value[f.name] = els[0].checked;
    else value[f.name] = els[0].value;
  }
  const prev = state.draft[card.dataset.key];
  return {
    value,
    priority: card.querySelector('.prio .on')?.dataset.p || 'flex',
    note: card.querySelector('[data-note]')?.value || '',
    interpreted: prev?.interpreted,
  };
}

function refreshCardHead(card) {
  const key = card.dataset.key;
  const entry = state.draft[key];
  const set = isSet(key, entry.value);
  card.classList.toggle('set', set);
  card.querySelector('.pref-title small').textContent = set ? summary(key, entry.value) : 'Tap to add';
  card.querySelector('.tag').outerHTML = tagHtml(set, entry.priority);
}

function collectStep() {
  document.querySelectorAll('.pref').forEach((card) => { state.draft[card.dataset.key] = readCard(card); });
}

function renderWishlist() {
  document.querySelector('.bar')?.remove();
  const steps = state.schema.steps;
  const s = steps[state.step];
  const last = state.step === steps.length - 1;
  if (s.keys.length === 1) state.open.add(s.keys[0]);
  const count = Object.keys(state.draft).filter((k) => isSet(k, state.draft[k]?.value)).length;
  $('#content').innerHTML = `
    ${me().submitted_at && state.step === 0 ? `<div class="banner">✅ You've submitted. Change anything and resubmit, and we'll re-match.</div>` : ''}
    <div class="steps" aria-label="Step ${state.step + 1} of ${steps.length}">${steps.map((_, i) => `<i class="${i <= state.step ? 'on' : ''}"></i>`).join('')}</div>
    <div class="step-title"><span class="step-emoji" aria-hidden="true">${s.emoji}</span><div><p class="small muted"><b>Step ${state.step + 1} of ${steps.length}</b></p><h2>${esc(s.title)}</h2></div></div>
    <p class="muted">${esc(s.blurb)} Skip anything that doesn't matter to you.</p>
    <div class="stack">${s.keys.map(prefCard).join('')}</div>
    ${last ? `<div class="card stack"><h3>Ready? ${HEARTS[me().slot]}</h3><p class="small muted">You've added <b>${count}</b> preference${count === 1 ? '' : 's'}. Only you can see these. Your friends only see the notes when a flat asks one of you to compromise.</p></div>` : ''}`;

  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = `<div class="bar-inner">
    ${state.step > 0 ? '<button class="btn btn-ghost" data-nav="-1">← Back</button>' : ''}
    <button class="btn btn-primary" data-nav="${last ? 'submit' : '1'}">${last ? (me().submitted_at ? 'Resubmit my wishlist ✨' : 'Submit my wishlist ✨') : 'Next →'}</button>
  </div>`;
  document.body.appendChild(bar);

  const content = $('#content');
  content.querySelectorAll('.pref').forEach((card) => {
    const key = card.dataset.key;
    card.querySelector('.pref-head').onclick = () => {
      const open = card.classList.toggle('open');
      card.querySelector('.pref-head').setAttribute('aria-expanded', open);
      open ? state.open.add(key) : state.open.delete(key);
      if (open) card.querySelector('.pref-body input:not([type=checkbox]), .pref-body textarea, .pref-body select')?.focus({ preventScroll: true });
    };
    card.querySelectorAll('.prio button').forEach((b) => b.onclick = () => {
      card.querySelectorAll('.prio button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
      state.draft[key] = readCard(card);
      refreshCardHead(card);
    });
    card.querySelector('[data-clear]').onclick = () => {
      delete state.draft[key];
      state.open.delete(key);
      renderWishlist();
    };
    const update = () => { state.draft[key] = readCard(card); refreshCardHead(card); };
    card.addEventListener('input', update);
    card.addEventListener('change', update);
  });
  bar.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => navigate(b.dataset.nav, b));
}

function draftPayload() {
  const out = {};
  for (const [k, v] of Object.entries(state.draft)) if (isSet(k, v?.value)) out[k] = { value: v.value, priority: v.priority, note: v.note };
  return out;
}

async function navigate(dir, btn) {
  collectStep();
  if (dir === 'submit') return submit(btn);
  api(`/api/me/${token}/preferences`, { method: 'PUT', body: { preferences: draftPayload() } }).catch(() => {});
  state.step += Number(dir);
  renderWishlist();
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function submit(btn) {
  const c = state.draft.commute?.value;
  if (c?.from && !c.maxMinutes && !c.maxKm) {
    state.step = state.schema.steps.findIndex((s) => s.keys.includes('commute'));
    state.open.add('commute');
    renderWishlist();
    return toast('Add a max commute time or distance 🚌');
  }
  if (!Object.keys(draftPayload()).length) return toast('Add at least one preference first 💜');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const lastRunId = state.data.results?.run.id;
  try {
    const r = await api(`/api/me/${token}/submit`, { method: 'POST', body: { preferences: draftPayload() } });
    await load();
    state.view = 'done';
    state.doneInfo = r;
    render();
    confetti();
    if (r.allSubmitted) startPolling(lastRunId);
  } catch (err) {
    toast(err.message);
    btn.disabled = false;
    btn.textContent = 'Submit my wishlist ✨';
  }
}

function renderDone() {
  const r = state.doneInfo || {};
  $('#content').innerHTML = `
    <div class="card celebrate">
      <div class="big">${r.allSubmitted ? '🎉' : '💌'}</div>
      <h2 style="margin-top:12px">${r.allSubmitted ? 'All three wishlists are in!' : `You're in, ${esc(me().name)}!`}</h2>
      <p class="muted" style="margin-top:8px">${r.allSubmitted
        ? 'Matching flats now. Your shortlist will pop up here and in the group chat.'
        : `Waiting on ${esc((r.waitingOn || []).join(' & '))}. We'll post in the group chat as soon as everyone's done.`}</p>
      ${r.allSubmitted ? '<div class="spinner" aria-label="Matching"></div>' : ''}
    </div>
    ${telegramCard()}
    <button class="btn btn-ghost btn-block" id="editAgain">✏️ Edit my wishlist</button>`;
  $('#editAgain').onclick = () => { state.view = 'wishlist'; state.step = 0; render(); };
}

function startPolling(previousRunId) {
  clearInterval(state.polling);
  let tries = 0;
  state.polling = setInterval(async () => {
    if (++tries > 60) return clearInterval(state.polling);
    try {
      await load();
      const fresh = state.data.results && state.data.results.run.id !== previousRunId && !state.data.matching;
      if (fresh) {
        clearInterval(state.polling);
        state.view = 'shortlist';
        render();
        confetti(120);
        scrollTo(0, 0);
      }
    } catch { /* keep trying */ }
  }, 4000);
}

function telegramCard() {
  const d = state.data;
  if (!d.botUsername || me().telegramConnected) return '';
  return `<div class="card stack"><h3>💬 Answer from the group chat</h3>
    <p class="small muted">Connect your Telegram so you can tap Yes / No on compromise questions right in the chat.</p>
    <a class="btn btn-ghost btn-block" href="https://t.me/${esc(d.botUsername)}?start=L${esc(token)}" target="_blank" rel="noopener">Connect Telegram</a></div>`;
}

// ---------- shortlist ----------
const STATUS = { agreed: '✅ Everyone agrees', pending: '⏳ Waiting on answers', rejected: '❌ Someone said no' };

function renderShortlist() {
  const { run, top } = state.data.results;
  const pending = myPending().length;
  const passed = run.evaluated_count - run.eliminated_count;
  const reasons = run.elimination_summary || [];
  $('#content').innerHTML = `
    ${state.data.matching ? '<div class="banner">🔄 Re-matching with the latest wishlists…</div>' : ''}
    <div class="stats">
      <div class="stat"><b>${run.evaluated_count}</b><span>flats checked</span></div>
      <div class="stat out"><b>${run.eliminated_count}</b><span>ruled out</span></div>
      <div class="stat pass"><b>${passed}</b><span>passed must-haves</span></div>
    </div>
    ${pending ? `<div class="banner">💌 You have ${pending} compromise question${pending > 1 ? 's' : ''} below</div>` : ''}
    ${reasons.length ? `<details class="card"><summary class="display" style="cursor:pointer">Why flats were ruled out</summary><ul style="margin:10px 0 0;padding-left:20px">${reasons.slice(0, 6).map((r) => `<li>${esc(r.personName)}'s ${esc(r.label.toLowerCase())}: <b>${r.count}</b> flat${r.count > 1 ? 's' : ''}</li>`).join('')}</ul></details>` : ''}
    ${top.length ? top.map(aptCard).join('') : `<div class="card celebrate"><div class="big">😕</div><h2 style="margin-top:12px">No flat ticked everyone's must-haves</h2><p class="muted" style="margin-top:8px">Try switching a must-have to "Can compromise" and resubmit.</p></div>`}
    ${telegramCard()}`;
  $('#content').querySelectorAll('[data-answer]').forEach((b) => b.onclick = () => answer(b.dataset.id, b.dataset.answer, b));
}

function aptCard(t) {
  const l = t.listing;
  const friends = state.data.friends;
  const byId = Object.fromEntries(friends.map((f) => [f.id, f]));
  const comps = [...t.compromises].sort((a, b) => (b.person_id === me().id) - (a.person_id === me().id));
  return `
    <article class="apt ${t.status}">
      <div class="apt-photo">
        ${l.photos?.[0] ? `<img src="${esc(l.photos[0])}" alt="" loading="lazy">` : ''}
        <span class="rank">#${t.rank}</span>
        <span class="ring" style="--v:${Math.round(t.overall_score)}" aria-label="Group score ${Math.round(t.overall_score)}"><b>${Math.round(t.overall_score)}<small>GROUP</small></b></span>
      </div>
      <div class="apt-body">
        <h3>${esc(l.title)}</h3>
        <div class="facts">
          <span>📍 ${esc(l.location.locality || l.location.city || 'Location n/a')}</span>
          <span class="money">💰 ${inr(l.rent / friends.length)} each</span>
          <span>${inr(l.rent)}/mo total</span>
          <span>🔐 ${inr(l.deposit)} deposit</span>
          <span>🛏️ ${l.bhk ?? '?'} BHK</span>
          <span>📐 ${l.sizeSqft ?? '?'} sq ft</span>
          ${l.furnishing ? `<span>🛋️ ${esc(l.furnishing)}</span>` : ''}
          ${l.availableFrom ? `<span>📅 from ${esc(new Date(l.availableFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}</span>` : ''}
        </div>
        <div class="scores">${friends.map((f) => `
          <div class="score-row f${f.slot}"><span class="nm">${f.id === me().id ? 'You' : esc(f.name)}</span><i style="--w:${t.person_scores[f.id]}%"></i><span>${t.person_scores[f.id]}</span></div>`).join('')}
        </div>
        <span class="pill ${t.status}">${STATUS[t.status]}</span>
        ${comps.length ? `<div class="comps">${comps.map((c) => compHtml(c, byId[c.person_id])).join('')}</div>` : '<p class="happy">🎉 No compromises needed. It ticks everyone\'s boxes!</p>'}
        ${t.unverified?.length ? `<details class="check"><summary>🔍 Check on a visit (${t.unverified.length})</summary><ul>${t.unverified.map((u) => `<li>${u.personId === me().id ? `You: ${esc(u.reason)}` : `${esc(u.personName)}: ${esc(u.label.toLowerCase())}`}</li>`).join('')}</ul></details>` : ''}
        ${t.explanation ? `<p class="why">${esc(t.explanation)}</p>` : ''}
        ${l.url ? `<div class="apt-actions"><a class="btn btn-ghost btn-block" href="${esc(l.url)}" target="_blank" rel="noopener">View listing ↗</a></div>` : ''}
      </div>
    </article>`;
}

function compHtml(c, f) {
  const mine = c.person_id === me().id;
  const label = esc(c.label.toLowerCase());
  if (mine) {
    if (c.status === 'pending') {
      return `<div class="comp mine f${f.slot}"><span class="who">You</span>: this flat doesn't match your preference for <b>${label}</b> <span class="muted">(${esc(c.detail)})</span>. Are you okay compromising?
        <div class="answer"><button class="btn btn-coral" data-id="${c.id}" data-answer="accepted">💚 Yes, okay</button><button class="btn btn-ghost" data-id="${c.id}" data-answer="rejected">🙅‍♀️ No</button></div></div>`;
    }
    return `<div class="comp mine f${f.slot}"><span class="who">You</span>, ${label}: <b>${c.status === 'accepted' ? 'okay to compromise 💚' : 'not okay 🙅‍♀️'}</b>
      <button class="clear" style="margin:0 0 0 6px" data-id="${c.id}" data-answer="${c.status === 'accepted' ? 'rejected' : 'accepted'}">change</button></div>`;
  }
  const st = c.status === 'pending' ? 'hasn\'t answered yet ⏳' : c.status === 'accepted' ? 'is okay with it ✅' : 'isn\'t okay with it ❌';
  return `<div class="comp f${f.slot}"><span class="who">${esc(f.name)}</span> compromises on <b>${label}</b><div class="done small">${esc(f.name)} ${st}</div></div>`;
}

async function answer(id, ans, btn) {
  btn.disabled = true;
  try {
    const y = scrollY;
    await api(`/api/me/${token}/compromises/${id}`, { method: 'POST', body: { answer: ans } });
    await load();
    render();
    scrollTo(0, y);
    toast(ans === 'accepted' ? 'Thanks! Marked as okay 💚' : 'Got it. Marked as not okay');
  } catch (err) {
    btn.disabled = false;
    toast(err.message);
  }
}

boot();
