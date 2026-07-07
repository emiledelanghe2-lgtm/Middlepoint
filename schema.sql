-- Middlepoint database schema (VOLLEDIGE REFERENTIE, stand van zaken na migration-007)
-- LET OP: dit bestand is enkel voor documentatie / om ooit een nieuwe omgeving mee op te
-- zetten. NIET uitvoeren op de bestaande, live Supabase database, want de tabellen
-- bestaan daar al en je krijgt foutmeldingen. Voor de bestaande database: voer enkel
-- migration-007-toegang-en-derde-partij.sql uit.

create extension if not exists "uuid-ossp";

-- ============================================================
-- SESSIONS
-- ============================================================
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  category text not null default 'algemeen',
  status text not null default 'wachten_op_verhalen',
  organizer_role text,
  organizer_sees_document boolean default true,
  organizer_participates boolean not null default true,
  participants_receive_document boolean not null default true,
  safety_category text,
  organizer_email text not null,
  plan text,
  include_followups boolean default true,
  followup_reminder_sent boolean default false,
  story_reminder_sent boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- PARTICIPANTS
-- ============================================================
create table participants (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  display_name text not null,
  access_token text not null unique default replace(uuid_generate_v4()::text, '-', ''),
  is_organizer boolean default false,
  email text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- ENTRIES
-- ============================================================
create table entries (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  round int not null default 1,
  content text not null,
  is_anonymous boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- FOLLOWUP_QUESTIONS (legacy)
-- ============================================================
create table followup_questions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  questions jsonb not null,
  created_at timestamptz default now()
);

-- ============================================================
-- DOCUMENTS
-- ============================================================
create table documents (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  version int not null default 1,
  shared_summary text,
  common_ground text,
  perspectives jsonb,
  tips jsonb,
  questions_to_ask jsonb,
  suggested_phrases jsonb,
  shared_actions jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- TESTIMONIALS
-- ============================================================
create table testimonials (
  id uuid primary key default uuid_generate_v4(),
  display_name text,
  is_anonymous boolean default false,
  content text not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table customers (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  stripe_customer_id text,
  plan text,
  plan_status text,
  sessions_used_this_period int default 0,
  period_start timestamptz,
  period_end timestamptz,
  free_session_used boolean default false,
  magic_link_token text,
  magic_link_expires timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_participants_session on participants(session_id);
create index idx_entries_session on entries(session_id);
create index idx_documents_session on documents(session_id);
create index idx_customers_email on customers(email);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table sessions enable row level security;
alter table participants enable row level security;
alter table entries enable row level security;
alter table followup_questions enable row level security;
alter table documents enable row level security;
alter table testimonials enable row level security;
alter table customers enable row level security;
