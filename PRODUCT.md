# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Groups of exactly three friends in India looking for a shared rental flat, splitting the rent three ways. They use it on their phones and coordinate in a Telegram group chat. The reference scenario is Riya, Meera and Kavita: four months of searching and no shortlist, because every listing got picked apart one objection at a time in the chat, after someone had already fallen for it.

## Product Purpose
Fix the process, not the listing search. Each friend fills in her own wishlist privately, before anyone looks at a listing: rent share, deposit share, areas she wants, areas she won't consider, commutes (office, gym, family), must-haves such as a lift, parking, bathrooms or pets, and nice-to-haves. The tool then brings back 2–3 flats that pass everyone's dealbreakers. For each one it shows, per person, what she gets, what she gives up and what still needs checking. Success means the group walks into the conversation arguing about which tradeoff to accept, not whether a flat even qualifies.

## Positioning
Not a listings site and not a recommender. It never picks the flat; the decision stays with the three friends. What sets it apart is the per-person breakdown of what each friend gets and gives up, gathered separately and privately before anyone gets attached to a listing.

## Operating Context
- The hunt starts in a Telegram group (`/newhunt A, B, C`) or on the website. Each friend gets a private link (`/p/:token`).
- Each preference is marked 💯 No compromise (a flat that fails it is ruled out) or 🤝 Can compromise (a miss lowers that friend's score, and she is asked whether she's okay with it).
- Matching runs when the last friend submits. The shortlist is posted to Telegram and shown on each private page, and a shared, read-only comparison page covers the whole group.

## Capabilities and Constraints
- Privacy is non-negotiable: friends never see each other's budgets, addresses or notes. Shared surfaces show only *which* preference someone compromises on, never the numbers.
- Stack: Express + static HTML/CSS/vanilla JS modules in `public/`, deployed on Vercel with Supabase. No frontend framework or build step.
- Listings come from a mock provider (Bengaluru localities) or RapidAPI. Commute times are estimates and must be labelled as such.

## Brand Commitments
- Name: Flat Hunt. Voice: playful and warm, with lots of emoji. The copy assumes the three friends are women ("Flat hunt, girls!", "her wishlist"); the user confirmed keeping this.
- Each friend has her own colour (lilac, coral, mint) and a heart (💜 🧡 💚), used consistently.

## Evidence on Hand
No real users, testimonials or listings yet. The sample data is generated. Do not invent claims.

## Product Principles
1. Constraints come before listings: nobody should find out about a dealbreaker after falling for a flat.
2. Show the tradeoff, don't make the decision.
3. Private by default: share *what* someone compromises on, never *how much*.
4. A flat everyone finds decent beats one that's perfect for two and bad for the third.
