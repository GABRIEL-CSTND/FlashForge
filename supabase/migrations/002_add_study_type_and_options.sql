-- Run this in Supabase SQL Editor if these columns don't already exist.
-- Safe to run even if your PM/teammate already added them (uses IF NOT EXISTS).

alter table flashcard_sets
  add column if not exists study_type text not null default 'flashcard';

alter table flashcards
  add column if not exists options jsonb;
