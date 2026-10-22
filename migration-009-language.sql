-- Migration 009: language of a conversation or reflection ('nl' or 'en').
-- Run this once in the Supabase SQL editor. Existing rows become Dutch.
-- The site works for Dutch visitors before this runs, English conversations need it.

alter table sessions    add column if not exists lang text not null default 'nl';
alter table reflections add column if not exists lang text not null default 'nl';

alter table sessions    drop constraint if exists sessions_lang_check;
alter table sessions    add  constraint sessions_lang_check    check (lang in ('nl', 'en'));
alter table reflections drop constraint if exists reflections_lang_check;
alter table reflections add  constraint reflections_lang_check check (lang in ('nl', 'en'));
