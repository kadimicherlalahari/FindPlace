// Provider registry. To add a new listings source, write a module exporting
// { name, search(query) -> Promise<NormalizedListing[]> } and register it here.
// The recommendation engine never imports a provider directly.
//
// query: { locations: [string], minBhk, maxRent (total monthly rent), moveInBy }
import { config } from '../config.js';
import { rapidapiProvider } from './rapidapi.js';
import { mockProvider } from './mock.js';

const PROVIDERS = { rapidapi: rapidapiProvider, mock: mockProvider };

export function getProvider(name = config.listings.provider) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown LISTINGS_PROVIDER "${name}". Options: ${Object.keys(PROVIDERS).join(', ')}`);
  return p;
}

export async function fetchListings(query) {
  const provider = getProvider();
  const listings = await provider.search(query);
  const seen = new Set();
  return {
    provider: provider.name,
    listings: listings.filter((l) => !seen.has(l.id) && seen.add(l.id)),
  };
}
