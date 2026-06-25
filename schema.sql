-- Middlepoint database schema
-- Plak dit in Supabase: Project -> SQL Editor -> New query -> Run

create extension if not exists "uuid-ossp";

-- Een sessie = één conflict/document, kan 2+ deelnemers hebben
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  category text not null default 'algemeen',
  status text not null default 'wachten_op_verhalen',
  organizer_role text,
  organizer_sees_document boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Elke deelnemer aan een sessie
create table participants (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  display_name text not null,
  access_token text not null unique default replace(uuid_generate_v4()::text, '-', ''),
  is_organizer boolean default false,
  created_at timestamptz default now()
);

-- Het ruwe verhaal van elke deelnemer (los van elkaar ingevuld)
create table entries (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  round int not null default 1,
  content text not null,
  is_anonymous boolean default false,
  created_at timestamptz default now()
);

-- AI-gegenereerde vervolgvragen per deelnemer
create table followup_questions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  questions jsonb not null,
  created_at timestamptz default now()
);

-- Het eindrapport, met versiehistorie (groeidocument)
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
  created_at timestamptz default now()
);

create index idx_participants_session on participants(session_id);
create index idx_entries_session on entries(session_id);
create index idx_documents_session on documents(session_id);

-- Row Level Security: alle toegang loopt via onze Netlify Functions met de service role key
alter table sessions enable row level security;
alter table participants enable row level security;
alter table entries enable row level security;
alter table followup_questions enable row level security;
alter table documents enable row level security;

-- Geen policies toevoegen = enkel service_role (gebruikt in onze functions) heeft toegang.
