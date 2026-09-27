import { $, api, esc, toast, confetti } from './shared.js';

const colors = ['f0', 'f1', 'f2'];
$('#friendsFields').innerHTML = [0, 1, 2].map((i) => `
  <div class="grid2 ${colors[i]}">
    <div><label class="lbl" for="p${i}">Friend ${i + 1}</label><input id="p${i}" name="p${i}" required placeholder="${['Asha', 'Priya', 'Meera'][i]}" autocomplete="off"></div>
    <div><label class="lbl" for="u${i}">Telegram @ <span class="muted">(optional)</span></label><input id="u${i}" name="u${i}" placeholder="@username" autocapitalize="off" autocomplete="off"></div>
  </div>`).join('');

const schema = await api('/api/schema').catch(() => null);
if (schema && !schema.status.telegram) $('#chatField').hidden = true;

$('#hunt').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const r = await api('/api/hunts', { method: 'POST', body: {
      name: f.get('name'), telegram_chat_id: f.get('chat'),
      people: [0, 1, 2].map((i) => ({ name: f.get(`p${i}`), telegram_username: f.get(`u${i}`) })),
    } });
    e.target.hidden = true;
    const done = $('#setupDone');
    done.hidden = false;
    done.innerHTML = r.sent
      ? `<div class="celebrate"><div class="big">💌</div><h2 style="margin-top:12px">Links sent!</h2><p class="muted" style="margin-top:6px">Check your group chat. Each of you taps her own name.</p></div>`
      : `<div class="stack" style="margin-top:12px"><p><b>Telegram isn't connected</b>, so here are the private links (local testing only):</p>${r.devLinks.map((l) => `<p><a href="${esc(l.url)}">${esc(l.name)}'s wishlist →</a></p>`).join('')}</div>`;
    confetti();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
};
