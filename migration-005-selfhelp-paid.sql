-- De zelfhulp-toevoeging (Reflectie+, €2,99) kon voorheen gestart worden
-- zonder bevestigde betaling: er was geen kolom om de betaalstatus in op
-- te slaan, dus de website vertrouwde puur op de doorverwijzing naar
-- Stripe. Deze kolom wordt gezet door de Stripe-webhook zodra de
-- betaling binnenkomt, en gecontroleerd door submit-selfhelp.js voor het
-- de AI-generatie start.
alter table reflections add column if not exists self_help_paid boolean not null default false;
