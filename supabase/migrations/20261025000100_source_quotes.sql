-- Where a card comes from in the uploaded file: the sentence it is based on, and
-- where that sits ("Page 3" for a PDF, "Line 12" for plain text). Both are
-- optional: older sets, photos, scanned PDFs, Word and PowerPoint files and web
-- pages have neither.
--
-- Safe to run more than once: both columns were first added by hand while this was
-- being tested, so on the live database this only records them.
alter table public.flashcards
  add column if not exists source_excerpt text,
  add column if not exists source_location text;
