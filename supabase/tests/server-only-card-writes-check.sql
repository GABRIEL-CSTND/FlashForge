-- Run: npx supabase db query --linked --project-ref <ref> -f supabase/tests/server-only-card-writes-check.sql
-- Expect: every row says ok = true.
select
  t.tbl,
  r.role,
  p.priv,
  not has_table_privilege(r.role, 'public.' || t.tbl, p.priv) as ok
from (values ('flashcards'), ('flashcard_sets')) as t(tbl)
cross join (values ('anon'), ('authenticated')) as r(role)
cross join (values ('INSERT')) as p(priv)
union all
select 'flashcards', r.role, p.priv, not has_table_privilege(r.role, 'public.flashcards', p.priv)
from (values ('anon'), ('authenticated')) as r(role)
cross join (values ('UPDATE'), ('DELETE')) as p(priv);
