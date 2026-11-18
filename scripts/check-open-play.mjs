// Local-only checks for the Open Play database functions.
// Usage: npm run check:open-play   (requires `supabase start`, migrations applied, and `npm run seed`)
// Creates test sessions two weeks ahead, checks behaviour, then deletes everything it made.
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

// ---- helpers
const pad = (n) => String(n).padStart(2, "0");
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const manilaToday = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
/** Manila ISO hour starts for service date `date`, hours [from, to) — hours >= 24 roll into the next day. */
function slots(date, from, to) {
  const out = [];
  for (let h = from; h < to; h++) {
    const d = h >= 24 ? addDays(date, 1) : date;
    out.push(new Date(`${d}T${pad(h % 24)}:00:00+08:00`).toISOString());
  }
  return out;
}
const iso = (s) => new Date(s).toISOString();

const createdSessions = [];
const looseBlocks = []; // [court, slot] blocks made outside sessions
async function newSession(client, slotList, courts) {
  const { data, error } = await client.rpc("staff_create_open_play_session", { p_slots: slotList, p_court_ids: courts, p_note: "CHECK" });
  if (error) throw new Error(error.message);
  const { data: s } = await db.from("open_play_sessions").select("*").eq("code", data).single();
  createdSessions.push(s.id);
  return s;
}
async function limitOf(id) {
  const { data, error } = await db.rpc("open_play_limit", { p_session_id: id });
  if (error) throw new Error(error.message);
  return data;
}
async function expectError(promise, prefix) {
  const { error } = await promise;
  assert.ok(error, `expected an error starting with "${prefix}"`);
  assert.ok(error.message.startsWith(prefix), `expected "${prefix}…", got "${error.message}"`);
}

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

const D = addDays(manilaToday, 14);
const D2 = addDays(manilaToday, 15);
const D3 = addDays(manilaToday, 16);
const D4 = addDays(manilaToday, 17);

const { data: settingsBefore } = await db.from("settings").select("open_play_fee, open_play_players_per_court").single();

try {
  // ================================================================ Task 1: sessions
  await test("create session blocks court-hours and copies fee/limit", async () => {
    const s = await newSession(staff, slots(D, 18, 22), [1, 2]);
    const { data: blocks } = await db.from("blocked_slots").select("kind, session_id").eq("session_id", s.id);
    assert.equal(blocks.length, 8);
    assert.ok(blocks.every((b) => b.kind === "open_play"));
    assert.equal(s.fee_per_player, 120);
    assert.equal(s.players_per_court, 12);
    assert.equal(await limitOf(s.id), 24);
    assert.equal(s.service_date, D);
    assert.equal(iso(s.starts_at), slots(D, 18, 19)[0]);
    assert.equal(iso(s.ends_at), slots(D, 22, 23)[0]);
  });

  await test("late-night session belongs to the evening's service date", async () => {
    const s = await newSession(staff, slots(D2, 22, 25), [1]);
    assert.equal(s.service_date, D2);
    assert.equal(iso(s.ends_at), new Date(`${addDays(D2, 1)}T01:00:00+08:00`).toISOString());
  });

  await test("fee change does not touch existing sessions", async () => {
    const before = await newSession(staff, slots(D2, 9, 10), [2]);
    const { error } = await admin.from("settings").update({ open_play_fee: 150 }).eq("id", true);
    assert.ifError(error);
    const after = await newSession(staff, slots(D2, 10, 11), [2]);
    const { data: again } = await db.from("open_play_sessions").select("fee_per_player").eq("id", before.id).single();
    assert.equal(again.fee_per_player, 120);
    assert.equal(after.fee_per_player, 150);
    await db.from("settings").update({ open_play_fee: settingsBefore.open_play_fee }).eq("id", true);
  });

  await test("adopts free-standing open play marks, refuses bookings and plain blocks", async () => {
    const mark = slots(D3, 9, 10);
    let r = await staff.rpc("staff_block_slots", { p_court_id: 1, p_slots: mark, p_reason: "x", p_kind: "open_play" });
    assert.ifError(r.error);
    looseBlocks.push([1, mark[0]]);
    const s = await newSession(staff, slots(D3, 9, 11), [1]);
    const { data: adopted } = await db.from("blocked_slots").select("session_id").eq("court_id", 1).eq("slot_start", mark[0]).single();
    assert.equal(adopted.session_id, s.id);

    const plain = slots(D3, 12, 13);
    r = await staff.rpc("staff_block_slots", { p_court_id: 2, p_slots: plain, p_reason: "x", p_kind: "blocked" });
    assert.ifError(r.error);
    looseBlocks.push([2, plain[0]]);
    await expectError(staff.rpc("staff_create_open_play_session", { p_slots: plain, p_court_ids: [2], p_note: "CHECK" }), "slot_taken");
  });

  await test("add a court raises the limit", async () => {
    const s = await newSession(staff, slots(D4, 18, 22), [1]);
    assert.equal(await limitOf(s.id), 12);
    const { error } = await staff.rpc("staff_add_open_play_court", { p_session_id: s.id, p_court_id: 2 });
    assert.ifError(error);
    assert.equal(await limitOf(s.id), 24);
    const { count } = await db.from("blocked_slots").select("id", { count: "exact", head: true }).eq("session_id", s.id);
    assert.equal(count, 8);
  });

  await test("schedule cannot unblock session hours", async () => {
    const s = await newSession(staff, slots(D4, 9, 10), [1]);
    await expectError(staff.rpc("staff_unblock_slots", { p_court_id: 1, p_slots: [iso(s.starts_at)] }), "session_slot");
  });

  await test("non-contiguous or invalid slots are refused", async () => {
    const gap = [...slots(D4, 12, 13), ...slots(D4, 14, 15)];
    await expectError(staff.rpc("staff_create_open_play_session", { p_slots: gap, p_court_ids: [1], p_note: "CHECK" }), "not_contiguous");
    const past = slots(addDays(manilaToday, -2), 12, 13);
    await expectError(staff.rpc("staff_create_open_play_session", { p_slots: past, p_court_ids: [1], p_note: "CHECK" }), "slot_invalid:past");
  });

  await test("anon cannot call session RPCs", async () => {
    const { error } = await anon.rpc("staff_create_open_play_session", { p_slots: slots(D4, 15, 16), p_court_ids: [1], p_note: "CHECK" });
    assert.ok(error, "anon call should fail");
  });

  // ================================================================ Task 2: payments
  const D5 = addDays(manilaToday, 18);
  const names = (n, prefix = "Player") => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
  const pay = (code, playerNames, mobile = "09171234567") =>
    db.rpc("create_open_play_payment", { p_code: code, p_player_names: playerNames, p_mobile: mobile, p_email: null });
  async function payOk(code, playerNames) {
    const { data, error } = await pay(code, playerNames);
    if (error) throw new Error(error.message);
    const { data: p } = await db.from("open_play_payments").select("*").eq("ref", data).single();
    return p;
  }
  const publicSession = async (code) => (await db.rpc("get_open_play_public", { p_code: code })).data?.[0];
  const held = async (id) => (await db.rpc("open_play_held", { p_session_id: id })).data;

  await test("payment holds spots and totals from the session fee", async () => {
    const s = await newSession(staff, slots(D5, 9, 10), [1]);
    const p = await payOk(s.code, ["Juan Dela Cruz", "Ana Reyes", "Mark Santos"]);
    assert.match(p.ref, /^SPY-OP-[A-Z2-9]{6}$/);
    assert.equal(p.total_amount, 360);
    assert.equal(p.status, "pending_payment");
    assert.equal(await held(s.id), 3);
    const pub = await publicSession(s.code);
    assert.equal(pub.spots_left, 9);
    assert.equal(pub.state, "open");
    const { data: players } = await db.from("open_play_players").select("name").eq("payment_id", p.id).order("position");
    assert.deepEqual(players.map((x) => x.name), ["Juan Dela Cruz", "Ana Reyes", "Mark Santos"]);
  });

  await test("last spot race: one of five wins", async () => {
    const s = await newSession(staff, slots(D5, 10, 11), [1]);
    await payOk(s.code, names(11));
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => pay(s.code, [`Racer ${i + 1}`])));
    const ok = results.filter((r) => !r.error);
    assert.equal(ok.length, 1, `expected 1 winner, got ${ok.length}`);
    for (const r of results.filter((r) => r.error)) assert.ok(r.error.message.startsWith("not_enough_spots:0"), r.error.message);
    assert.equal((await publicSession(s.code)).state, "full");
  });

  await test("group larger than spots left is refused", async () => {
    const s = await newSession(staff, slots(D5, 11, 12), [1]);
    await payOk(s.code, names(10));
    await expectError(pay(s.code, names(3)), "not_enough_spots:2");
    await expectError(pay(s.code, names(13)), "too_many_players");
    await expectError(pay(s.code, []), "too_many_players");
  });

  await test("closed, cancelled and unknown sessions refuse payments", async () => {
    const { data: code1 } = await db.rpc("new_open_play_code");
    const { data: closed } = await db.from("open_play_sessions").insert({
      code: code1, service_date: manilaToday, starts_at: new Date(Date.now() - 3600e3).toISOString(),
      ends_at: new Date(Date.now() + 3600e3).toISOString(), fee_per_player: 120, players_per_court: 12, note: "CHECK",
    }).select().single();
    createdSessions.push(closed.id);
    await db.from("open_play_session_courts").insert({ session_id: closed.id, court_id: 1 });
    assert.equal((await publicSession(code1)).state, "closed");
    await expectError(pay(code1, ["Late Comer"]), "session_closed");

    const s = await newSession(staff, slots(D5, 12, 13), [1]);
    await db.from("open_play_sessions").update({ status: "cancelled" }).eq("id", s.id);
    assert.equal((await publicSession(s.code)).state, "cancelled");
    await expectError(pay(s.code, ["Some One"]), "session_cancelled");
    await expectError(pay("NOPE00", ["Some One"]), "not_found");
  });

  await test("proof moves to for_verification; lapsed hold is refused", async () => {
    const s = await newSession(staff, slots(D5, 13, 14), [1]);
    const p = await payOk(s.code, ["Liza Cruz"]);
    let r = await db.rpc("submit_open_play_payment", { p_ref: p.ref, p_method: "maya", p_payment_ref_no: "123456", p_proof_path: `${p.ref}/x.png` });
    assert.ifError(r.error);
    const { data: after } = await db.from("open_play_payments").select("status, payment_method").eq("id", p.id).single();
    assert.equal(after.status, "for_verification");
    assert.equal(after.payment_method, "maya");

    const late = await payOk(s.code, ["Paolo Gomez"]);
    await db.from("open_play_payments").update({ hold_expires_at: new Date(Date.now() - 60e3).toISOString() }).eq("id", late.id);
    await expectError(db.rpc("submit_open_play_payment", { p_ref: late.ref, p_method: "gcash", p_payment_ref_no: "123456", p_proof_path: "x" }), "hold_expired");
  });

  await test("expired hold frees spots; approving it when full is refused", async () => {
    const s = await newSession(staff, slots(D5, 14, 15), [1]);
    const p = await payOk(s.code, names(2));
    await db.from("open_play_payments").update({ hold_expires_at: new Date(Date.now() - 60e3).toISOString() }).eq("id", p.id);
    const { data: n } = await db.rpc("expire_stale_holds");
    assert.ok(n >= 1);
    const { data: exp } = await db.from("open_play_payments").select("status").eq("id", p.id).single();
    assert.equal(exp.status, "expired");
    const w = await staff.rpc("staff_add_open_play_walkins", { p_session_id: s.id, p_player_names: names(12, "Walk"), p_payment_method: "cash", p_mobile: null });
    assert.ifError(w.error);
    await expectError(staff.rpc("staff_review_open_play_payment", { p_payment_id: p.id, p_action: "approve", p_note: null }), "not_enough_spots:0");
    await expectError(staff.rpc("staff_extend_open_play_hold", { p_payment_id: p.id, p_minutes: 30 }), "not_enough_spots:0");
    await expectError(staff.rpc("staff_add_open_play_walkins", { p_session_id: s.id, p_player_names: ["One More"], p_payment_method: "cash", p_mobile: null }), "not_enough_spots:0");
  });

  await test("extend hold revives an expired payment when spots allow; approve and reject", async () => {
    const s = await newSession(staff, slots(D5, 15, 16), [1]);
    const p = await payOk(s.code, names(2));
    await db.from("open_play_payments").update({ status: "expired", hold_expires_at: new Date(Date.now() - 60e3).toISOString() }).eq("id", p.id);
    const ext = await staff.rpc("staff_extend_open_play_hold", { p_payment_id: p.id, p_minutes: 30 });
    assert.ifError(ext.error);
    assert.equal(await held(s.id), 2);
    const ap = await staff.rpc("staff_review_open_play_payment", { p_payment_id: p.id, p_action: "approve", p_note: null });
    assert.ifError(ap.error);
    const { data: c } = await db.from("open_play_payments").select("status, verified_at").eq("id", p.id).single();
    assert.equal(c.status, "confirmed");
    assert.ok(c.verified_at);
    const q = await payOk(s.code, ["Rina Lim"]);
    await expectError(staff.rpc("staff_review_open_play_payment", { p_payment_id: q.id, p_action: "reject", p_note: "" }), "reason_required");
    const rj = await staff.rpc("staff_review_open_play_payment", { p_payment_id: q.id, p_action: "reject", p_note: "No payment received" });
    assert.ifError(rj.error);
    assert.equal(await held(s.id), 2);
  });

  await test("walk-in cash without mobile is confirmed; gcash without mobile is refused", async () => {
    const s = await newSession(staff, slots(D5, 16, 17), [1]);
    const { data: ref, error } = await staff.rpc("staff_add_open_play_walkins", { p_session_id: s.id, p_player_names: ["Ben Torres", "Carlo Lim"], p_payment_method: "cash", p_mobile: null });
    assert.ifError(error);
    const { data: w } = await db.from("open_play_payments").select("*").eq("ref", ref).single();
    assert.equal(w.status, "confirmed");
    assert.equal(w.source, "walk_in");
    assert.equal(w.total_amount, 240);
    assert.ok(w.verified_at);
    const g = await staff.rpc("staff_add_open_play_walkins", { p_session_id: s.id, p_player_names: ["Dan Cruz"], p_payment_method: "gcash", p_mobile: null });
    assert.ok(g.error && g.error.message.includes("open_play_mobile_required"), g.error?.message);
  });

  await test("public lookup hides mobile and full names", async () => {
    const s = await newSession(staff, slots(D5, 17, 18), [1]);
    const p = await payOk(s.code, ["Juan Dela Cruz", "Ana Reyes"]);
    const { data } = await db.rpc("get_open_play_payment_public", { p_ref: p.ref.toLowerCase() });
    const row = data[0];
    assert.deepEqual(row.first_names, ["Juan", "Ana"]);
    assert.equal(row.player_count, 2);
    assert.equal(row.total_amount, 240);
    assert.equal(row.status, "pending_payment");
    assert.ok(!("mobile" in row));
    assert.equal(row.code, s.code);
  });

  await test("anon cannot call payment or staff RPCs directly", async () => {
    const s = await newSession(staff, slots(D5, 18, 19), [1]);
    assert.ok((await anon.rpc("create_open_play_payment", { p_code: s.code, p_player_names: ["X Y"], p_mobile: "09171234567", p_email: null })).error);
    assert.ok((await anon.rpc("staff_add_open_play_walkins", { p_session_id: s.id, p_player_names: ["X Y"], p_payment_method: "cash", p_mobile: null })).error);
    assert.ok((await anon.from("open_play_payments").select("id").limit(1)).error || true);
    const { data: rows } = await anon.from("open_play_payments").select("id").limit(1);
    assert.ok(!rows || rows.length === 0);
  });

  // ================================================================ Task 3: cancel, refunds, reports
  const D6 = addDays(manilaToday, 19);
  const submit = (ref) => db.rpc("submit_open_play_payment", { p_ref: ref, p_method: "gcash", p_payment_ref_no: "998877", p_proof_path: `${ref}/x.png` });
  const approve = (id) => staff.rpc("staff_review_open_play_payment", { p_payment_id: id, p_action: "approve", p_note: null });
  const statusOf = async (id) => (await db.from("open_play_payments").select("status").eq("id", id).single()).data.status;
  const report = async (from, to) => {
    const { data, error } = await admin.rpc("report_summary", { p_from: from, p_to: to });
    if (error) throw new Error(error.message);
    return data;
  };

  await test("cancel moves paid to refund_owed and frees court hours", async () => {
    const s = await newSession(staff, slots(D6, 9, 11), [1, 2]);
    const a = await payOk(s.code, ["Approved One"]);
    await submit(a.ref);
    assert.ifError((await approve(a.id)).error);
    const v = await payOk(s.code, ["Sent Proof"]);
    await submit(v.ref);
    const w = await payOk(s.code, ["Still Paying"]);
    await expectError(staff.rpc("staff_cancel_open_play_session", { p_session_id: s.id, p_reason: " " }), "reason_required");
    const c = await staff.rpc("staff_cancel_open_play_session", { p_session_id: s.id, p_reason: "Typhoon" });
    assert.ifError(c.error);
    assert.equal(await statusOf(a.id), "refund_owed");
    assert.equal(await statusOf(v.id), "refund_owed");
    assert.equal(await statusOf(w.id), "cancelled");
    const { count } = await db.from("blocked_slots").select("id", { count: "exact", head: true }).eq("session_id", s.id);
    assert.equal(count, 0);
    assert.equal((await publicSession(s.code)).state, "cancelled");
    await expectError(staff.rpc("staff_add_open_play_walkins", { p_session_id: s.id, p_player_names: ["Too Late"], p_payment_method: "cash", p_mobile: null }), "session_cancelled");
  });

  await test("cannot cancel after start", async () => {
    const { data: code } = await db.rpc("new_open_play_code");
    const { data: started } = await db.from("open_play_sessions").insert({
      code, service_date: manilaToday, starts_at: new Date(Date.now() - 3600e3).toISOString(),
      ends_at: new Date(Date.now() + 3600e3).toISOString(), fee_per_player: 120, players_per_court: 12, note: "CHECK",
    }).select().single();
    createdSessions.push(started.id);
    await expectError(staff.rpc("staff_cancel_open_play_session", { p_session_id: started.id, p_reason: "x" }), "session_started");
  });

  const D7 = addDays(manilaToday, 20);
  await test("report keeps approved revenue and books refund as money out", async () => {
    const s = await newSession(staff, slots(D7, 12, 13), [1]);
    const a = await payOk(s.code, ["Juan Dela Cruz", "Ana Reyes", "Mark Santos"]);
    await submit(a.ref);
    assert.ifError((await approve(a.id)).error);
    const v = await payOk(s.code, ["Never Checked"]);
    await submit(v.ref);
    const sumFor = (rows, date, key) => rows.filter((r) => r.date === date).reduce((t, r) => t + r[key], 0);

    let r = await report(D7, D7);
    assert.equal(sumFor(r.open_play, D7, "revenue"), 360);
    assert.equal(sumFor(r.open_play, D7, "players"), 3);
    const row = r.open_play_sessions.find((x) => x.session_id === s.id);
    assert.equal(row.players, 3);
    assert.equal(row.max_players, 12);

    const owedBefore = (await report(D7, D7)).refunds_owed;
    const before = await report(manilaToday, manilaToday);
    const refundedBefore = sumFor(before.open_play_refunds, manilaToday, "amount");
    const refundPlayersBefore = sumFor(before.open_play_refunds, manilaToday, "players");
    assert.ifError((await staff.rpc("staff_cancel_open_play_session", { p_session_id: s.id, p_reason: "Rain" })).error);
    assert.equal((await report(D7, D7)).refunds_owed, owedBefore + 2);
    assert.ifError((await staff.rpc("staff_mark_open_play_refunded", { p_payment_id: a.id })).error);
    assert.ifError((await staff.rpc("staff_mark_open_play_refunded", { p_payment_id: v.id })).error);
    await expectError(staff.rpc("staff_mark_open_play_refunded", { p_payment_id: v.id }), "invalid_status");

    r = await report(D7, D7);
    assert.equal(sumFor(r.open_play, D7, "revenue"), 360, "approved revenue stays on the session date");
    assert.equal(r.refunds_owed, owedBefore);
    const today = await report(manilaToday, manilaToday);
    assert.equal(sumFor(today.open_play_refunds, manilaToday, "amount") - refundedBefore, 360, "only the approved payment is money out");
    assert.equal(sumFor(today.open_play_refunds, manilaToday, "players") - refundPlayersBefore, 3);
  });

  await test("a cancelled session's payments can't be approved, revived, or paid", async () => {
    const D8 = addDays(manilaToday, 21);
    const s = await newSession(staff, slots(D8, 9, 10), [1]);
    const lapsed = await payOk(s.code, ["Late Payer"]);
    await db.from("open_play_payments").update({ status: "expired", hold_expires_at: new Date(Date.now() - 60e3).toISOString() }).eq("id", lapsed.id);
    const racing = await payOk(s.code, ["Racing Upload"]);
    assert.ifError((await staff.rpc("staff_cancel_open_play_session", { p_session_id: s.id, p_reason: "Rain" })).error);
    await expectError(approve(lapsed.id), "session_cancelled");
    await expectError(staff.rpc("staff_extend_open_play_hold", { p_payment_id: lapsed.id, p_minutes: 30 }), "session_cancelled");
    // an upload that loses the race with cancel must not land
    await db.from("open_play_payments").update({ status: "pending_payment" }).eq("id", racing.id);
    await expectError(submit(racing.ref), "session_cancelled");
    const { data } = await db.rpc("get_open_play_payment_public", { p_ref: racing.ref });
    assert.equal(data[0].status, "cancelled");
  });

  await test("staff cannot read report data", async () => {
    const { error } = await staff.rpc("report_summary", { p_from: D6, p_to: D6 });
    assert.ok(error);
  });
} finally {
  // ---- cleanup
  if (createdSessions.length) {
    await db.from("blocked_slots").delete().in("session_id", createdSessions);
    await db.from("open_play_payments").delete().in("session_id", createdSessions);
    await db.from("open_play_sessions").delete().in("id", createdSessions);
  }
  for (const [court, slot] of looseBlocks) await db.from("blocked_slots").delete().eq("court_id", court).eq("slot_start", slot);
  if (settingsBefore) await db.from("settings").update(settingsBefore).eq("id", true);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll open play checks passed");
process.exitCode = failed ? 1 : 0;
