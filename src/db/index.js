// Minimal table-oriented data layer. Both backends expose the same five calls,
// so the rest of the app never knows whether it is talking to Supabase or the
// local JSON store.
//   insert(table, row|rows)          -> rows
//   upsert(table, rows, onConflict)  -> rows
//   select(table, filters, {order, limit}) -> rows
//   update(table, filters, patch)    -> rows
//   remove(table, filters)
// filters: { column: value } (equality) or { column: [v1, v2] } (IN).
import { config } from '../config.js';
import { createSupabaseStore } from './supabase.js';
import { createMemoryStore } from './memory.js';

if (config.onVercel && !(config.supabase.url && config.supabase.serviceKey)) {
  // Vercel's filesystem is read-only and wiped between requests.
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Vercel');
}

export const db = config.supabase.url && config.supabase.serviceKey
  ? createSupabaseStore(config.supabase)
  : createMemoryStore();

export const one = async (table, filters) => (await db.select(table, filters, { limit: 1 }))[0] || null;
