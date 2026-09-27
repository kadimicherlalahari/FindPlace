// Point Telegram at the deployed app. Run after deploying:
//   APP_URL=https://your-app.vercel.app npm run telegram:webhook
import { setWebhook } from '../src/services/telegram.js';

setWebhook()
  .then((info) => console.log('Webhook set:', info.url, info.last_error_message ? `(last error: ${info.last_error_message})` : ''))
  .catch((err) => { console.error(err.message); process.exit(1); });
