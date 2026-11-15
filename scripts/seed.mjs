// Local development seed: backoffice accounts + sample bookings for reports.
// Usage: npm run seed   (requires `supabase start` and .env.local)
//
// Test accounts (LOCAL ONLY — never use these on a real project):
//   admin@serve.test / ServeAdmin#2026   (role: admin)
//   staff@serve.test / ServeStaff#2026   (role: staff)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Refusing to seed a non-local Supabase project");

const db = createClient(url, key, { auth: { persistSession: false } });

const ACCOUNTS = [
  { email: "admin@serve.test", password: "ServeAdmin#2026", full_name: "Yard Admin", role: "admin" },
  { email: "staff@serve.test", password: "ServeStaff#2026", full_name: "Front Desk Staff", role: "staff" },
];

async function upsertUser(a) {
  const { data: list } = await db.auth.admin.listUsers();
  let user = list.users.find((u) => u.email === a.email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email: a.email, password: a.password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  }
  const { error } = await db.from("staff_profiles").upsert({ user_id: user.id, full_name: a.full_name, email: a.email, role: a.role, active: true });
  if (error) throw error;
  return user.id;
}

const OFFSET = 8 * 3600e3;
const slotAt = (date, sh) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, sh) - OFFSET).toISOString();
};
const ymd = (t) => new Date(t + OFFSET).toISOString().slice(0, 10);
const NAMES = ["Juan Santos", "Ana Reyes", "Mark Cruz", "Bea Garcia", "Paolo Mendoza", "Kim Tan", "Rina Lopez", "Jojo Bautista", "Carla Dizon", "Migs Villanueva"];
const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ref = () => "SPY-" + Array.from({ length: 6 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join("");
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Demand weight for a service hour + weekday: evenings and weekends are busiest. */
function demand(sh, dow, monthIdx) {
  let w = 0.12;
  if (sh >= 17 && sh <= 21) w = 0.65;
  else if (sh >= 22) w = 0.35;
  else if (sh >= 5 && sh <= 7) w = 0.3;
  else if (sh >= 9 && sh <= 11) w = 0.18;
  if (dow >= 5) w += 0.2; // Sat/Sun
  if (dow === 4 && sh >= 18) w += 0.15; // Friday night
  w *= 0.65 + monthIdx * 0.07; // growing month over month
  return Math.min(w, 0.95);
}

async function seedBookings(adminId) {
  const { count } = await db.from("bookings").select("*", { count: "exact", head: true }).eq("source", "online").eq("status", "confirmed");
  if (count > 50) {
    console.log("sample bookings already present, skipping");
    return;
  }
  const now = Date.now();
  const today = ymd(now);
  const bookings = [];
  const slots = [];
  // ~6 months of history up to yesterday
  for (let back = 182; back >= 1; back--) {
    const date = ymd(now - back * 86400e3);
    const dow = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
    const monthIdx = Math.floor((182 - back) / 30);
    for (const court of [1, 2]) {
      let sh = 4;
      while (sh <= 24) {
        if (Math.random() < demand(sh, dow, monthIdx)) {
          const len = Math.min(1 + Math.floor(Math.random() * 2.2), 25 - sh);
          const id = crypto.randomUUID();
          const created = new Date(new Date(slotAt(date, sh)).getTime() - (1 + Math.random() * 72) * 3600e3).toISOString();
          const method = Math.random() < 0.68 ? "gcash" : "maya";
          bookings.push({
            id, ref: ref(), court_id: court, player_name: pick(NAMES), mobile: "0917" + String(1000000 + Math.floor(Math.random() * 8999999)),
            email: null, hours: len, rate_per_hour: 400, total_amount: len * 400, status: "confirmed",
            source: Math.random() < 0.12 ? "walk_in" : "online", payment_method: Math.random() < 0.12 ? "cash" : method,
            payment_ref_no: String(Math.floor(Math.random() * 1e12)), verified_by: adminId, verified_at: created, created_at: created,
          });
          for (let i = 0; i < len; i++) slots.push({ booking_id: id, court_id: court, slot_start: slotAt(date, sh + i) });
          sh += len;
        } else sh++;
      }
    }
  }
  for (let i = 0; i < bookings.length; i += 500) {
    const { error } = await db.from("bookings").insert(bookings.slice(i, i + 500));
    if (error) throw error;
  }
  for (let i = 0; i < slots.length; i += 1000) {
    const { error } = await db.from("booking_slots").insert(slots.slice(i, i + 1000));
    if (error) throw error;
  }
  console.log(`seeded ${bookings.length} past bookings (${slots.length} hours) through ${today}`);
}

async function seedUpcoming() {
  // a few upcoming bookings through the real RPC so the queue has work in it
  const now = Date.now();
  const d = (n) => ymd(now + n * 86400e3);
  const mk = async (court, date, hours, name, mobile) => {
    const { data, error } = await db.rpc("create_booking", {
      p_court_id: court, p_slots: hours.map((h) => slotAt(date, h)), p_player_name: name, p_mobile: mobile, p_email: "player@example.test",
    });
    if (error) console.warn("skip upcoming:", error.message);
    return data;
  };
  const proof = readFileSync(new URL("../public/brand/logo.jpeg", import.meta.url));
  const r1 = await mk(1, d(2), [18, 19], "Juan Santos", "09171234567");
  const r2 = await mk(2, d(3), [19], "Ana Reyes", "09181234567");
  await mk(1, d(4), [20, 21], "Mark Cruz", "09191234567");
  for (const [r, method] of [[r1, "gcash"], [r2, "maya"]]) {
    if (!r) continue;
    const path = `${r}/seed-proof.jpg`;
    await db.storage.from("payment-proofs").upload(path, proof, { contentType: "image/jpeg", upsert: true });
    await db.rpc("submit_payment", { p_ref: r, p_method: method, p_payment_ref_no: "9001234567", p_proof_path: path });
  }
  console.log("seeded upcoming bookings:", [r1, r2].filter(Boolean).join(", "));
}

const ids = {};
for (const a of ACCOUNTS) ids[a.role] = await upsertUser(a);
console.log("accounts ready: admin@serve.test, staff@serve.test (passwords in scripts/seed.mjs)");
await db.from("settings").update({ gcash_name: "Serve Pickleball Yard", gcash_number: "0917 000 0000", maya_name: "Serve Pickleball Yard", maya_number: "0917 000 0000" }).eq("id", true);
await seedBookings(ids.admin);
await seedUpcoming();
