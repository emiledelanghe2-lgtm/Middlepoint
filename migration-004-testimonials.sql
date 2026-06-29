create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  is_anonymous boolean default false,
  content text not null,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table testimonials enable row level security;
