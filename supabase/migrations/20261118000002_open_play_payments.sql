-- Open Play payments: a player pays for one or more players through the
-- session's link; staff check the screenshot, or add walk-ins who paid at the yard.
-- Locking order everywhere: session row first, then payment rows (avoids deadlocks).

create or replace function public.new_open_play_ref() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  r text;
begin
  loop
    r := 'SPY-OP-';
    for i in 1..4 loop
      r := r || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.open_play_payments where ref = r);
  end loop;
  return r;
end $$;

-- Holds now also expire open play payments.
create or replace function public.expire_stale_holds() returns int
language plpgsql security definer set search_path = '' as $$
declare n int; m int;
begin
  update public.bookings set status = 'expired'
   where status = 'pending_payment' and hold_expires_at < now();
  get diagnostics n = row_count;
  update public.open_play_payments set status = 'expired', updated_at = now()
   where status = 'pending_payment' and hold_expires_at < now();
  get diagnostics m = row_count;
  return n + m;
end $$;

-- Raises not_enough_spots:<left> when p_players don't fit. Caller holds the session lock.
create or replace function public.open_play_require_spots(p_session_id uuid, p_players int)
returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_left int;
begin
  v_left := public.open_play_limit(p_session_id) - public.open_play_held(p_session_id);
  if p_players > v_left then
    raise exception 'not_enough_spots:%', greatest(v_left, 0);
  end if;
end $$;

-- Trims names and checks the count (1..12).
create or replace function public.open_play_clean_names(p_names text[]) returns text[]
language plpgsql immutable set search_path = '' as $$
declare v text[];
begin
  select coalesce(array_agg(trim(x) order by i), '{}') into v
    from unnest(p_names) with ordinality as t(x, i);
  if array_length(v, 1) is null or array_length(v, 1) > 12 then
    raise exception 'too_many_players';
  end if;
  return v;
end $$;

create or replace function public.open_play_insert_players(p_payment_id uuid, p_names text[])
returns void
language sql security definer set search_path = '' as $$
  insert into public.open_play_players (payment_id, position, name)
  select p_payment_id, i, x from unnest(p_names) with ordinality as t(x, i)
$$;

-- ---------------------------------------------------------------- public (via server, service role)

create or replace function public.get_open_play_public(p_code text)
returns table (code text, service_date date, starts_at timestamptz, ends_at timestamptz,
               court_names text[], fee_per_player int, max_players int, spots_left int, state text)
language sql stable security definer set search_path = '' as $$
  select s.code, s.service_date, s.starts_at, s.ends_at,
         array(select c.name from public.open_play_session_courts sc
                 join public.courts c on c.id = sc.court_id
                where sc.session_id = s.id order by c.id),
         s.fee_per_player,
         public.open_play_limit(s.id),
         greatest(public.open_play_limit(s.id) - public.open_play_held(s.id), 0),
         case when s.status = 'cancelled' then 'cancelled'
              when now() >= s.starts_at then 'closed'
              when public.open_play_limit(s.id) - public.open_play_held(s.id) <= 0 then 'full'
              else 'open' end
    from public.open_play_sessions s
   where s.code = upper(trim(p_code))
$$;

create or replace function public.create_open_play_payment(
  p_code text, p_player_names text[], p_mobile text, p_email text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  st public.settings;
  ses public.open_play_sessions;
  v_names text[];
  v_n int;
  v_id uuid;
  v_ref text;
begin
  select * into st from public.settings;
  select * into ses from public.open_play_sessions where code = upper(trim(p_code)) for update;
  if not found then raise exception 'not_found'; end if;
  if ses.status = 'cancelled' then raise exception 'session_cancelled'; end if;
  if now() >= ses.starts_at then raise exception 'session_closed'; end if;

  v_names := public.open_play_clean_names(p_player_names);
  v_n := array_length(v_names, 1);
  perform public.expire_stale_holds();
  perform public.open_play_require_spots(ses.id, v_n);

  v_ref := public.new_open_play_ref();
  insert into public.open_play_payments (ref, session_id, player_count, fee_per_player, total_amount,
                                         mobile, email, status, source, hold_expires_at)
  values (v_ref, ses.id, v_n, ses.fee_per_player, v_n * ses.fee_per_player, p_mobile,
          nullif(trim(p_email), ''), 'pending_payment', 'online',
          now() + make_interval(mins => st.hold_minutes))
  returning id into v_id;
  perform public.open_play_insert_players(v_id, v_names);
  return v_ref;
end $$;

create or replace function public.submit_open_play_payment(
  p_ref text, p_method text, p_payment_ref_no text, p_proof_path text
) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.open_play_payments;
begin
  if p_method not in ('gcash', 'maya') then raise exception 'invalid_method'; end if;
  select * into p from public.open_play_payments where ref = upper(trim(p_ref)) for update;
  if not found then raise exception 'not_found'; end if;
  if p.status = 'pending_payment' and p.hold_expires_at < now() then
    update public.open_play_payments set status = 'expired', updated_at = now() where id = p.id;
    raise exception 'hold_expired';
  end if;
  if p.status not in ('pending_payment', 'for_verification') then
    raise exception 'invalid_status:%', p.status;
  end if;
  update public.open_play_payments
     set status = 'for_verification', payment_method = p_method,
         payment_ref_no = left(trim(p_payment_ref_no), 64),
         proof_path = p_proof_path, proof_uploaded_at = now(), updated_at = now()
   where id = p.id;
end $$;

-- Limited view by ref: first names only, no mobile/email.
create or replace function public.get_open_play_payment_public(p_ref text)
returns table (ref text, code text, service_date date, starts_at timestamptz, ends_at timestamptz,
               court_names text[], player_count int, first_names text[], total_amount int,
               status text, hold_expires_at timestamptz, admin_note text)
language sql stable security definer set search_path = '' as $$
  select p.ref, s.code, s.service_date, s.starts_at, s.ends_at,
         array(select c.name from public.open_play_session_courts sc
                 join public.courts c on c.id = sc.court_id
                where sc.session_id = s.id order by c.id),
         p.player_count,
         array(select split_part(pl.name, ' ', 1) from public.open_play_players pl
                where pl.payment_id = p.id order by pl.position),
         p.total_amount,
         case when p.status = 'pending_payment' and p.hold_expires_at < now() then 'expired'
              else p.status end,
         p.hold_expires_at,
         case when p.status = 'rejected' then p.admin_note end
    from public.open_play_payments p
    join public.open_play_sessions s on s.id = p.session_id
   where p.ref = upper(trim(p_ref))
$$;

-- ---------------------------------------------------------------- staff

create or replace function public.staff_review_open_play_payment(p_payment_id uuid, p_action text,
                                                                 p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare p public.open_play_payments; v_holding boolean;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  perform 1 from public.open_play_sessions
   where id = (select session_id from public.open_play_payments where id = p_payment_id) for update;
  select * into p from public.open_play_payments where id = p_payment_id for update;
  if not found then raise exception 'not_found'; end if;
  v_holding := p.status in ('for_verification', 'confirmed')
               or (p.status = 'pending_payment' and p.hold_expires_at > now());

  if p_action = 'approve' then
    if p.status not in ('for_verification', 'pending_payment', 'expired') then
      raise exception 'invalid_status:%', p.status;
    end if;
    if not v_holding then perform public.open_play_require_spots(p.session_id, p.player_count); end if;
    update public.open_play_payments
       set status = 'confirmed', verified_by = auth.uid(), verified_at = now(),
           admin_note = coalesce(p_note, admin_note), updated_at = now()
     where id = p.id;
  elsif p_action = 'reject' then
    if p.status not in ('for_verification', 'pending_payment', 'confirmed') then
      raise exception 'invalid_status:%', p.status;
    end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'reason_required'; end if;
    update public.open_play_payments
       set status = 'rejected', verified_by = auth.uid(), verified_at = now(),
           admin_note = p_note, updated_at = now()
     where id = p.id;
  else
    raise exception 'invalid_action';
  end if;

  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'open_play_' || p_action,
          jsonb_build_object('open_play_payment_id', p.id, 'from', p.status, 'note', p_note));
end $$;

create or replace function public.staff_extend_open_play_hold(p_payment_id uuid, p_minutes int)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare p public.open_play_payments; v_new timestamptz;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_minutes not between 5 and 1440 then raise exception 'invalid_minutes'; end if;
  perform 1 from public.open_play_sessions
   where id = (select session_id from public.open_play_payments where id = p_payment_id) for update;
  select * into p from public.open_play_payments where id = p_payment_id for update;
  if not found then raise exception 'not_found'; end if;
  if p.status not in ('pending_payment', 'expired') then raise exception 'invalid_status:%', p.status; end if;
  if not (p.status = 'pending_payment' and p.hold_expires_at > now()) then
    perform public.open_play_require_spots(p.session_id, p.player_count);
  end if;
  v_new := greatest(coalesce(p.hold_expires_at, now()), now()) + make_interval(mins => p_minutes);
  update public.open_play_payments
     set status = 'pending_payment', hold_expires_at = v_new, updated_at = now()
   where id = p.id;
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'open_play_extend_hold',
          jsonb_build_object('open_play_payment_id', p.id, 'minutes', p_minutes, 'until', v_new));
  return v_new;
end $$;

create or replace function public.staff_add_open_play_walkins(
  p_session_id uuid, p_player_names text[], p_payment_method text, p_mobile text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  ses public.open_play_sessions;
  v_names text[];
  v_n int;
  v_id uuid;
  v_ref text;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_payment_method not in ('cash', 'gcash', 'maya') then raise exception 'invalid_method'; end if;
  select * into ses from public.open_play_sessions where id = p_session_id for update;
  if not found then raise exception 'not_found'; end if;
  if ses.status = 'cancelled' then raise exception 'session_cancelled'; end if;
  if now() >= ses.ends_at then raise exception 'session_closed'; end if;

  v_names := public.open_play_clean_names(p_player_names);
  v_n := array_length(v_names, 1);
  perform public.open_play_require_spots(ses.id, v_n);

  v_ref := public.new_open_play_ref();
  insert into public.open_play_payments (ref, session_id, player_count, fee_per_player, total_amount,
                                         mobile, status, source, payment_method, created_by,
                                         verified_by, verified_at)
  values (v_ref, ses.id, v_n, ses.fee_per_player, v_n * ses.fee_per_player, nullif(trim(p_mobile), ''),
          'confirmed', 'walk_in', p_payment_method, auth.uid(), auth.uid(), now())
  returning id into v_id;
  perform public.open_play_insert_players(v_id, v_names);

  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'open_play_walk_in',
          jsonb_build_object('open_play_payment_id', v_id, 'session_id', ses.id, 'players', v_n));
  return v_ref;
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- internal helpers
revoke execute on function public.open_play_insert_players(uuid, text[]) from authenticated;
