-- Open Play sessions: staff set a date, hours and courts; the court-hours are
-- reserved through blocked_slots (kind 'open_play') linked to the session.
-- Players pay per head through the session's public link (see the next migration).

-- ---------------------------------------------------------------- settings

alter table public.settings
  add column open_play_fee int not null default 120 check (open_play_fee > 0),
  add column open_play_players_per_court int not null default 12
    check (open_play_players_per_court between 1 and 50);

-- ---------------------------------------------------------------- tables

create table public.open_play_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  service_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- copied from settings when the session is created, so later changes don't
  -- alter a session already shared in Reclub
  fee_per_player int not null check (fee_per_player > 0),
  players_per_court int not null check (players_per_court > 0),
  status text not null default 'open' check (status in ('open', 'cancelled')),
  note text,
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index open_play_sessions_date_idx on public.open_play_sessions (service_date);

create table public.open_play_session_courts (
  session_id uuid not null references public.open_play_sessions on delete cascade,
  court_id smallint not null references public.courts,
  primary key (session_id, court_id)
);

alter table public.blocked_slots
  add column session_id uuid references public.open_play_sessions on delete cascade;
create index blocked_slots_session_idx on public.blocked_slots (session_id) where session_id is not null;

create table public.open_play_payments (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  session_id uuid not null references public.open_play_sessions on delete cascade,
  player_count int not null check (player_count between 1 and 12),
  fee_per_player int not null,
  total_amount int not null,
  mobile text check (mobile is null or mobile ~ '^(09|\+639)\d{9}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status text not null default 'pending_payment' check (status in
    ('pending_payment', 'for_verification', 'confirmed', 'rejected', 'expired', 'cancelled',
     'refund_owed', 'refunded')),
  source text not null default 'online' check (source in ('online', 'walk_in')),
  payment_method text check (payment_method in ('gcash', 'maya', 'cash')),
  payment_ref_no text,
  proof_path text,
  proof_uploaded_at timestamptz,
  hold_expires_at timestamptz,
  admin_note text,
  verified_by uuid references auth.users,
  verified_at timestamptz,
  refunded_by uuid references auth.users,
  refunded_at timestamptz,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint open_play_mobile_required check (
    mobile is not null or (source = 'walk_in' and payment_method = 'cash'))
);
create index open_play_payments_session_idx on public.open_play_payments (session_id, status);
create index open_play_payments_status_idx on public.open_play_payments (status, created_at desc);

create table public.open_play_players (
  payment_id uuid not null references public.open_play_payments on delete cascade,
  position smallint not null,
  name text not null check (length(name) between 2 and 60),
  primary key (payment_id, position)
);

-- ---------------------------------------------------------------- helpers

-- Players currently holding spots: paying (hold not lapsed), sent proof, or approved.
create or replace function public.open_play_held(p_session_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(player_count), 0)::int
    from public.open_play_payments
   where session_id = p_session_id
     and (status in ('for_verification', 'confirmed')
          or (status = 'pending_payment' and hold_expires_at > now()))
$$;

create or replace function public.open_play_limit(p_session_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select (s.players_per_court * (select count(*) from public.open_play_session_courts c
                                  where c.session_id = s.id))::int
    from public.open_play_sessions s where s.id = p_session_id
$$;

create or replace function public.new_open_play_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  r text;
begin
  loop
    r := '';
    for i in 1..6 loop
      r := r || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.open_play_sessions where code = r);
  end loop;
  return r;
end $$;

-- Reserve one court's hours for a session: adopts free-standing open play marks,
-- refuses active bookings, plain blocks, and hours owned by another session.
create or replace function public.open_play_reserve_court(p_session_id uuid, p_court_id smallint,
                                                         p_slots timestamptz[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v_slot timestamptz; b public.blocked_slots;
begin
  if not exists (select 1 from public.courts where id = p_court_id and active) then
    raise exception 'invalid_court';
  end if;
  foreach v_slot in array p_slots loop
    if exists (select 1 from public.booking_slots
                where court_id = p_court_id and slot_start = v_slot and active) then
      raise exception 'slot_taken:%', v_slot;
    end if;
    select * into b from public.blocked_slots where court_id = p_court_id and slot_start = v_slot for update;
    if found then
      if b.kind <> 'open_play' or b.session_id is not null then
        raise exception 'slot_taken:%', v_slot;
      end if;
      update public.blocked_slots set session_id = p_session_id where id = b.id;
    else
      insert into public.blocked_slots (court_id, slot_start, reason, kind, session_id, created_by)
      values (p_court_id, v_slot, 'Open play', 'open_play', p_session_id, auth.uid());
    end if;
  end loop;
  insert into public.open_play_session_courts (session_id, court_id) values (p_session_id, p_court_id);
end $$;

-- ---------------------------------------------------------------- staff RPCs

create or replace function public.staff_create_open_play_session(
  p_slots timestamptz[], p_court_ids smallint[], p_note text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.settings;
  v_slot timestamptz;
  v_issue text;
  v_n int;
  v_date date;
  v_court smallint;
  v_id uuid;
  v_code text;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into s from public.settings;

  select array_agg(distinct x order by x) into p_slots from unnest(p_slots) x;
  v_n := coalesce(array_length(p_slots, 1), 0);
  if v_n = 0 then raise exception 'no_slots'; end if;
  if v_n > 21 then raise exception 'too_many_slots'; end if;
  if p_slots[v_n] - p_slots[1] <> make_interval(hours => v_n - 1) then
    raise exception 'not_contiguous';
  end if;

  foreach v_slot in array p_slots loop
    v_issue := public.validate_slot(v_slot, s, true);
    if v_issue is not null then raise exception 'slot_invalid:%:%', v_issue, v_slot; end if;
    if v_date is null then
      v_date := (public.service_slot(v_slot, s)).service_date;
    elsif (public.service_slot(v_slot, s)).service_date <> v_date then
      raise exception 'not_contiguous';
    end if;
  end loop;

  select array_agg(distinct x order by x) into p_court_ids from unnest(p_court_ids) x;
  if coalesce(array_length(p_court_ids, 1), 0) = 0 then raise exception 'invalid_court'; end if;

  v_code := public.new_open_play_code();
  insert into public.open_play_sessions (code, service_date, starts_at, ends_at, fee_per_player,
                                         players_per_court, note, created_by)
  values (v_code, v_date, p_slots[1], p_slots[v_n] + interval '1 hour', s.open_play_fee,
          s.open_play_players_per_court, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  foreach v_court in array p_court_ids loop
    perform public.open_play_reserve_court(v_id, v_court, p_slots);
  end loop;

  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'open_play_session_created',
          jsonb_build_object('session_id', v_id, 'courts', p_court_ids, 'hours', v_n));
  return v_code;
end $$;

create or replace function public.staff_add_open_play_court(p_session_id uuid, p_court_id smallint)
returns void
language plpgsql security definer set search_path = '' as $$
declare ses public.open_play_sessions; v_slots timestamptz[];
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into ses from public.open_play_sessions where id = p_session_id for update;
  if not found then raise exception 'not_found'; end if;
  if ses.status <> 'open' then raise exception 'session_cancelled'; end if;
  if now() >= ses.ends_at then raise exception 'session_closed'; end if;
  if exists (select 1 from public.open_play_session_courts where session_id = ses.id and court_id = p_court_id) then
    raise exception 'court_in_session';
  end if;
  select array_agg(x order by x) into v_slots
    from generate_series(ses.starts_at, ses.ends_at - interval '1 hour', interval '1 hour') x;
  perform public.open_play_reserve_court(ses.id, p_court_id, v_slots);
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'open_play_court_added', jsonb_build_object('session_id', ses.id, 'court', p_court_id));
end $$;

-- Session hours can't be freed from the schedule; they're managed on the session page.
create or replace function public.staff_unblock_slots(p_court_id smallint, p_slots timestamptz[])
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.blocked_slots
              where court_id = p_court_id and slot_start = any(p_slots) and session_id is not null) then
    raise exception 'session_slot';
  end if;
  delete from public.blocked_slots where court_id = p_court_id and slot_start = any(p_slots);
  get diagnostics n = row_count;
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'unblock_slots', jsonb_build_object('court', p_court_id, 'count', n));
  return n;
end $$;

-- ---------------------------------------------------------------- RLS and grants

alter table public.open_play_sessions enable row level security;
alter table public.open_play_session_courts enable row level security;
alter table public.open_play_payments enable row level security;
alter table public.open_play_players enable row level security;

create policy open_play_sessions_staff_read on public.open_play_sessions for select to authenticated using (public.is_staff());
create policy open_play_session_courts_staff_read on public.open_play_session_courts for select to authenticated using (public.is_staff());
create policy open_play_payments_staff_read on public.open_play_payments for select to authenticated using (public.is_staff());
create policy open_play_players_staff_read on public.open_play_players for select to authenticated using (public.is_staff());

revoke all on public.open_play_sessions, public.open_play_session_courts,
              public.open_play_payments, public.open_play_players from anon, authenticated;
grant select on public.open_play_sessions, public.open_play_session_courts,
                public.open_play_payments, public.open_play_players to authenticated;
grant all on public.open_play_sessions, public.open_play_session_courts,
             public.open_play_payments, public.open_play_players to service_role;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- internal helper: only callable from the RPCs above
revoke execute on function public.open_play_reserve_court(uuid, smallint, timestamptz[]) from authenticated;
