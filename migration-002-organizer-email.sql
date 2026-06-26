-- Eenmalig uitvoeren in Supabase SQL Editor (bovenop het bestaande schema)
alter table sessions add column if not exists organizer_email text;
