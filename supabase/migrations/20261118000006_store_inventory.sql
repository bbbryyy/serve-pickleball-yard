-- Store inventory: item photo and description, one item form that also sets the
-- stock count and item cost, and restocks moved to admins (Inventory page).

alter table public.store_items
  add column description text check (description is null or length(description) <= 200),
  add column image_path text;

-- public bucket for item photos shown on the POS tiles
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-images', 'store-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

grant select (description, image_path) on public.store_items to authenticated;

-- One save for the Inventory form.
-- New shelf item: p_in_stock becomes opening stock at p_cost each; p_cost is the item cost.
-- Existing shelf item: a different p_in_stock is saved as a "count fix" correction;
--   a different p_cost replaces the average cost (later restocks average from it).
-- Made to order: p_cost is the cost per serving; no stock.
drop function if exists public.admin_save_store_item(uuid, text, text, int, numeric, int, boolean, int);

create function public.admin_save_store_item(
  p_id uuid, p_name text, p_kind text, p_price int, p_cost numeric, p_low_stock_at int,
  p_in_stock int, p_description text, p_image_path text, p_active boolean, p_sort int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.store_items; v_id uuid; v_on_hand int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_cost is not null and p_cost < 0 then raise exception 'invalid_cost'; end if;
  if p_in_stock is not null and p_in_stock < 0 then raise exception 'stock_below_zero'; end if;

  if p_id is null then
    if p_kind = 'made_to_order' and p_cost is null then raise exception 'invalid_cost'; end if;
    insert into public.store_items (name, kind, price, serving_cost, low_stock_at, avg_cost, description,
                                    image_path, active, sort_order)
    values (trim(p_name), p_kind, p_price,
            case when p_kind = 'made_to_order' then p_cost end,
            case when p_kind = 'shelf' then p_low_stock_at end,
            case when p_kind = 'shelf' then coalesce(p_cost, 0) else 0 end,
            nullif(trim(p_description), ''), nullif(p_image_path, ''),
            coalesce(p_active, true), coalesce(p_sort, 0))
    returning id into v_id;
    if p_kind = 'shelf' and coalesce(p_in_stock, 0) > 0 then
      insert into public.store_stock_moves (item_id, kind, qty, total_cost, paid_from, created_by)
      values (v_id, 'opening', p_in_stock, round(p_in_stock * coalesce(p_cost, 0), 2), 'owner', auth.uid());
    end if;
  else
    select * into i from public.store_items where id = p_id for update;
    if not found then raise exception 'not_found'; end if;
    update public.store_items
       set name = trim(p_name), price = p_price,
           serving_cost = case when kind = 'made_to_order' then coalesce(p_cost, serving_cost) end,
           low_stock_at = case when kind = 'shelf' then p_low_stock_at end,
           avg_cost = case when kind = 'shelf' and p_cost is not null then round(p_cost, 2) else avg_cost end,
           description = nullif(trim(p_description), ''),
           image_path = coalesce(nullif(p_image_path, ''), image_path),
           active = coalesce(p_active, true), sort_order = coalesce(p_sort, 0)
     where id = i.id;
    v_id := i.id;
    if i.kind = 'shelf' and p_in_stock is not null then
      v_on_hand := public.store_on_hand(i.id);
      if p_in_stock <> v_on_hand then
        insert into public.store_stock_moves (item_id, kind, qty, unit_cost, reason, created_by)
        values (i.id, 'correction', p_in_stock - v_on_hand, coalesce(round(p_cost, 2), i.avg_cost), 'count fix', auth.uid());
      end if;
    end if;
  end if;

  insert into public.audit_log (actor_id, action, detail)
  values (auth.uid(), 'store_item_saved', jsonb_build_object('item_id', v_id, 'price', p_price, 'cost', p_cost, 'in_stock', p_in_stock));
  return v_id;
end $$;

-- Restocks are recorded in Inventory, by admins.
create or replace function public.store_add_stock(
  p_item_id uuid, p_qty int, p_total_cost int, p_paid_from text, p_opening boolean default false
) returns int
language plpgsql security definer set search_path = '' as $$
declare i public.store_items; v_on_hand int; v_day date := public.current_store_day();
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'invalid_qty'; end if;
  if p_total_cost is null or p_total_cost < 0 then raise exception 'invalid_cost'; end if;
  if p_paid_from not in ('drawer', 'owner', 'gcash', 'maya') then raise exception 'invalid_paid_from'; end if;
  if p_paid_from = 'drawer' then
    perform public.store_lock_day(v_day, false);
    if public.store_day_closed(v_day) then raise exception 'day_closed'; end if;
  end if;
  select * into i from public.store_items where id = p_item_id for update;
  if not found then raise exception 'not_found'; end if;
  if i.kind <> 'shelf' then raise exception 'not_shelf_item'; end if;

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

-- POS tiles: add photo and description (still no costs).
drop function if exists public.store_catalog();
create function public.store_catalog()
returns table (id uuid, name text, kind text, price int, low_stock_at int, active boolean,
               sort_order int, on_hand int, description text, image_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  return query
  select i.id, i.name, i.kind, i.price, i.low_stock_at, i.active, i.sort_order,
         case when i.kind = 'shelf' then public.store_on_hand(i.id) end,
         i.description, i.image_path
    from public.store_items i
   order by i.sort_order, i.name;
end $$;

drop function if exists public.admin_store_stock();
create function public.admin_store_stock()
returns table (id uuid, name text, kind text, price int, serving_cost numeric, avg_cost numeric,
               on_hand int, low_stock_at int, active boolean, sort_order int, description text, image_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select i.id, i.name, i.kind, i.price, i.serving_cost, i.avg_cost,
         case when i.kind = 'shelf' then public.store_on_hand(i.id) end,
         i.low_stock_at, i.active, i.sort_order, i.description, i.image_path
    from public.store_items i
   order by i.sort_order, i.name;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.open_play_insert_players(uuid, text[]) from authenticated;
revoke execute on function public.open_play_reserve_court(uuid, smallint, timestamptz[]) from authenticated;
revoke execute on function public.open_play_lock_open_session(uuid) from authenticated;
revoke execute on function public.store_lock_day(date, boolean) from authenticated;
