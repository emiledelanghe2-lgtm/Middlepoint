-- Adminfuncties werden beveiligd door enkel het wachtwoord te vergelijken
-- (bovendien niet constant-time), zonder enige limiet op het aantal
-- pogingen. Deze tabel houdt mislukte pogingen per IP bij en zorgt voor
-- een tijdelijke lockout na te veel mislukte pogingen. Gebruikt door
-- functions/_admin-auth.js.
create table if not exists admin_login_attempts (
  ip text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
-- Enkel de service-role (gebruikt door de Netlify functions) mag hierbij, dus
-- RLS aan zonder policies: dat sluit anon/authenticated volledig buiten, en de
-- service-role omzeilt RLS sowieso altijd.
alter table admin_login_attempts enable row level security;
