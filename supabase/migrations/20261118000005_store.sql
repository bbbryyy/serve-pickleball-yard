-- Store (simple POS): items, a running stock log, sales, cash-outs and daily closes.
-- Stock = sum of store_stock_moves. store_items.avg_cost is a moving-average cache
-- updated under the item's row lock. Costs are admin-only (column grants + RPCs).

-- ---------------------------------------------------------------- tables

create table public.store_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 60),
  kind text not null check (kind in ('shelf', 'made_to_order')),
  price int not null check (price > 0),
  serving_cost numeric(10,2) check (serving_cost is null or serving_cost >= 0),
  low_stock_at int check (low_stock_at is null or low_stock_at >= 0),
  avg_cost numeric(10,2) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (kind = 'shelf' or serving_cost is not null)
);

create table public.store_sales (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  payment_method text not null check (payment_method in ('cash', 'gcash', 'maya')),
  total int not null check (total >= 0),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  cancel_reason text,
  cancelled_by uuid references auth.users,
  cancelled_at timestamptz,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index store_sales_day_idx on public.store_sales (service_date, status);

create table public.store_sale_lines (
  sale_id uuid not null references public.store_sales on delete cascade,
  item_id uuid not null references public.store_items,
  qty int not null check (qty > 0),
  unit_price int not null,
  unit_cost numeric(10,2) not null,
  line_total int not null,
  primary key (sale_id, item_id)
);

create table public.store_stock_moves (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.store_items,
  kind text not null check (kind in ('opening', 'restock', 'sale', 'cancel', 'correction')),
  qty int not null check (qty <> 0),
  total_cost numeric(10,2),
  unit_cost numeric(10,2),
  paid_from text check (paid_from in ('drawer', 'owner', 'gcash', 'maya')),
  sale_id uuid references public.store_sales on delete cascade,
  reason text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index store_stock_moves_item_idx on public.store_stock_moves (item_id, created_at);

create table public.store_cash_outs (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  amount int not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 2 and 120),
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index store_cash_outs_day_idx on public.store_cash_outs (service_date);

-- several rows per day are allowed: the day is closed when its latest row isn't reopened
create table public.store_daily_closes (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  expected_cash int not null,
  expected_gcash int not null,
  expected_maya int not null,
  breakdown jsonb not null,
  counted_cash int not null check (counted_cash >= 0),
  counted_gcash int not null check (counted_gcash >= 0),
  counted_maya int not null check (counted_maya >= 0),
  note text,
  closed_by uuid references auth.users,
  closed_at timestamptz not null default now(),
  reopened_by uuid references auth.users,
  reopened_at timestamptz
);
create index store_daily_closes_day_idx on public.store_daily_closes (service_date, closed_at desc);

-- ---------------------------------------------------------------- helpers

create or replace function public.current_store_day() returns date
language sql stable security definer set search_path = '' as $$
  select public.current_service_date(s) from public.settings s
$$;

create or replace function public.store_day_closed(p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.store_daily_closes
                  where service_date = p_date and reopened_at is null)
$$;

create or replace function public.store_on_hand(p_item_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(qty), 0)::int from public.store_stock_moves where item_id = p_item_id
$$;

-- sales take a shared lock on the day, closing takes an exclusive one
create or replace function public.store_lock_day(p_date date, p_exclusive boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_exclusive then
    perform pg_advisory_xact_lock(hashtext('store_day:' || p_date::text));
  else
    perform pg_advisory_xact_lock_shared(hashtext('store_day:' || p_date::text));
  end if;
end $$;

-- ---------------------------------------------------------------- items and stock

create or replace function public.admin_save_store_item(
  p_id uuid, p_name text, p_kind text, p_price int, p_serving_cost numeric,
  p_low_stock_at int, p_active boolean, p_sort int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_id is null then
    insert into public.store_items (name, kind, price, serving_cost, low_stock_at, active, sort_order)
    values (trim(p_name), p_kind, p_price,
            case when p_kind = 'made_to_order' then p_serving_cost end,
            case when p_kind = 'shelf' then p_low_stock_at end,
            coalesce(p_active, true), coalesce(p_sort, 0))
    returning id into v_id;
  else
    update public.store_items
       set name = trim(p_name), price = p_price,
           serving_cost = case when kind = 'made_to_order' then p_serving_cost end,
           low_stock_at = case when kind = 'shelf' then p_low_stock_at end,
           active = coalesce(p_active, true), sort_order = coalesce(p_sort, 0)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'store_item_saved', jsonb_build_object('item_id', v_id, 'price', p_price));
  return v_id;
end $$;

-- What staff see: no costs.
create or replace function public.store_catalog()
returns table (id uuid, name text, kind text, price int, low_stock_at int, active boolean,
               sort_order int, on_hand int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  return query
  select i.id, i.name, i.kind, i.price, i.low_stock_at, i.active, i.sort_order,
         case when i.kind = 'shelf' then public.store_on_hand(i.id) end
    from public.store_items i
   order by i.sort_order, i.name;
end $$;

create or replace function public.admin_store_stock()
returns table (id uuid, name text, kind text, price int, serving_cost numeric, avg_cost numeric,
               on_hand int, low_stock_at int, active boolean, sort_order int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select i.id, i.name, i.kind, i.price, i.serving_cost, i.avg_cost,
         case when i.kind = 'shelf' then public.store_on_hand(i.id) end,
         i.low_stock_at, i.active, i.sort_order
    from public.store_items i
   order by i.sort_order, i.name;
end $$;

-- Restock (staff) or opening stock (admin). Returns the new count only.
create or replace function public.store_add_stock(
  p_item_id uuid, p_qty int, p_total_cost int, p_paid_from text, p_opening boolean default false
) returns int
language plpgsql security definer set search_path = '' as $$
declare i public.store_items; v_on_hand int; v_day date := public.current_store_day();
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_opening and not public.is_admin() then raise exception 'forbidden'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'invalid_qty'; end if;
  if p_total_cost is null or p_total_cost < 0 then raise exception 'invalid_cost'; end if;
  if p_paid_from not in ('drawer', 'owner', 'gcash', 'maya') then raise exception 'invalid_paid_from'; end if;
  select * into i from public.store_items where id = p_item_id for update;
  if not found then raise exception 'not_found'; end if;
  if i.kind <> 'shelf' then raise exception 'not_shelf_item'; end if;
  if p_paid_from = 'drawer' then
    perform public.store_lock_day(v_day, false);
    if public.store_day_closed(v_day) then raise exception 'day_closed'; end if;
  end if;

  v_on_hand := public.store_on_hand(i.id);
  update public.store_items
     set avg_cost = case when v_on_hand <= 0 then round(p_total_cost::numeric / p_qty, 2)
                         else round((v_on_hand * avg_cost + p_total_cost) / (v_on_hand + p_qty), 2) end
   where id = i.id;
  insert into public.store_stock_moves (item_id, kind, qty, total_cost, paid_from, created_by)
  values (i.id, case when p_opening then 'opening' else 'restock' end, p_qty, p_total_cost, p_paid_from, auth.uid());
  if p_paid_from = 'drawer' and p_total_cost > 0 then
    insert into public.store_cash_outs (service_date, amount, reason, created_by)
    values (v_day, p_total_cost, left('Restock: ' || i.name, 120), auth.uid());
  end if;
  return v_on_hand + p_qty;
end $$;

create or replace function public.admin_correct_stock(p_item_id uuid, p_qty int, p_reason text) returns int
language plpgsql security definer set search_path = '' as $$
declare i public.store_items; v_on_hand int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if coalesce(p_reason, '') not in ('expired', 'damaged', 'given away', 'count fix') then
    raise exception 'invalid_reason';
  end if;
  if p_qty is null or p_qty = 0 then raise exception 'invalid_qty'; end if;
  select * into i from public.store_items where id = p_item_id for update;
  if not found then raise exception 'not_found'; end if;
  if i.kind <> 'shelf' then raise exception 'not_shelf_item'; end if;
  v_on_hand := public.store_on_hand(i.id);
  if v_on_hand + p_qty < 0 then raise exception 'stock_below_zero'; end if;
  insert into public.store_stock_moves (item_id, kind, qty, unit_cost, reason, created_by)
  values (i.id, 'correction', p_qty, i.avg_cost, p_reason, auth.uid());
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'store_stock_corrected', jsonb_build_object('item_id', i.id, 'qty', p_qty, 'reason', p_reason));
  return v_on_hand + p_qty;
end $$;

-- ---------------------------------------------------------------- sales

-- p_lines: [{"item_id": "...", "qty": 2}, ...]
create or replace function public.store_create_sale(p_lines jsonb, p_method text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := public.current_store_day();
  v_sale uuid;
  v_total int := 0;
  v_items int;
  v_bad int;
  v_found int := 0;
  r record;
  v_on_hand int;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_method not in ('cash', 'gcash', 'maya') then raise exception 'invalid_method'; end if;
  perform public.store_lock_day(v_day, false);
  if public.store_day_closed(v_day) then raise exception 'day_closed'; end if;

  select count(distinct x->>'item_id'), count(*) filter (where coalesce((x->>'qty')::int, 0) <= 0)
    into v_items, v_bad
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x;
  if v_items = 0 then raise exception 'no_items'; end if;
  if v_bad > 0 then raise exception 'invalid_qty'; end if;

  insert into public.store_sales (service_date, payment_method, total, created_by)
  values (v_day, p_method, 0, auth.uid()) returning id into v_sale;

  -- lock items in a fixed order so two phones can't sell the same last unit
  for r in
    select i.*, c.want
      from (select (x->>'item_id')::uuid as item_id, sum((x->>'qty')::int)::int as want
              from jsonb_array_elements(p_lines) x group by 1) c
      join public.store_items i on i.id = c.item_id
     order by i.id
       for update of i
  loop
    v_found := v_found + 1;
    if not r.active then raise exception 'item_inactive:%', r.name; end if;
    if r.kind = 'shelf' then
      v_on_hand := public.store_on_hand(r.id);
      if r.want > v_on_hand then raise exception 'not_enough_stock:%:%', r.name, v_on_hand; end if;
      insert into public.store_stock_moves (item_id, kind, qty, unit_cost, sale_id, created_by)
      values (r.id, 'sale', -r.want, r.avg_cost, v_sale, auth.uid());
    end if;
    insert into public.store_sale_lines (sale_id, item_id, qty, unit_price, unit_cost, line_total)
    values (v_sale, r.id, r.want, r.price,
            case when r.kind = 'shelf' then r.avg_cost else r.serving_cost end, r.want * r.price);
    v_total := v_total + r.want * r.price;
  end loop;
  if v_found <> v_items then raise exception 'not_found'; end if;

  update public.store_sales set total = v_total where id = v_sale;
  return v_sale;
end $$;

create or replace function public.store_cancel_sale(p_sale_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.store_sales;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into s from public.store_sales where id = p_sale_id for update;
  if not found then raise exception 'not_found'; end if;
  if s.status <> 'completed' then raise exception 'invalid_status:%', s.status; end if;
  perform public.store_lock_day(s.service_date, false);
  if public.store_day_closed(s.service_date) then raise exception 'day_closed'; end if;
  if s.service_date <> public.current_store_day() and not public.is_admin() then
    raise exception 'not_same_day';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  update public.store_sales
     set status = 'cancelled', cancel_reason = trim(p_reason), cancelled_by = auth.uid(), cancelled_at = now()
   where id = s.id;
  insert into public.store_stock_moves (item_id, kind, qty, unit_cost, sale_id, created_by)
  select l.item_id, 'cancel', l.qty, l.unit_cost, s.id, auth.uid()
    from public.store_sale_lines l join public.store_items i on i.id = l.item_id
   where l.sale_id = s.id and i.kind = 'shelf';
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'store_sale_cancelled', jsonb_build_object('sale_id', s.id, 'total', s.total, 'reason', p_reason));
end $$;

create or replace function public.store_cash_out(p_amount int, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_day date := public.current_store_day(); v_id uuid;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then raise exception 'reason_required'; end if;
  perform public.store_lock_day(v_day, false);
  if public.store_day_closed(v_day) then raise exception 'day_closed'; end if;
  insert into public.store_cash_outs (service_date, amount, reason, created_by)
  values (v_day, p_amount, trim(p_reason), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- daily close

-- All money taken at the desk for a service day, by method and source.
create or replace function public.store_day_expected(p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.settings;
  st jsonb; cw jsonb; ow jsonb; oc jsonb; oo jsonb; v_out int;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into s from public.settings;

  select jsonb_build_object(
           'cash',  coalesce(sum(total) filter (where payment_method = 'cash'), 0),
           'gcash', coalesce(sum(total) filter (where payment_method = 'gcash'), 0),
           'maya',  coalesce(sum(total) filter (where payment_method = 'maya'), 0))
    into st from public.store_sales where service_date = p_date and status = 'completed';

  select jsonb_build_object(
           'cash',  coalesce(sum(total_amount) filter (where coalesce(payment_method, 'cash') = 'cash'), 0),
           'gcash', coalesce(sum(total_amount) filter (where payment_method = 'gcash'), 0),
           'maya',  coalesce(sum(total_amount) filter (where payment_method = 'maya'), 0))
    into cw from public.bookings b
   where b.source = 'walk_in' and b.status = 'confirmed'
     and (public.service_slot(date_trunc('hour', b.created_at), s)).service_date = p_date;

  select jsonb_build_object(
           'cash',  coalesce(sum(total_amount) filter (where payment_method = 'cash'), 0),
           'gcash', coalesce(sum(total_amount) filter (where payment_method = 'gcash'), 0),
           'maya',  coalesce(sum(total_amount) filter (where payment_method = 'maya'), 0))
    into ow from public.open_play_payments p
   where p.source = 'walk_in' and p.verified_at is not null
     and p.status in ('confirmed', 'refund_owed', 'refunded')
     and (public.service_slot(date_trunc('hour', p.created_at), s)).service_date = p_date;

  select jsonb_build_object(
           'gcash', coalesce(sum(total_amount) filter (where payment_method = 'gcash'), 0),
           'maya',  coalesce(sum(total_amount) filter (where payment_method = 'maya'), 0))
    into oc from public.bookings b
   where b.source = 'online' and b.status = 'confirmed' and b.verified_at is not null
     and (public.service_slot(date_trunc('hour', b.verified_at), s)).service_date = p_date;

  select jsonb_build_object(
           'gcash', coalesce(sum(total_amount) filter (where payment_method = 'gcash'), 0),
           'maya',  coalesce(sum(total_amount) filter (where payment_method = 'maya'), 0))
    into oo from public.open_play_payments p
   where p.source = 'online' and p.verified_at is not null
     and p.status in ('confirmed', 'refund_owed', 'refunded')
     and (public.service_slot(date_trunc('hour', p.verified_at), s)).service_date = p_date;

  select coalesce(sum(amount), 0)::int into v_out from public.store_cash_outs where service_date = p_date;

  return jsonb_build_object(
    'cash',  (st->>'cash')::int + (cw->>'cash')::int + (ow->>'cash')::int - v_out,
    'gcash', (st->>'gcash')::int + (cw->>'gcash')::int + (ow->>'gcash')::int + (oc->>'gcash')::int + (oo->>'gcash')::int,
    'maya',  (st->>'maya')::int + (cw->>'maya')::int + (ow->>'maya')::int + (oc->>'maya')::int + (oo->>'maya')::int,
    'breakdown', jsonb_build_object('store', st, 'court_walk_in', cw, 'open_play_walk_in', ow,
                                    'online_court', oc, 'online_open_play', oo, 'cash_outs', v_out));
end $$;

create or replace function public.store_day_status(p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.store_daily_closes;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select * into c from public.store_daily_closes
   where service_date = p_date and reopened_at is null order by closed_at desc limit 1;
  return jsonb_build_object('closed', c.id is not null, 'close', case when c.id is not null then to_jsonb(c) end);
end $$;

-- Earlier days (last 30) with desk activity that nobody closed.
create or replace function public.store_unclosed_days() returns date[]
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := public.current_store_day(); v date[];
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select coalesce(array_agg(d order by d), '{}') into v from (
    select distinct service_date d from public.store_sales
     where service_date between v_today - 30 and v_today - 1
    union
    select distinct service_date from public.store_cash_outs
     where service_date between v_today - 30 and v_today - 1
  ) x where not public.store_day_closed(x.d);
  return v;
end $$;

create or replace function public.store_close_day(p_date date, p_cash int, p_gcash int, p_maya int, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare e jsonb; v_id uuid;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if p_date > public.current_store_day() then raise exception 'invalid_date'; end if;
  perform public.store_lock_day(p_date, true);
  if public.store_day_closed(p_date) then raise exception 'already_closed'; end if;
  e := public.store_day_expected(p_date);
  insert into public.store_daily_closes (service_date, expected_cash, expected_gcash, expected_maya, breakdown,
                                         counted_cash, counted_gcash, counted_maya, note, closed_by)
  values (p_date, (e->>'cash')::int, (e->>'gcash')::int, (e->>'maya')::int, e->'breakdown',
          p_cash, p_gcash, p_maya, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'store_day_closed', jsonb_build_object('close_id', v_id, 'date', p_date,
          'cash_diff', p_cash - (e->>'cash')::int, 'gcash_diff', p_gcash - (e->>'gcash')::int,
          'maya_diff', p_maya - (e->>'maya')::int));
  return v_id;
end $$;

create or replace function public.admin_reopen_day(p_close_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.store_daily_closes;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into c from public.store_daily_closes where id = p_close_id for update;
  if not found then raise exception 'not_found'; end if;
  if c.reopened_at is not null then raise exception 'invalid_status:reopened'; end if;
  update public.store_daily_closes set reopened_by = auth.uid(), reopened_at = now() where id = c.id;
  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'store_day_reopened', jsonb_build_object('close_id', c.id, 'date', c.service_date));
end $$;

-- ---------------------------------------------------------------- reports (admin)

create or replace function public.store_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.settings;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into s from public.settings;
  return jsonb_build_object(
    'daily', coalesce((select jsonb_agg(d order by d.date) from (
        select ss.service_date as date, ss.payment_method as method,
               sum(l.line_total)::int as revenue, round(sum(l.qty * l.unit_cost), 2) as cost
          from public.store_sales ss join public.store_sale_lines l on l.sale_id = ss.id
         where ss.status = 'completed' and ss.service_date between p_from and p_to
         group by 1, 2) d), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(x order by x.revenue desc) from (
        select i.id as item_id, i.name, i.kind, sum(l.qty)::int as units, sum(l.line_total)::int as revenue,
               round(sum(l.qty * l.unit_cost), 2) as cost
          from public.store_sales ss join public.store_sale_lines l on l.sale_id = ss.id
          join public.store_items i on i.id = l.item_id
         where ss.status = 'completed' and ss.service_date between p_from and p_to
         group by 1, 2, 3) x), '[]'::jsonb),
    'losses', coalesce((select jsonb_agg(x order by x.date) from (
        select (public.service_slot(date_trunc('hour', m.created_at), s)).service_date as date,
               i.name as item, -m.qty as qty, m.reason, round(-m.qty * coalesce(m.unit_cost, 0), 2) as cost
          from public.store_stock_moves m join public.store_items i on i.id = m.item_id
         where m.kind = 'correction' and m.qty < 0
           and (public.service_slot(date_trunc('hour', m.created_at), s)).service_date between p_from and p_to) x),
      '[]'::jsonb),
    'low_stock', coalesce((select jsonb_agg(x order by x.on_hand) from (
        select i.name, public.store_on_hand(i.id) as on_hand, i.low_stock_at
          from public.store_items i
         where i.kind = 'shelf' and i.active and i.low_stock_at is not null
           and public.store_on_hand(i.id) <= i.low_stock_at) x), '[]'::jsonb)
  );
end $$;

-- report_summary: unchanged court rental and open play keys, plus store revenue and cost by day and method.
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
    'refunds_owed', (select count(*) from public.open_play_payments where status = 'refund_owed'),
    'store', coalesce((select jsonb_agg(x) from (
        select ss.service_date as date, ss.payment_method as method,
               sum(l.line_total)::int as revenue, round(sum(l.qty * l.unit_cost), 2) as cost
          from public.store_sales ss join public.store_sale_lines l on l.sale_id = ss.id
         where ss.status = 'completed' and ss.service_date between p_from and p_to
         group by 1, 2 order by 1) x), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------- RLS and grants

alter table public.store_items enable row level security;
alter table public.store_sales enable row level security;
alter table public.store_sale_lines enable row level security;
alter table public.store_stock_moves enable row level security;
alter table public.store_cash_outs enable row level security;
alter table public.store_daily_closes enable row level security;

create policy store_items_staff_read on public.store_items for select to authenticated using (public.is_staff());
create policy store_sales_staff_read on public.store_sales for select to authenticated using (public.is_staff());
create policy store_sale_lines_staff_read on public.store_sale_lines for select to authenticated using (public.is_staff());
create policy store_stock_moves_staff_read on public.store_stock_moves for select to authenticated using (public.is_staff());
create policy store_cash_outs_staff_read on public.store_cash_outs for select to authenticated using (public.is_staff());
create policy store_daily_closes_staff_read on public.store_daily_closes for select to authenticated using (public.is_staff());

revoke all on public.store_items, public.store_sales, public.store_sale_lines, public.store_stock_moves,
              public.store_cash_outs, public.store_daily_closes from anon, authenticated;
grant all on public.store_items, public.store_sales, public.store_sale_lines, public.store_stock_moves,
             public.store_cash_outs, public.store_daily_closes to service_role;
-- staff can read everything except costs (admins read costs through admin RPCs)
grant select (id, name, kind, price, low_stock_at, active, sort_order, created_at) on public.store_items to authenticated;
grant select (sale_id, item_id, qty, unit_price, line_total) on public.store_sale_lines to authenticated;
grant select (id, item_id, kind, qty, paid_from, sale_id, reason, created_by, created_at) on public.store_stock_moves to authenticated;
grant select on public.store_sales, public.store_cash_outs, public.store_daily_closes to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.open_play_insert_players(uuid, text[]) from authenticated;
revoke execute on function public.open_play_reserve_court(uuid, smallint, timestamptz[]) from authenticated;
revoke execute on function public.open_play_lock_open_session(uuid) from authenticated;
revoke execute on function public.store_lock_day(date, boolean) from authenticated;
