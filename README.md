# Flat Hunt: Apartment Matchmaker 🏡✨

Three friends, one flat. Each friend fills in her wishlist **privately**, before anyone looks at a listing. The app then finds the 2–3 flats that pass everyone's dealbreakers and shows, for each one, **what every friend gets, what she'd give up, and what to check on a visit**. It never picks the flat: the tradeoff is the group's call.

- **Live app:** https://find-place-five.vercel.app
- **Try it locally in one minute:** [Quick demo](#quick-demo-no-keys-needed)

## How it works

1. **Start a hunt** in your Telegram group with `/newhunt Asha, Priya, Meera` (or on the website).
2. The bot posts **one private link per friend** (`/p/<token>`). Each link opens only that person's wishlist.
3. Each friend fills in what matters to her:

   | Step | Preferences |
   |---|---|
   | Where & when | preferred areas, **no-go areas**, **up to 3 commutes** (office, gym, family, each with its own time limit and mode), move-in date |
   | Money talk | rent share, deposit share (the total is split three ways) |
   | The flat | bedrooms, **bathrooms**, size, furnishing, balcony, **lift (optionally "only above floor N")** |
   | Daily life | parking, pets, water, power backup, security, amenities |
   | Anything else | free text, turned into checks (by Gemini if a key is set) |

   She marks every preference **💯 No compromise** (flats that fail it are ruled out) or **🤝 Can compromise** (a miss lowers her score, and she's asked whether she's okay with it).
4. The bot posts progress ("2/3 done, waiting on Meera 👀"). When the **last friend submits**, matching runs automatically.
5. The group gets its **top 3**:
   - **Telegram:** a summary with a **Compare all 3** button, then one message per flat with a "How it works for each of you" block (✔️ gets / 🤝 gives up) and ✅/❌ buttons for each compromise.
   - **Shared comparison page** (`/r/<run>`): a **"Who gives up what" grid** (friends as rows × flats as columns), then one card per flat with each friend's *gives up* / *check on a visit* / *gets* chips. Ranks 4–10 sit behind **Show**.
   - **Each friend's private page:** the same grid and cards, plus her own details ("₹833 over your ₹21,500 budget") and the buttons to answer her compromise questions.
6. Anyone can edit her wishlist and resubmit, and the bot re-matches. Older comparison links then point to the newer shortlist. `/search` re-runs manually.

**Privacy:** friends never see each other's wishlists. Shared surfaces (Telegram, the comparison page) say *who* gives up *which* preference ("Meera: rent budget"), never the numbers, notes or addresses behind it. Private notes are never sent to Gemini. The comparison link is an unguessable ID that's only posted to the group chat.

**Scoring:** the group score is `0.6 × average + 0.4 × lowest`, so a flat everyone finds decent beats one that's perfect for two and bad for the third. When listing data is missing (e.g. the pet policy isn't stated), a flat is **never** silently ruled out; it's flagged "check on a visit" instead.

## Quick demo (no keys needed)

This runs the brief's scenario, Riya, Meera and Kavita moved to Bengaluru, on sample listings and a local JSON store:

```bash
npm install
npm run start:demo          # terminal 1: server on http://localhost:3000, ignores .env
npm run demo                # terminal 2: creates the hunt, submits 3 wishlists, prints links
```

It prints something like:

```
Shared comparison page:
  http://localhost:3000/r/2bcd6b82-…
Private pages (one per friend):
  Riya    http://localhost:3000/p/6Kg8OZ…
  Meera   http://localhost:3000/p/Hl4K-U…
  Kavita  http://localhost:3000/p/95eJi_…
```

What the scenario shows:

| Friend | Her rules in the demo |
|---|---|
| **Riya** | Rent ≤ ₹24,000 (must). Gym in Indiranagar ≤ 25 min **and** family in Jayanagar ≤ 40 min, by two-wheeler (must) |
| **Meera** | Lift needed **above the 1st floor** (must: knee condition). 2+ bathrooms, balcony, rent ≤ ₹22,000 (flexible) |
| **Kavita** | Office in Marathahalli ≤ 35 min by car (must). **No-go area:** Whitefield (must). 3+ BHK (must) |

Things to try:

- On the **comparison page**, read the grid: which flat has everyone on "Gets it all", and where is Meera giving up her rent budget?
- Open **Meera's** page and answer "okay with it?" on a flat, then reload the comparison page: her chip changes from *asking* to *okay with it*.
- On **Kavita's** page, open *My wishlist → Commutes*, add a second place, and resubmit: the shortlist re-matches.
- Tap **Why flats were ruled out** to see which must-haves did the filtering (in the demo, Meera's lift rules out the most).

Data lives in `./data/db.json`; delete it to start fresh. `npm run demo -- http://localhost:3111` targets another port.

> Use `npm run start:demo`, not `npm start`, for the demo. `npm start` loads your `.env`, which connects to your real Supabase and, with a bot token, **switches your bot to polling and disconnects the live webhook** (see below).

## Deploy on Vercel

### 1. Create the database tables (Supabase)

`supabase/schema.sql` is SQL for your database, not a terminal command. Run it once in the Supabase dashboard:

1. Open https://supabase.com/dashboard and pick your project.
2. Left sidebar → **SQL Editor** → **New query**.
3. Paste the **whole** contents of `supabase/schema.sql` and click **Run**. You should see *"Success. No rows returned."*
4. Check: **Table Editor** should now list `groups`, `people`, `preferences`, `search_runs`, `listings`, `evaluations`, `compromises`.

The file is safe to re-run (every statement uses `if not exists`). **Re-run it whenever you pull a version that changes it.** This version adds `evaluations.met`, the "what each friend gets" list; without it, matching fails.

If you prefer the terminal, get the connection string from **Connect** in the dashboard and run:

```bash
psql "postgresql://postgres:<DB-PASSWORD>@db.<project-ref>.supabase.co:5432/postgres" -f supabase/schema.sql
```

Then copy two values from **Project Settings → API**: the **Project URL** (`https://<ref>.supabase.co`; a trailing `/rest/v1/` is also accepted) and the **service_role / secret key** (server-side only, never put it in the browser).

### 2. Configure Vercel

Import this repo in Vercel. Under **Settings → Environment Variables** (Production), add:

| Variable | Value | Required |
|---|---|---|
| `SUPABASE_URL` | Project URL from step 1 | ✅ The app refuses to start on Vercel without it |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key from step 1 | ✅ |
| `APP_URL` | your production URL, e.g. `https://find-place-five.vercel.app` (no trailing slash) | recommended |
| `TELEGRAM_BOT_TOKEN` | from [@BotFather](https://t.me/BotFather) | for Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | any long random string: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` | for Telegram |
| `GEMINI_API_KEY` | from Google AI Studio | optional |
| `LISTINGS_PROVIDER` | `mock` (sample Bengaluru listings) or `rapidapi` | optional, default `mock` |
| `RAPIDAPI_KEY`, `RAPIDAPI_HOST` | your RapidAPI subscription | only with `rapidapi` |

Don't set `TELEGRAM_MODE` on Vercel; it always uses the webhook. Changing variables takes effect only after a **redeploy** (Deployments → ⋯ → Redeploy).

**If every page shows `500 FUNCTION_INVOCATION_FAILED`:** the server crashed on startup. Read the reason with `npx vercel logs --environment production --since 30m` (or Vercel → *Deployments → latest → Runtime Logs*):

| Log says | Fix |
|---|---|
| `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Vercel` | The variables are missing **or empty** (e.g. a bulk paste of the blank `.env.example`). Set real values, then redeploy |
| `Could not find the table 'public.…'` | Tables were never created in *that* project: run step 1 on the project `SUPABASE_URL` points at |
| `401` from Supabase | The key belongs to a different project than `SUPABASE_URL`. Each project has its own secret key |
| `Invalid export found in module "…/src/app.js"` | `src/app.js` must keep its `export default app` (Vercel serves `/` from it) |

**Syncing variables from your `.env` with the CLI** (values are piped, never printed):

```bash
npx vercel login && npx vercel link --yes --project find-place
bash -c 'set -a; . ./.env; set +a
for k in APP_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET GEMINI_API_KEY GEMINI_MODEL LISTINGS_PROVIDER RAPIDAPI_KEY RAPIDAPI_HOST RAPIDAPI_CONFIG RAPIDAPI_MAX_PAGES GEOCODER GEOCODER_CONTACT; do
  npx vercel env rm $k production --yes >/dev/null 2>&1
  printf "%s" "${!k}" | npx vercel env add $k production --sensitive
done'
npx vercel deploy --prod
```

`.vercelignore` keeps `.env`, `./data` and screenshots out of CLI deploys.

### 3. Point Telegram at the deployment

Put the **same** `APP_URL` (your https URL, not localhost), `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in your local `.env`, then run:

```bash
npm run telegram:webhook
```

It prints the webhook info. `APP_URL must be your public https URL` means `.env` still says `http://localhost:3000`.

### 4. Test the live app

1. Open your `APP_URL`: the home page should load. `APP_URL/api/schema` should return JSON showing `"db":"supabase"` and `"telegram":true`.
2. Add the bot to a Telegram group with your two friends and send `/newhunt Name1, Name2, Name3`.
3. Each friend taps **her own** name, fills in the wishlist and submits. The bot posts progress, then the shortlist and a **Compare all 3** button that opens `/r/<run>`.
4. Answer a compromise with the buttons in the chat (tap **Connect Telegram** on your private page first) or on your private page.

> ⚠️ Running `npm start` locally with the same bot token switches the bot back to polling and **disconnects the webhook**. Run `npm run telegram:webhook` again afterwards, or use a second bot for local testing.

## Run locally with your own keys

```bash
npm install
npm start      # loads .env; http://localhost:3000, Telegram via polling
npm test       # engine unit tests
```

With no Supabase keys it stores data in `./data`. Without a Telegram token, setting up a hunt on the website shows the three private links directly.

## Bot commands

| Command | What it does |
|---|---|
| `/newhunt A, B, C` | Start a hunt. Usernames are optional: `Asha @asha_k, Priya, Meera` |
| `/links` | Re-post the private links |
| `/status` | Who has submitted, and where the shortlist stands |
| `/search` | Re-match now |
| `/chatid` | Show this chat's ID (for web setup) |

## Listings (RapidAPI)

`src/providers/rapidapi.config.json` maps your chosen RapidAPI API to the app's listing format: the endpoint, parameters and field paths (e.g. `images[].url`), including `bathrooms` and `floor`. When the API has no floor field, the floor is read from the description ("3rd floor", "ground floor"). Then set `LISTINGS_PROVIDER=rapidapi`. To add a different source, write a module with `search(query)` and register it in `src/providers/index.js`.

Commute times are estimates (straight-line distance × road factor ÷ typical city speed, geocoded with OpenStreetMap Nominatim) and are labelled as such.

## Layout

```
api/index.js            Vercel entry (same Express app)
src/app.js              HTTP routes: private pages (/p/:token), shared shortlist (/r/:runId)
src/server.js           local server + Telegram polling
src/preferences.js      preference catalog + wizard steps
src/engine/             evaluate, rank, commute (pure logic, unit-tested)
src/providers/          listing sources (mock Bengaluru data, RapidAPI) + normalizer
src/services/           groups, search, runs (+ privacy filter), telegram, gemini
public/                 home, private wishlist (me.*), shared comparison (shortlist.*); no build step
scripts/                set-webhook.js, demo.js
supabase/schema.sql     tables; safe to re-run
```
