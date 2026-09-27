// The group's shared, read-only shortlist: the three flats side by side, and
// for each friend what she gets, gives up and needs to check. Answering
// compromise questions stays on each friend's private page or in Telegram.
import { $, api, esc, breakdownHtml, factsHtml, runnersUpHtml, tradeoffGridHtml } from './shared.js';

const app = $('#app');
const runId = location.pathname.split('/').pop();
const STATUS = { agreed: '✅ Everyone\'s okay with it', pending: '⏳ Waiting on answers', rejected: '❌ Someone said no' };

function flatCard(t, friends) {
  const l = t.listing;
  return `
    <article class="apt ${t.status}" id="flat-${t.rank}">
      <div class="apt-photo">
        ${l.photos?.[0] ? `<img src="${esc(l.photos[0])}" alt="" loading="lazy">` : ''}
        <span class="rank">#${t.rank}</span>
        <span class="ring" style="--v:${Math.round(t.overall_score)}" aria-label="Group score ${Math.round(t.overall_score)}"><b>${Math.round(t.overall_score)}<small>GROUP</small></b></span>
      </div>
      <div class="apt-body">
        <h3>${esc(l.title)}</h3>
        <div class="facts">${factsHtml(l, friends.length)}</div>
        <span class="pill ${t.status}">${STATUS[t.status] || ''}</span>
        ${breakdownHtml(t, friends)}
        ${t.explanation ? `<p class="why">${esc(t.explanation)}</p>` : ''}
        ${l.url ? `<div class="apt-actions"><a class="btn btn-ghost btn-block" href="${esc(l.url)}" target="_blank" rel="noopener">View listing ↗</a></div>` : ''}
      </div>
    </article>`;
}

async function boot() {
  let d;
  try {
    d = await api(`/api/shortlist/${encodeURIComponent(runId)}`);
  } catch (err) {
    app.innerHTML = `<div class="card celebrate"><div class="big">🙈</div><h2 style="margin-top:12px">We couldn't find this shortlist</h2><p class="muted" style="margin-top:6px">Ask the bot in your group chat for /status, or open your own private link.</p></div>`;
    return;
  }
  const { run, top, runnersUp, friends, group, newerRunId } = d;
  document.title = `${group.name}: shortlist`;
  const passed = run.evaluated_count - run.eliminated_count;
  app.innerHTML = `
    ${newerRunId ? `<a class="banner" href="/r/${esc(newerRunId)}">🔄 Someone updated her wishlist and there's a newer shortlist. See it →</a>` : ''}
    <section class="stack sl-intro">
      <h1>${top.length ? `Your top ${top.length}` : 'No match yet'}</h1>
      <p class="muted">${esc(group.name)}</p>
      <p>${top.length
        ? 'Every flat here passes all three of your must-haves. Nobody is picking for you: here\'s what each of you gets and gives up, so you can choose the tradeoff together.'
        : 'No flat passed everyone\'s No Compromise rules. One of you could switch a must-have to "Can compromise" on her private page.'}</p>
      <p class="small muted">${run.evaluated_count} flats checked · ${run.eliminated_count} ruled out by someone's must-have · ${passed} passed</p>
    </section>
    ${tradeoffGridHtml(top, friends)}
    ${top.map((t) => flatCard(t, friends)).join('')}
    ${runnersUpHtml(runnersUp, friends)}
    <p class="small muted sl-foot">Your friends only see <i>which</i> of your preferences a flat misses, never your budget or notes. Answer "okay with it?" questions on your private link or with the buttons in Telegram.</p>`;
}

boot();
