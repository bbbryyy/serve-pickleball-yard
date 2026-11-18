# Open Play — sessions, payment link, roster, reports

Status: approved by owner 2026-11-18 · mockups next

## Why

Serve runs open play nights where players register in the **Reclub** app. Today
nothing ties the money to the site: payments aren't checked in one place and
open play income doesn't show up in Sales or Analytics. The owner wants:

- a **payment link per session** that goes into the Reclub registration, so
  players pay before staff accept them from Reclub's waiting list;
- every player **counted** so Sales and Analytics show open play revenue and
  turnout next to court rentals.

## Goals

1. Staff or admin create an open play session (date, start and end hour, courts).
   Those court hours are blocked from hourly booking.
2. Each session gets a public payment link to paste into Reclub.
3. A player pays for **one or several players** through the link (GCash/Maya QR +
   screenshot), naming each player as they appear in Reclub.
4. Staff approve or reject the payment in the backoffice. Approval is the
   signal to accept those players off the Reclub waiting list (done by hand in Reclub).
5. Each session has a **player limit** = players per court × courts. The link
   stops taking payments when full.
6. Staff can **add walk-in players** to a session while it has spots left.
7. Admin sets the **fee per player** (₱120) and **players per court** (12) in Settings.
8. **Sales** splits revenue into Court Rentals and Open Play. **Analytics** shows
   players per session and how full each session got.

## Non-goals (this phase)

- The game queue: "who's up next" board, court assignment, rotation rules. Designed later,
  after a few sessions have run.
- Uploading a player list from Reclub. Not needed: the paid list *is* the roster.
- Any integration with Reclub (no API). Staff move players in Reclub by hand.
- Automatic refunds. Refunds are handled by hand, outside the site.
- Player accounts or logins.

## Anti-goals (would be a failure even if it works)

- Breaking or changing the behaviour of court bookings, which are already tested and live.
- Players paying for a session that is already full.
- A changed fee in Settings altering the price of a session already shared in Reclub,
  or rewriting past sales figures.

## Constraints

- Existing stack: Next.js 16 App Router, Supabase (Postgres + RLS + security-definer RPCs,
  private `payment-proofs` bucket), Tailwind v4. Manila time; "service day" runs 4AM–1AM.
- All writes go through RPCs / server actions, as with bookings. Anonymous users get no
  direct table access.
- Staff vs Admin roles as today: staff run sessions and check payments; only admins
  change Settings and see reports.
- Owner's rule: **new screens are shown as mockups first** and built only after approval.

## Approaches considered

**A. Open play as its own part of the system — chosen.**
Own tables for sessions and payments. Reuses the existing payment UI pieces (QR panel,
screenshot upload, countdown, approve/reject), the hold timer and the audit log.
Sales sums both sources. More work up front, but court bookings are untouched and the
later game queue attaches cleanly to the session and its players.

**B. Store each open play payment as a court booking.**
Faster, since verification, status page and Sales mostly work as-is. But bookings assume one
court and specific slots; every booking screen and report would need "unless open play"
exceptions. Rejected for risk to the tested booking flow and for a messier queue phase.

Owner picked **A** on 2026-11-18.

## What was decided with the owner

- Session is created by **staff or admin** with date and time (and courts).
- Creating a session produces a **payment link** to put in the Reclub registration.
- In Reclub, players wait on the waiting list until staff confirm their payment.
- One payment can cover **several players**; the payer types each player's name as shown in Reclub.
- **Fee per player** is an admin setting, currently **₱120**.
- **12 players per court**, also an admin setting. Limit = 12 × courts in the session.
- Staff/admin can **add walk-in players by hand** while the limit isn't reached; once full,
  staff simply don't accept more in Reclub.
- No Reclub list upload.
- Reports show revenue for **Open Play** and **Court Rentals** separately.
- Game queue is out of scope for now ("let's ship this first").
- **Cancelling a paid session** (owner said yes, 2026-11-18): paid money stays visible as
  "Refund owed"; staff tap "Mark refunded" after paying it back; Sales records the refund as money
  out on that day so past totals never change. A session can only be cancelled before it starts.
- **Editing** (owner said yes, 2026-11-18): no general editing — cancel and recreate — except staff
  can **add a court** to a session, which raises its limit.

## Design

### Data

- `settings`: add `open_play_fee` (int, default 120) and `open_play_players_per_court` (int, default 12).
- `open_play_sessions`: id, code (short public code for the link), service date, start hour,
  end hour (whole hours, same rules as booking hours), `fee_per_player` and `players_per_court`
  **copied at creation** (limit = players_per_court × courts), status (`open | cancelled`), note, created_by, created_at.
- `open_play_session_courts`: session ↔ court. Creating a session writes `blocked_slots`
  rows with `kind = 'open_play'` for each court-hour (this kind already exists and already
  shows as Open Play on the public grid and staff schedule).
- `open_play_payments`: id, ref (`SPY-OP-XXXX`), session_id, payer mobile, payer email (optional),
  player_count, total_amount (= count × session fee), status (bookings' set plus two:
  `pending_payment | for_verification | confirmed | rejected | expired | cancelled | refund_owed | refunded`),
  refunded_at/refunded_by,
  source (`online | walk_in`), payment_method (`gcash | maya | cash`), payment_ref_no, proof_path,
  hold_expires_at, admin_note, verified_by/at, created_at.
- `open_play_players`: payment_id, position, name. (Kept separate so the future queue can
  point at individual players.)
- Mobile rule mirrors court walk-ins: required, except walk-in + cash.

### Existing "mark as open play" on the staff schedule (Claude's call)

- `blocked_slots` gets a nullable `session_id`. Creating a session **adopts** any existing
  open play blocks on those court-hours (sets their `session_id`) instead of refusing them;
  it refuses only active bookings or plain `blocked` hours.
- Unblocking from the schedule ("Make N hour(s) bookable") **refuses** hours that belong to a
  session; the message points staff to the session page. Free-standing open play marks
  (no session) keep working as today, so nothing about the live schedule breaks.
- The schedule's open play button stays; the schedule shows session hours with a link to the session.

### Spots and the limit

A payment **holds its spots** while it is `pending_payment` within its hold time,
`for_verification`, or `confirmed`. Rejected, expired and cancelled payments free their spots.
`spots_left = players_per_court × courts − held spots`. The create-payment RPC locks the session row and
refuses a payment larger than `spots_left`, so two people can't both buy the last spot.
Walk-ins go through the same check.

> Builder note: this holds spots from the moment a player starts paying (during the 30-min
> hold), not only after the screenshot is uploaded as first described to the owner. Without it,
> two players can both pay for the last spot. Flagged to the owner as Claude's call.

### Public pages

- `/open-play/[code]` — the payment link. Shows session date, time, courts, fee, spots left.
  Form: number of players (1 … min(spots left, 12)), a name field per player ("as shown in
  Reclub"), payer mobile, optional email. Submit creates the payment and moves to the payment step.
  States: **full**, **closed** (session has started or ended), **cancelled**, **not found**.
- Payment step reuses the court-booking pay page pieces: amount, GCash/Maya QR, reference to
  write in the payment note, hold countdown, screenshot + transaction no. upload.
- Status lookup: the existing `/booking/[ref]` page recognises `SPY-OP-` refs and shows the open
  play status (session, players, amount, status). "My booking" in the menu therefore works for both.
- Link stops taking new payments at the session's start time. Uploads for payments already
  in progress are still accepted until their hold ends.

### Backoffice (staff + admin)

- **Open Play** menu item → list of upcoming and past sessions with `paid / limit`.
- **Create session**: date, start hour, end hour, courts. Fails clearly if any of those
  court-hours already has an active booking or block. Shows the fee and limit that will be
  copied in. After saving, shows the link with a **Copy link** button.
- **Session page**: header with date, time, courts, players `20 / 24`, the link; roster grouped
  by payment (ref, player names, method, status); **Add walk-in players** (count, names,
  cash/GCash/Maya, mobile optional for cash) — confirmed immediately, disabled when full;
  **Add a court** (only free court-hours; raises the limit by players per court);
  **Cancel session**, only before the session starts: frees the court hours; payments that were
  `confirmed` or `for_verification` (money already sent) become **Refund owed**, unpaid ones become
  `cancelled`. Each Refund owed payment has a **Mark refunded** button. No other editing:
  to change date or time, cancel and create a new session.
- **Payments queue** (existing home page): open play payments appear in the same tabs with an
  "Open Play" tag, showing session and player names instead of court and hours. Approve,
  reject (with reason) and extend hold behave as for bookings and write to the audit log.

### Settings (admin)

New **Open Play** group: fee per player (₱), players per court. Changes apply to sessions
created afterwards.

### Reports (admin)

- **Sales**: totals split into **Court Rentals** and **Open Play**, per day/week/month as the page
  already groups; method breakdown covers both; CSV export gains a `type` column
  (`court_rental | open_play`) and a `players` column. Open play revenue is dated by the
  session's service date and counts payments that were approved (`verified_at` set), whatever
  their later status. A refund of an approved payment appears as **money out on the refund date**
  (negative line, `type = open_play_refund` in the CSV), so totals for past periods never change.
  Refunds of never-approved payments (screenshot sent, session cancelled before review) don't
  touch Sales. A "Refunds owed" count is shown so they aren't forgotten.
- **Analytics**: new Open Play block — sessions held, total players, average players per
  session, fill rate (players ÷ limit), and a per-session list. The peak-hours heatmap and court
  utilisation stay court-rentals only.

### Expiry

The existing `expire-stale-holds` cron also expires open play payments past their hold.

## Left to the builder

- Exact RPC names and signatures, table/column naming, indexes, RLS details (follow the
  booking schema's patterns: revoke anon, security-definer RPCs, staff read policies).
- Public session code format and ref generator (reuse `new_booking_ref` style).
- Component reuse/refactor of the pay page pieces, as long as court booking behaviour is unchanged.
- Validation messages (add to `lib/errors.ts` `friendlyError`).
- Tests: unit tests for spot counting and limit maths; a DB race test for the last spot like the
  double-booking test.

## Order of work

1. Mockups of the new screens (payment link page, session page, create session, settings group,
   Sales split) → owner approval.
2. Then build behind those mockups; update `docs/PRD.md` with the Open Play section.
