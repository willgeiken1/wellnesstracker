-- Friends-only social schema. Safe to run more than once.
--
-- Social is off until a person turns it on. Each share is an explicit row,
-- copied at share time. The feed reads only that copy. There is no foreign key
-- to user_data, oura_days, progress_photos, or any other health table.
--
-- Shareable snapshot fields: workout duration, total volume, a PR flag plus the
-- exercise name (no load), cardio distance and duration, streak length, and
-- goal percent. Oura data, photos, food, body weight, and per-set weights are
-- not columns and cannot be stored here.
--
-- Policies are for authenticated only and use auth.uid(). Every insert and
-- update policy has WITH CHECK. Helpers live in the private schema, pin an
-- empty search_path, and are not granted to anon.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Master switch. Missing row and enabled = false both mean social is off.
create table if not exists public.social_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  username text,
  updated_at timestamptz not null default now(),
  constraint social_settings_username_check check (
    username is null or username ~ '^[a-z0-9_]{3,20}$'
  )
);
create unique index if not exists social_settings_username_uidx
  on public.social_settings (username);

-- Invite links. Only the owner can read the token. Redeeming creates a
-- pending request; it does not accept the friendship.
create table if not exists public.friend_invites (
  token text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  revoked_at timestamptz,
  constraint friend_invites_token_check check (token ~ '^[A-Za-z0-9_-]{32,128}$'),
  constraint friend_invites_expiry_check check (
    expires_at > created_at
    and expires_at <= created_at + interval '30 days'
  )
);
create index if not exists friend_invites_owner_idx
  on public.friend_invites (owner_id);

-- Mutual friendship: one row, pending until the addressee accepts.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint friendships_status_check check (status in ('pending', 'accepted', 'declined')),
  constraint friendships_not_self check (requester_id <> addressee_id)
);
create unique index if not exists friendships_one_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
create index if not exists friendships_accepted_forward_idx
  on public.friendships (requester_id, addressee_id) where status = 'accepted';
create index if not exists friendships_accepted_reverse_idx
  on public.friendships (addressee_id, requester_id) where status = 'accepted';

-- Snapshot copied at share time. kind decides which value columns may be set.
create table if not exists public.shared_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  workout_duration_seconds integer,
  total_volume numeric,
  pr_flag boolean,
  pr_exercise text,
  cardio_distance_meters numeric,
  cardio_duration_seconds integer,
  streak_days integer,
  goal_percent numeric,
  occurred_on date,
  created_at timestamptz not null default now(),
  unshared_at timestamptz,
  constraint shared_items_kind_check check (kind in (
    'workout_duration', 'total_volume', 'pr_flag', 'cardio', 'streak', 'goal_percent'
  )),
  constraint shared_items_snapshot_ranges check (
    (workout_duration_seconds is null or workout_duration_seconds between 0 and 604800)
    and (total_volume is null or (total_volume >= 0 and total_volume <= 1000000000))
    and (cardio_distance_meters is null or (cardio_distance_meters >= 0 and cardio_distance_meters <= 1000000))
    and (cardio_duration_seconds is null or cardio_duration_seconds between 0 and 604800)
    and (streak_days is null or streak_days between 0 and 100000)
    and (goal_percent is null or (goal_percent >= 0 and goal_percent <= 1000))
    and (pr_exercise is null or pr_exercise ~ '^[A-Za-z0-9][A-Za-z0-9 .()+''/-]{0,79}$')
  ),
  constraint shared_items_snapshot_shape check (
    case kind
      when 'workout_duration' then
        workout_duration_seconds is not null
        and total_volume is null and pr_flag is null and pr_exercise is null
        and cardio_distance_meters is null and cardio_duration_seconds is null
        and streak_days is null and goal_percent is null
      when 'total_volume' then
        total_volume is not null
        and workout_duration_seconds is null and pr_flag is null and pr_exercise is null
        and cardio_distance_meters is null and cardio_duration_seconds is null
        and streak_days is null and goal_percent is null
      when 'pr_flag' then
        pr_flag is true and pr_exercise is not null
        and workout_duration_seconds is null and total_volume is null
        and cardio_distance_meters is null and cardio_duration_seconds is null
        and streak_days is null and goal_percent is null
      when 'cardio' then
        (cardio_distance_meters is not null or cardio_duration_seconds is not null)
        and workout_duration_seconds is null and total_volume is null
        and pr_flag is null and pr_exercise is null
        and streak_days is null and goal_percent is null
      when 'streak' then
        streak_days is not null
        and workout_duration_seconds is null and total_volume is null
        and pr_flag is null and pr_exercise is null
        and cardio_distance_meters is null and cardio_duration_seconds is null
        and goal_percent is null
      when 'goal_percent' then
        goal_percent is not null
        and workout_duration_seconds is null and total_volume is null
        and pr_flag is null and pr_exercise is null
        and cardio_distance_meters is null and cardio_duration_seconds is null
        and streak_days is null
      else false
    end
  )
);
create index if not exists shared_items_owner_created_idx
  on public.shared_items (owner_id, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  shared_item_id uuid not null references public.shared_items(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_body_check check (char_length(btrim(body)) between 1 and 500)
);
create index if not exists comments_item_created_idx
  on public.comments (shared_item_id, created_at);
create index if not exists comments_author_created_idx
  on public.comments (author_id, created_at desc);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  shared_item_id uuid not null references public.shared_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint reactions_kind_check check (kind in ('like', 'cheer', 'fire'))
);
create unique index if not exists reactions_one_per_user_idx
  on public.reactions (shared_item_id, user_id);
create index if not exists reactions_user_idx on public.reactions (user_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  shared_item_id uuid references public.shared_items(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint reports_reason_check check (char_length(btrim(reason)) between 1 and 500),
  constraint reports_one_target check (
    (shared_item_id is not null and comment_id is null)
    or (shared_item_id is null and comment_id is not null)
  )
);
create unique index if not exists reports_one_item_per_reporter_idx
  on public.reports (reporter_id, shared_item_id) where comment_id is null;
create unique index if not exists reports_one_comment_per_reporter_idx
  on public.reports (reporter_id, comment_id) where comment_id is not null;
create index if not exists reports_reporter_created_idx
  on public.reports (reporter_id, created_at desc);
create index if not exists reports_item_idx on public.reports (shared_item_id);
create index if not exists reports_comment_idx on public.reports (comment_id);

-- One direction is enough. Visibility treats a block as mutual.
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx
  on public.blocks (blocked_id, blocker_id);

alter table public.social_settings enable row level security;
alter table public.friend_invites enable row level security;
alter table public.friendships enable row level security;
alter table public.shared_items enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

-- Helpers. A caller can only ask about a pair that includes their own id,
-- except social_enabled, which friends may check so a disabled account hides.

create or replace function private.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_a is null or p_b is null or p_a = p_b then false
    when (select auth.uid()) is null then false
    when (select auth.uid()) is distinct from p_a
     and (select auth.uid()) is distinct from p_b then false
    else exists (
      select 1 from public.blocks b
      where (b.blocker_id = p_a and b.blocked_id = p_b)
         or (b.blocker_id = p_b and b.blocked_id = p_a)
    )
  end;
$$;

create or replace function private.is_friend(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_a is null or p_b is null or p_a = p_b then false
    when (select auth.uid()) is null then false
    when (select auth.uid()) is distinct from p_a
     and (select auth.uid()) is distinct from p_b then false
    else exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = p_a and f.addressee_id = p_b)
          or (f.requester_id = p_b and f.addressee_id = p_a)
        )
    )
  end;
$$;

create or replace function private.social_enabled(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.social_settings s
    where s.user_id = p_user and s.enabled
  )
  and (
    (select auth.uid()) is not distinct from p_user
    or private.is_friend((select auth.uid()), p_user)
  );
$$;

-- Raw switch for the friendship insert policy. social_enabled hides this from
-- strangers, which would also reject a first request. Callers who already know
-- a user id still only learn the bit by attempting the insert.
create or replace function private.recipient_social_on(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.social_settings s
      where s.user_id = p_user and s.enabled
    );
$$;

create or replace function private.can_view_share(p_viewer uuid, p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not distinct from p_viewer
    and exists (
      select 1 from public.shared_items s
      where s.id = p_item
        and (
          s.owner_id = p_viewer
          or (
            s.unshared_at is null
            and private.is_friend(p_viewer, s.owner_id)
            and private.social_enabled(s.owner_id)
            and not private.is_blocked(p_viewer, s.owner_id)
            and not exists (
              select 1 from public.reports r
              where r.reporter_id = p_viewer
                and r.shared_item_id = s.id
                and r.comment_id is null
            )
          )
        )
    );
$$;

create or replace function private.can_view_comment(p_viewer uuid, p_comment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not distinct from p_viewer
    and exists (
      select 1 from public.comments c
      where c.id = p_comment
        and private.can_view_share(p_viewer, c.shared_item_id)
        and not private.is_blocked(p_viewer, c.author_id)
        and not exists (
          select 1 from public.reports r
          where r.reporter_id = p_viewer and r.comment_id = c.id
        )
    );
$$;

create or replace function private.can_comment(p_author uuid, p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not distinct from p_author
    and exists (
      select 1 from public.shared_items s
      where s.id = p_item
        and s.unshared_at is null
        and s.owner_id <> p_author
        and private.social_enabled(s.owner_id)
        and private.is_friend(p_author, s.owner_id)
        and not private.is_blocked(p_author, s.owner_id)
        and not exists (
          select 1 from public.reports r
          where r.reporter_id = p_author
            and r.shared_item_id = s.id
            and r.comment_id is null
        )
    );
$$;

create or replace function private.can_react(p_user uuid, p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not distinct from p_user
    and exists (
      select 1 from public.shared_items s
      where s.id = p_item
        and s.unshared_at is null
        and private.social_enabled(s.owner_id)
        and (
          s.owner_id = p_user
          or (
            private.is_friend(p_user, s.owner_id)
            and not private.is_blocked(p_user, s.owner_id)
          )
        )
    );
$$;

create or replace function private.can_view_reaction(p_viewer uuid, p_reaction uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not distinct from p_viewer
    and exists (
      select 1 from public.reactions r
      where r.id = p_reaction
        and private.can_view_share(p_viewer, r.shared_item_id)
        and not private.is_blocked(p_viewer, r.user_id)
    );
$$;

create or replace function private.owns_share(p_user uuid, p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not distinct from p_user
    and exists (
      select 1 from public.shared_items s
      where s.id = p_item and s.owner_id = p_user
    );
$$;

create or replace function private.can_report(p_reporter uuid, p_item uuid, p_comment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is distinct from p_reporter then false
    when p_item is not null and p_comment is null then exists (
      select 1 from public.shared_items s
      where s.id = p_item
        and s.owner_id <> p_reporter
        and private.can_view_share(p_reporter, s.id)
    )
    when p_comment is not null and p_item is null then exists (
      select 1 from public.comments c
      where c.id = p_comment
        and c.author_id <> p_reporter
        and private.can_view_comment(p_reporter, c.id)
    )
    else false
  end;
$$;

create or replace function private.social_settings_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'social settings owner is fixed' using errcode = '42501';
  end if;
  -- Username changes go through set_username so a taken name and a bad name
  -- raise the same error. A direct update would surface the unique index.
  if (select auth.uid()) is not null
     and coalesce(current_setting('social.setting_username', true), '') is distinct from '1'
     and (
       (tg_op = 'INSERT' and new.username is not null)
       or (tg_op = 'UPDATE' and new.username is distinct from old.username)
     )
  then
    raise exception 'unavailable' using errcode = '42501';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function private.friend_invites_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.revoked_at := null;
    return new;
  end if;
  if new.token is distinct from old.token
     or new.owner_id is distinct from old.owner_id
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'invite is fixed' using errcode = '42501';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'invite already revoked' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.friendships_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    return new;
  end if;
  if new.id is distinct from old.id
     or new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id
     or new.created_at is distinct from old.created_at then
    raise exception 'friendship parties are fixed' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' or new.status not in ('accepted', 'declined') then
      raise exception 'bad friendship transition' using errcode = '42501';
    end if;
    if (select auth.uid()) is distinct from old.addressee_id then
      raise exception 'only the recipient can respond' using errcode = '42501';
    end if;
    if private.is_blocked(old.requester_id, old.addressee_id) then
      raise exception 'unavailable' using errcode = '42501';
    end if;
    if new.status = 'accepted' and not private.social_enabled((select auth.uid())) then
      raise exception 'social is off' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.shared_items_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.unshared_at := null;
    return new;
  end if;
  if new.id is distinct from old.id
     or new.owner_id is distinct from old.owner_id
     or new.kind is distinct from old.kind
     or new.workout_duration_seconds is distinct from old.workout_duration_seconds
     or new.total_volume is distinct from old.total_volume
     or new.pr_flag is distinct from old.pr_flag
     or new.pr_exercise is distinct from old.pr_exercise
     or new.cardio_distance_meters is distinct from old.cardio_distance_meters
     or new.cardio_duration_seconds is distinct from old.cardio_duration_seconds
     or new.streak_days is distinct from old.streak_days
     or new.goal_percent is distinct from old.goal_percent
     or new.occurred_on is distinct from old.occurred_on
     or new.created_at is distinct from old.created_at then
    raise exception 'shared snapshot is immutable' using errcode = '42501';
  end if;
  if old.unshared_at is not null and new.unshared_at is distinct from old.unshared_at then
    raise exception 'already unshared' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 30 comments per rolling hour, counted before the new row is stored.
-- security definer so a hidden comment still counts toward the cap.
create or replace function private.comments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    perform pg_advisory_xact_lock(hashtextextended('social-comment:' || new.author_id::text, 0));
    select count(*)::integer into recent_count
    from public.comments
    where author_id = new.author_id
      and created_at > clock_timestamp() - interval '1 hour';
    if recent_count >= 30 then
      raise exception 'comment rate limit' using errcode = '54000';
    end if;
    return new;
  end if;
  if coalesce(auth.uid()::text, '') <> '' then
    if new.id is distinct from old.id
       or new.author_id is distinct from old.author_id
       or new.shared_item_id is distinct from old.shared_item_id
       or new.created_at is distinct from old.created_at then
      raise exception 'comment identity is fixed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.reactions_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    return new;
  end if;
  if new.id is distinct from old.id
     or new.shared_item_id is distinct from old.shared_item_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'reaction identity is fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 5 reports per rolling hour. Reported rows hide from the reporter through
-- the view helpers. Reports themselves are not editable.
create or replace function private.reports_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if tg_op = 'UPDATE' then
    raise exception 'reports cannot be edited' using errcode = '42501';
  end if;
  new.created_at := clock_timestamp();
  perform pg_advisory_xact_lock(hashtextextended('social-report:' || new.reporter_id::text, 0));
  select count(*)::integer into recent_count
  from public.reports
  where reporter_id = new.reporter_id
    and created_at > clock_timestamp() - interval '1 hour';
  if recent_count >= 5 then
    raise exception 'report rate limit' using errcode = '54000';
  end if;
  return new;
end;
$$;

create or replace function private.request_friend(p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  them uuid;
  them_on boolean;
  new_id uuid;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if not private.social_enabled(me) then
    raise exception 'social is off' using errcode = '42501';
  end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'unknown username' using errcode = '42501';
  end if;

  select s.user_id, s.enabled into them, them_on
  from public.social_settings s
  where s.username = p_username
    and s.user_id <> me;

  if them is null or them_on is not true or private.is_blocked(me, them) then
    raise exception 'unknown username' using errcode = '42501';
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (me, them, 'pending')
  returning id into new_id;
  return new_id;
exception
  when unique_violation then
    raise exception 'unavailable' using errcode = '42501';
end;
$$;

create or replace function private.redeem_friend_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  invite public.friend_invites%rowtype;
  owner_on boolean;
  new_id uuid;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if not private.social_enabled(me) then
    raise exception 'social is off' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'unknown invite' using errcode = '42501';
  end if;

  select * into invite
  from public.friend_invites i
  where i.token = p_token
    and i.revoked_at is null
    and i.expires_at > now();

  if invite.token is null or invite.owner_id = me then
    raise exception 'unknown invite' using errcode = '42501';
  end if;

  select s.enabled into owner_on
  from public.social_settings s
  where s.user_id = invite.owner_id;

  if owner_on is not true or private.is_blocked(me, invite.owner_id) then
    raise exception 'unknown invite' using errcode = '42501';
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (me, invite.owner_id, 'pending')
  returning id into new_id;
  return new_id;
exception
  when unique_violation then
    raise exception 'unavailable' using errcode = '42501';
end;
$$;

create or replace function private.set_username(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_username is not null and p_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'unavailable' using errcode = '42501';
  end if;
  perform set_config('social.setting_username', '1', true);
  insert into public.social_settings as s (user_id, username)
  values (me, p_username)
  on conflict (user_id) do update
    set username = excluded.username
    where s.user_id = me;
exception
  when unique_violation then
    raise exception 'unavailable' using errcode = '42501';
end;
$$;

create or replace function public.request_friend(p_username text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.request_friend(p_username);
$$;

create or replace function public.redeem_friend_invite(p_token text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.redeem_friend_invite(p_token);
$$;

create or replace function public.set_username(p_username text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_username(p_username);
$$;

drop trigger if exists social_settings_guard on public.social_settings;
create trigger social_settings_guard
  before insert or update on public.social_settings
  for each row execute function private.social_settings_guard();

drop trigger if exists friend_invites_guard on public.friend_invites;
create trigger friend_invites_guard
  before insert or update on public.friend_invites
  for each row execute function private.friend_invites_guard();

drop trigger if exists friendships_guard on public.friendships;
create trigger friendships_guard
  before insert or update on public.friendships
  for each row execute function private.friendships_guard();

drop trigger if exists shared_items_guard on public.shared_items;
create trigger shared_items_guard
  before insert or update on public.shared_items
  for each row execute function private.shared_items_guard();

drop trigger if exists comments_guard on public.comments;
create trigger comments_guard
  before insert or update on public.comments
  for each row execute function private.comments_guard();

drop trigger if exists reactions_guard on public.reactions;
create trigger reactions_guard
  before insert or update on public.reactions
  for each row execute function private.reactions_guard();

drop trigger if exists reports_guard on public.reports;
create trigger reports_guard
  before insert or update on public.reports
  for each row execute function private.reports_guard();

drop policy if exists "social settings: read" on public.social_settings;
drop policy if exists "social settings: insert" on public.social_settings;
drop policy if exists "social settings: update" on public.social_settings;
create policy "social settings: read" on public.social_settings
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "social settings: insert" on public.social_settings
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "social settings: update" on public.social_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "invites: read" on public.friend_invites;
drop policy if exists "invites: insert" on public.friend_invites;
drop policy if exists "invites: update" on public.friend_invites;
drop policy if exists "invites: delete" on public.friend_invites;
create policy "invites: read" on public.friend_invites
  for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "invites: insert" on public.friend_invites
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and revoked_at is null
    and expires_at > now()
    and expires_at <= now() + interval '30 days'
    and (select private.social_enabled((select auth.uid())))
  );
create policy "invites: update" on public.friend_invites
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "invites: delete" on public.friend_invites
  for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "friendships: read" on public.friendships;
drop policy if exists "friendships: insert" on public.friendships;
drop policy if exists "friendships: update" on public.friendships;
drop policy if exists "friendships: delete" on public.friendships;
create policy "friendships: read" on public.friendships
  for select to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );
create policy "friendships: insert" on public.friendships
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and requester_id <> addressee_id
    and status = 'pending'
    and (select private.social_enabled((select auth.uid())))
    and (select private.recipient_social_on(addressee_id))
    and not (select private.is_blocked(requester_id, addressee_id))
  );
create policy "friendships: update" on public.friendships
  for update to authenticated
  using (
    addressee_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    addressee_id = (select auth.uid())
    and requester_id <> addressee_id
    and status in ('accepted', 'declined')
    and not (select private.is_blocked(requester_id, addressee_id))
    and (
      status = 'declined'
      or (select private.social_enabled((select auth.uid())))
    )
  );
create policy "friendships: delete" on public.friendships
  for delete to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );

drop policy if exists "shares: read" on public.shared_items;
drop policy if exists "shares: insert" on public.shared_items;
drop policy if exists "shares: update" on public.shared_items;
drop policy if exists "shares: delete" on public.shared_items;
create policy "shares: read" on public.shared_items
  for select to authenticated
  using ((select private.can_view_share((select auth.uid()), id)));
create policy "shares: insert" on public.shared_items
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select private.social_enabled((select auth.uid())))
  );
create policy "shares: update" on public.shared_items
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "shares: delete" on public.shared_items
  for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "comments: read" on public.comments;
drop policy if exists "comments: insert" on public.comments;
drop policy if exists "comments: update" on public.comments;
drop policy if exists "comments: delete" on public.comments;
create policy "comments: read" on public.comments
  for select to authenticated
  using ((select private.can_view_comment((select auth.uid()), id)));
create policy "comments: insert" on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.can_comment((select auth.uid()), shared_item_id))
  );
create policy "comments: update" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and (select private.can_comment((select auth.uid()), shared_item_id))
  );
create policy "comments: delete" on public.comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or (select private.owns_share((select auth.uid()), shared_item_id))
  );

drop policy if exists "reactions: read" on public.reactions;
drop policy if exists "reactions: insert" on public.reactions;
drop policy if exists "reactions: update" on public.reactions;
drop policy if exists "reactions: delete" on public.reactions;
create policy "reactions: read" on public.reactions
  for select to authenticated
  using ((select private.can_view_reaction((select auth.uid()), id)));
create policy "reactions: insert" on public.reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.can_react((select auth.uid()), shared_item_id))
  );
create policy "reactions: update" on public.reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select private.can_react((select auth.uid()), shared_item_id))
  );
create policy "reactions: delete" on public.reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "reports: read" on public.reports;
drop policy if exists "reports: insert" on public.reports;
drop policy if exists "reports: delete" on public.reports;
create policy "reports: read" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy "reports: insert" on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (select private.can_report((select auth.uid()), shared_item_id, comment_id))
  );
create policy "reports: delete" on public.reports
  for delete to authenticated
  using (reporter_id = (select auth.uid()));

drop policy if exists "blocks: read" on public.blocks;
drop policy if exists "blocks: insert" on public.blocks;
drop policy if exists "blocks: delete" on public.blocks;
create policy "blocks: read" on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "blocks: insert" on public.blocks
  for insert to authenticated
  with check (
    blocker_id = (select auth.uid())
    and blocker_id <> blocked_id
  );
create policy "blocks: delete" on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

revoke all on public.social_settings, public.friend_invites, public.friendships,
  public.shared_items, public.comments, public.reactions, public.reports, public.blocks
  from public, anon;
grant select, insert, update on public.social_settings to authenticated;
grant select, insert, update, delete on public.friend_invites to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.shared_items to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select, insert, update, delete on public.reactions to authenticated;
grant select, insert, delete on public.reports to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant all on public.social_settings, public.friend_invites, public.friendships,
  public.shared_items, public.comments, public.reactions, public.reports, public.blocks
  to service_role;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

revoke all on function public.request_friend(text) from public, anon;
revoke all on function public.redeem_friend_invite(text) from public, anon;
revoke all on function public.set_username(text) from public, anon;
grant execute on function public.request_friend(text) to authenticated;
grant execute on function public.redeem_friend_invite(text) to authenticated;
grant execute on function public.set_username(text) to authenticated;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

comment on function public.request_friend(text) is
  'Start a pending friend request by exact username. Social must be on. Does not accept the request.';
comment on function public.redeem_friend_invite(text) is
  'Turn an invite link into a pending friend request. Does not accept it.';
comment on function public.set_username(text) is
  'Set or clear the exact username. A taken name and a rejected name both raise unavailable.';

-- Account deletion removes social rows that are not keyed only by user_id.
-- Date-range purge does not. A shared snapshot is a copy, not a health row,
-- and unfriending is not part of deleting a week of logs.
create or replace function public.delete_user_rows(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if p_user is null then
    raise exception 'missing user';
  end if;

  if to_regclass('public.shared_items') is not null then
    delete from public.reports
    where reporter_id = p_user
       or shared_item_id in (select s.id from public.shared_items s where s.owner_id = p_user)
       or comment_id in (
         select c.id from public.comments c
         where c.author_id = p_user
            or c.shared_item_id in (select s.id from public.shared_items s where s.owner_id = p_user)
       );
    delete from public.reactions
    where user_id = p_user
       or shared_item_id in (select s.id from public.shared_items s where s.owner_id = p_user);
    delete from public.comments
    where author_id = p_user
       or shared_item_id in (select s.id from public.shared_items s where s.owner_id = p_user);
    delete from public.shared_items where owner_id = p_user;
    delete from public.friend_invites where owner_id = p_user;
    delete from public.friendships
    where requester_id = p_user or addressee_id = p_user;
    delete from public.blocks
    where blocker_id = p_user or blocked_id = p_user;
    delete from public.social_settings where user_id = p_user;
  end if;

  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and t.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where user_id = $1', r.table_name) using p_user;
  end loop;
end;
$$;

create or replace function public.purge_user_range_rows(p_user uuid, p_from date, p_to date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  col text;
begin
  if p_user is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'bad range';
  end if;

  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in (
        'user_data', 'ai_usage', 'oura_tokens', 'oura_connections', 'oura_oauth_states', 'progress_photos',
        'social_settings', 'friendships', 'friend_invites', 'shared_items', 'comments', 'reactions', 'reports', 'blocks'
      )
  loop
    select c.column_name into col
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = r.table_name
      and c.column_name in ('day', 'date')
      and c.data_type = 'date'
    order by case c.column_name when 'day' then 0 else 1 end
    limit 1;
    if col is not null then
      execute format('delete from public.%I where user_id = $1 and %I >= $2 and %I <= $3', r.table_name, col, col)
        using p_user, p_from, p_to;
    end if;
  end loop;
end;
$$;

revoke all on function public.delete_user_rows(uuid) from public, anon, authenticated;
revoke all on function public.purge_user_range_rows(uuid, date, date) from public, anon, authenticated;
grant execute on function public.delete_user_rows(uuid) to service_role;
grant execute on function public.purge_user_range_rows(uuid, date, date) to service_role;
