// Creates the Riya / Meera / Kavita demo hunt against a running server,
// submits all three wishlists and prints the links to open.
//
//   npm run demo                       # against http://localhost:3000
//   npm run demo -- http://localhost:3111
//
// Only works when Telegram is NOT configured on that server (otherwise the
// private links go to a Telegram group instead of being returned here), so
// run the server without your .env: `npm run start:demo`.
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

async function call(path, body) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
  return data;
}

// The brief's scenario, moved to Bengaluru. Riya's gym and family are across
// town, Kavita's office is out east, Meera can't do stairs.
const WISHLISTS = {
  Riya: {
    locations: { value: { areas: 'Indiranagar, Domlur, Koramangala, HSR Layout, Ulsoor, CV Raman Nagar, Whitefield, Marathahalli' }, priority: 'flex' },
    maxRent: { value: { amount: 24000 }, priority: 'must' },
    commute: { value: { trips: [
      { name: 'Gym', from: 'Indiranagar, Bengaluru', maxMinutes: 25, mode: 'two_wheeler' },
      { name: 'Family', from: 'Jayanagar, Bengaluru', maxMinutes: 40, mode: 'two_wheeler' },
    ] }, priority: 'must' },
    furnishing: { value: { accepted: ['semi-furnished', 'furnished'] }, priority: 'flex' },
  },
  Meera: {
    lift: { value: { needed: true, aboveFloor: 1 }, priority: 'must', note: 'Knee condition, stairs are a hard no' },
    maxRent: { value: { amount: 22000 }, priority: 'flex' },
    bathrooms: { value: { min: 2 }, priority: 'flex' },
    balcony: { value: { needed: true }, priority: 'flex' },
    parking: { value: { type: 'two_wheeler' }, priority: 'flex' },
  },
  Kavita: {
    commute: { value: { trips: [{ name: 'Office', from: 'Marathahalli, Bengaluru', maxMinutes: 35, mode: 'driving' }] }, priority: 'must' },
    avoidAreas: { value: { areas: 'Whitefield' }, priority: 'must' },
    bhk: { value: { min: 3 }, priority: 'must' },
    minSize: { value: { sqft: 1400 }, priority: 'flex' },
    maxDeposit: { value: { amount: 70000 }, priority: 'flex' },
  },
};

const hunt = await call('/api/hunts', { name: 'Riya, Meera & Kavita 💜', people: Object.keys(WISHLISTS).map((name) => ({ name })) });
if (!hunt.devLinks) throw new Error('This server has Telegram configured, so it posts links to Telegram instead. Run it without .env: npm run start:demo');
const tokens = Object.fromEntries(hunt.devLinks.map((l) => [l.name, l.url.split('/').pop()]));
for (const [name, preferences] of Object.entries(WISHLISTS)) await call(`/api/me/${tokens[name]}/submit`, { preferences });

process.stdout.write('Matching');
let run;
for (let i = 0; i < 30 && !run; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  process.stdout.write('.');
  run = (await call(`/api/me/${tokens.Riya}`)).results?.run;
}
console.log(run ? ' done\n' : ' still running, open the links in a moment\n');
if (run) console.log(`Shared comparison page:\n  ${base}/r/${run.id}\n`);
console.log('Private pages (one per friend):');
for (const l of hunt.devLinks) console.log(`  ${l.name.padEnd(7)} ${l.url.replace(/^https?:\/\/[^/]+/, base)}`);
