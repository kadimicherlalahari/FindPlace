# Flat Hunt: Apartment Matchmaker 🏡✨

Three friends, one flat. Each friend fills in her wishlist **privately**, and the app finds flats all three can realistically agree on. The shortlist goes to your Telegram group, with notes on who's compromising on what.

## How it works

1. **Start a hunt** in your Telegram group with `/newhunt Asha, Priya, Meera` (or on the website).
2. The bot posts **one private link per friend**. Each link opens only that person's wishlist.
3. Each friend marks every preference **💯 No compromise** (flats without it are ruled out) or **🤝 Can compromise** (it lowers the score, and she's asked first).
4. The bot posts progress (“2/3 done, waiting on Meera 👀”). When the **last friend submits**, matching runs automatically.
5. The group gets the **Top 10**: details, group score + each friend's score, and who's compromising on what, with ✅/❌ buttons. Each friend can also answer on her private page.
6. Anyone can edit her wishlist and resubmit, and the bot re-matches. `/search` re-runs manually.

**Privacy:** friends never see each other's wishlists. Group messages say *who* compromises on *which* preference (e.g. “Priya: rent budget”), never the numbers. Each friend sees her own details (“₹833 over your ₹21,500 budget”) only on her private page. Private notes are never sent to Gemini.

The group score is `0.6 × average + 0.4 × lowest`, so a flat everyone likes beats one that's perfect for two and bad for the third.

## Deploy on Vercel

1. **Supabase:** in the SQL editor, run `supabase/schema.sql`. Copy the **Project URL** (`https://xxxx.supabase.co`, no `/rest/v1`) and the **secret / service-role key**.
2. **Vercel:** import this project. Under *Settings → Environment Variables* add:

   | Variable | Value |
   |---|---|
   | `APP_URL` | your Vercel URL, e.g. `https://flat-hunt.vercel.app` |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
   | `TELEGRAM_BOT_TOKEN` | from @BotFather |
   | `TELEGRAM_WEBHOOK_SECRET` | any long random string |
   | `GEMINI_API_KEY` | optional |
   | `LISTINGS_PROVIDER`, `RAPIDAPI_KEY`, `RAPIDAPI_HOST` | `mock` until your RapidAPI mapping is ready |

   Then deploy.
3. **Point Telegram at it:** with the same `APP_URL`, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in your local `.env`, run:
   ```bash
   npm run telegram:webhook
   ```
4. In your group: `/newhunt Name1, Name2, Name3` 🎉

> ⚠️ Running `npm start` locally with the same bot token switches the bot back to polling and **disconnects the webhook**. Run `npm run telegram:webhook` again afterwards, or use a second bot for local testing.

## Run locally

```bash
npm install
npm start      # http://localhost:3000
npm test
```

With no keys it uses sample listings and a local JSON file (`./data`). Without Telegram, setting up a hunt on the website shows the three private links directly, for testing.

## Bot commands

| Command | What it does |
|---|---|
| `/newhunt A, B, C` | Start a hunt. Usernames are optional: `Asha @asha_k, Priya, Meera` |
| `/links` | Re-post the private links |
| `/status` | Who has submitted, and where the shortlist stands |
| `/search` | Re-match now |
| `/chatid` | Show this chat's ID (for web setup) |

To answer with the buttons in the group, each friend taps **Connect Telegram** on her private page once, or gives her @username at setup.

## Listings (RapidAPI)

`src/providers/rapidapi.config.json` maps your chosen RapidAPI API to the app's listing format. Set the endpoint, parameters and field paths for your API (e.g. `images[].url`), then set `LISTINGS_PROVIDER=rapidapi`. To add a completely different source, write a module with `search(query)` and register it in `src/providers/index.js`.

## Layout

```
api/index.js            Vercel entry (same Express app)
src/app.js              HTTP routes (all friend data scoped by private-link token)
src/server.js           local server + Telegram polling
src/preferences.js      preference catalog + wizard steps
src/engine/             evaluate, rank, commute (pure logic, unit-tested)
src/providers/          listing sources + normalizer
src/services/           groups, search, runs/compromises, telegram, gemini
public/                 home page + private wishlist page (no build step)
supabase/schema.sql
```
