-- Dink (AI booking assistant): run log and booking proposals.
-- No message text is stored. Writes happen only from the server (service role);
-- admins can read for the Analytics card. No anon access.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mode text not null default 'player' check (mode in ('player', 'staff', 'admin')),
  user_id uuid references auth.users,
  ip_hash text,
  steps int not null default 0,
  tools text[] not null default '{}',
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  latency_ms int,
  outcome text not null default 'pending'
    check (outcome in ('pending', 'answered', 'proposed', 'no_options', 'declined', 'limited', 'error')),
  error text
);
create index agent_runs_ip_idx on public.agent_runs (ip_hash, created_at desc);
create index agent_runs_created_idx on public.agent_runs (created_at desc);

create table public.agent_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs on delete cascade,
  court_id smallint not null references public.courts,
  slots timestamptz[] not null,
  total int not null,
  created_at timestamptz not null default now(),
  -- set when the player books these hours through the "Book these hours" link
  booking_ref text
);
create index agent_proposals_run_idx on public.agent_proposals (run_id);

alter table public.agent_runs enable row level security;
alter table public.agent_proposals enable row level security;

create policy agent_runs_admin_read on public.agent_runs for select to authenticated using (public.is_admin());
create policy agent_proposals_admin_read on public.agent_proposals for select to authenticated using (public.is_admin());

revoke all on public.agent_runs, public.agent_proposals from anon, authenticated;
grant select on public.agent_runs, public.agent_proposals to authenticated;
grant all on public.agent_runs, public.agent_proposals to service_role;
