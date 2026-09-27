// Local fallback store: one JSON file, good enough for development and demos.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const FILE = path.resolve('data/db.json');
const TIMESTAMP = { search_runs: 'created_at', preferences: 'updated_at', listings: 'fetched_at' };

export function createMemoryStore() {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* fresh store */ }
  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(state));
    }, 50);
  };
  const tableOf = (t) => (state[t] ||= []);
  const matches = (row, filters = {}) => Object.entries(filters).every(([c, v]) =>
    Array.isArray(v) ? v.includes(row[c]) : (row[c] ?? null) === v);
  const clone = (x) => structuredClone(x);
  const fill = (table, row) => ({
    id: randomUUID(),
    [TIMESTAMP[table] || 'created_at']: new Date().toISOString(),
    ...row,
  });

  return {
    kind: 'memory',
    async insert(table, rows) {
      const list = (Array.isArray(rows) ? rows : [rows]).map((r) => fill(table, r));
      tableOf(table).push(...list);
      persist();
      return clone(list);
    },
    async upsert(table, rows, onConflict) {
      const keys = onConflict.split(',').map((s) => s.trim());
      const out = [];
      for (const r of Array.isArray(rows) ? rows : [rows]) {
        const existing = tableOf(table).find((x) => keys.every((k) => x[k] === r[k]));
        if (existing) { Object.assign(existing, r); out.push(existing); }
        else { const n = fill(table, r); tableOf(table).push(n); out.push(n); }
      }
      persist();
      return clone(out);
    },
    async select(table, filters, { order, limit } = {}) {
      let rows = tableOf(table).filter((r) => matches(r, filters));
      if (order) {
        const dir = order.ascending === false ? -1 : 1;
        rows = [...rows].sort((a, b) => (a[order.column] > b[order.column] ? dir : a[order.column] < b[order.column] ? -dir : 0));
      }
      if (limit) rows = rows.slice(0, limit);
      return clone(rows);
    },
    async update(table, filters, patch) {
      const rows = tableOf(table).filter((r) => matches(r, filters));
      rows.forEach((r) => Object.assign(r, patch));
      persist();
      return clone(rows);
    },
    async remove(table, filters) {
      state[table] = tableOf(table).filter((r) => !matches(r, filters));
      persist();
    },
  };
}
