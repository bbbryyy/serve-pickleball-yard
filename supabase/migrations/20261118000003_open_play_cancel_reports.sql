-- Cancelling a session, tracking refunds, and open play figures in reports.

create or replace function public.staff_cancel_open_play_session(p_session_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare ses public.open_play_sessions; n_owed int; n_cancelled int;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into ses from public.open_play_sessions where id = p_session_id for update;
  if not found then raise exception 'not_found'; end if;
  if ses.status = 'cancelled' then raise exception 'session_cancelled'; end if;
  if now() >= ses.starts_at then raise exception 'session_started'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  delete from public.blocked_slots where session_id = ses.id;
  -- money already sent (approved, or screenshot not yet checked) is owed back
  update public.open_play_payments set status = 'refund_owed', updated_at = now()
   where session_id = ses.id and status in ('confirmed', 'for_verification');
  get diagnostics n_owed = row_count;
  update public.open_play_payments set status = 'cancelled', updated_at = now()
   where session_id = ses.id and status = 'pending_payment';
  get diagnostics n_cancelled = row_count;
  update public.open_play_sessions
     set status = 'cancelled', cancel_reason = trim(p_reason), cancelled_at = now(), cancelled_by = auth.uid()
   where id = ses.id;

  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'open_play_session_cancelled',
          jsonb_build_object('session_id', ses.id, 'reason', p_reason,
                             'refunds_owed', n_owed, 'cancelled', n_cancelled));
end $$;

create or replace function public.staff_mark_open_play_refunded(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare p public.open_play_payments;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into p from public.open_play_payments where id = p_payment_id for update;
  if not found then raise exception 'not_found'; end if;
  if p.status <> 'refund_owed' then raise exception 'invalid_status:%', p.status; end if;
  update public.open_play_payments
     set status = 'refunded', refunded_by = auth.uid(), refunded_at = now(), updated_at = now()
   where id = p.id;
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'open_play_refunded',
          jsonb_build_object('open_play_payment_id', p.id, 'amount', p.total_amount));
end $$;

-- Report data: court rentals (unchanged: daily + heat) plus open play.
-- Open play revenue counts payments that were approved (whatever happened later),
-- dated by the session's service date. Refunds of approved payments are money out
-- on the Manila date they were marked refunded, so past totals never change.
create or replace function public.report_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.settings; result jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into s from public.settings;
  with hrs as (
    select bs.booking_id, bs.court_id, b.payment_method, b.source, b.rate_per_hour,
           ss.service_date, ss.sh
      from public.booking_slots bs
      join public.bookings b on b.id = bs.booking_id
      cross join lateral public.service_slot(bs.slot_start, s) ss
     where b.status = 'confirmed'
       and bs.slot_start >= ((p_from::timestamp + make_interval(hours => s.early_start)) at time zone 'Asia/Manila')
       and bs.slot_start <  (((p_to + 1)::timestamp + make_interval(hours => s.early_start)) at time zone 'Asia/Manila')
  ),
  op as (
    select ses.service_date, p.payment_method, p.source, p.player_count, p.total_amount
      from public.open_play_payments p
      join public.open_play_sessions ses on ses.id = p.session_id
     where p.verified_at is not null
       and p.status in ('confirmed', 'refund_owed', 'refunded')
       and ses.service_date between p_from and p_to
  ),
  refunds as (
    select (p.refunded_at at time zone 'Asia/Manila')::date as date, p.player_count, p.total_amount
      from public.open_play_payments p
     where p.status = 'refunded' and p.verified_at is not null
       and (p.refunded_at at time zone 'Asia/Manila')::date between p_from and p_to
  )
  select jsonb_build_object(
    'daily', coalesce((select jsonb_agg(d) from (
        select service_date as date, court_id as court, coalesce(payment_method, 'cash') as method, source,
               count(distinct booking_id) as bookings, count(*) as hours, sum(rate_per_hour) as revenue
          from hrs group by 1, 2, 3, 4 order by 1) d), '[]'::jsonb),
    'heat', coalesce((select jsonb_agg(h) from (
        select extract(isodow from service_date)::int as dow, sh, count(*) as hours
          from hrs group by 1, 2) h), '[]'::jsonb),
    'open_play', coalesce((select jsonb_agg(o) from (
        select service_date as date, coalesce(payment_method, 'cash') as method, source,
               count(*) as payments, sum(player_count) as players, sum(total_amount) as revenue
          from op group by 1, 2, 3 order by 1) o), '[]'::jsonb),
    'open_play_refunds', coalesce((select jsonb_agg(r) from (
        select date, count(*) as payments, sum(player_count) as players, sum(total_amount) as amount
          from refunds group by 1 order by 1) r), '[]'::jsonb),
    'open_play_sessions', coalesce((select jsonb_agg(x) from (
        select ses.id as session_id, ses.service_date as date, ses.starts_at, ses.ends_at,
               (select count(*) from public.open_play_session_courts c where c.session_id = ses.id) as courts,
               public.open_play_limit(ses.id) as max_players,
               coalesce((select sum(p.player_count) from public.open_play_payments p
                          where p.session_id = ses.id and p.verified_at is not null
                            and p.status in ('confirmed', 'refund_owed', 'refunded')), 0) as players,
               ses.status
          from public.open_play_sessions ses
         where ses.service_date between p_from and p_to
         order by ses.starts_at) x), '[]'::jsonb),
    'refunds_owed', (select count(*) from public.open_play_payments where status = 'refund_owed')
  ) into result;
  return result;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.open_play_insert_players(uuid, text[]) from authenticated;
revoke execute on function public.open_play_reserve_court(uuid, smallint, timestamptz[]) from authenticated;
