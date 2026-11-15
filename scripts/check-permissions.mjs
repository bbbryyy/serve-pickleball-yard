// Local permission smoke test: run after `npm run seed`. Uses the seeded test accounts.
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const login = async (email, password) => { const c = createClient(url, anon, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password }); if (error) throw error; return c; };
const staff = await login("staff@serve.test", "ServeStaff#2026");
const admin = await login("admin@serve.test", "ServeAdmin#2026");
const pub = createClient(url, anon, { auth: { persistSession: false } });
// Expected: staff/anon writes and admin-only reads are DENIED or affect 0 rows (RLS).
const show = (label, r) =>
  console.log(
    label.padEnd(42),
    r.error ? "DENIED: " + r.error.message : Array.isArray(r.data) && r.data.length === 0 ? "BLOCKED by RLS (0 rows)" : "OK " + JSON.stringify(r.data).slice(0, 70),
  );
show("staff report_summary", await staff.rpc("report_summary", { p_from: "2026-11-01", p_to: "2026-11-15" }));
show("admin report_summary", await admin.rpc("report_summary", { p_from: "2026-11-01", p_to: "2026-11-15" }));
show("staff update settings", await staff.from("settings").update({ rate_per_hour: 1 }).eq("id", true).select());
show("staff read audit_log", await staff.from("audit_log").select("id").limit(1));
show("staff self-promote to admin", await staff.from("staff_profiles").update({ role: "admin" }).eq("email", "staff@serve.test").select());
show("staff direct update bookings", await staff.from("bookings").update({ status: "confirmed" }).eq("status", "pending_payment").select());
show("staff read bookings", await staff.from("bookings").select("ref").limit(1));
show("anon read bookings", await pub.from("bookings").select("ref").limit(1));
show("anon get_availability", await pub.rpc("get_availability", { p_court_id: 1, p_from: new Date().toISOString(), p_to: new Date(Date.now() + 864e5).toISOString() }));
show("anon create_booking", await pub.rpc("create_booking", { p_court_id: 1, p_slots: [], p_player_name: "x", p_mobile: "09171234567" }));
