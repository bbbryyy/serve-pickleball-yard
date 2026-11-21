# PRD: Serve Pickleball Yard booking app with Dink

Owner: Serve Pickleball Yard, Santa Fe, Agoo, La Union · 2026-11-21 · Live: https://serve-pickleball-yard.vercel.app
Long version: `docs/PRD.md` · Spec: `docs/spec.md`

## 1. Problem statement

Players can't see which of Serve's 2 courts are free without messaging or walking in, and staff
answer the same questions and track reservations by hand. Unpaid reservations block hours, double
bookings happen, and the owner has no view of sales, court use or store stock.

## 2. Target users

- **Players** (primary): groups of friends and families around Agoo who book from a phone and pay
  by GCash or Maya. No account.
- **Staff**: front desk; check payments, add walk-ins, run the store.
- **Admin**: the owner; settings, prices, stock costs, reports.

## 3. Core features

| # | Feature | Acceptance criterion (testable) |
|---|---|---|
| 1 | **Live booking grid with holds** | Given a free hour, when a player reserves it, the hour shows On hold to others and is released if no payment proof arrives within the hold time (default 30 min). |
| 2 | **QR payment with proof check** | When a player uploads a GCash or Maya screenshot, the booking moves to For verification and appears in the staff queue; Approve makes it Confirmed. |
| 3 | **No double booking** | When 5 requests try to book the same court-hour at once, exactly 1 succeeds and the others get a "just taken" message. |
| 4 | **Dink player assistant** | When a player asks "2 hours this Saturday after 6pm", Dink returns up to 5 real free options with correct ₱ totals (or nearest alternatives), and "Book these hours" opens `/book` with those hours preselected. |
| 5 | **Store POS and reports** | When staff record a sale and close the day, expected cash equals cash sales + cash walk-ins − cash out, and the Sales report shows store revenue next to court rentals. |

## 4. Out of scope (v1)

- Payment gateways or automatic payment checks; player accounts; memberships or discounts.
- Email or SMS notifications; Messenger or WhatsApp channels.
- Dink staff and admin modes (drafts for walk-ins, blocks, restock; sales questions): v2.
- Dink making or changing bookings itself; storing chat text.
- Open play game queue and court rotation.

## 5. Success metrics

1. **Online share:** ≥ 30% of court bookings made online within the first month.
2. **Dink to booking:** ≥ 15% of Dink proposals become a booking (`agent_proposals.booking_ref`).
3. **Unpaid holds:** ≤ 25% of online bookings expire unpaid.

## 6. Open questions

- Targets above: confirm with the owner after the interview.
- Dink on every public page, or only `/book` first?
- Taglish: mirror the player, or English by default?
- Cancellation and refund policy for confirmed court bookings.
- After launch: Messenger channel first, or Dink staff mode?
