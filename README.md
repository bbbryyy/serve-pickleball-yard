# Serve Pickleball Yard

[![CI](https://github.com/bbbryyy/serve-pickleball-yard/actions/workflows/ci.yml/badge.svg)](https://github.com/bbbryyy/serve-pickleball-yard/actions/workflows/ci.yml)

Court booking, QR payments, open play payments, a store POS and reports for a 2-court indoor
pickleball venue in Agoo, La Union. Players also get **Dink**, an AI assistant that finds open
courts from live availability and hands them to the booking form with the hours already picked.

**Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres with RLS, Auth, Storage, pg_cron),
Tailwind CSS 4, Zod 4, Vitest, Claude (Anthropic SDK), Vercel.

## Submission (AIM Week 4, Assignment 4.2)

| Item | Link |
|---|---|
| Live app | https://serve-pickleball-yard.vercel.app (tap the Dink button, bottom right) |
| Repository | https://github.com/bbbryyy/serve-pickleball-yard |
| Idea validation (7 steps) | [docs/idea-validation.md](docs/idea-validation.md) |
| 1-page PRD | [docs/prd-one-page.md](docs/prd-one-page.md) |
| Spec (revised after review) | [docs/spec.md](docs/spec.md) |
| Architecture notes | [docs/architecture.md](docs/architecture.md) |
| AI coding rules | [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), [.cursorrules](.cursorrules) |
| CI pipeline | [.github/workflows/ci.yml](.github/workflows/ci.yml): lint, typecheck, tests, gitleaks secret scan |
| Reflection | [docs/reflection.md](docs/reflection.md) |
| 2-minute demo | _(add the video link)_ |
| v2 issue | _(add the GitHub issue link)_ |

**About the git history.** The base booking app was built first and saved as one snapshot commit.
The work after that (open play, store, and everything for this assignment: validation, PRD, spec,
architecture, AI rules, CI, Dink, monitoring) is in small commits, each named with its phase.

## Dink, the AI assistant (player mode)

Dink is not a general chatbot. It answers only from tools that read the yard's live data and rules:

| Tool | What it does |
|---|---|
| `find_options` | Searches live availability for free blocks of the length asked (for example 2 hours, Saturday after 6PM), across both courts, with the 4AM–1AM service day and off-hours notice rules. Offers the nearest alternatives when nothing fits. |
| `propose_booking` | Re-checks one option and shows a card with a **Book these hours** button. The booking page opens with those hours picked; the player still fills in the form and pays. Dink never books, holds or discounts anything. |
| `find_open_play` | Scheduled open play sessions in a date range (day, time, courts), hiding ones that already ended, with the fee and how to join. |
| `check_booking` | Status of a booking or open play payment by its SPY- reference, without personal details. |
| `get_info` | Hours, rates, how to pay, open play and contact, read from Settings. |

Safety and cost limits: 500 characters per message, 20 messages per conversation, 20 requests per
10 minutes per visitor, a daily cap, and a kill switch (`AGENT_ENABLED=false`). Chat text is never
stored; `agent_runs` keeps only counts, tools used, tokens, time taken and the outcome. The
backoffice **Analytics** page shows Dink chats, bookings that came from Dink, errors and tokens.

Provider: Claude (`claude-haiku-5-5`) by default. An OpenAI-compatible endpoint is a switchable
backup (`AGENT_PROVIDER=openai`) with the same tools and limits.

Code: `app/api/agent/route.ts`, `lib/agent/`, `components/DinkChat.tsx`.

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

For Dink, also set `AGENT_PROVIDER`, `ANTHROPIC_API_KEY` and `AGENT_IP_SALT` in `.env.local`
(see `.env.example`). Without a key, Dink shows "Dink is off right now" and booking still works.

The test backoffice accounts and their passwords are listed at the top of `scripts/seed.mjs`. They
are for local use only.

## Checks

```bash
npm test                       # schedule, open play, store and Dink rules
npm run lint
npx tsc --noEmit
npm run check:permissions      # staff/admin/public database permissions (after seeding)
npm run check:open-play        # open play sessions, payments, refunds, reports (local only, after seeding)
npm run check:store            # store sales, stock, daily close, reports (local only, after seeding)
```

CI runs lint, typecheck, tests and a gitleaks secret scan on every push and pull request.

## How it fits together

| Area | Where |
|---|---|
| Schedule rules (shared by the UI and server) | `lib/schedule.ts` (the same rules are enforced again in SQL by `validate_slot`) |
| Database: tables, booking RPCs, RLS, cron | `supabase/migrations/` |
| Public site: home, booking grid, payment, status | `app/(public)/` |
| Backoffice: bookings, schedule, open play, store, reports, settings, users | `app/backoffice/` |
| Dink | `app/api/agent/route.ts`, `lib/agent/`, `components/DinkChat.tsx` |
| Auth guard | `proxy.ts` (redirect), `lib/auth.ts` (`requireStaff` / `requireAdmin`), and RLS/RPC role checks |

Key rules:
- **One active booking per court-hour** is enforced by a unique partial index (`booking_slots_one_active`), so two players can't book the same hour.
- **Holds:** an online booking holds its slots for 30 minutes (set in Settings). If no payment proof arrives, the slots are released: right away for availability, and a cron job marks the booking expired every 5 minutes.
- **Service day:** a day runs from 4AM to 1AM. The 12AM–1AM slot belongs to the day before it, in the grid, in reports and in Dink.
- **Public pages never touch tables directly.** They call security-definer RPCs through the server. Staff use their own session, and every RPC re-checks `is_staff()` / `is_admin()`.

## Deploying

1. Create a Supabase project and run `supabase link` and then `supabase db push`.
2. Create the first admin: add the user in Supabase Auth, then insert a `staff_profiles` row with `role = 'admin'`. Add other users from the backoffice **Users** page.
3. Deploy to Vercel with the env vars from `.env.example` (the Supabase three, plus `AGENT_PROVIDER`, `ANTHROPIC_API_KEY`, a new random `AGENT_IP_SALT`, `AGENT_ENABLED`, `AGENT_DAILY_LIMIT`). Never expose `SUPABASE_SERVICE_ROLE_KEY` or the AI key to the browser.
4. Upload the GCash and Maya QR codes in **Backoffice → Settings**.

Monitoring: Vercel Web Analytics for page views, and the Dink card on the backoffice Analytics page.

## Demo script (2 minutes)

1. **0:00 Problem (15s).** Bookings used to come by message; staff checked each hour by hand.
2. **0:15 Booking (25s).** Home page, then the booking grid: pick hours, see the ₱ total and the 30-minute hold.
3. **0:40 Dink (45s).** Open Dink and ask "2 hours next Saturday evening". Show the option cards, tap **Book these hours** and show the hours already picked. Then ask "book me for free" and show that Dink declines.
4. **1:25 Backoffice (20s).** Staff confirm a payment; the Analytics page shows Dink chats and bookings from Dink.
5. **1:45 Engineering (15s).** The GitHub Actions run (lint, typecheck, tests, secret scan) and the spec's review log.

## Next (v2)

Dink for staff and admins (drafting bookings, open play and restock with a confirm card) and
Messenger as a channel. See the v2 GitHub issue.
