// Local development server. On Vercel, api/index.js serves the same app.
import { app } from './app.js';
import { config } from './config.js';
import { db } from './db/index.js';
import { startPolling } from './services/telegram.js';
import { geminiEnabled } from './services/gemini.js';

app.listen(config.port, () => {
  console.log(`Apartment Matchmaker on http://localhost:${config.port}`);
  console.log(`  db=${db.kind} listings=${config.listings.provider} gemini=${geminiEnabled()} telegram=${Boolean(config.telegram.token)}`);
  startPolling().catch((err) => console.error('[telegram] failed to start:', err.message));
});
