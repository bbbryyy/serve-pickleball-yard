# Open Play Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff create open play sessions that block court hours and produce a payment link for Reclub; players pay for one or more players via GCash/Maya; staff verify, add walk-ins, cancel/refund; Sales and Analytics show Open Play next to Court Rentals.

**Architecture:** New Postgres tables (`open_play_sessions`, `open_play_session_courts`, `open_play_payments`, `open_play_players`) with security-definer RPCs mirroring the booking RPCs; court hours are reserved through existing `blocked_slots` (`kind='open_play'`) linked by a new `session_id`. Public pages call RPCs through the service client from server actions (as `/book` does); backoffice calls RPCs as the signed-in user. Court booking tables and RPCs are not changed except `expire_stale_holds`, `staff_unblock_slots` and `report_summary`, which gain open-play handling.

**Tech Stack:** Next.js 16.4.6 App Router (read `node_modules/next/dist/docs/` before using any Next API you haven't seen in this repo), React 19, Tailwind v4 (`@utility`, no `@apply` of custom classes), Supabase Postgres + RLS, zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-open-play-payments-design.md` (approved). Approved mockups: payment link page, payment step, full state, session page, create session, Settings group, Sales split — described in the spec's Design section; match them.

## Global Constraints

- Fee per player setting default **120**; players per court setting default **12**; both copied onto the session at creation (`fee_per_player`, `players_per_court`). Limit = `players_per_court × courts in session`.
- One payment covers **1 … min(spots left, 12)** players.
- Payment ref format `SPY-OP-` + 4 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- Spots are held by payments in `pending_payment` (hold not expired), `for_verification`, `confirmed`.
- Hold length = existing `settings.hold_minutes` (30).
- Link stops new payments at session `starts_at`; proof uploads for payments already started are accepted until their hold ends.
- Session cancel only before `starts_at`. Approved or for-verification payments → `refund_owed`; `pending_payment` → `cancelled`.
- Only "add a court" edits a session. No date/time edits.
- Mobile `^09\d{9}$` after `normalizeMobile`; required except walk-in + cash. Email optional. Player names trimmed, 2–60 chars each.
- Staff and admin: sessions, payments, walk-ins, refunds. Admin only: Settings, reports.
- Sales: open play revenue dated by session service date for payments that were approved (`verified_at` set and status in `confirmed|refund_owed|refunded`); refunds of approved payments are money out on the Manila date of `refunded_at`.
- All pages responsive (phone 375px and desktop); check both in the browser pane.
- UI copy: sentence case, no "please"/"successfully"; follow existing look (`card`, `btn-primary`, `btn-ghost`, `label`, `font-display`, theme colours).
- Work on branch `feature/open-play`. Commit steps below run only after the owner has said yes to committing (ask once at the start of execution). Commits use the repo's configured bbbryyy identity.
- `npm run seed` and the new check script refuse non-local Supabase URLs; never run them against production.

## Review Focus

1. **Two players racing for the last spot** → exactly one gets it; the other sees "Only N spots left". (Task 2 race test.)
2. **Late-night sessions crossing midnight** (e.g. 10 PM–1 AM) → stored on the correct service date, shown as "Sat, Nov 22 · 10 PM – 1 AM", Sales dates them to Saturday. (Task 1 SQL test, Task 4 unit test.)
3. **Fee changed after a session is shared** → existing session keeps its fee and limit; new sessions use the new values. (Task 1 SQL test.)
4. **Approving or reviving a payment whose hold expired while the session filled up** → refused with a clear "session is full" message instead of overbooking. (Task 2 SQL test.)
5. **Cancelling a session with mixed payment states** → approved and for-verification become Refund owed, waiting ones become Cancelled, Sales for past dates unchanged, refund shows as money out when marked. (Task 3 SQL test.)

---

### Task 1: Schema, settings columns, session RPCs

**Files:**
- Create: `supabase/migrations/20261118000001_open_play_sessions.sql`
- Create: `scripts/check-open-play.mjs` (local-only assertion script, grows in Tasks 2–3)
- Modify: `package.json` (add `"check:open-play": "node --env-file=.env.local scripts/check-open-play.mjs"`)

**Interfaces:**
- Produces tables:
  - `settings.open_play_fee int not null default 120 check (> 0)`, `settings.open_play_players_per_court int not null default 12 check (between 1 and 50)`.
  - `open_play_sessions(id uuid pk, code text unique, service_date date, starts_at timestamptz, ends_at timestamptz, fee_per_player int, players_per_court int, status text check in ('open','cancelled') default 'open', note text, cancel_reason text, created_by uuid, created_at, cancelled_at, cancelled_by)`.
  - `open_play_session_courts(session_id uuid → sessions on delete cascade, court_id smallint → courts, pk(session_id, court_id))`.
  - `blocked_slots.session_id uuid null → open_play_sessions`.
- Produces SQL functions (security definer, `search_path = ''`):
  - `open_play_held(p_session_id uuid) returns int` — sum of `player_count` over holding payments (defined here, used by Task 2; returns 0 until Task 2's table exists — create `open_play_payments` and `open_play_players` tables in this migration too, see Task 2 columns, so the function compiles).
  - `open_play_limit(p_session_id uuid) returns int` — `players_per_court × count(courts)`.
  - `staff_create_open_play_session(p_slots timestamptz[], p_court_ids smallint[], p_note text default null) returns text` (session code).
  - `staff_add_open_play_court(p_session_id uuid, p_court_id smallint) returns void`.
  - `staff_unblock_slots` replaced: raises `session_slot` if any targeted row has `session_id` not null.
- `open_play_payments` columns (created here): `id uuid pk, ref text unique, session_id uuid → sessions, player_count int check between 1 and 12, fee_per_player int, total_amount int, mobile text null check (null or '^(09|\+639)\d{9}$'), email text null (same check as bookings), status text check in ('pending_payment','for_verification','confirmed','rejected','expired','cancelled','refund_owed','refunded') default 'pending_payment', source text check in ('online','walk_in'), payment_method text check in ('gcash','maya','cash'), payment_ref_no, proof_path, proof_uploaded_at, hold_expires_at, admin_note, verified_by, verified_at, refunded_by, refunded_at, created_by, created_at, updated_at`; constraint `open_play_mobile_required check (mobile is not null or (source='walk_in' and payment_method='cash'))`; index `(session_id, status)`.
- `open_play_players(payment_id uuid → payments on delete cascade, position smallint, name text check length between 2 and 60, pk(payment_id, position))`.
- RLS: enable on all four tables; `*_staff_read` select policies `using (public.is_staff())`; `grant select` to authenticated, `grant all` to service_role, nothing to anon; `revoke execute ... from public, anon` and `grant execute ... to authenticated, service_role` for each new function.

- [ ] **Step 1: Write the failing checks** in `scripts/check-open-play.mjs`

Structure: refuse unless `NEXT_PUBLIC_SUPABASE_URL` host is `127.0.0.1`/`localhost`; sign in `staff@serve.test` / `admin@serve.test` (passwords from `scripts/seed.mjs`); service client from `SUPABASE_SERVICE_ROLE_KEY`; each check is `await test(name, async () => {...})` using `node:assert/strict`, printing PASS/FAIL and setting a non-zero exit code on failure; all rows created carry `note = 'CHECK'` and are deleted at the end (payments → players cascade, sessions → courts cascade, `blocked_slots where session_id in (...)`), and settings are restored. Helper `slots(date, fromHour, toHour)` builds Manila ISO hours (`${date}T${hh}:00:00+08:00`, hours ≥24 roll to next day). Use a date 14 days ahead.

Checks:
```js
test("create session blocks court-hours and copies fee/limit", ...)
  // staff rpc staff_create_open_play_session(slots(d,18,22), [1,2], 'CHECK') → code
  // assert 8 blocked_slots rows with kind 'open_play' and session_id = session.id
  // assert session.fee_per_player === 120, players_per_court === 12, open_play_limit === 24
  // assert service_date === d, starts_at = d 18:00+08, ends_at = d 22:00+08
test("late-night session belongs to the evening's service date", ...)
  // slots(d2,22,25) on court 1 → service_date === d2, ends_at === (d2+1) 01:00+08
test("fee change does not touch existing sessions", ...)
  // admin updates settings.open_play_fee=150; earlier session still 120; new session 150; restore 120
test("adopts free-standing open play marks, refuses bookings and plain blocks", ...)
  // staff_block_slots(1, slots(d3,9,10), 'x', 'open_play') then create session over 9–11 → ok, the pre-existing row now has session_id
  // staff_block_slots(2, slots(d3,12,13), 'x', 'blocked') then create over 12–13 on court 2 → error starts with 'slot_taken'
test("add a court raises the limit", ...)  // 1-court session → add court 2 → limit 24, 4 more blocked rows
test("schedule cannot unblock session hours", ...)  // staff_unblock_slots on a session hour → error 'session_slot'
test("non-contiguous or invalid slots are refused", ...)  // [18:00, 20:00] → 'not_contiguous'; past hour → 'slot_invalid:past'
test("anon cannot call session RPCs", ...)  // anon client rpc → error
```

- [ ] **Step 2: Run** `npm run check:open-play` — Expected: FAIL (functions don't exist).

- [ ] **Step 3: Write the migration**

`staff_create_open_play_session`: require `is_staff()`; dedupe+sort `p_slots`; refuse empty (`no_slots`), > 21 hours, or not consecutive hours (`not_contiguous`); `validate_slot(x, s, true)` each (raise `slot_invalid:<issue>:<slot>`); all slots on one service date (`service_slot`) else `not_contiguous`; at least one active court in `p_court_ids` (`invalid_court`). For each court × slot: active `booking_slots` → `slot_taken`; `blocked_slots` with `kind='blocked'` or non-null `session_id` → `slot_taken`; existing `open_play` with null session → update `session_id`; else insert `blocked_slots(kind 'open_play', reason 'Open play', session_id)`. Code: 6 chars from the ref alphabet, unique. Audit `open_play_session_created` with `detail {session_id, courts, hours}`.
`staff_add_open_play_court`: staff; session `open` and `now() < ends_at`; court not already in session; same conflict rules over the session's hours; audit.

- [ ] **Step 4: Apply and run** `supabase db reset` is destructive to local test data — use `supabase migration up` then `npm run check:open-play`. Expected: all Task 1 checks PASS.

- [ ] **Step 5: Commit** `git add supabase/migrations/20261118000001_open_play_sessions.sql scripts/check-open-play.mjs package.json && git commit -m "Add open play sessions schema and session RPCs"`

---

### Task 2: Payment RPCs (public pay, proof, review, hold, walk-ins, expiry)

**Files:**
- Create: `supabase/migrations/20261118000002_open_play_payments.sql`
- Modify: `scripts/check-open-play.mjs`

**Interfaces:**
- Consumes: Task 1 tables, `open_play_held`, `open_play_limit`.
- Produces SQL functions:
  - `new_open_play_ref() returns text` (`SPY-OP-XXXX`, unique).
  - `get_open_play_public(p_code text) returns table(code text, service_date date, starts_at timestamptz, ends_at timestamptz, court_names text[], fee_per_player int, max_players int, spots_left int, state text)` — `state` ∈ `open|full|closed|cancelled`; anon-safe (no personal data).
  - `create_open_play_payment(p_code text, p_player_names text[], p_mobile text, p_email text default null) returns text` (ref). Locks the session row `for update`; raises `not_found`, `session_cancelled`, `session_closed` (now ≥ starts_at), `too_many_players` (0 or > 12), `not_enough_spots:<n>`. Calls `expire_stale_holds()` first. Inserts payment (`pending_payment`, hold = now + `hold_minutes`, `total = count × session.fee_per_player`) and players in order.
  - `submit_open_play_payment(p_ref text, p_method text, p_payment_ref_no text, p_proof_path text) returns void` — same rules as `submit_payment`.
  - `get_open_play_payment_public(p_ref text) returns table(ref text, code text, service_date date, starts_at timestamptz, ends_at timestamptz, court_names text[], player_count int, first_names text[], total_amount int, status text, hold_expires_at timestamptz, admin_note text)` — status reports `expired` for lapsed holds; `admin_note` only when rejected; `first_names` = first word of each name.
  - `staff_review_open_play_payment(p_payment_id uuid, p_action text, p_note text default null) returns void` — `approve` from `for_verification|pending_payment|expired` (an expired/lapsed one is re-checked: if `player_count > limit − held` → `not_enough_spots:<n>`); `reject` from `for_verification|pending_payment|confirmed` requires note (`reason_required`). Sets `verified_by/at`. Audit with `detail {open_play_payment_id, from}`.
  - `staff_extend_open_play_hold(p_payment_id uuid, p_minutes int) returns timestamptz` — like `staff_extend_hold`, reviving `expired` only if spots allow.
  - `staff_add_open_play_walkins(p_session_id uuid, p_player_names text[], p_payment_method text, p_mobile text default null) returns text` — staff; session `open` and `now() < ends_at`; spots check under row lock; inserts `confirmed`, `source 'walk_in'`, `verified_by/at` now.
  - `expire_stale_holds()` replaced: also expires lapsed `open_play_payments`; returns total count.
- Grants: public functions (`get_open_play_public`, `create_open_play_payment`, `submit_open_play_payment`, `get_open_play_payment_public`) executed via service role only, like booking RPCs; staff functions to authenticated.

- [ ] **Step 1: Add failing checks**
```js
test("payment holds spots and totals from the session fee", ...)  // 3 names → total 360, held 3, spots_left 21
test("last spot race: one of five wins", ...)
  // session limit 12 (1 court); create payments to hold 11; fire 5 concurrent 1-player payments via service client (Promise.allSettled) → exactly 1 ok, 4 errors starting 'not_enough_spots:0'
test("group larger than spots left is refused", ...)  // 2 left, ask 3 → 'not_enough_spots:2'
test("full / closed / cancelled states", ...)  // get_open_play_public state for a full session = 'full'; for a session with starts_at in the past (insert directly via service client) = 'closed'
test("proof moves to for_verification; lapsed hold is refused", ...)  // set hold_expires_at = now()-1min via service client → submit → 'hold_expired'
test("expired hold frees spots; approving it when full is refused", ...)
  // expire a 2-player payment, fill the session with walk-ins, approve the expired one → 'not_enough_spots'
test("walk-in cash without mobile is confirmed; gcash without mobile is refused", ...)
test("public lookup hides mobile and full names", ...)  // first_names ['Juan','Ana']; no mobile column
test("staff cannot approve with another role's rights; anon cannot call staff RPCs", ...)
```

- [ ] **Step 2: Run** `npm run check:open-play` — Expected: new checks FAIL.
- [ ] **Step 3: Write the migration** per the Interfaces block.
- [ ] **Step 4: Apply and run** `supabase migration up && npm run check:open-play` — Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "Add open play payment RPCs"`

---

### Task 3: Cancel, refunds, and report data

**Files:**
- Create: `supabase/migrations/20261118000003_open_play_cancel_reports.sql`
- Modify: `scripts/check-open-play.mjs`, `scripts/check-permissions.mjs` (add: staff `report_summary` still denied; anon `staff_create_open_play_session` denied; staff update `settings.open_play_fee` blocked)

**Interfaces:**
- Produces:
  - `staff_cancel_open_play_session(p_session_id uuid, p_reason text) returns void` — staff; `status='open'` and `now() < starts_at` else `session_started`; reason required; deletes its `blocked_slots`; payments `confirmed|for_verification` → `refund_owed`, `pending_payment` → `cancelled`; session `cancelled` with `cancel_reason`, `cancelled_at/by`; audit.
  - `staff_mark_open_play_refunded(p_payment_id uuid) returns void` — `refund_owed` → `refunded`, sets `refunded_by/at`; audit.
  - `report_summary(p_from date, p_to date)` replaced: same `daily` and `heat` as today, plus keys:
    - `open_play`: rows `{date, method, source, payments, players, revenue}` for approved payments (Global Constraints rule) grouped by session `service_date`.
    - `open_play_refunds`: rows `{date, payments, players, amount}` for `refunded` payments that had `verified_at`, by Manila date of `refunded_at`.
    - `open_play_sessions`: rows `{session_id, date, starts_at, ends_at, courts, max_players, players, status}` for sessions with `service_date` in range (players = approved players).
    - `refunds_owed`: integer count of all `refund_owed` payments (not range-limited).
  Admin-only, unchanged guard.

- [ ] **Step 1: Add failing checks**
```js
test("cancel moves paid to refund_owed and frees court hours", ...)
  // session with one confirmed, one for_verification, one pending → after cancel: refund_owed, refund_owed, cancelled; 0 blocked_slots for session; get_open_play_public state 'cancelled'
test("cannot cancel after start", ...)  // starts_at in past → 'session_started'
test("report keeps approved revenue and books refund as money out", ...)
  // approved 3×120 on session date D → report_summary(D,D).open_play revenue 360; cancel + mark refunded → open_play for D still 360; open_play_refunds on today's Manila date amount 360; for_verification refund never appears in either
test("refunds_owed counts outstanding refunds", ...)
```
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run** `supabase migration up && npm run check:open-play && npm run check:permissions` — Expected: all open-play checks PASS; permission lines for the new checks show DENIED/BLOCKED.
- [ ] **Step 5: Commit** `git commit -m "Add open play cancel, refunds and report data"`

---

### Task 4: Shared TypeScript helpers

**Files:**
- Create: `lib/openPlay.ts` (pure), `lib/openPlay.test.ts`, `lib/openPlayData.ts` (`server-only` fetchers)
- Modify: `lib/errors.ts`, `lib/reports.ts`

**Interfaces:**
- `lib/openPlay.ts`:
  - `MAX_GROUP = 12`
  - `maxGroupSize(spotsLeft: number): number` → `max(0, min(spotsLeft, 12))`
  - `openPlayTotal(players: number, fee: number): number`
  - `sessionSlots(serviceDate: string, fromHour: number, toHour: number, rules: HoursConfig): Date[]` — `fromHour`/`toHour` are service hours (late-night 24, 25 for 12 AM, 1 AM); uses `slotStartFor`; returns `[]` when `toHour <= fromHour` or any hour is outside `serviceHours(rules)`.
  - `formatSessionTime(startsAt: Date, endsAt: Date, rules: HoursConfig): string` → `"Sat, Nov 22 · 6 PM – 10 PM"` (date from service date, so a 10 PM–1 AM session reads `Sat, Nov 22 · 10 PM – 1 AM`).
  - `isOpenPlayRef(ref: string): boolean` → `/^SPY-OP-/i`
  - `parsePlayerNames(raw: string[]): { names: string[] } | { error: string }` — trims, rejects empty or <2 / >60 chars ("Enter each player's name as shown in Reclub."), max 12.
  - `type OpenPlayDaily = { date: string; method: string; source: string; payments: number; players: number; revenue: number }`, `type OpenPlayRefund = { date: string; payments: number; players: number; amount: number }`, `type OpenPlaySessionRow = { session_id: string; date: string; starts_at: string; ends_at: string; courts: number; max_players: number; players: number; status: "open" | "cancelled" }`
  - `salesSplit(rentals: DailyRow[], openPlay: OpenPlayDaily[], refunds: OpenPlayRefund[]): { rentals: number; openPlay: number; refunds: number; total: number; rentalHours: number; players: number }` — `total = rentals + openPlay − refunds`.
- `lib/reports.ts`: `getReport` return type gains `open_play: OpenPlayDaily[]; open_play_refunds: OpenPlayRefund[]; open_play_sessions: OpenPlaySessionRow[]; refunds_owed: number`.
- `lib/openPlayData.ts`: `getOpenPlayPublic(code: string)`, `getOpenPlayPaymentPublic(ref: string)` (service client RPC wrappers returning typed row or `null`), and `OPEN_PLAY_STATUS_TEXT: Record<OpenPlayStatus, {label, cls, body}>` reusing `STATUS_TEXT` wording plus `refund_owed` ("Refund on the way" / "This session was cancelled. Our staff will send your refund.") and `refunded` ("Refunded").
- `lib/errors.ts` `friendlyError` additions: `not_enough_spots:<n>` → `"Only n spots left in this session."` (`n=0` → `"This session is full."`), `session_closed` → `"Payments for this session have closed."`, `session_cancelled` → `"This session was cancelled."`, `session_started` → `"This session has already started, so it can't be cancelled."`, `session_slot` → `"These hours belong to an open play session. Change them from the session page."`, `not_contiguous` → `"Pick one continuous block of hours on one day."`, `too_many_players` → `"One payment can cover up to 12 players."`, `open_play_mobile_required` → same text as `bookings_mobile_required`, `open_play_payments_mobile_check` → mobile text.

- [ ] **Step 1: Write failing tests** in `lib/openPlay.test.ts`:
```ts
expect(maxGroupSize(7)).toBe(7); expect(maxGroupSize(30)).toBe(12); expect(maxGroupSize(-1)).toBe(0);
expect(openPlayTotal(3, 120)).toBe(360);
expect(sessionSlots("2026-11-22", 18, 22, DEFAULT_RULES).map(d => d.toISOString())).toEqual(["2026-11-22T10:00:00.000Z","2026-11-22T11:00:00.000Z","2026-11-22T12:00:00.000Z","2026-11-22T13:00:00.000Z"]);
expect(sessionSlots("2026-11-22", 22, 25, DEFAULT_RULES).at(-1)!.toISOString()).toBe("2026-11-22T16:00:00.000Z"); // 12 AM Sun = Sat service day
expect(sessionSlots("2026-11-22", 25, 27, DEFAULT_RULES)).toEqual([]); // 1–3 AM closed
expect(formatSessionTime(new Date("2026-11-22T14:00:00Z"), new Date("2026-11-22T17:00:00Z"), DEFAULT_RULES)).toBe("Sat, Nov 22 · 10 PM – 1 AM");
expect(isOpenPlayRef("spy-op-4k2q")).toBe(true); expect(isOpenPlayRef("SPY-4K2Q7H")).toBe(false);
expect(parsePlayerNames([" Ana Reyes ", "J"])).toEqual({ error: "Enter each player's name as shown in Reclub." });
expect(salesSplit([{revenue: 800, hours: 2} as DailyRow], [{revenue: 360, players: 3} as OpenPlayDaily], [{amount: 120} as OpenPlayRefund])).toMatchObject({ rentals: 800, openPlay: 360, refunds: 120, total: 1040, players: 3 });
```
Add `friendlyError("not_enough_spots:2")` → `"Only 2 spots left in this session."` and `":0"` → `"This session is full."` (new `lib/errors.test.ts`).
- [ ] **Step 2: Run** `npm test` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `npm test` — Expected: all pass (16 existing + new).
- [ ] **Step 5: Commit** `git commit -m "Add open play helpers and error messages"`

---

### Task 5: Settings — Open Play group

**Files:**
- Modify: `app/backoffice/admin-actions.ts` (`SettingsInput` gains `open_play_fee: z.coerce.number().int().min(1).max(10000)`, `open_play_players_per_court: z.coerce.number().int().min(1).max(50)`), `app/backoffice/(app)/settings/SettingsForm.tsx`, `app/backoffice/(app)/settings/page.tsx`, `lib/settings.ts` (`SiteSettings.openPlay: { fee: number; playersPerCourt: number }`)

- [ ] **Step 1:** Add the "Open play" group (fee per player ₱, players per court, hint "Changes apply to sessions created after you save.") per mockup 6.
- [ ] **Step 2: Verify** in the browser pane as admin@serve.test: change fee to 130 → "Settings saved"; reload shows 130; set back to 120. As staff@serve.test, `/backoffice/settings` redirects.
- [ ] **Step 3: Commit** `git commit -m "Add open play settings"`

---

### Task 6: Public payment link, payment step, status page

**Files:**
- Create: `app/(public)/open-play/[code]/page.tsx`, `app/(public)/open-play/[code]/OpenPlayForm.tsx` (client: player count stepper 1…`maxGroupSize`, one name input per player, mobile, optional email, live total), `app/(public)/open-play/actions.ts` (`createOpenPlayPayment(prev, form)` → redirect `/open-play/pay/[ref]`; `submitOpenPlayPayment(prev, form)` → redirect `/booking/[ref]`), `app/(public)/open-play/pay/[ref]/page.tsx`
- Create: `components/QrPanels.tsx` — extract the GCash/Maya QR grid from `app/(public)/book/[ref]/pay/page.tsx` (props `{ gcash: PaymentAccount; maya: PaymentAccount }`) and use it in both pay pages. Make `PaymentForm` accept a `action` prop (default `submitPayment`) so open play reuses it. Court booking pay page must render identically.
- Modify: `app/(public)/booking/[ref]/page.tsx` — if `isOpenPlayRef(ref)` render the open play status card (session time, courts, first names, players × fee, status text, refund notes); `app/(public)/booking/page.tsx` lookup accepts `SPY-OP-` refs.

**Interfaces:**
- Consumes: `getOpenPlayPublic`, `getOpenPlayPaymentPublic`, `parsePlayerNames`, `maxGroupSize`, `openPlayTotal`, `formatSessionTime`, `friendlyError`, `normalizeMobile`.
- Upload path for proofs: `payment-proofs/<ref>/<timestamp>.<ext>`, same type/size rules as `submitPayment`.

States to render on `/open-play/[code]`: open (form), full ("This session is full" + Book a court, mockup 3), closed ("Payments for this session have closed."), cancelled ("This session was cancelled."), not found (`notFound()`). Page is dynamic (no ISR): spots must be live.

- [ ] **Step 1: Verify by hand** (local, seeded data, a session created via the Task 7 page or the check script helper) in the browser pane at 375px and desktop:
  - 3 players → total ₱360 → pay step shows SPY-OP ref, countdown, both QR panels → upload a small PNG → status page shows "Checking your payment".
  - Stepper max equals spots left; with 2 left, choosing 3 is impossible and a forced POST returns "Only 2 spots left in this session."
  - Full, closed, cancelled, unknown code each show their state.
  - `/book` → pay → status still works unchanged for a court booking.
- [ ] **Step 2:** `npm run lint && npm test` — Expected: clean, pass.
- [ ] **Step 3: Commit** `git commit -m "Add open play payment link and status pages"`

---

### Task 7: Backoffice — Open Play list and create session

**Files:**
- Create: `app/backoffice/(app)/open-play/page.tsx` (upcoming first, then past 30 days; each row: time via `formatSessionTime`, courts, `paid / limit` with approved+held counts, status, link to session page; "New session" button), `app/backoffice/(app)/open-play/new/page.tsx` + `NewSessionForm.tsx` (date, from, to selects of service hours, court toggles, preview line "₱120 per player · limit 24 players (12 per court)", mockup 5), `app/backoffice/open-play-actions.ts`
- Modify: `components/BackofficeNav.tsx` (add `{ href: "/backoffice/open-play", label: "Open Play", admin: false }` after Schedule)

**Interfaces:**
- `open-play-actions.ts` (`"use server"`, each calls `requireStaff()` then the RPC as the user, `revalidatePath("/backoffice", "layout")`, `revalidatePath("/book")`, returns `ActionResult` from `app/backoffice/actions.ts`):
  - `createSession(input: { date: string; fromHour: number; toHour: number; courtIds: number[]; note?: string }): Promise<ActionResult & { code?: string; id?: string }>` — builds slots with `sessionSlots`, redirects to the session page on success.
  - `addCourt(sessionId: string, courtId: number)`, `cancelSession(sessionId: string, reason: string)`, `addWalkIns(input: { sessionId: string; names: string[]; paymentMethod: "cash" | "gcash" | "maya"; mobile: string })`, `reviewOpenPlayPayment(paymentId: string, action: "approve" | "reject", note?: string)`, `extendOpenPlayHold(paymentId: string, minutes: number)`, `markRefunded(paymentId: string)`.

- [ ] **Step 1: Verify by hand** as staff: create Sat 6–10 PM on both courts → lands on session page; `/backoffice/schedule` shows those hours as Open play; `/book` shows them unavailable; creating an overlapping session shows "One of those hours was just taken…"; a 10 PM–1 AM session saves on the right day.
- [ ] **Step 2:** `npm run lint` — clean.
- [ ] **Step 3: Commit** `git commit -m "Add open play session list and create form"`

---

### Task 8: Session page — roster, walk-ins, add court, cancel, refunds

**Files:**
- Create: `app/backoffice/(app)/open-play/[id]/page.tsx`, `SessionRoster.tsx` (client), `WalkInForm.tsx` (client)

Per mockup 4: header (time, courts, fee, link with Copy button using `navigator.clipboard`, `paid / limit` and bar), roster grouped by payment (ref or "Walk-in", names, method, status pill: Approved / Check payment / Paying · N min / Paid / Refund owed / Refunded / Rejected / Expired), per-row actions (view proof via 10-minute signed URL, Approve, Reject with reason, Extend hold, Mark refunded), walk-in form (count stepper ≤ `maxGroupSize(spots left)`, names, Cash/GCash/Maya, mobile "optional for cash"; hidden with "Session is full" text when no spots), Add a court (only courts not in session; hidden after `ends_at`), Cancel session (confirm dialog with reason; hidden after `starts_at`). Below `lg`, roster rows render as stacked cards.

- [ ] **Step 1: Verify by hand** as staff at desktop and 375px: approve, reject (reason required), extend hold, add 2 cash walk-ins without mobile, GCash walk-in without mobile shows the mobile error, add court raises limit 12→24, cancel with mixed statuses shows Refund owed rows, Mark refunded moves them to Refunded.
- [ ] **Step 2:** `npm run lint` — clean.
- [ ] **Step 3: Commit** `git commit -m "Add open play session page"`

---

### Task 9: Payments queue and schedule integration

**Files:**
- Modify: `app/backoffice/(app)/page.tsx` (query `open_play_payments` with the same status tab and search `q` on ref/mobile/player names; merge with bookings sorted by the tab's existing order; tab counts include both), create `app/backoffice/(app)/OpenPlayPaymentRow.tsx` (same look as `BookingRow`, "Open Play" tag, session time instead of court/hours, names list, actions call Task 7 actions)
- Modify: `app/backoffice/(app)/layout.tsx` (pending badge = bookings + open play `for_verification`)
- Modify: `app/backoffice/(app)/schedule/page.tsx` / `ScheduleBoard.tsx` — include `session_id` in blocked-slot details; session hours show "Open play session" with a link to `/backoffice/open-play/[id]` instead of the "make bookable" action; free-standing open play marks keep today's behaviour.

- [ ] **Step 1: Verify by hand:** an open play payment with a screenshot appears under "For verification" with the tag and the nav badge counts it; approving there updates the session page; court booking rows unchanged; schedule shows a session link for session hours and still frees a free-standing open play mark.
- [ ] **Step 2:** `npm run lint` — clean.
- [ ] **Step 3: Commit** `git commit -m "Show open play payments in queue and schedule"`

---

### Task 10: Sales and Analytics

**Files:**
- Modify: `app/backoffice/(app)/reports/sales/page.tsx`, `app/backoffice/(app)/reports/sales/export/route.ts`, `app/backoffice/(app)/reports/analytics/page.tsx`

Sales (mockup 7): metric row Total / Court rentals (hours) / Open play (players · sessions), "N refunds owed" pill linking to `/backoffice/open-play?refunds=1` when `refunds_owed > 0` (list page filters to sessions with refund_owed payments), existing By court table stays rentals-only and is labelled so; By payment method and By channel include open play; daily table gains Open play and Refunds columns; Total uses `salesSplit`.
CSV header becomes `date,type,court,payment_method,channel,bookings,players,hours,revenue_php` with `type` ∈ `court_rental|open_play|open_play_refund` (refund rows negative revenue; blank court/hours where not applicable).
Analytics: new "Open play" card — sessions held (status open, date ≤ today), total players, average players per session, fill rate (players ÷ max_players), table of sessions in range. Heatmap and utilisation untouched.

- [ ] **Step 1: Verify by hand** as admin with the Task 8 data: totals match the session page; refund appears on today's row as money out; CSV opens with the new columns; staff still redirected from reports.
- [ ] **Step 2:** `npm run lint && npm test` — clean, pass.
- [ ] **Step 3: Commit** `git commit -m "Split sales into court rentals and open play"`

---

### Task 11: Docs and full verification

**Files:**
- Modify: `docs/PRD.md` (Open Play section: replace the phase-2 placeholder with the shipped behaviour; queue remains future), `README.md` (new npm script)

- [ ] **Step 1:** Update docs.
- [ ] **Step 2: Full run:** `npm test`, `npm run lint`, `npm run build`, `npm run check:open-play`, `npm run check:permissions` — all pass / expected DENIED lines.
- [ ] **Step 3: End-to-end in the browser pane** (desktop and 375px): staff creates a session → copy link → player pays for 3 → staff approves → walk-in 2 cash → Sales shows Open play ₱600 for that date → admin changes fee to 150 → existing session still ₱120, new session ₱150 → cancel the new session.
- [ ] **Step 4: Commit** `git commit -m "Document open play"`. Deploying migrations to production (`supabase db push`) and pushing the branch are separate owner decisions — ask, don't do.
