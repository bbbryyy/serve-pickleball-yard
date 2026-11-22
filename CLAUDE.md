# CLAUDE.md

Guidance for AI coding assistants working in this repo. Also read `AGENTS.md`.

## Project

Serve Pickleball Yard: court booking, QR payments, open play payments, store POS and reports for a
2-court indoor venue in Agoo, La Union, plus **Dink**, an AI assistant for players. Live at
https://serve-pickleball-yard.vercel.app.

Docs: `docs/spec.md` (Dink spec), `docs/architecture.md`, `docs/PRD.md`, `docs/prd-one-page.md`,
`docs/superpowers/specs/` (open play and store designs).

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts
- Supabase: Postgres with row-level security, Auth, Storage, pg_cron (`supabase/migrations/`)
- Zod 4 for validation, Vitest for tests, date-fns-tz for Manila time
- Dink: `@anthropic-ai/sdk` (default, `claude-haiku-5-5`) or an OpenAI-compatible backup via
  `AGENT_PROVIDER=openai` (`openai` SDK, `gpt-4o-mini`); model from `AGENT_MODEL`; code in
  `lib/agent/` and `app/api/agent/route.ts`
- Hosting: Vercel; CI in `.github/workflows/ci.yml`

## Commands

```bash
npm run dev                 # local dev server (http://localhost:3000)
npm run build               # production build
npm run start               # run the production build
npm run lint                # eslint
npm test                    # vitest run (unit tests)
npx tsc --noEmit            # typecheck
npm run seed                # seed local Supabase (needs .env.local)
npm run check:permissions   # role and RLS checks against local Supabase
npm run check:open-play     # open play flow checks (local only)
npm run check:store         # store flow checks (local only)
supabase start              # local Supabase in Docker
supabase db reset           # apply migrations locally
```

Before saying work is done: `npm run lint`, `npx tsc --noEmit`, `npm test`.

## Rules

1. **Read the Next.js docs first.** This is Next.js 16; APIs and conventions differ from older
   versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing code and
   heed deprecation notices. For Dink, read `node_modules/@anthropic-ai/sdk/` too.
2. **Writes only through server actions and RPCs.** Public pages never read or write tables
   directly: they call security-definer RPCs through the server (`createServiceClient`). Staff code
   uses the signed-in user's client (`createUserClient`), and every staff RPC re-checks
   `is_staff()` / `is_admin()`. New tables get RLS enabled and no anon access.
3. **Manila time and the service day.** All dates and hours are `Asia/Manila`. A service day runs
   4AM–1AM; the 12AM–1AM hour belongs to the day before, in the grid, reports and Dink. Use the
   helpers in `lib/schedule.ts`; keep them in step with `validate_slot` in SQL.
4. **Rules come from Settings.** Rate, hours, hold minutes, lead time, weeks ahead and open play fee
   are read from the `settings` table, never hard-coded.
5. **Secrets only in env.** Supabase keys, `ANTHROPIC_API_KEY`, `AGENT_IP_SALT` and the like live in
   `.env.local` and Vercel env vars, server-side. Never commit them or expose
   `SUPABASE_SERVICE_ROLE_KEY` to the browser. CI runs gitleaks.
6. **Mockups before redesigns.** Show new screens or visual changes as a mockup and wait for the
   owner's go-ahead before changing UI code.
7. **Dink safety.** Dink states availability, prices, bookings and figures only from a tool result
   in the same turn. All tools are read-only; the only writes are buttons a person taps on a Dink card: staff
   tapping "Save to session" on a queue card, and the owner tapping "Create session" on an open play
   draft card (admin only, through the same RPC as the Open play screen). Player mode sends no names, mobiles or emails to the model; staff mode sends first
   names only. The mode comes from the signed-in session, never the request. Chat text is never
   stored (`agent_runs` keeps counts and outcomes only).
8. **Tests for rules.** Pure logic (schedule, store math, `lib/agent/*`) gets Vitest tests with no
   network or database.

## Style

- Plain, sentence-case English in UI copy and docs. No hype.
- Small, focused commits with clear messages.
