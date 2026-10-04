-- Atomic daily caps for AI food estimates.
-- photo: 10 a day. describe: 20 a day. The day is the user's local date, chosen by the
-- edge function after it checks the phone's time zone. Safe to run more than once.
-- Only service_role can call these. The app cannot read or write ai_usage directly.

alter table public.ai_usage add column if not exists kind text not null default 'photo';

alter table public.ai_usage drop constraint if exists ai_usage_pkey;
alter table public.ai_usage add primary key (user_id, day, kind);

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('photo', 'describe'));

alter table public.ai_usage drop constraint if exists ai_usage_count_check;
alter table public.ai_usage add constraint ai_usage_count_check check (count >= 0);

-- Take one use if the person is still under the cap. Parallel calls lock the same
-- row, so two requests cannot both pass the check and push the count over the limit.
create or replace function public.consume_ai_quota(p_user uuid, p_day date, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  new_count int;
  cur int;
begin
  if p_user is null or p_day is null then
    raise exception 'missing quota key';
  end if;
  if p_kind = 'photo' then
    lim := 10;
  elsif p_kind = 'describe' then
    lim := 20;
  else
    raise exception 'bad quota kind';
  end if;

  insert into public.ai_usage (user_id, day, kind, count)
  values (p_user, p_day, p_kind, 1)
  on conflict (user_id, day, kind)
  do update set count = public.ai_usage.count + 1
  where public.ai_usage.count < lim
  returning count into new_count;

  if new_count is null then
    select count into cur
    from public.ai_usage
    where user_id = p_user and day = p_day and kind = p_kind;
    return jsonb_build_object(
      'allowed', false,
      'used', coalesce(cur, 0),
      'remaining', 0,
      'limit', lim,
      'kind', p_kind
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'used', new_count,
    'remaining', lim - new_count,
    'limit', lim,
    'kind', p_kind
  );
end;
$$;

-- Give a use back when the estimate fails. Never goes below zero.
create or replace function public.release_ai_quota(p_user uuid, p_day date, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  new_count int;
begin
  if p_kind = 'photo' then
    lim := 10;
  elsif p_kind = 'describe' then
    lim := 20;
  else
    raise exception 'bad quota kind';
  end if;

  update public.ai_usage
  set count = greatest(count - 1, 0)
  where user_id = p_user and day = p_day and kind = p_kind
  returning count into new_count;

  if new_count is null then
    new_count := 0;
  end if;

  return jsonb_build_object(
    'allowed', new_count < lim,
    'used', new_count,
    'remaining', lim - new_count,
    'limit', lim,
    'kind', p_kind
  );
end;
$$;

-- Read the counter without incrementing it. Used by tests and by the describe step.
create or replace function public.ai_quota_status(p_user uuid, p_day date, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  cur int;
begin
  if p_kind = 'photo' then
    lim := 10;
  elsif p_kind = 'describe' then
    lim := 20;
  else
    raise exception 'bad quota kind';
  end if;

  select count into cur
  from public.ai_usage
  where user_id = p_user and day = p_day and kind = p_kind;

  cur := coalesce(cur, 0);
  return jsonb_build_object(
    'allowed', cur < lim,
    'used', cur,
    'remaining', lim - cur,
    'limit', lim,
    'kind', p_kind
  );
end;
$$;

revoke all on function public.consume_ai_quota(uuid, date, text) from public, anon, authenticated;
revoke all on function public.release_ai_quota(uuid, date, text) from public, anon, authenticated;
revoke all on function public.ai_quota_status(uuid, date, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, date, text) to service_role;
grant execute on function public.release_ai_quota(uuid, date, text) to service_role;
grant execute on function public.ai_quota_status(uuid, date, text) to service_role;
