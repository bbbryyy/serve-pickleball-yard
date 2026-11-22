# PRD: Serve Pickleball Yard booking app with Dink

Owner: Serve Pickleball Yard, Santa Fe, Agoo, La Union · 2026-11-21 · Live: https://serve-pickleball-yard.vercel.app
Long version: `docs/PRD.md` · Spec: `docs/spec.md`

## 1. Problem statement

Players can't see which of Serve's 2 courts are free. They ask through Messenger, text, calls or
Reclub; staff answer about 20 inquiries a week (~10 minutes each, mostly "how much per hour?" and
"is this slot available?") and write reservations in a logbook. With no reservation fee, no-shows
go unpaid. Store sales in the logbook don't always match the cash, and the owner has no view of
sales, court use or stock.

## 2. Target users

- **Players** (primary): ages 12 to 50, groups of friends and families around Agoo who book from a
  phone and pay by GCash or Maya. No account. Peak demand: weekends, 5PM–10PM.
- **Staff**: front desk; check payments, add walk-ins, run the store.
- **Admin**: the owner; settings, prices, stock costs, reports.

## 3. Core features

| # | Feature | Acceptance criterion (testable) |
|---|---|---|
| 1 | **Live booking grid with holds** | Given a free hour, when a player reserves it, the hour shows On hold to others and is released if no payment proof arrives within the hold time (default 30 min). |
| 2 | **QR payment with proof check** | When a player uploads a GCash or Maya screenshot, the booking moves to For verification and appears in the staff queue; Approve makes it Confirmed. |
| 3 | **No double booking** | When 5 requests try to book the same court-hour at once, exactly 1 succeeds and the others get a "just taken" message. |
| 4 | **Dink AI assistant** (players; read-only help for staff and the owner) | When a player asks "2 hours this Saturday after 6pm", Dink returns up to 5 real free options with correct ₱ totals (or nearest alternatives), and "Book these hours" opens `/book` with those hours preselected. |
| 5 | **Store POS and reports** | When staff record a sale and close the day, expected cash equals cash sales + cash walk-ins − cash out, and the Sales report shows store revenue next to court rentals. |

## 4. Out of scope (v1)

- Payment gateways or automatic payment checks; player accounts; memberships or discounts.
- Email or SMS notifications; Messenger or WhatsApp channels.
- Dink draft actions with a confirm card (walk-ins, blocks, restocks): v2.
- Dink making or changing bookings, payments or stock itself; storing chat text.
## 5. Success metrics

1. **Online share:** ≥ 30% of court bookings made online within the first month.
2. **Dink to booking:** ≥ 15% of Dink proposals become a booking (`agent_proposals.booking_ref`).
3. **Unpaid holds:** ≤ 25% of online bookings expire unpaid.
4. **Open play lost revenue:** reduce revenue lost to open play backouts and cancellations from
   players who hadn't paid. Target: 100% of open play spots paid in advance through the payment link
   (or at the desk for walk-ins), so an unpaid backout costs ₱0. Measured from approved
   `open_play_payments` against players in each session.

## 6. Open questions

- Targets above: confirm with the owner after the interview.
- Dink on every public page, or only `/book` first?
- Taglish: mirror the player, or English by default?
- Cancellation and refund policy for confirmed court bookings.
- After launch: Messenger channel first, or Dink draft actions?
