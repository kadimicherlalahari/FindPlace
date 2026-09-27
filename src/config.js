const env = process.env;

export const config = {
  onVercel: Boolean(env.VERCEL),
  port: Number(env.PORT || 3000),
  // On Vercel, fall back to the production domain Vercel provides.
  appUrl: (env.APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${env.PORT || 3000}`)).replace(/\/$/, ''),
  supabase: {
    // Accept the REST URL too (…supabase.co/rest/v1/); the client wants the project URL.
    url: (env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  listings: {
    provider: env.LISTINGS_PROVIDER || 'mock',
    rapidapiKey: env.RAPIDAPI_KEY || '',
    rapidapiHost: env.RAPIDAPI_HOST || '',
    rapidapiConfig: env.RAPIDAPI_CONFIG || 'src/providers/rapidapi.config.json',
    maxPages: Number(env.RAPIDAPI_MAX_PAGES || 2),
  },
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || '',
    mode: env.TELEGRAM_MODE || (env.VERCEL ? 'webhook' : 'polling'),
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || '',
  },
  gemini: {
    key: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  geocoder: {
    kind: env.GEOCODER || 'nominatim',
    contact: env.GEOCODER_CONTACT || 'apartment-matchmaker',
  },
  topN: 10,
};
