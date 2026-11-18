# Store — simple POS, inventory, daily close

Status: approved by owner 2026-11-18 (owner delegated the remaining decisions: "I'll leave it to you")

## Why

The yard's store sells drinks (Gatorade, soft drinks), chocolate bars, and quick-serve
food (cup noodles, nachos). Today staff write each sale in a notebook: there is no stock
count, nothing warns when an item runs low, and nobody can check that the cash, GCash and
Maya taken match what was sold. The owner wants:

1. stock tracked automatically as items sell and are restocked;
2. a warning before an item runs out;
3. **(most important)** money taken by method (cash, GCash, Maya) matched against what was sold;
4. store revenue **and profit** in the reports, next to court rentals and open play.

No receipts are needed.

## Goals

- Staff ring up a sale on a phone at the desk in a few taps and pick how it was paid.
- Shelf items lose stock on every sale; restocks add stock with what was paid.
- Each shelf item has its own low-stock level; low items are flagged.
- Once a day, staff close the store: the site shows expected cash / GCash / Maya from the
  day's sales, staff enter what they counted, and the differences are saved.
- Reports show store revenue, cost, profit, best sellers, losses, and past daily closes.

## Non-goals

- Receipts, printers, barcode scanners, cash-drawer hardware.
- Per-shift drawer counts (owner chose one close per day).
- Recipes / ingredient tracking for made-to-order food.
- Supplier management, purchase orders, accounts payable.
- Selling to players online, or adding store items to court bookings.
- Discounts, promos, tabs or credit.

## Anti-goals

- A count that changes with no trace of why. Every stock change must be explainable.
- A closed day whose sales can later be edited quietly.
- Court bookings or open play behaving differently because of the store.
- Slow checkout at the desk (more than a few taps for a typical sale).

## Constraints

- Same stack and patterns as Open Play: Next.js 16 App Router, Supabase Postgres with RLS
  and security-definer RPCs, Tailwind v4, Vitest, local check script against the local DB.
- Roles: staff = sell, restock, cancel an open-day sale, daily close. Admin = everything,
  plus items/prices/costs/low-stock levels, stock corrections, store reports, reopen a close.
- Manila time; the store day is the **service day** (4AM–1AM), the same one bookings use, so a
  sale at 12:30AM belongs to the evening before.
- Owner's rule: new screens are shown as mockups first.
- Ships through a PR with a Vercel preview; live DB migrations applied before merging.

## Approaches considered

**A. Running stock log — chosen.** Every stock change is a row: restock (+qty, cost), sale (−qty),
cancelled sale (+qty), correction (±qty, reason). Current stock = sum of the log. Sales and daily
closes are their own tables. Every count is traceable, which serves the money-matching goal.
Fits the Open Play pattern.

**B. Stock number on each item, updated in place.** Faster, but loses the "why" behind every count,
which works against matching.

**C. Separate POS app (e.g. Loyverse).** Ready-made, but store money lives outside the site and
staff use two apps. Dropped.

Owner picked **A** on 2026-11-18.

## What was decided with the owner

- Items: drinks, chocolate bars, cup noodles, nachos and other quick-serve food.
- Payment methods: cash, GCash, Maya. No receipts.
- **One daily close** (not per shift).
- **Profit wanted**: restocks record what was paid.
- **Two kinds of items**:
  - **Shelf items** — counted; restock = quantity + total paid; cost per unit = **average cost**
    (Claude's proposal, accepted with "all good"); own low-stock level.
  - **Made-to-order items** — not counted; admin sets a **cost per serving** and a **selling price**.
- Roles, selling screen, mistakes and reports as below (owner: "All good proceed").

### Decisions after the builder check (owner delegated these to Claude)
- **One shared drawer and shared GCash/Maya accounts.** The daily close covers all money taken at the desk,
  not just the store: expected cash = store cash sales + cash court walk-ins + cash open play walk-ins
  − cash paid out from the drawer. GCash and Maya are shown by source (store, court walk-ins, open play
  walk-ins, online court bookings, online open play payments) so staff can tick them off against each
  wallet's history; the difference is checked on the desk total per method.
- **Cash leaving the drawer is recorded.** Restocks have "Paid from: drawer / owner / GCash / Maya" (default
  owner); "drawer" counts as cash out. A separate **cash-out** entry (amount + reason, e.g. "ice ₱50") also
  reduces expected cash. No change fund: staff count only what came in (counted cash = drawer total minus
  the fixed change fund, which stays in the drawer and is not part of the close). Claude's call.
- **Staff never see costs or profit.** Restock asks staff for total paid but shows only the new stock count;
  cost, average cost, margins and store reports are admin-only (also enforced in RPC responses).
- **Re-closing after a reopen requires a fresh count.** Every close is a row in `store_daily_closes`
  (no unique date); the latest non-reopened row is the day's close; earlier ones stay as history.
- **Unclosed past days** show as "Not closed" (badge on the Store menu and on Daily close). Staff can close
  them late. New sales always go to the current service day. Cancelling a sale is only allowed on the
  service day it was made, unless an admin reopens that day.
- **Opening stock**: a one-time "Opening stock" entry per shelf item with quantity and estimated cost per unit,
  stored as a restock move with `kind = 'opening'` so profit isn't overstated from day one.

## Design

### Data

- `store_items`: id, name, kind (`shelf | made_to_order`), price (₱, int), serving_cost (int, made-to-order
  only), low_stock_at (int, shelf only), active, sort_order, created_at.
- `store_stock_moves` (the log, shelf items only): id, item_id, kind (`opening | restock | sale | cancel | correction`),
  qty (signed int), total_cost (opening/restock only), paid_from (`drawer | owner | gcash | maya`, restock only), sale_id (sale/cancel), reason (correction), created_by, created_at.
  - Current stock = `sum(qty)`.
  - Average cost per unit = total restock cost ÷ total restocked units **still on hand**, computed with
    the moving-average method: on each restock, `avg = (on_hand × avg + total_cost) / (on_hand + qty)`.
    The average at the moment of sale is stored on the sale line (below), so later restocks never change
    past profit.
- `store_sales`: id, service_date, payment_method (`cash | gcash | maya`), total, status (`completed | cancelled`),
  cancelled_by/at, cancel_reason, created_by, created_at.
- `store_sale_lines`: sale_id, item_id, qty, unit_price, unit_cost (avg cost for shelf items at sale time,
  serving_cost for made-to-order), line_total.
- `store_daily_closes`: id, service_date, expected_cash/gcash/maya (desk totals), breakdown (jsonb by source),
  counted_cash/gcash/maya, note, closed_by, closed_at, reopened_by/at (null unless reopened). Several rows per
  day allowed; the day is closed when its latest row isn't reopened.
- `store_cash_outs`: id, service_date, amount, reason, restock_move_id (null for plain cash-outs), created_by, created_at.
- All writes through RPCs; staff read, admin write on items. Audit log entries for close, reopen,
  correction, cancel.

### Rules

- A sale needs ≥1 line; shelf lines need enough stock (`not_enough_stock:<item>`), locked per item so two
  phones can't sell the last bottle twice.
- A sale gets the current service date. If that date is already closed → `day_closed`.
- Cancelling a sale: only while its day is open; returns shelf stock with `cancel` moves.
- Daily close: expected per method = desk money for the service date (see decisions above): store sales,
  walk-in court bookings and walk-in open play payments by method (by the service date they were recorded),
  minus cash-outs for cash; online GCash/Maya payments approved that day are listed for matching. Staff enter counted
  amounts; differences = counted − expected. Closing locks the day.
- Reopen (admin only): clears the lock so a missed sale can be added or a mistake cancelled; the earlier
  close is kept in history.
- Corrections (admin only): ±qty with a reason (`expired`, `damaged`, `given away`, `count fix`); the cost
  of lost units (qty × avg cost) is reported as **losses**.
- Prices and costs can change any time; past sales keep the price and cost they were sold at.

### Screens

**Staff (and admin) — backoffice "Store" menu**
- **Sell:** grid of item buttons (name, price, stock badge; low ones flagged; out-of-stock disabled).
  Tap to add, +/− in a sale tray, pick Cash / GCash / Maya, **Save sale**. Today's sales list underneath
  with Cancel. Works on a phone.
- **Restock:** pick a shelf item, quantity, total paid, paid from → shows new stock (admins also see average cost).
- **Cash out:** amount + reason.
- **Daily close:** today's expected by method, inputs for counted, live differences, note, **Close day**.
  After closing, read-only summary.

**Admin**
- **Items:** add/edit items, kind, price, serving cost, low-stock level, active, order.
- **Stock:** current counts and average cost, low-stock list, stock log per item, **Correct stock**.
- **Store report:** revenue, cost, profit, margin; per item units, revenue, profit; losses; best sellers;
  date ranges like the Sales page.
- **Past closes:** list of daily closes with expected vs counted and differences; reopen.
- **Sales page:** third block **Store** (revenue and profit) next to Court Rentals and Open Play;
  CSV gains `store` rows; Total includes store revenue.

### Low-stock warning

Shown as a badge on Sell, a list on Stock, and a count on the backoffice **Store** menu item
(like the payments badge). No SMS/email.

## Left to the builder

- Table/RPC names and SQL details following the Open Play migrations' patterns.
- Exact money types (whole pesos as int, like the rest of the app).
- Component structure and reuse of existing report helpers.
- Tests: unit tests for average cost and difference maths; DB checks for last-unit race, closed-day
  refusal, cancel returning stock, correction losses, reopen.

## Order of work

1. Mockups of Sell, Restock, Daily close, Items/Stock, Store report → owner approval.
2. Build on a branch, PR with Vercel preview; apply DB migrations to live before merge.
