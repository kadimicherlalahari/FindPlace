import { createClient } from '@supabase/supabase-js';

export function createSupabaseStore({ url, serviceKey }) {
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });

  const applyFilters = (q, filters = {}) => {
    for (const [col, val] of Object.entries(filters)) {
      q = Array.isArray(val) ? q.in(col, val) : val === null ? q.is(col, null) : q.eq(col, val);
    }
    return q;
  };
  const check = ({ data, error }) => {
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data || [];
  };

  return {
    kind: 'supabase',
    async insert(table, rows) {
      return check(await client.from(table).insert(rows).select());
    },
    async upsert(table, rows, onConflict) {
      return check(await client.from(table).upsert(rows, { onConflict }).select());
    },
    async select(table, filters, { order, limit } = {}) {
      let q = applyFilters(client.from(table).select('*'), filters);
      if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
      if (limit) q = q.limit(limit);
      return check(await q);
    },
    async update(table, filters, patch) {
      return check(await applyFilters(client.from(table).update(patch), filters).select());
    },
    async remove(table, filters) {
      check(await applyFilters(client.from(table).delete(), filters));
    },
  };
}
