# Idea validation: Serve Pickleball Yard booking app and Dink

Status: draft, 2026-11-21. Interview evidence to be added today (see the placeholders marked
`> Interview evidence:`).

The idea: a booking, payment and store system for Serve Pickleball Yard (Santa Fe, Agoo, La Union;
2 indoor courts; ₱400 per court-hour), with **Dink**, an AI assistant on the public site that answers
player questions and finds free court hours, then hands the player to the normal booking form.

> **5 interview questions for the owner and staff (ask today, write the answers into steps 1, 2 and 6)**
>
> 1. Before the app, how did a player book a court, step by step? Where did you track it (notebook,
>    spreadsheet, Messenger, memory)?
> 2. In a normal week, how many booking messages or calls did you answer, and how long did each one
>    take? What were the most common questions?
> 3. How often did someone reserve and not show up or not pay? What happened to that hour? Any
>    double bookings? Give one recent example.
> 4. How did you record store sales and count the money at the end of the day? Did the money ever
>    not match? By how much?
> 5. If this app (with the assistant that answers questions at night) were a paid service, what
>    would it be worth per month to you? What would make you stop using it?

---

## 1. Define the problem

**Problem statement.** Players who want to rent a court at Serve can't see which hours are free.
They message the yard's page or walk in, and staff answer the same questions (is a court free on
Saturday night, how much, how to pay) by hand and track reservations by hand. Reservations are made
without payment, so unpaid no-shows block hours that other players wanted.

What this costs today:

- **Staff time** spent answering availability and price questions, often outside desk hours.
- **Lost bookings** when a player gets no reply fast enough and plays elsewhere.
- **Dead hours** from reservations that are never paid or shown up for.
- **Errors** from manual tracking: double bookings and lost cancellations.
- **No numbers** for the owner: sales, court use, busiest hours, store stock and cash differences.

Note to confirm: the draft spec says reservations were tracked in a spreadsheet; the PRD says
bookings came by message. Use whichever the owner describes.

> Interview evidence: _(owner quote on how bookings worked before, e.g. "…")_
>
> Interview evidence: _(staff quote on time spent answering messages, with a number per day or week)_
>
> Interview evidence: _(one recent no-show or double-booking example)_

## 2. Profile the target customer

There are two customers: the players who book, and the yard that runs the courts. The app serves
both; Dink is aimed at the player.

| | Primary: casual and regular players | Secondary: the yard (owner and front desk) |
|---|---|---|
| Who | Adults in Agoo and nearby towns, mostly groups of 2–4 friends or family; many new to the sport | Family owner plus a small desk team |
| How they find a court | Facebook groups, Reclub, word of mouth, Messenger | — |
| Device | Phone, GCash or Maya wallet | Phone or a laptop at the desk |
| When they plan | Evenings and weekends, often same day ("tonight after 7?") | Busy at the same peak hours they get messages |
| Job to be done | "Find a free court at a time that suits my group, and lock it in without waiting for a reply" | "Fill the courts, get paid, and stop answering the same questions" |
| Pain | Waiting for a reply; not knowing the price or how to pay; losing the slot | Repetitive questions, unpaid holds, manual cash counts |
| Language | English or Taglish | English or Taglish |

Local signal: the Agoo pickleball community groups on Reclub list 313 members (Agoo Eco Park Smash
Court) and 259 members (Agoo Pickleball Courts), and open play is organised on Reclub across La
Union ([Reclub La Union community](https://reclub.co/communities/la-union-luzon-philippines-552)).
These are people already used to booking and paying for play from their phones.

> Interview evidence: _(staff description of a typical booker: age, group size, how they message, peak days)_
>
> Interview evidence: _(the 3 most common questions players ask, in their words)_

## 3. Size the market (TAM / SAM / SOM)

The app is first a tool for one yard, so the market that matters most is court-hours in Serve's
catchment. A second view sizes the market if the app were offered to other small PH venues.

**View A: court rentals (what Serve can earn)**

| Level | Definition | Estimate | Basis |
|---|---|---|---|
| TAM | Organised pickleball players in the Philippines | ~18,000 federation-registered players in 277 clubs (2025); many more casual players | [Philippine Pickleball Federation (Wikipedia)](https://en.wikipedia.org/wiki/Philippine_Pickleball_Federation) |
| SAM | Players within a short drive of Agoo (Agoo, Aringay, Caba, Sto. Tomas, Rosario, Pugo, San Fernando) | Low thousands; the two Agoo Reclub groups alone have ~570 members (some overlap) | [Reclub La Union](https://reclub.co/communities/la-union-luzon-philippines-552); Agoo population 66,028 ([PSA 2020 census](https://rsso01.psa.gov.ph/node/56333)) |
| SOM | Court-hours Serve can sell | Capacity: 2 courts × 21 bookable hours × 365 days × ₱400 = **₱6.1M a year**. At 30% utilization: **~₱1.8M a year** from court rentals | Serve's own settings (₱400/hr, 4AM–1AM). Utilization target to confirm with the owner |

**View B: booking software for small PH venues (if the app is offered to others later)**

| Level | Definition | Estimate | Basis |
|---|---|---|---|
| TAM | PH pickleball clubs and venues | ~277–400 clubs, plus mall chains (SM Active Hub alone runs 86 courts in 29 malls) | [PPF](https://en.wikipedia.org/wiki/Philippine_Pickleball_Federation), [IPOPHL](https://www.ipophil.gov.ph/news/pickleballs-next-shot-rules-ip-rights-and-the-road-to-the-olympics/), [SM Supermalls](https://www.smsupermalls.com/whats-new/lifestyle/sm-active-hub-leads-the-philippine-pickleball-boom-with-86-courts-nationwide) |
| SAM | Independent 1–6 court venues that take GCash or Maya and run on Messenger | Assume half of the clubs: ~150–200 venues | Assumption |
| SOM | Venues reachable in Northern Luzon in year 1 | 5–10 venues × ~₱1,500/month = ₱90k–₱180k a year | Assumption; price is below CourtReserve and Playtomic entry tiers |

View B is a possible later step, not the goal of this submission.

## 4. Map the competition (gap matrix)

| Need | Facebook page / Messenger | Spreadsheet or notebook | Reclub | Playtomic | CourtReserve | **Serve app + Dink** |
|---|---|---|---|---|---|---|
| Player sees free court-hours live | No | No | Open play sessions, not hourly court rental | Yes | Yes | **Yes** |
| Answers questions at night without staff | No (waits for a reply) | No | No | No | No | **Yes (Dink)** |
| Pay by GCash or Maya QR with proof upload | Manual, in chat | No | Proof upload per club | Card and in-app wallet | Card (US-centric) | **Yes** |
| Unpaid holds release themselves | No | No | Partly (per club) | Yes | Yes | **Yes** |
| No double booking | No | No | n/a | Yes | Yes | **Yes (database rule)** |
| Store POS and daily cash close in the same system | No | No | No | Limited | Add-on | **Yes** |
| Taglish, PH service day (4AM–1AM) | Yes (human) | — | Partly | No | No | **Yes** |
| Cost to the yard | Free | Free | Free for clubs; fees on payments | Subscription from ~$38/month (third-party listing) plus player service fees | From $25–$199/month depending on source and courts | **Hosting only** |

Sources: [Reclub on the App Store](https://apps.apple.com/app/id1323924315) and Reclub club pages
showing the request-pay-upload-proof flow ([example](https://reclub.co/m/Q7951C));
[Playtomic Manager](https://playtomic.com/playtomic-manager),
[Playtomic pricing (third-party)](https://www.softwaresuggest.com/playtomic-manager),
[Playtomic player service fee](https://playerhelp.playtomic.com/hc/en-gb/articles/19831779272337-Service-Fee);
[CourtReserve pricing](https://courtreserve.com/pricing),
[Capterra](https://www.capterra.com/p/152562/courtreserve/),
[Cal.com comparison](https://cal.com/fr/blog/court-scheduling-software). Published software prices
conflict between sources and should be treated as rough.

**The gap:** nobody answers the player's first question ("is there a court tonight, how much, how do
I pay?") instantly, in Taglish, from live data, and then lets them lock the hour with the payment
method they already use. Reclub stays: Serve keeps using it for open play registration, and the app
handles the payment link.

## 5. Define your edge (why now, why us)

**Why now**

- **Demand is ahead of supply.** PH pickleball grew from a niche to hundreds of clubs in about two
  years, and the federation's president names the lack of courts as the main obstacle to growth
  ([Manila Bulletin, Mar 2026](https://mb.com.ph/2026/03/22/pickleball-gains-ground-in-philippines);
  [Daily Tribune, Jun 2026](https://tribune.net.ph/2026/06/23/the-meteoric-rise-of-pickleball-in-phl)).
  When courts are scarce, an hour lost to a slow reply or an unpaid hold is real money.
- **Players already pay by QR.** GCash and Maya are how PH players pay for open play today, so the
  app doesn't need a payment gateway.
- **Small, cheap AI models are now fast and reliable at tool use.** A small Claude model can answer
  and search availability for a fraction of a peso per conversation, which makes a 24/7 assistant
  affordable for a 2-court family business.
- **Sports tech is growing locally** alongside the boom
  ([Philstar, Jun 2026](https://www.philstar.com/bansa/2026/06/12/2534694/pickleball-boom-fuels-sports-tech-growth-philippines)).

**Why us**

- We run the yard, so we know the real rules (4AM–1AM service day, 24-hour notice for early and late
  hours, ₱400/hr, open play on Reclub) and can test with real players every day.
- The booking system, payment checks, reports and store are already live, so Dink has trustworthy
  data to read from instead of guessing.
- Dink is built to be safe by design: it only reads availability and proposes; the player still
  books through the normal form, and no personal data goes to the model.

## 6. Design a cheap test

**Test 1: the live site itself (running now).** The booking site is live at
https://serve-pickleball-yard.vercel.app. Share the link in the yard's Facebook page and the Agoo
groups for one week and measure:

| Measure | How | Pass if |
|---|---|---|
| Share of bookings made online | Bookings with source "online" ÷ all bookings (Reports → Sales, by channel) | ≥ 30% in week 1 |
| Unpaid holds | Expired holds ÷ online bookings | ≤ 25% |
| Dink usefulness | `agent_runs` with outcome `proposed` ÷ all player runs | ≥ 40% of conversations end with a real option |
| Dink to booking | `agent_proposals` with a `booking_ref` ÷ proposals shown | ≥ 15% |
| Cost | Tokens per conversation × model price | < ₱1 per conversation |

**Test 2: the owner and staff interview (today).** Ask the 5 questions at the top. The idea passes if
staff report answering booking questions daily and at least one no-show or double booking in the
last month, and the owner says they would keep using it.

**Test 3: a 10-person hallway test.** Ask 10 players at the yard to find "2 hours this Saturday after
6pm" using Dink on their phone, without help. Pass if 8 of 10 reach the booking form with hours
preselected in under 2 minutes.

> Interview evidence: _(owner's answer to question 5: value per month and what would make them stop)_
>
> Interview evidence: _(results of the hallway test: n of 10 succeeded, median time, what confused people)_
>
> Interview evidence: _(first-week numbers from Reports once collected)_

## 7. Stress-test the idea (risk register)

| # | Risk | Likelihood | Impact | Mitigation | Early warning |
|---|---|---|---|---|---|
| 1 | Players keep messaging instead of using the site | High | High | Pin the link on the page; staff reply to messages with the link; Dink chips for common questions | Online share below 20% after 2 weeks |
| 2 | Dink states a wrong time or price | Medium | High | Every hour, price and booking comes from a tool result in the same turn; prompt forbids answering availability from memory; the form re-validates | Test transcripts; player complaints |
| 3 | Prompt injection ("book me for free", "ignore your rules") | Medium | Medium | Dink has no write tools; proposals are re-validated; price comes from Settings, not the model | Declined outcomes in `agent_runs` |
| 4 | AI cost spikes from abuse | Low | Medium | Limits per message, conversation and step; 20 requests per 10 min per hashed IP counted in `agent_runs`; daily cap; kill switch | Daily runs near `AGENT_DAILY_LIMIT` |
| 5 | Player personal data sent to the AI provider | Low | High | Name, mobile and email are only entered in the booking form; `check_booking` strips the first name; notice on the panel | Review of tool outputs in tests |
| 6 | Staff don't check payment proofs quickly, so players wait | Medium | Medium | Sidebar badge and queue sorted by oldest upload; hold stops running once proof is uploaded | Median upload-to-confirm time over 1 hour |
| 7 | Double booking under load | Low | High | Unique database index on active court-hours (tested: 5 concurrent tries, 1 success) | Any `booking_slots_one_active` conflict error |
| 8 | Competition: a bigger venue or chain opens nearby with an app | Medium | Medium | Compete on location, price and service; Dink and same-day answers as a service advantage | New venue announcements in La Union groups |
| 9 | AI provider outage | Low | Low | Panel shows a short apology and a link to `/book`; booking never depends on Dink | Error outcomes in `agent_runs` |
| 10 | Data privacy obligations (PH Data Privacy Act) | Medium | Medium | Minimum data collected; no chat text stored; privacy notice; review before scaling | Owner decision pending |

**Riskiest assumption:** players will use a website instead of Messenger. Test 1 measures this
directly in the first week.
