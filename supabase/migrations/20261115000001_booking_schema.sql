-- Serve Pickleball Yard: court booking schema
-- Security model
--   * anon (public site) gets NO direct table access. Public pages go through
--     Next.js server actions using the service role, which call the
--     security-definer RPCs below.
--   * authenticated users are backoffice users; what they can do depends on
--     staff_profiles.role (staff | admin), checked by is_staff()/is_admin()
--     in RLS policies and inside every RPC.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------- tables

create table public.courts (
  id smallint primary key,
  name text not null,
  active boolean not null default true
);

create table public.settings (
  id boolean primary key default true check (id),
  rate_per_hour int not null default 400 check (rate_per_hour > 0),
  hold_minutes int not null default 30 check (hold_minutes between 5 and 1440),
  max_weeks_ahead int not null default 8 check (max_weeks_ahead between 1 and 52),
  offhours_lead_hours int not null default 24 check (offhours_lead_hours between 0 and 168),
  early_start int not null default 4,
  regular_start int not null default 9,
  late_start int not null default 22,
  close_hour int not null default 1,
  gcash_qr_path text,
  gcash_name text,
  gcash_number text,
  maya_qr_path text,
  maya_name text,
  maya_number text,
  updated_at timestamptz not null default now(),
  check (0 <= close_hour and close_hour < early_start and early_start < regular_start
         and regular_start < late_start and late_start <= 24)
);

create type public.staff_role as enum ('staff', 'admin');

create table public.staff_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  email text not null,
  role public.staff_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create type public.booking_status as enum
  ('pending_payment', 'for_verification', 'confirmed', 'rejected', 'expired', 'cancelled');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  court_id smallint not null references public.courts,
  player_name text not null check (length(player_name) between 2 and 100),
  mobile text not null check (mobile ~ '^(09|\+639)\d{9}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  hours int not null check (hours > 0),
  rate_per_hour int not null,
  total_amount int not null,
  status public.booking_status not null default 'pending_payment',
  source text not null default 'online' check (source in ('online', 'walk_in')),
  hold_expires_at timestamptz,
  payment_method text check (payment_method in ('gcash', 'maya', 'cash')),
  payment_ref_no text,
  proof_path text,
  proof_uploaded_at timestamptz,
  admin_note text,
  verified_by uuid references auth.users,
  verified_at timestamptz,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_status_idx on public.bookings (status, created_at desc);

create table public.booking_slots (
  booking_id uuid not null references public.bookings on delete cascade,
  court_id smallint not null references public.courts,
  slot_start timestamptz not null,
  -- true while the booking holds the slot; kept in sync by trigger
  active boolean not null default true,
  primary key (booking_id, slot_start)
);
-- The double-booking guard: one active booking per court-hour.
create unique index booking_slots_one_active
  on public.booking_slots (court_id, slot_start) where active;
create index booking_slots_time_idx on public.booking_slots (slot_start);

create table public.blocked_slots (
  id bigint generated always as identity primary key,
  court_id smallint not null references public.courts,
  slot_start timestamptz not null,
  reason text not null default 'Blocked',
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  unique (court_id, slot_start)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users,
  action text not null,
  booking_id uuid references public.bookings on delete set null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- role helpers

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_profiles
                 where user_id = auth.uid() and active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_profiles
                 where user_id = auth.uid() and active and role = 'admin')
$$;

-- ---------------------------------------------------------------- slot sync trigger

create or replace function public.sync_slot_active() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    update public.booking_slots
       set active = new.status in ('pending_payment', 'for_verification', 'confirmed')
     where booking_id = new.id;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger bookings_sync_slots before update on public.bookings
for each row execute function public.sync_slot_active();

-- ---------------------------------------------------------------- schedule rules (mirror of lib/schedule.ts)

-- Service day + service hour for an instant. Hours after midnight but before
-- early open belong to the previous service day (sh = 24, 25 ...).
create or replace function public.service_slot(p_start timestamptz, s public.settings,
  out service_date date, out sh int)
language plpgsql immutable set search_path = '' as $$
declare local_ts timestamp := p_start at time zone 'Asia/Manila';
begin
  sh := extract(hour from local_ts)::int;
  service_date := local_ts::date;
  if sh < s.early_start then
    sh := sh + 24;
    service_date := service_date - 1;
  end if;
end $$;

create or replace function public.current_service_date(s public.settings) returns date
language sql stable set search_path = '' as $$
  select (public.service_slot(date_trunc('hour', now()), s)).service_date
$$;

-- Returns null when the slot is bookable, otherwise an issue code
-- (same codes as SlotIssue in lib/schedule.ts).
create or replace function public.validate_slot(p_start timestamptz, s public.settings, p_staff boolean)
returns text language plpgsql stable set search_path = '' as $$
declare ss record;
begin
  if p_start <> date_trunc('hour', p_start) then return 'not_on_hour'; end if;
  ss := public.service_slot(p_start, s);
  if ss.sh < s.early_start or ss.sh >= 24 + s.close_hour then return 'closed'; end if;
  if p_start <= now() then return 'past'; end if;
  if p_staff then return null; end if;
  if ss.service_date > public.current_service_date(s) + s.max_weeks_ahead * 7 then
    return 'too_far';
  end if;
  if (ss.sh < s.regular_start or ss.sh >= s.late_start)
     and p_start - now() < make_interval(hours => s.offhours_lead_hours) then
    return 'offhours_lead';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- holds

create or replace function public.expire_stale_holds() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.bookings set status = 'expired'
   where status = 'pending_payment' and hold_expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- booking RPCs

create or replace function public.new_booking_ref() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  r text;
begin
  loop
    r := 'SPY-';
    for i in 1..6 loop
      r := r || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.bookings where ref = r);
  end loop;
  return r;
end $$;

-- Creates a booking for one court and one or more hourly slots, atomically.
-- Online (public) bookings start as pending_payment with a hold.
-- Walk-in bookings (staff only) are created confirmed.
create or replace function public.create_booking(
  p_court_id smallint,
  p_slots timestamptz[],
  p_player_name text,
  p_mobile text,
  p_email text default null,
  p_source text default 'online',
  p_payment_method text default null,
  p_note text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.settings;
  v_staff boolean := public.is_staff();
  v_slot timestamptz;
  v_issue text;
  v_id uuid;
  v_ref text;
  v_n int;
begin
  if p_source not in ('online', 'walk_in') then raise exception 'invalid_source'; end if;
  if p_source = 'walk_in' and not v_staff then raise exception 'forbidden'; end if;

  select * into s from public.settings;
  if not exists (select 1 from public.courts where id = p_court_id and active) then
    raise exception 'invalid_court';
  end if;

  select array_agg(distinct x order by x) into p_slots from unnest(p_slots) x;
  v_n := coalesce(array_length(p_slots, 1), 0);
  if v_n = 0 then raise exception 'no_slots'; end if;
  if v_n > 12 then raise exception 'too_many_slots'; end if;

  foreach v_slot in array p_slots loop
    v_issue := public.validate_slot(v_slot, s, p_source = 'walk_in');
    if v_issue is not null then
      raise exception 'slot_invalid:%:%', v_issue, v_slot;
    end if;
    if exists (select 1 from public.blocked_slots where court_id = p_court_id and slot_start = v_slot) then
      raise exception 'slot_taken:%', v_slot;
    end if;
  end loop;

  perform public.expire_stale_holds();

  v_ref := public.new_booking_ref();
  insert into public.bookings (ref, court_id, player_name, mobile, email, hours, rate_per_hour,
                               total_amount, status, source, hold_expires_at, payment_method,
                               admin_note, created_by, verified_by, verified_at)
  values (v_ref, p_court_id, trim(p_player_name), p_mobile, nullif(trim(p_email), ''), v_n,
          s.rate_per_hour, v_n * s.rate_per_hour,
          case when p_source = 'walk_in' then 'confirmed' else 'pending_payment' end::public.booking_status,
          p_source,
          case when p_source = 'online' then now() + make_interval(mins => s.hold_minutes) end,
          case when p_source = 'walk_in' then coalesce(p_payment_method, 'cash') end,
          p_note,
          auth.uid(),
          case when p_source = 'walk_in' then auth.uid() end,
          case when p_source = 'walk_in' then now() end)
  returning id into v_id;

  begin
    insert into public.booking_slots (booking_id, court_id, slot_start)
    select v_id, p_court_id, x from unnest(p_slots) x;
  exception when unique_violation then
    raise exception 'slot_taken';
  end;

  if p_source = 'walk_in' then
    insert into public.audit_log (actor_id, action, booking_id, detail)
    values (auth.uid(), 'walk_in_created', v_id, jsonb_build_object('slots', v_n));
  end if;

  return v_ref;
end $$;

-- Public: record payment proof (called by the server after uploading the file).
create or replace function public.submit_payment(
  p_ref text, p_method text, p_payment_ref_no text, p_proof_path text
) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  if p_method not in ('gcash', 'maya') then raise exception 'invalid_method'; end if;
  select * into b from public.bookings where ref = p_ref for update;
  if not found then raise exception 'not_found'; end if;
  if b.status = 'pending_payment' and b.hold_expires_at < now() then
    update public.bookings set status = 'expired' where id = b.id;
    raise exception 'hold_expired';
  end if;
  if b.status not in ('pending_payment', 'for_verification') then
    raise exception 'invalid_status:%', b.status;
  end if;
  update public.bookings
     set status = 'for_verification', payment_method = p_method,
         payment_ref_no = left(trim(p_payment_ref_no), 64),
         proof_path = p_proof_path, proof_uploaded_at = now()
   where id = b.id;
end $$;

-- Public: limited booking view by ref (no mobile/email).
create or replace function public.get_booking_public(p_ref text)
returns table (ref text, court_id smallint, court_name text, player_name text, hours int,
               total_amount int, status public.booking_status, hold_expires_at timestamptz,
               payment_method text, admin_note text, slots timestamptz[])
language sql stable security definer set search_path = '' as $$
  select b.ref, b.court_id, c.name, split_part(b.player_name, ' ', 1), b.hours, b.total_amount,
         case when b.status = 'pending_payment' and b.hold_expires_at < now()
              then 'expired'::public.booking_status else b.status end,
         b.hold_expires_at, b.payment_method,
         case when b.status = 'rejected' then b.admin_note end,
         array(select slot_start from public.booking_slots s where s.booking_id = b.id order by 1)
    from public.bookings b join public.courts c on c.id = b.court_id
   where b.ref = upper(trim(p_ref))
$$;

-- Public: occupied slots for a court in a time range (no personal data).
create or replace function public.get_availability(p_court_id smallint, p_from timestamptz, p_to timestamptz)
returns table (slot_start timestamptz, state text)
language sql stable security definer set search_path = '' as $$
  select s.slot_start,
         case when b.status = 'confirmed' then 'booked' else 'pending' end
    from public.booking_slots s join public.bookings b on b.id = s.booking_id
   where s.court_id = p_court_id and s.active
     and s.slot_start >= p_from and s.slot_start < p_to
     and not (b.status = 'pending_payment' and b.hold_expires_at < now())
  union all
  select slot_start, 'blocked' from public.blocked_slots
   where court_id = p_court_id and slot_start >= p_from and slot_start < p_to
$$;

-- ---------------------------------------------------------------- staff RPCs

create or replace function public.staff_review_booking(p_booking_id uuid, p_action text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare b public.bookings;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'not_found'; end if;

  if p_action = 'approve' then
    if b.status not in ('for_verification', 'pending_payment') then
      raise exception 'invalid_status:%', b.status;
    end if;
    -- an expired hold may have lost its slots; make sure they are still free
    begin
      update public.bookings set status = 'confirmed', verified_by = auth.uid(), verified_at = now(),
             admin_note = coalesce(p_note, admin_note)
       where id = b.id;
    exception when unique_violation then
      raise exception 'slot_taken';
    end;
  elsif p_action = 'reject' then
    if b.status not in ('for_verification', 'pending_payment', 'confirmed') then
      raise exception 'invalid_status:%', b.status;
    end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'reason_required'; end if;
    update public.bookings set status = 'rejected', verified_by = auth.uid(), verified_at = now(),
           admin_note = p_note
     where id = b.id;
  elsif p_action = 'cancel' then
    if b.status not in ('pending_payment', 'for_verification', 'confirmed') then
      raise exception 'invalid_status:%', b.status;
    end if;
    update public.bookings set status = 'cancelled', admin_note = coalesce(p_note, admin_note)
     where id = b.id;
  else
    raise exception 'invalid_action';
  end if;

  insert into public.audit_log (actor_id, action, booking_id, detail)
  values (auth.uid(), p_action, b.id, jsonb_build_object('from', b.status, 'note', p_note));
end $$;

-- Extend (or revive) a pending hold by N minutes from now or from the current expiry.
create or replace function public.staff_extend_hold(p_booking_id uuid, p_minutes int)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare b public.bookings; v_new timestamptz;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_minutes not between 5 and 1440 then raise exception 'invalid_minutes'; end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'not_found'; end if;
  if b.status not in ('pending_payment', 'expired') then raise exception 'invalid_status:%', b.status; end if;
  v_new := greatest(coalesce(b.hold_expires_at, now()), now()) + make_interval(mins => p_minutes);
  begin
    update public.bookings set status = 'pending_payment', hold_expires_at = v_new where id = b.id;
  exception when unique_violation then
    raise exception 'slot_taken';
  end;
  insert into public.audit_log (actor_id, action, booking_id, detail)
  values (auth.uid(), 'extend_hold', b.id, jsonb_build_object('minutes', p_minutes, 'until', v_new));
  return v_new;
end $$;

create or replace function public.staff_block_slots(p_court_id smallint, p_slots timestamptz[], p_reason text)
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.booking_slots
              where court_id = p_court_id and active and slot_start = any(p_slots)) then
    raise exception 'slot_taken';
  end if;
  insert into public.blocked_slots (court_id, slot_start, reason, created_by)
  select p_court_id, x, coalesce(nullif(trim(p_reason), ''), 'Blocked'), auth.uid()
    from unnest(p_slots) x
  on conflict do nothing;
  get diagnostics n = row_count;
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'block_slots', jsonb_build_object('court', p_court_id, 'count', n, 'reason', p_reason));
  return n;
end $$;

create or replace function public.staff_unblock_slots(p_court_id smallint, p_slots timestamptz[])
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  delete from public.blocked_slots where court_id = p_court_id and slot_start = any(p_slots);
  get diagnostics n = row_count;
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'unblock_slots', jsonb_build_object('court', p_court_id, 'count', n));
  return n;
end $$;

-- ---------------------------------------------------------------- admin reports

-- Aggregated report data for confirmed bookings in [p_from, p_to] (Manila service dates).
-- A booking never spans two service days (the day closes at 1AM, opens 4AM),
-- so daily booking counts are exact. Returned as one jsonb document to avoid
-- API row limits.
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
  )
  select jsonb_build_object(
    'daily', coalesce((select jsonb_agg(d) from (
        select service_date as date, court_id as court, coalesce(payment_method, 'cash') as method, source,
               count(distinct booking_id) as bookings, count(*) as hours, sum(rate_per_hour) as revenue
          from hrs group by 1, 2, 3, 4 order by 1) d), '[]'::jsonb),
    'heat', coalesce((select jsonb_agg(h) from (
        select extract(isodow from service_date)::int as dow, sh, count(*) as hours
          from hrs group by 1, 2) h), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------- RLS

alter table public.courts enable row level security;
alter table public.settings enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_slots enable row level security;
alter table public.blocked_slots enable row level security;
alter table public.audit_log enable row level security;

create policy courts_staff_read on public.courts for select to authenticated using (public.is_staff());
create policy courts_admin_write on public.courts for update to authenticated using (public.is_admin());

create policy settings_staff_read on public.settings for select to authenticated using (public.is_staff());
create policy settings_admin_write on public.settings for update to authenticated using (public.is_admin());

create policy staff_self_read on public.staff_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy staff_admin_write on public.staff_profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy bookings_staff_read on public.bookings for select to authenticated using (public.is_staff());
create policy slots_staff_read on public.booking_slots for select to authenticated using (public.is_staff());
create policy blocked_staff_read on public.blocked_slots for select to authenticated using (public.is_staff());
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());

-- Table privileges (explicit; RLS above narrows rows further).
-- No direct writes on bookings/slots/blocks/audit: only through the RPCs above.
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on all tables in schema public to authenticated;
grant update on public.settings, public.courts to authenticated;
grant insert, update, delete on public.staff_profiles to authenticated;

-- Functions: nothing for anon; backoffice users get the RPCs (each checks role).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
       ('qr-codes', 'qr-codes', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
-- Uploads go through the server (service role); no anon/authenticated storage policies needed.

-- ---------------------------------------------------------------- cron

select cron.schedule('expire-stale-holds', '*/5 * * * *', $$select public.expire_stale_holds()$$);

-- ---------------------------------------------------------------- base data

insert into public.courts (id, name) values (1, 'Court 1'), (2, 'Court 2');
insert into public.settings (id) values (true);
