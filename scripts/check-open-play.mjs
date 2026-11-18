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
