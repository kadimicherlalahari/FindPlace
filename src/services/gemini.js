// Gemini is used for two things:
//  1. Turning free-text preferences into keyword checks the engine can run.
//  2. Writing short, plain-language explanations of each top apartment's trade-offs.
// Both have deterministic fallbacks, so the app works without a Gemini key.
import { config } from '../config.js';

async function generate(prompt, { json = true } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.gemini.key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const out = body.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return json ? JSON.parse(out) : out;
}

export const geminiEnabled = () => Boolean(config.gemini.key);

function fallbackChecks(text) {
  return String(text).split(/[,;\n]|\band\b/i).map((s) => s.trim()).filter((s) => s.length > 2).map((s) => {
    // Without Gemini we can't tell "no brokerage" (want a listing saying so)
    // from "no ground floor" (avoid), so negated phrases are matched verbatim:
    // at worst they come back "couldn't verify" instead of wrongly failing.
    const core = s.replace(/^(i want|want|near|close to|a|an)\s+/i, '').trim();
    return { label: s, keywords: [core.toLowerCase()], avoid: false };
  });
}

// "not ground floor, near a metro, quiet street" ->
// { checks: [{label:'Not on the ground floor', keywords:['ground floor'], avoid:true}, ...] }
export async function interpretFreeText(text) {
  if (!text?.trim()) return { checks: [] };
  if (!geminiEnabled()) return { checks: fallbackChecks(text), by: 'fallback' };
  try {
    const out = await generate(`You convert an apartment hunter's free-text requirement into checks that can be run against a rental listing's title, description and amenity list using case-insensitive keyword matching.
Return JSON: {"checks":[{"label": short human-readable requirement, "keywords": [lowercase words or phrases likely to appear in a listing], "avoid": true if the person wants to AVOID this (listing mentioning it is bad), false if they WANT it}]}
Give 3-8 keyword variants per check (synonyms, Indian real-estate phrasing). Listings phrase positives as negations, e.g. \"no brokerage\", \"zero deposit\": for such wishes use avoid=false with the positive phrasings as keywords (\"no brokerage\", \"zero brokerage\", \"brokerage free\"), and use avoid=true only for things whose mention in a listing is bad (e.g. \"ground floor\"). Ignore anything that is not a property requirement.
Text: """${text}"""`);
    const checks = (out.checks || []).filter((c) => c.label && Array.isArray(c.keywords) && c.keywords.length)
      .map((c) => ({ label: String(c.label), keywords: c.keywords.map((k) => String(k).toLowerCase()), avoid: Boolean(c.avoid) }));
    return { checks, by: 'gemini' };
  } catch (err) {
    console.warn('[gemini] interpret failed, using fallback:', err.message);
    return { checks: fallbackChecks(text), by: 'fallback' };
  }
}

function fallbackExplanation(item) {
  if (!item.unmet.length) return 'Ticks every box for all three of you, with no compromises needed.';
  const byPerson = {};
  for (const u of item.unmet) (byPerson[u.personName] ||= []).push(u.label.toLowerCase());
  const parts = Object.entries(byPerson).map(([n, labels]) => `${n} on ${labels.join(' and ')}`);
  const who = Object.keys(byPerson);
  return `Passes everyone's must-haves. The give: ${parts.join('; ')}. ${who.length === 1 ? `${who[0]} is the only one compromising here.` : 'The compromises are shared around.'}`;
}

// items: ranked results; people: [{id,name}].
// Explanations are shown to the whole group, so Gemini only gets *which*
// preference each person compromises on: no budgets, addresses or notes.
export async function explainTop(items, people) {
  if (!items.length) return [];
  if (!geminiEnabled()) return items.map((i) => fallbackExplanation(i));
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const payload = items.map((i, idx) => ({
    idx,
    title: i.listing.title,
    rent: i.listing.rent,
    scores: Object.fromEntries(Object.entries(i.personScores).map(([id, s]) => [names[id], s])),
    groupScore: i.overall,
    compromises: i.unmet.map((u) => ({ person: u.personName, preference: u.label })),
    toVerify: i.unverified.map((u) => ({ person: u.personName, preference: u.label })),
  }));
  try {
    const out = await generate(`Three friends (${people.map((p) => p.name).join(', ')}) are choosing an apartment to share. For each apartment below, write 2 short, warm sentences explaining why it's a realistic option for the group, who is compromising on what, and anything to check on a visit. Use names. This is shown to all three friends: never invent or mention amounts, budgets, addresses or other specifics. No markdown, no emojis, no score numbers.
Return JSON: {"explanations":[{"idx":number,"text":string}]}
Apartments: ${JSON.stringify(payload)}`);
    const byIdx = Object.fromEntries((out.explanations || []).map((e) => [e.idx, e.text]));
    return items.map((i, idx) => byIdx[idx] || fallbackExplanation(i));
  } catch (err) {
    console.warn('[gemini] explain failed, using fallback:', err.message);
    return items.map((i) => fallbackExplanation(i));
  }
}
