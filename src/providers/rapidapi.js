// Config-driven RapidAPI adapter. Which API to call and how to read its
// response lives in rapidapi.config.json, so switching to another RapidAPI
// listings API is a config change, not a code change.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { makeListing } from './normalize.js';

function loadMapping() {
  return JSON.parse(fs.readFileSync(path.resolve(config.listings.rapidapiConfig), 'utf8'));
}

// "a.b[].c" -> walks objects, maps arrays at "[]"
export function getPath(obj, p) {
  if (!p) return undefined;
  const [head, ...rest] = p.split('[].');
  let cur = head.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  if (rest.length && Array.isArray(cur)) cur = cur.map((x) => getPath(x, rest.join('[].')));
  return cur;
}

const fillTemplate = (tpl, vars) =>
  String(tpl).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? '') === '' ? '' : String(vars[k]));

async function request(mapping, vars) {
  const params = new URLSearchParams();
  for (const [k, tpl] of Object.entries(mapping.params || {})) {
    const v = fillTemplate(tpl, vars);
    if (v !== '') params.set(k, v);
  }
  const url = `https://${config.listings.rapidapiHost}${mapping.path}${mapping.method === 'POST' ? '' : `?${params}`}`;
  const res = await fetch(url, {
    method: mapping.method || 'GET',
    headers: {
      'x-rapidapi-key': config.listings.rapidapiKey,
      'x-rapidapi-host': config.listings.rapidapiHost,
      ...(mapping.method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    body: mapping.method === 'POST' ? JSON.stringify(Object.fromEntries(params)) : undefined,
  });
  if (!res.ok) throw new Error(`RapidAPI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export const rapidapiProvider = {
  name: 'rapidapi',
  async search(query) {
    if (!config.listings.rapidapiKey || !config.listings.rapidapiHost) {
      throw new Error('RAPIDAPI_KEY and RAPIDAPI_HOST must be set when LISTINGS_PROVIDER=rapidapi');
    }
    const mapping = loadMapping();
    const out = [];
    for (const location of query.locations.length ? query.locations : ['']) {
      for (let page = 1; page <= config.listings.maxPages; page++) {
        const body = await request(mapping, { ...query, location, page });
        const results = getPath(body, mapping.resultsPath) || [];
        if (!Array.isArray(results) || results.length === 0) break;
        for (const r of results) {
          const partial = Object.fromEntries(Object.entries(mapping.fields).map(([k, p]) => [k, getPath(r, p)]));
          if (partial.externalId == null) continue;
          if (typeof partial.amenities === 'string') partial.amenities = partial.amenities.split(/[,;|]/).map((s) => s.trim());
          if (typeof partial.photos === 'string') partial.photos = [partial.photos];
          out.push(makeListing('rapidapi', partial));
        }
      }
    }
    return out;
  },
};
