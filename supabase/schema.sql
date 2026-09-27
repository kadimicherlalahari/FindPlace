-- Apartment Matchmaker schema. Run in the Supabase SQL editor (or `supabase db push`).
-- The server talks to Supabase with the service-role key, so RLS is enabled with
-- no public policies: the anon key can read nothing.

create extension if not exists "pgcrypto";

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  telegram_chat_id text,
  created_at timestamptz not null default now()
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  slot int not null,                         -- 0,1,2 => Person A,B,C
  name text not null,
  telegram_username text,
  telegram_user_id bigint,
  access_token text not null unique,         -- secret for this person's private link
  submitted_at timestamptz,                  -- null until they submit their preferences
  created_at timestamptz not null default now(),
  unique (group_id, slot)
);
-- for databases created from an earlier version of this file
alter table people add column if not exists access_token text unique;
alter table people add column if not exists submitted_at timestamptz;
create index if not exists groups_chat_idx on groups(telegram_chat_id);

create table if not exists preferences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  key text not null,                         -- e.g. maxRent, commute, pets
  value jsonb not null,
  priority text not null check (priority in ('must', 'flex')),  -- No Compromise / Can Compromise
  note text,
  interpreted jsonb,                         -- Gemini interpretation of free text
  updated_at timestamptz not null default now(),
  unique (person_id, key)
);

create table if not exists search_runs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  status text not null default 'running',    -- running | done | failed
  provider text,
  evaluated_count int default 0,
  eliminated_count int default 0,
  elimination_summary jsonb,
  preferences_snapshot jsonb,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists listings (
  id text primary key,                       -- "<source>:<external id>"
  source text not null,
  external_id text not null,
  data jsonb not null,                       -- normalized listing
  fetched_at timestamptz not null default now()
);

create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references search_runs(id) on delete cascade,
  listing_id text not null references listings(id) on delete cascade,
  eliminated boolean not null,
  eliminations jsonb,                        -- [{personId, personName, key, label, reason}]
  overall_score numeric,
  person_scores jsonb,                       -- {personId: score}
  unmet jsonb,                               -- soft preferences not (fully) met
  unverified jsonb,                          -- preferences we could not check from listing data
  met jsonb,                                 -- preferences the flat satisfies (ranked flats only)
  rank int,
  status text,                               -- agreed | pending | rejected (top N only)
  explanation text,
  tg_message_id bigint,
  created_at timestamptz not null default now()
);
create index if not exists evaluations_run_idx on evaluations(run_id);
alter table evaluations add column if not exists met jsonb;

create table if not exists compromises (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references search_runs(id) on delete cascade,
  evaluation_id uuid not null references evaluations(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  pref_key text not null,
  label text not null,
  detail text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  responded_via text,                        -- web | telegram
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists compromises_eval_idx on compromises(evaluation_id);

alter table groups enable row level security;
alter table people enable row level security;
alter table preferences enable row level security;
alter table search_runs enable row level security;
alter table listings enable row level security;
alter table evaluations enable row level security;
alter table compromises enable row level security;
