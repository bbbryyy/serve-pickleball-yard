-- Open Play: staff can set court-hours aside for open play sessions.
-- Stored with blocked hours (same rules: not privately bookable, can't overlap
-- an active booking), distinguished by `kind`.

alter table public.blocked_slots
  add column kind text not null default 'blocked' check (kind in ('blocked', 'open_play'));

-- Availability now reports open play hours as their own state.
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
  select slot_start, case when kind = 'open_play' then 'open_play' else 'blocked' end
    from public.blocked_slots
   where court_id = p_court_id and slot_start >= p_from and slot_start < p_to
$$;

-- Blocking takes a kind; existing callers keep the default.
drop function public.staff_block_slots(smallint, timestamptz[], text);

create function public.staff_block_slots(p_court_id smallint, p_slots timestamptz[], p_reason text,
                                         p_kind text default 'blocked')
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_kind not in ('blocked', 'open_play') then raise exception 'invalid_kind'; end if;
  if exists (select 1 from public.booking_slots
              where court_id = p_court_id and active and slot_start = any(p_slots)) then
    raise exception 'slot_taken';
  end if;
  insert into public.blocked_slots (court_id, slot_start, reason, kind, created_by)
  select p_court_id, x,
         coalesce(nullif(trim(p_reason), ''), case when p_kind = 'open_play' then 'Open play' else 'Blocked' end),
         p_kind, auth.uid()
    from unnest(p_slots) x
  on conflict do nothing;
  get diagnostics n = row_count;
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), case when p_kind = 'open_play' then 'open_play_slots' else 'block_slots' end,
          jsonb_build_object('court', p_court_id, 'count', n, 'reason', p_reason));
  return n;
end $$;

revoke execute on function public.staff_block_slots(smallint, timestamptz[], text, text) from public, anon;
grant execute on function public.staff_block_slots(smallint, timestamptz[], text, text) to authenticated, service_role;
