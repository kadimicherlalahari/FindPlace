export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inr = (n) => (n == null ? '?' : `₹${Math.round(n).toLocaleString('en-IN')}`);

export async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json' }, body: opts.body && JSON.stringify(opts.body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3200);
}

export function confetti(count = 90) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#8a63f0', '#ff6b5e', '#16a47a', '#ffc23d', '#ff9ecb'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--dx', `${(Math.random() - 0.5) * 200}px`);
    c.style.setProperty('--r', `${Math.random() * 720}deg`);
    c.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    c.style.animationDelay = `${Math.random() * 0.4}s`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}

// ---------- shortlist pieces (private page + shared /r/ page) ----------
// Friends only ever see *which* preference someone gets or gives up; the
// server strips the numbers before these arrive (see shareableView).

const ICON = {
  got: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  gave: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h9l-2.5-2.5M13 10H4l2.5 2.5"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/></svg>',
};
const ANSWER = { pending: 'asking', accepted: 'okay with it', rejected: 'said no' };
// "Rent budget" -> "rent budget", but "Areas I won't consider" keeps its I.
const lower = (s) => { const t = String(s || ''); return t.charAt(0).toLowerCase() + t.slice(1); };
const place = (l) => l.location.locality || l.location.city || 'Somewhere';
const who = (f, meId) => (f.id === meId ? 'You' : esc(f.name));

export const floorText = (f) => (f == null ? null : f === 0 ? 'Ground floor' : `Floor ${f}`);

export function factsHtml(l, n) {
  const hasLift = (l.amenities || []).includes('lift');
  return [
    `<span>📍 ${esc(place(l))}</span>`,
    `<span class="money">💰 ${inr(l.rent / n)} each</span>`,
    `<span>${inr(l.rent)}/mo total</span>`,
    `<span>🔐 ${inr(l.deposit)} deposit</span>`,
    `<span>🛏️ ${l.bhk ?? '?'} BHK</span>`,
    l.bathrooms != null ? `<span>🛁 ${l.bathrooms} bath</span>` : '',
    `<span>📐 ${l.sizeSqft ?? '?'} sq ft</span>`,
    l.floor != null ? `<span>🏢 ${floorText(l.floor)}${hasLift ? ' · lift' : l.amenitiesKnown ? ' · no lift' : ''}</span>` : '',
    l.furnishing ? `<span>🛋️ ${esc(l.furnishing)}</span>` : '',
    l.availableFrom ? `<span>📅 from ${esc(new Date(l.availableFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}</span>` : '',
  ].join('');
}

// Per friend: what she gives up, what to check on a visit, what she gets.
function friendParts(t, f) {
  return {
    gave: t.compromises.filter((c) => c.person_id === f.id),
    check: (t.unverified || []).filter((u) => u.personId === f.id),
    got: (t.met || []).filter((m) => m.personId === f.id),
  };
}

const chip = (kind, label, extra = '', title = '') =>
  `<li class="bd-chip ${kind}"${title ? ` title="${esc(title)}"` : ''}>${ICON[kind.split(' ')[0]]}<span>${esc(lower(label))}</span>${extra}</li>`;

export function breakdownHtml(t, friends, meId = null) {
  const rows = friends.map((f) => {
    const { gave, check, got } = friendParts(t, f);
    const mine = f.id === meId;
    const chips = [
      ...gave.map((c) => chip(`gave ${c.status}`, c.label, `<small>${ANSWER[c.status]}</small>`, mine ? c.detail : '')),
      ...check.map((u) => chip('check', u.label, '<small>check</small>', mine ? u.reason : '')),
      ...got.map((m) => chip('got', m.label, '', mine ? m.reason : '')),
    ];
    const verdict = !gave.length
      ? '<span class="bd-verdict all">Gets it all</span>'
      : `<span class="bd-verdict some">Gives up ${gave.length}</span>`;
    return `
      <li class="bd-row f${f.slot}">
        <div class="bd-head"><span class="avatar">${esc(f.name[0].toUpperCase())}</span><b>${who(f, meId)}</b>${verdict}<span class="bd-score" aria-label="${who(f, meId)}'s score">${t.person_scores[f.id] ?? '–'}</span></div>
        ${chips.length ? `<ul class="bd-chips">${chips.join('')}</ul>` : '<p class="small muted">Nothing on her list to check.</p>'}
      </li>`;
  });
  return `<ul class="bd" aria-label="What each of you gets and gives up">${rows.join('')}</ul>`;
}

const legendHtml = () => `
  <ul class="legend" aria-label="Key for the flat cards below">
    <li class="legend-title">On each flat:</li>
    ${chip('gave', 'Gives up')}${chip('check', 'Check on a visit')}${chip('got', 'Gets')}
  </ul>`;

// Friends down the side, flats across the top: the tradeoff at a glance.
export function tradeoffGridHtml(top, friends, meId = null) {
  if (!top.length) return '';
  const head = top.map((t) => `
    <th scope="col"><a href="#flat-${t.rank}"><span class="tg-rank">#${t.rank}</span>${esc(place(t.listing))}<small>${inr(t.listing.rent / friends.length)} each</small></a></th>`).join('');
  const body = friends.map((f) => `
    <tr class="f${f.slot}">
      <th scope="row"><span class="avatar">${esc(f.name[0].toUpperCase())}</span><span class="tg-name">${who(f, meId)}</span></th>
      ${top.map((t) => {
        const { gave, check } = friendParts(t, f);
        if (!gave.length) {
          return `<td class="all"><span class="tg-all">${ICON.got}Gets it all</span>${check.length ? `<small class="tg-check">${check.length} to check</small>` : ''}</td>`;
        }
        return `<td><ul>${gave.map((c) => `<li class="${c.status}">${esc(lower(c.label))}${c.status !== 'pending' ? `<small>${ANSWER[c.status]}</small>` : ''}</li>`).join('')}</ul>${check.length ? `<small class="tg-check">${check.length} to check</small>` : ''}</td>`;
      }).join('')}
    </tr>`).join('');
  return `
    <section class="tradeoff card" aria-labelledby="tg-title">
      <h2 id="tg-title">Who gives up what</h2>
      <p class="small muted">Each column is a flat. Each row is one of you. That's the conversation to have.</p>
      <div class="tg-scroll"><table class="tg">
        <thead><tr><td></td>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </section>
    ${legendHtml()}`;
}

export function runnersUpHtml(list, friends, meId = null) {
  if (!list?.length) return '';
  const byId = Object.fromEntries(friends.map((f) => [f.id, f]));
  return `
    <details class="card more">
      <summary>
        <span class="more-text"><span class="display">${list.length} more flat${list.length > 1 ? 's' : ''} that passed</span><small class="muted">Also passed every must-have, with lower group scores</small></span>
        <span class="more-toggle"><span class="when-closed">Show</span><span class="when-open">Hide</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></span>
      </summary>
      <ol class="more-list">${list.map((t) => {
        const grouped = t.givesUp.reduce((acc, g) => ((acc[g.personId] ||= []).push(g), acc), {});
        const gives = Object.entries(grouped)
          .map(([id, g]) => `<b>${byId[id] ? who(byId[id], meId) : '?'}:</b> ${g.map((x) => esc(lower(x.label))).join(', ')}`);
        return `
        <li>
          <span class="more-rank">#${t.rank}</span>
          <div>
            <p><b>${esc(t.listing.title)}</b></p>
            <p class="small muted">${inr(t.listing.rent / friends.length)} each · group score ${Math.round(t.overall_score)}${t.listing.url ? ` · <a href="${esc(t.listing.url)}" target="_blank" rel="noopener">listing ↗</a>` : ''}</p>
            <p class="small">${gives.length ? `Gives up: ${gives.join(' · ')}` : 'Nobody gives anything up'}</p>
          </div>
        </li>`;
      }).join('')}</ol>
    </details>`;
}
