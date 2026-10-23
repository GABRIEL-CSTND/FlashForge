-- #63: daily generation limits per role, edited by admins.
--
-- /api/generate calls start_generation() before using the AI. In one locked
-- step it counts the caller's guides today (plus requests still running) and
-- either reserves a log row or refuses. So parallel requests can't slip past
-- the limit. The reserved row is filled in after the response (#62).

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;

-- Guides per quota day for each role; null means no limit. Anyone can pick
-- "teacher" at sign-up, so teachers don't get much more than students.
insert into public.app_settings (key, value)
values ('generation_limits', '{"anonymous": 2, "student": 5, "teacher": 15, "admin": null}')
on conflict (key) do nothing;

-- A reserved row is "running" until it's filled in: success is null.
alter table public.generation_logs alter column success drop not null;
-- Signed-out callers are counted by a keyed hash of their IP (never the IP itself).
alter table public.generation_logs add column if not exists ip_hash text;
create index if not exists generation_logs_ip_idx on public.generation_logs (ip_hash, created_at desc) where user_id is null;
alter table public.generation_logs drop constraint if exists generation_logs_error_kind_check;
alter table public.generation_logs add constraint generation_logs_error_kind_check
  check (error_kind in ('no_file', 'unreadable', 'ai_busy', 'ai_failed', 'server_error', 'limit'));

-- Settings changes are admin actions too; they have no single target.
alter table public.audit_log alter column target_id drop not null;
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('role_change', 'set_delete', 'settings_change'));

-- Reserve a generation for this caller, or refuse it if they've reached their
-- role's limit for the quota day. Returns {"allowed": true, "id", "limit"} or
-- {"allowed": false, "limit", "resets_at"}; a refusal is logged as 'limit'.
-- Requests still running count, unless they started over 2 minutes ago (a
-- generation can't take that long, so it crashed).
create or replace function public.start_generation(p_user_id uuid, p_role text, p_ip_hash text, p_study_type text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := case when p_user_id is null then p_ip_hash end;
  v_limit int;
  v_used int;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_user_id::text, 'ip:' || coalesce(v_ip, '?')), 63));
  select (value ->> coalesce(p_role, 'anonymous'))::int into v_limit
    from public.app_settings where key = 'generation_limits';

  if v_limit is not null then
    select count(*) into v_used
    from public.generation_logs g
    where g.created_at >= private.quota_window_start(1)
      and case when p_user_id is not null then g.user_id = p_user_id
               else g.user_id is null and g.ip_hash is not distinct from v_ip end
      and (g.success or (g.success is null and g.created_at > now() - interval '2 minutes'));
    if v_used >= v_limit then
      insert into public.generation_logs (user_id, role, ip_hash, study_type, duration_ms, success, error_kind)
        values (p_user_id, p_role, v_ip, p_study_type, 0, false, 'limit');
      return jsonb_build_object(
        'allowed', false, 'limit', v_limit,
        'resets_at', (date_trunc('day', now() at time zone 'America/Los_Angeles') + interval '1 day')
                     at time zone 'America/Los_Angeles');
    end if;
  end if;

  insert into public.generation_logs (user_id, role, ip_hash, study_type, duration_ms, success)
    values (p_user_id, p_role, v_ip, p_study_type, 0, null)
    returning id into v_id;
  return jsonb_build_object('allowed', true, 'id', v_id, 'limit', v_limit);
end;
$$;

-- Replace the daily limits for an admin, and log it. Each of anonymous,
-- student, teacher and admin must be null (no limit) or a whole number 0-1000.
-- Errors: 42501 actor not an admin, 22023 invalid limits.
create or replace function public.admin_set_generation_limits(p_actor_id uuid, p_limits jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_key text;
  v_value jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if jsonb_typeof(p_limits) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_limits)) <> 4 then
    raise exception 'invalid limits' using errcode = '22023';
  end if;
  foreach v_key in array array['anonymous', 'student', 'teacher', 'admin'] loop
    v_value := p_limits -> v_key;
    if v_value is null or not (
      jsonb_typeof(v_value) = 'null'
      or (jsonb_typeof(v_value) = 'number' and (v_value #>> '{}')::numeric between 0 and 1000
          and (v_value #>> '{}')::numeric = trunc((v_value #>> '{}')::numeric))
    ) then
      raise exception 'invalid limits' using errcode = '22023';
    end if;
  end loop;

  select value into v_old from public.app_settings where key = 'generation_limits' for update;
  insert into public.app_settings (key, value, updated_at, updated_by)
    values ('generation_limits', p_limits, now(), p_actor_id)
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = p_actor_id;
  insert into public.audit_log (actor_id, action, target_id, details)
    values (p_actor_id, 'settings_change', null,
            jsonb_build_object('setting', 'generation_limits', 'from', v_old, 'to', p_limits));
  return p_limits;
end;
$$;

-- The dashboard (#62) now leaves out requests still running and refusals, and
-- counts refusals separately. The return type changes, so drop and recreate.
drop function if exists public.admin_generation_daily(int);
create function public.admin_generation_daily(p_days int default 14)
returns table (
  day date, generations bigint, failures bigint, signed_out bigint, avg_ms integer,
  answered jsonb, requests jsonb, limited bigint
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
  done as (
    select * from logs where success is not null and error_kind is distinct from 'limit'
  ),
  totals as (
    select day,
           count(*) filter (where success is not null and error_kind is distinct from 'limit') as generations,
           count(*) filter (where success = false and error_kind is distinct from 'limit') as failures,
           count(*) filter (where user_id is null and success is not null and error_kind is distinct from 'limit') as signed_out,
           coalesce(round(avg(duration_ms) filter (where success is not null and error_kind is distinct from 'limit')), 0)::int as avg_ms,
           count(*) filter (where error_kind = 'limit') as limited
    from logs
    group by day
  ),
  answered as (
    select day, jsonb_object_agg(model, n) as answered
    from (select day, model, count(*) as n from done where success and model is not null group by day, model) a
    group by day
  ),
  requested as (
    select day, jsonb_object_agg(model, n) as requests
    from (
      select d.day, r.key as model, sum(r.value::int) as n
      from done d, jsonb_each_text(d.requests) r
      group by d.day, r.key
    ) q
    group by day
  )
  select t.day, t.generations, t.failures, t.signed_out, t.avg_ms,
         coalesce(a.answered, '{}'::jsonb), coalesce(q.requests, '{}'::jsonb), t.limited
  from totals t
  left join answered a using (day)
  left join requested q using (day)
  order by t.day desc
$$;

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
    and g.success is not null and g.error_kind is distinct from 'limit'
  group by g.user_id, u.email, p.display_name, p.role
  order by count(*) desc, max(g.created_at) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

revoke all on function public.start_generation(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.start_generation(uuid, text, text, text) to service_role;
revoke all on function public.admin_set_generation_limits(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_generation_limits(uuid, jsonb) to service_role;
revoke all on function public.admin_generation_daily(int) from public, anon, authenticated;
grant execute on function public.admin_generation_daily(int) to service_role;
