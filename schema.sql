-- Middlepoint database schema
-- Plak dit in Supabase: Project -> SQL Editor -> New query -> Run

create extension if not exists "uuid-ossp";

-- Een sessie = één conflict/document, kan 2+ deelnemers hebben
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  category text not null default 'algemeen', -- koppel, familie, buren, werk, school, advocaat, therapeut
  status text not null default 'wachten_op_verhalen',
  -- statussen: wachten_op_verhalen -> wachten_op_vervolgvragen -> klaar
  organizer_role text, -- bv. 'hr', 'therapeut', 'leerkracht', null als geen derde partij
  organizer_sees_document boolean default true,
  safety_category text,
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
  round int not null default 1, -- 1 = origineel verhaal, 2 = vervolgvragen-antwoorden, 3+ = latere check-ins (groeidocument)
  content text not null,
  is_anonymous boolean default false,
  created_at timestamptz default now()
);

-- AI-gegenereerde vervolgvragen per deelnemer
create table followup_questions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  questions jsonb not null, -- array van strings
  created_at timestamptz default now()
);

-- Het eindrapport, met versiehistorie (groeidocument)
create table documents (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  version int not null default 1,
  shared_summary text,        -- objectieve samenvatting
  common_ground text,         -- gedeelde grond
  perspectives jsonb,         -- { participant_id: { explanation, strengths, growth_areas } }
  tips jsonb,                 -- { participant_id: [tips...] }
  questions_to_ask jsonb,     -- { participant_id: [vragen...] }
  suggested_phrases jsonb,    -- { participant_id: [zinnen...] }
  created_at timestamptz default now()
);

create index
