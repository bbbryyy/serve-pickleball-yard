# Reflection

> **DRAFT** — written as a starting point. Rewrite it in your own voice before submitting: keep what
> is true for you, cut what isn't, and add your own examples.

## What I built

A booking, payment and store system for Serve Pickleball Yard, a family-run 2-court venue in Agoo,
La Union, and Dink, an AI assistant that answers player questions and finds free court hours, then
hands the player to the normal booking form. The app is live on Vercel with Supabase behind it.

## What I learned

- **Validate before building, even for your own business.** Writing the 7 validation steps made me
  check things I took for granted: how many players are actually near Agoo, what Reclub already
  does well, and whether players would leave Messenger at all. The riskiest assumption turned out
  to be behavior, not technology.
- **A spec is a tool for the AI, not only for people.** Writing TypeScript interfaces and
  Given/When/Then criteria before coding gave the coding assistant something exact to build and
  test against. Vague specs produced vague code.
- **Put the AI on rails.** The useful version of Dink is narrow: four read-only tools, answers only
  from tool results, and no ability to book or change anything. Keeping the model away from writes
  and personal data made the feature much easier to trust.
- **The database is the last line of defense.** The unique index on court-hours and the role checks
  inside each RPC mean a bug in the screen, or in the AI, still can't double-book or leak data.

## Challenges

- **Time rules.** The 4AM–1AM service day, where 12AM belongs to the day before, broke several
  first attempts in the grid, reports and Dink's date handling. Shared helpers and tests fixed it.
- **Serverless limits.** Rate limiting needed storage that survives between requests; counting
  recent `agent_runs` in Postgres solved it without another service.
- **Scope.** The first Dink design had player, staff and admin modes. With one day left I cut it to
  player mode and moved the rest to v2.
- **Real evidence.** Market data for a single province is thin; the interview with the owner and
  staff mattered more than any statistic. _(Add what surprised you in the interview.)_

## What I would improve in v2

1. Dink staff mode: walk-ins, blocks and schedule questions as drafts with a confirm card.
2. Dink admin mode: sales and store questions, restock suggestions.
3. A Messenger channel, since that is where many players already ask.
4. Booking confirmations by SMS or email.
5. A Dink card on Analytics showing conversations, proposals booked and cost per day.
6. A short privacy review against the PH Data Privacy Act before scaling to other venues.

## Use of AI tools

_(Describe in your own words how you used Claude Code / Cursor: what you delegated, what you
checked by hand, and one time the AI was wrong and how you caught it.)_
