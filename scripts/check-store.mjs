// Local-only checks for the store (POS) database functions.
// Usage: npm run check:store   (requires `supabase start`, migrations applied, and `npm run seed`)
// Creates "CHECK …" items and today's test activity, checks behaviour, then deletes what it made.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase env vars");
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Refusing to run checks against a non-local Supabase project");

const opts = { auth: { persistSession: false } };
const db = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);
const login = async (email, password) => {
  const c = createClient(url, anonKey, opts);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
};
const staff = await login("staff@serve.test", "ServeStaff#2026");
const admin = await login("admin@serve.test", "ServeAdmin#2026");

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "\n     ", e.message);
  }
}
async function ok(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}
async function expectError(promise, prefix) {
  const { error } = await promise;
  assert.ok(error, `expected an error starting with "${prefix}"`);
  assert.ok(error.message.startsWith(prefix), `expected "${prefix}…", got "${error.message}"`);
}

const { data: today } = await db.rpc("current_store_day");
const made = { items: [], sales: [], closes: [], cashOuts: [], bookings: [], sessions: [] };
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const itemSave = (client, f) =>
  client.rpc("admin_save_store_item", {
    p_id: f.id ?? null, p_name: f.name, p_kind: f.kind, p_price: f.price,
    p_serving_cost: f.serving_cost ?? null, p_low_stock_at: f.low ?? null, p_active: true, p_sort: 0,
  });
const onHand = async (id) => (await ok(admin.rpc("admin_store_stock"))).find((r) => r.id === id);
const sell = (client, lines, method = "cash") => client.rpc("store_create_sale", { p_lines: lines, p_method: method });

let gat, nachos;
// the checks sell today: set aside any local close of today and restore it afterwards
const { data: openCloses } = await db.from("store_daily_closes").select("id").eq("service_date", today).is("reopened_at", null);
const setAside = (openCloses ?? []).map((c) => c.id);
if (setAside.length) await db.from("store_daily_closes").update({ reopened_at: new Date().toISOString() }).in("id", setAside);

try {
  await test("admin manages items; staff can't", async () => {
    gat = await ok(itemSave(admin, { name: "CHECK Gatorade", kind: "shelf", price: 50, low: 5 }));
    nachos = await ok(itemSave(admin, { name: "CHECK Nachos", kind: "made_to_order", price: 80, serving_cost: 35 }));
    made.items.push(gat, nachos);
    await expectError(itemSave(staff, { name: "CHECK Nope", kind: "shelf", price: 1 }), "forbidden");
    const cat = await ok(staff.rpc("store_catalog"));
    const row = cat.find((r) => r.id === gat);
    assert.equal(row.price, 50);
    assert.ok(!("avg_cost" in row) && !("serving_cost" in row), "catalog must not expose costs");
  });

  await test("opening stock and restock set the average cost", async () => {
    await expectError(staff.rpc("store_add_stock", { p_item_id: gat, p_qty: 10, p_total_cost: 300, p_paid_from: "owner", p_opening: true }), "forbidden");
    await ok(admin.rpc("store_add_stock", { p_item_id: gat, p_qty: 10, p_total_cost: 300, p_paid_from: "owner", p_opening: true }));
    const n = await ok(staff.rpc("store_add_stock", { p_item_id: gat, p_qty: 10, p_total_cost: 400, p_paid_from: "owner", p_opening: false }));
    assert.equal(n, 20);
    const s = await onHand(gat);
    assert.equal(Number(s.avg_cost), 35);
    assert.equal(s.on_hand, 20);
  });

  let firstSale;
  await test("a sale takes stock and keeps the cost it was sold at", async () => {
    firstSale = await ok(sell(staff, [{ item_id: gat, qty: 2 }, { item_id: nachos, qty: 1 }]));
    made.sales.push(firstSale);
    const { data: sale } = await db.from("store_sales").select("total, service_date, payment_method").eq("id", firstSale).single();
    assert.equal(sale.total, 180);
    assert.equal(sale.service_date, today);
    assert.equal((await onHand(gat)).on_hand, 18);
    await ok(staff.rpc("store_add_stock", { p_item_id: gat, p_qty: 2, p_total_cost: 100, p_paid_from: "owner", p_opening: false }));
    assert.equal(Number((await onHand(gat)).avg_cost), 36.5);
    const { data: lines } = await db.from("store_sale_lines").select("item_id, unit_cost").eq("sale_id", firstSale);
    assert.equal(Number(lines.find((l) => l.item_id === gat).unit_cost), 35);
    assert.equal(Number(lines.find((l) => l.item_id === nachos).unit_cost), 35);
  });

  await test("staff can't read costs", async () => {
    assert.ok((await staff.from("store_items").select("avg_cost").limit(1)).error, "avg_cost readable by staff");
    assert.ok((await staff.from("store_sale_lines").select("unit_cost").limit(1)).error, "unit_cost readable by staff");
    assert.ok((await staff.from("store_stock_moves").select("total_cost").limit(1)).error, "total_cost readable by staff");
    await expectError(staff.rpc("admin_store_stock"), "forbidden");
    await expectError(staff.rpc("store_report", { p_from: today, p_to: today }), "forbidden");
    assert.ok((await anon.rpc("store_catalog")).error, "anon can call store_catalog");
    assert.ok((await anon.rpc("store_create_sale", { p_lines: [], p_method: "cash" })).error);
  });

  await test("corrections need a reason and can't go below zero", async () => {
    await expectError(staff.rpc("admin_correct_stock", { p_item_id: gat, p_qty: -1, p_reason: "expired" }), "forbidden");
    await expectError(admin.rpc("admin_correct_stock", { p_item_id: gat, p_qty: -1, p_reason: "" }), "invalid_reason");
    await expectError(admin.rpc("admin_correct_stock", { p_item_id: gat, p_qty: -999, p_reason: "count fix" }), "stock_below_zero");
    const left = (await onHand(gat)).on_hand;
    assert.equal(await ok(admin.rpc("admin_correct_stock", { p_item_id: gat, p_qty: 1 - left, p_reason: "count fix" })), 1);
  });

  await test("last unit race: one of five wins", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => sell(staff, [{ item_id: gat, qty: 1 }])));
    const wins = results.filter((r) => !r.error);
    for (const r of results) if (!r.error) made.sales.push(r.data);
    assert.equal(wins.length, 1, `expected 1 winner, got ${wins.length}`);
    for (const r of results.filter((r) => r.error)) assert.ok(r.error.message.startsWith("not_enough_stock:CHECK Gatorade:0"), r.error.message);
  });

  await test("cancel returns stock; staff can't cancel an earlier day's sale", async () => {
    const before = (await onHand(gat)).on_hand;
    await ok(admin.rpc("store_add_stock", { p_item_id: gat, p_qty: 5, p_total_cost: 200, p_paid_from: "owner", p_opening: false }));
    const s = await ok(sell(staff, [{ item_id: gat, qty: 3 }], "gcash"));
    made.sales.push(s);
    await ok(staff.rpc("store_cancel_sale", { p_sale_id: s, p_reason: "Wrong item" }));
    assert.equal((await onHand(gat)).on_hand, before + 5);
    const { data: old } = await db.from("store_sales").insert({ service_date: addDays(today, -1), payment_method: "cash", total: 50 }).select().single();
    made.sales.push(old.id);
    await expectError(staff.rpc("store_cancel_sale", { p_sale_id: old.id, p_reason: "x" }), "not_same_day");
  });

  await test("expected desk money includes walk-ins and subtracts cash-outs", async () => {
    const e0 = await ok(staff.rpc("store_day_expected", { p_date: today }));
    const s = await ok(sell(staff, [{ item_id: nachos, qty: 2 }], "cash"));
    made.sales.push(s);
    made.cashOuts.push(await ok(staff.rpc("store_cash_out", { p_amount: 50, p_reason: "CHECK ice" })));
    await ok(staff.rpc("store_add_stock", { p_item_id: gat, p_qty: 2, p_total_cost: 100, p_paid_from: "drawer", p_opening: false }));
    // a cash court walk-in recorded today, for a slot two weeks out
    const slot = new Date(`${addDays(today, 14)}T15:00:00+08:00`).toISOString();
    const ref = await ok(staff.rpc("create_booking", { p_court_id: 2, p_slots: [slot], p_player_name: "CHECK Walkin", p_mobile: null, p_email: null, p_source: "walk_in", p_payment_method: "cash", p_note: null }));
    made.bookings.push(ref);
    // an open play cash walk-in recorded today
    const code = await ok(staff.rpc("staff_create_open_play_session", { p_slots: [new Date(`${addDays(today, 15)}T09:00:00+08:00`).toISOString()], p_court_ids: [1], p_note: "CHECK" }));
    const { data: ses } = await db.from("open_play_sessions").select("id, fee_per_player").eq("code", code).single();
    made.sessions.push(ses.id);
    await ok(staff.rpc("staff_add_open_play_walkins", { p_session_id: ses.id, p_player_names: ["CHECK Walker"], p_payment_method: "cash", p_mobile: null }));
    const e1 = await ok(staff.rpc("store_day_expected", { p_date: today }));
    // the court booking is for a later day: it's paid when they play, so it isn't in today's cash
    assert.equal(e1.cash - e0.cash, 160 + ses.fee_per_player - 50 - 100);
    assert.equal(e1.breakdown.cash_outs - e0.breakdown.cash_outs, 150);
    assert.equal(e1.breakdown.court_walk_in.cash - e0.breakdown.court_walk_in.cash, 0);
    const later = await ok(staff.rpc("store_day_expected", { p_date: addDays(today, 14) }));
    assert.ok(later.breakdown.court_walk_in.cash >= 400, "walk-in counted on its play date");
  });

  await test("days with only walk-in money are flagged as not closed", async () => {
    const code = await ok(staff.rpc("staff_create_open_play_session", { p_slots: [new Date(`${addDays(today, 16)}T09:00:00+08:00`).toISOString()], p_court_ids: [1], p_note: "CHECK" }));
    const { data: ses } = await db.from("open_play_sessions").select("id").eq("code", code).single();
    made.sessions.push(ses.id);
    const ref = await ok(staff.rpc("staff_add_open_play_walkins", { p_session_id: ses.id, p_player_names: ["CHECK Early"], p_payment_method: "cash", p_mobile: null }));
    const old = new Date(`${addDays(today, -3)}T15:00:00+08:00`).toISOString();
    await db.from("open_play_payments").update({ created_at: old }).eq("ref", ref);
    // before the store existed, walk-in days aren't flagged
    let days = await ok(staff.rpc("store_unclosed_days"));
    const { data: firstItem } = await db.from("store_items").select("created_at").order("created_at").limit(1).single();
    if (firstItem.created_at > old) assert.ok(!days.includes(addDays(today, -3)), "flagged a day before the store started");
    // once the store started earlier, the walk-in day is flagged
    const realStart = firstItem.created_at;
    await db.from("store_items").update({ created_at: new Date(`${addDays(today, -10)}T10:00:00+08:00`).toISOString() }).eq("id", gat);
    days = await ok(staff.rpc("store_unclosed_days"));
    await db.from("store_items").update({ created_at: new Date().toISOString() }).eq("id", gat);
    assert.ok(days.includes(addDays(today, -3)), `expected ${addDays(today, -3)} in ${days}`);
    void realStart;
  });

  await test("closing locks the day until an admin reopens it", async () => {
    const c1 = await ok(staff.rpc("store_close_day", { p_date: today, p_cash: 0, p_gcash: 0, p_maya: 0, p_note: "CHECK" }));
    made.closes.push(c1);
    await expectError(staff.rpc("store_close_day", { p_date: today, p_cash: 0, p_gcash: 0, p_maya: 0, p_note: "CHECK" }), "already_closed");
    await expectError(sell(staff, [{ item_id: nachos, qty: 1 }]), "day_closed");
    await expectError(staff.rpc("admin_reopen_day", { p_close_id: c1 }), "forbidden");
    await ok(admin.rpc("admin_reopen_day", { p_close_id: c1 }));
    const s = await ok(sell(staff, [{ item_id: nachos, qty: 1 }]));
    made.sales.push(s);
    const c2 = await ok(staff.rpc("store_close_day", { p_date: today, p_cash: 10, p_gcash: 0, p_maya: 0, p_note: "CHECK" }));
    made.closes.push(c2);
    const { data: rows } = await db.from("store_daily_closes").select("id, reopened_at").eq("service_date", today).in("id", made.closes);
    assert.equal(rows.length, 2);
    assert.equal((await ok(staff.rpc("store_day_status", { p_date: today }))).closed, true);
    // money recorded after the close shows up as late money on the close
    const code = await ok(staff.rpc("staff_create_open_play_session", { p_slots: [new Date(`${addDays(today, 17)}T09:00:00+08:00`).toISOString()], p_court_ids: [1], p_note: "CHECK" }));
    const { data: ses } = await db.from("open_play_sessions").select("id, fee_per_player").eq("code", code).single();
    made.sessions.push(ses.id);
    await ok(staff.rpc("staff_add_open_play_walkins", { p_session_id: ses.id, p_player_names: ["CHECK Late"], p_payment_method: "cash", p_mobile: null }));
    const st = await ok(staff.rpc("store_day_status", { p_date: today }));
    assert.equal(st.late.cash, ses.fee_per_player, "late cash after close");
    assert.equal(st.late.gcash, 0);
    const alerts = await ok(staff.rpc("store_late_days"));
    assert.ok(alerts.includes(today), "late money flags the day");
    await ok(admin.rpc("admin_reopen_day", { p_close_id: c2 })); // leave today open for manual testing
  });

  await test("reports count store revenue and cost (admin only)", async () => {
    const sum = await ok(admin.rpc("report_summary", { p_from: today, p_to: today }));
    const { data: sales } = await db.from("store_sales").select("total").eq("service_date", today).eq("status", "completed");
    const revenue = sales.reduce((t, s) => t + s.total, 0);
    assert.equal(sum.store.reduce((t, r) => t + r.revenue, 0), revenue);
    const rep = await ok(admin.rpc("store_report", { p_from: today, p_to: today }));
    const g = rep.items.find((i) => i.item_id === gat);
    assert.ok(g && g.units >= 3, "gatorade units");
    assert.ok(rep.losses.length >= 1, "correction shows as a loss");
  });
} finally {
  if (made.items.length) {
    const { data: sl } = await db.from("store_sale_lines").select("sale_id").in("item_id", made.items);
    const saleIds = [...new Set([...(sl ?? []).map((r) => r.sale_id), ...made.sales])];
    await db.from("store_stock_moves").delete().in("item_id", made.items);
    if (saleIds.length) {
      await db.from("store_sale_lines").delete().in("sale_id", saleIds);
      await db.from("store_sales").delete().in("id", saleIds);
    }
    await db.from("store_items").delete().in("id", made.items);
  }
  await db.from("store_cash_outs").delete().or(`reason.like.CHECK%,reason.like.Restock: CHECK%`);
  if (made.closes.length) await db.from("store_daily_closes").delete().in("id", made.closes);
  if (made.bookings.length) await db.from("bookings").delete().in("ref", made.bookings);
  if (setAside.length) await db.from("store_daily_closes").update({ reopened_at: null }).in("id", setAside);
  if (made.sessions.length) {
    await db.from("blocked_slots").delete().in("session_id", made.sessions);
    await db.from("open_play_sessions").delete().in("id", made.sessions);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll store checks passed");
process.exitCode = failed ? 1 : 0;
