-- #62: log every study-guide generation for the admin usage dashboard.
--
-- Written only by /api/generate (service role), after the response is sent.
-- Server-only: no grants or policies for browsers.

create table if not exists public.generation_logs (
  id bigint generated always as identity primary key,
  -- Null when signed out. Kept (as null) if the account is deleted.
  user_id uuid references auth.users (id) on delete set null,
  role text check (role in ('student', 'teacher', 'admin')),
  -- The model that produced the guide; null if none did.
  model text,
  study_type text not null check (study_type in ('flashcard', 'multiple_choice')),
  duration_ms integer not null check (duration_ms >= 0),
  success boolean not null,
  -- 'no_file', 'unreadable', 'ai_busy', 'ai_failed' or 'server_error'; null on success.
  error_kind text,
  -- Requests made to each model, retries and fallbacks included: what counts
  -- against the AI quota. E.g. {"gemini-3.5-flash": 1, "gemini-3.5-flash-lite": 1}.
  requests jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists generation_logs_created_idx on public.generation_logs (created_at desc);
create index if not exists generation_logs_user_idx on public.generation_logs (user_id, created_at desc);

alter table public.generation_logs enable row level security;
revoke all on table public.generation_logs from anon, authenticated;

-- Start of the reporting window: midnight Pacific time, p_days - 1 days ago.
-- Days follow the Gemini free quota, which resets at midnight Pacific time.
create or replace function private.quota_window_start(p_days int)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (date_trunc('day', now() at time zone 'America/Los_Angeles')
          - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90) - 1))
         at time zone 'America/Los_Angeles'
$$;

-- One row per quota day with activity, newest first: generations, failures,
-- signed-out generations, average wait, guides answered per model, and
-- requests made per model. Service role only.
create or replace function public.admin_generation_daily(p_days int default 14)
returns table (
  day date, generations bigint, failures bigint, signed_out bigint, avg_ms integer,
  answered jsonb, requests jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with logs as (
    select (g.created_at at time zone 'America/Los_Angeles')::date as day, g.*
    from public.generation_logs g
    where g.created_at >= private.quota_window_start(p_days)
  ),
  totals as (
    select day, count(*) as generations, count(*) filter (where not success) as failures,
           count(*) filter (where user_id is null) as signed_out, round(avg(duration_ms))::int as avg_ms
    from logs
    group by day
  ),
  answered as (
    select day, jsonb_object_agg(model, n) as answered
    from (select day, model, count(*) as n from logs where success and model is not null group by day, model) a
    group by day
  ),
  requested as (
    select day, jsonb_object_agg(model, n) as requests
    from (
      select l.day, r.key as model, sum(r.value::int) as n
      from logs l, jsonb_each_text(l.requests) r
      group by l.day, r.key
    ) q
    group by day
  )
  select t.day, t.generations, t.failures, t.signed_out, t.avg_ms,
         coalesce(a.answered, '{}'::jsonb), coalesce(q.requests, '{}'::jsonb)
  from totals t
  left join answered a using (day)
  left join requested q using (day)
  order by t.day desc
$$;

-- The signed-in users who generated the most guides in the window. Service
-- role only (it returns emails).
create or replace function public.admin_top_generators(p_days int default 14, p_limit int default 10)
returns table (user_id uuid, email text, display_name text, role text, generations bigint, failures bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select g.user_id, u.email::text, p.display_name, coalesce(p.role, 'student'),
         count(*), count(*) filter (where not g.success)
  from public.generation_logs g
  join auth.users u on u.id = g.user_id
  left join public.profiles p on p.id = g.user_id
  where g.created_at >= private.quota_window_start(p_days)
  group by g.user_id, u.email, p.display_name, p.role
  order by count(*) desc, max(g.created_at) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

revoke all on function private.quota_window_start(int) from public, anon, authenticated;
revoke all on function public.admin_generation_daily(int) from public, anon, authenticated;
grant execute on function public.admin_generation_daily(int) to service_role;
revoke all on function public.admin_top_generators(int, int) from public, anon, authenticated;
grant execute on function public.admin_top_generators(int, int) to service_role;
