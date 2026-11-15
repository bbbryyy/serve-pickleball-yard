# Serve Pickleball Yard — Court booking

Players book courts by the hour and pay with GCash or Maya QR. Staff check payments by hand. Admins also get sales reports and analytics.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth, Storage) · Tailwind CSS 4 · Recharts

## Run locally

Requires Node 20+, Docker, and the Supabase CLI.

```bash
npm install
supabase start                 # local Postgres/Auth/Storage in Docker
supabase status -o env         # copy API_URL / ANON_KEY / SERVICE_ROLE_KEY into .env.local (see .env.example)
supabase db reset              # applies supabase/migrations
npm run seed                   # test admin + staff accounts, sample bookings for reports
npm run dev                    # http://localhost:3000
```

The test backoffice accounts and their passwords are listed at the top of `scripts/seed.mjs`. They are for local use only.

## Checks

```bash
npm test                       # schedule rules (hours, midnight, 24h notice, 8-week window)
npm run check:permissions      # staff/admin/public database permissions (after seeding)
npx tsc --noEmit && npx eslint .
```

## How it fits together

| Area | Where |
|---|---|
| Schedule rules (shared by the UI and server) | `lib/schedule.ts` (the same rules are enforced again in SQL by `validate_slot`) |
| Database: tables, booking RPCs, RLS, cron | `supabase/migrations/` |
| Public site: home, booking grid, payment, status | `app/(public)/` |
| Backoffice: bookings queue, schedule, reports, settings, users | `app/backoffice/` |
| Auth guard | `proxy.ts` (redirect), `lib/auth.ts` (`requireStaff` / `requireAdmin`), and RLS/RPC role checks |

Key rules:
- **One active booking per court-hour** is enforced by a unique partial index (`booking_slots_one_active`), so two players can't book the same hour.
- **Holds:** an online booking holds its slots for 30 minutes (set in Settings). If no payment proof arrives, the slots are released: right away for availability, and a cron job marks the booking expired every 5 minutes. Staff can extend a hold or revive an expired one.
- **Service day:** a day runs from 4AM to 1AM. The 12AM–1AM slot belongs to the day before it, in the grid and in reports.
- **Public pages never touch tables directly.** They call security-definer RPCs through the server with the service role. Staff use their own session, and every RPC re-checks `is_staff()` / `is_admin()`.

## Deploying

1. Create a Supabase project and run `supabase link` and then `supabase db push`.
2. Create the first admin: add the user in Supabase Auth, then insert a `staff_profiles` row with `role = 'admin'`. Add other users from the backoffice **Users** page.
3. Deploy to Vercel with the three env vars from `.env.example`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
4. Upload the GCash and Maya QR codes in **Backoffice → Settings**.

## Next phase (not built yet)

Open play queue management: admins create sessions, staff import the player list from Reclub, then check players in and rotate games.
