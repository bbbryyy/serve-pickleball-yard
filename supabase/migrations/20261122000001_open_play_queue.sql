-- Open play queue: one saved game queue per session.
-- Dink (or staff) plans it; staff save it, mark rounds played, and rebuild the rest when players
-- arrive or leave. Players see it read-only through the session's public code (first names only).

create table public.open_play_queues (
  session_id uuid primary key references public.open_play_sessions on delete cascade,
  minutes_per_game int not null check (minutes_per_game between 5 and 60),
  -- first names as shown on the queue
  players text[] not null,
  -- [{start, games: [{court, a: [x, y], b: [x, y]}], out: [...]}]
  rounds jsonb not null check (jsonb_typeof(rounds) = 'array'),
  -- rounds already played (0 = none); the current round is rounds[played_through]
  played_through int not null default 0 check (played_through >= 0),
  version int not null default 1,
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now()
);

alter table public.open_play_queues enable row level security;
create policy open_play_queues_staff_read on public.open_play_queues for select to authenticated using (public.is_staff());
revoke all on public.open_play_queues from anon, authenticated;
grant select on public.open_play_queues to authenticated;
grant all on public.open_play_queues to service_role;

-- Save (or replace) a session's queue. Played rounds can be kept by the caller: it sends the full
-- list and how many are already played.
create or replace function public.save_open_play_queue(
  p_session_id uuid, p_minutes int, p_players text[], p_rounds jsonb, p_played_through int default 0
) returns int
language plpgsql security definer set search_path = '' as $$
declare ses public.open_play_sessions; v_version int;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into ses from public.open_play_sessions where id = p_session_id;
  if not found then raise exception 'not_found'; end if;
  if ses.status <> 'open' then raise exception 'session_cancelled'; end if;
  if now() >= ses.ends_at then raise exception 'session_closed'; end if;
  if jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) = 0 or jsonb_array_length(p_rounds) > 200 then
    raise exception 'bad_rounds';
  end if;
  if coalesce(array_length(p_players, 1), 0) < 4 or array_length(p_players, 1) > 200 then raise exception 'bad_players'; end if;
  if p_played_through < 0 or p_played_through > jsonb_array_length(p_rounds) then raise exception 'bad_round'; end if;

  insert into public.open_play_queues (session_id, minutes_per_game, players, rounds, played_through, updated_by)
  values (ses.id, p_minutes, p_players, p_rounds, p_played_through, auth.uid())
  on conflict (session_id) do update
    set minutes_per_game = excluded.minutes_per_game, players = excluded.players, rounds = excluded.rounds,
        played_through = excluded.played_through, version = public.open_play_queues.version + 1,
        updated_by = auth.uid(), updated_at = now()
  returning version into v_version;

  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'open_play_queue_saved',
          jsonb_build_object('session_id', ses.id, 'version', v_version, 'rounds', jsonb_array_length(p_rounds),
                             'players', array_length(p_players, 1)));
  return v_version;
end $$;

-- Mark how many rounds are played (moves "now" forward, or back to undo a mistaken tap).
create or replace function public.mark_open_play_queue_round(p_session_id uuid, p_played_through int)
returns void
language plpgsql security definer set search_path = '' as $$
declare q public.open_play_queues;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into q from public.open_play_queues where session_id = p_session_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_played_through < 0 or p_played_through > jsonb_array_length(q.rounds) then raise exception 'bad_round'; end if;
  update public.open_play_queues set played_through = p_played_through, updated_by = auth.uid(), updated_at = now()
   where session_id = p_session_id;
end $$;

-- Players' view: the queue by the session's public code. Only first names are stored here.
create or replace function public.get_open_play_queue_public(p_code text)
returns table (service_date date, starts_at timestamptz, ends_at timestamptz, status text,
               minutes_per_game int, rounds jsonb, played_through int, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.service_date, s.starts_at, s.ends_at, s.status, q.minutes_per_game, q.rounds, q.played_through, q.updated_at
    from public.open_play_sessions s
    join public.open_play_queues q on q.session_id = s.id
   where s.code = upper(trim(p_code))
$$;

revoke execute on function public.save_open_play_queue(uuid, int, text[], jsonb, int) from public, anon;
revoke execute on function public.mark_open_play_queue_round(uuid, int) from public, anon;
revoke execute on function public.get_open_play_queue_public(text) from public, anon;
grant execute on function public.save_open_play_queue(uuid, int, text[], jsonb, int) to authenticated, service_role;
grant execute on function public.mark_open_play_queue_round(uuid, int) to authenticated, service_role;
grant execute on function public.get_open_play_queue_public(text) to service_role;
