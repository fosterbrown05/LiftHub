-- Enums
create type user_role     as enum ('member','trainer','admin');
create type guide_category as enum ('programs','nutrition','gym_picks','recovery');
create type guide_status   as enum ('draft','published');

-- Tables
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '',
  role          user_role not null default 'member',
  equipment     text[],            -- P1: personalize pre-fill
  days_per_week int,               -- P1
  level         text,              -- P1
  created_at    timestamptz not null default now()
);

create table guides (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references profiles(id) on delete cascade,
  title      text not null,
  category   guide_category not null,
  body_md    text not null default '',
  status     guide_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table qa_posts (
  id          uuid primary key default gen_random_uuid(),
  guide_id    uuid not null references guides(id) on delete cascade,
  author_id   uuid not null references profiles(id) on delete cascade,
  parent_id   uuid references qa_posts(id) on delete cascade,  -- null = question
  author_role user_role not null,   -- badge snapshot, set by trigger
  body        text not null,
  created_at  timestamptz not null default now()
);

create table plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  guide_id   uuid not null references guides(id) on delete cascade,
  inputs     jsonb not null,        -- {equipment, days_per_week, level}
  plan       jsonb not null,        -- validated model output
  created_at timestamptz not null default now()
);

-- Indexes
create index on guides   (status, category);
create index on qa_posts (guide_id, created_at);
create index on plans    (user_id, created_at);            -- rate limit count
create index on plans    (user_id, guide_id, created_at desc);  -- latest plan
