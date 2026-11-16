-- #41: a guide that fails after the AI was asked didn't count toward the daily
-- limit (#63), so it could be repeated all day (a photo with nothing to study
-- in it, say), each try using the AI quota everyone shares. Failed guides that
-- asked the AI now have their own daily cap, the same size as the role's limit.
-- Failures before the AI is asked (a file that's too big, a page that can't be
-- read) still don't count, and neither do refusals.
--
-- Same arguments as before (20261023000400_generation_limits.sql), so the
-- function is replaced in place and keeps its grants; they're repeated anyway.
-- A refusal now also says why: "reason" is "guides" or "failures".

begin;

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
  v_failed int;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_user_id::text, 'ip:' || coalesce(v_ip, '?')), 63));
  select (value ->> coalesce(p_role, 'anonymous'))::int into v_limit
    from public.app_settings where key = 'generation_limits';

  if v_limit is not null then
    -- Guides made today plus requests still running, and today's failures that
    -- asked the AI at least once (requests counts every model request).
    select count(*) filter (where g.success or (g.success is null and g.created_at > now() - interval '2 minutes')),
           count(*) filter (where not g.success and g.error_kind is distinct from 'limit' and g.requests <> '{}'::jsonb)
      into v_used, v_failed
    from public.generation_logs g
    where g.created_at >= private.quota_window_start(1)
      and case when p_user_id is not null then g.user_id = p_user_id
               else g.user_id is null and g.ip_hash is not distinct from v_ip end;
    if v_used >= v_limit or v_failed >= v_limit then
      insert into public.generation_logs (user_id, role, ip_hash, study_type, duration_ms, success, error_kind)
        values (p_user_id, p_role, v_ip, p_study_type, 0, false, 'limit');
      return jsonb_build_object(
        'allowed', false, 'limit', v_limit,
        'reason', case when v_used >= v_limit then 'guides' else 'failures' end,
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

revoke all on function public.start_generation(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.start_generation(uuid, text, text, text) to service_role;

commit;
