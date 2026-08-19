-- participants.email en sessions.organizer_email worden op gelijkheid
-- opgezocht in find-link.js, get-my-sessions.js, update-my-email.js en
-- admin-get-leads.js, maar waren niet geïndexeerd.
create index if not exists idx_participants_email on participants(email);
create index if not exists idx_sessions_organizer_email on sessions(organizer_email);
