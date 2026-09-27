// Run work after the HTTP response has been sent. On Vercel the function would
// otherwise be frozen as soon as it responds; waitUntil keeps it alive. On a
// normal Node server the promise simply keeps running.
import { waitUntil } from '@vercel/functions';

export function background(label, fn) {
  const p = Promise.resolve().then(fn).catch((err) => console.error(`[${label}]`, err));
  waitUntil(p);
  return p;
}
