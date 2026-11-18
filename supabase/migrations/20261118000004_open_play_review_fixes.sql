-- Review fixes:
-- 1. A cancelled session's payments can't be approved, revived, or paid, and the
--    public status shows them as cancelled.
-- 2. Open play refs get 6 random characters (like court bookings) so they can't be guessed.

create or replace function public.new_open_play_ref() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  r text;
begin
  loop
    r := 'SPY-OP-';
    for i in 1..6 loop
      r := r || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.open_play_payments where ref = r);
  end loop;
  return r;
end $$;

-- Locks the payment's session (session first, then payment — same order everywhere)
-- and refuses if the session was cancelled.
create or replace function public.open_play_lock_open_session(p_payment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select s.status into v_status from public.open_play_sessions s
   where s.id = (select session_id from public.open_play_payments where id = p_payment_id)
   for update;
  if v_status = 'cancelled' then raise exception 'session_cancelled'; end if;
end $$;

create or replace function public.submit_open_play_payment(
  p_ref text, p_method text, p_payment_ref_no text, p_proof_path text
) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.open_play_payments;
begin
  if p_method not in ('gcash', 'maya') then raise exception 'invalid_method'; end if;
  perform public.open_play_lock_open_session(
    (select id from public.open_play_payments where ref = upper(trim(p_ref))));
  select * into p from public.open_play_payments where ref = upper(trim(p_ref)) for update;
  if not found then raise exception 'not_found'; end if;
  if p.status = 'pending_payment' and p.hold_expires_at <= now() then
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

create or replace function public.staff_review_open_play_payment(p_payment_id uuid, p_action text,
                                                                 p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare p public.open_play_payments; v_holding boolean; v_session_status text;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select s.status into v_session_status from public.open_play_sessions s
   where s.id = (select session_id from public.open_play_payments where id = p_payment_id) for update;
  select * into p from public.open_play_payments where id = p_payment_id for update;
  if not found then raise exception 'not_found'; end if;
  v_holding := p.status in ('for_verification', 'confirmed')
               or (p.status = 'pending_payment' and p.hold_expires_at > now());

  if p_action = 'approve' then
    if v_session_status = 'cancelled' then raise exception 'session_cancelled'; end if;
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
  perform public.open_play_lock_open_session(p_payment_id);
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

-- Public status: a payment still waiting in a cancelled session reads as cancelled.
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
         case when s.status = 'cancelled' and p.status in ('pending_payment', 'expired') then 'cancelled'
              when p.status = 'pending_payment' and p.hold_expires_at < now() then 'expired'
              else p.status end,
         p.hold_expires_at,
         case when p.status = 'rejected' then p.admin_note end
    from public.open_play_payments p
    join public.open_play_sessions s on s.id = p.session_id
   where p.ref = upper(trim(p_ref))
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.open_play_insert_players(uuid, text[]) from authenticated;
revoke execute on function public.open_play_reserve_court(uuid, smallint, timestamptz[]) from authenticated;
revoke execute on function public.open_play_lock_open_session(uuid) from authenticated;
