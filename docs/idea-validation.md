# Idea validation: Serve Pickleball Yard booking app and Dink

Status: updated with the owner and staff interview and the yard's logbook (November 2026). The
first-week measurement and the hallway test in step 6 are planned for after launch.

The idea: a booking, payment and store system for Serve Pickleball Yard (Santa Fe, Agoo, La Union;
2 indoor courts; ₱400 per court-hour), with **Dink**, an AI assistant on the public site that answers
player questions and finds free court hours, then hands the player to the normal booking form.

> **5 interview questions asked to the owner and staff** (answers are quoted in steps 1, 2 and 6)
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
They ask through Messenger, text, a phone call or Reclub, and staff answer the same two questions
("how much per hour?" and "is this time slot available?") by hand, then write the reservation in a
logbook. No reservation fee is collected, so no-shows and late cancellations cost the yard the hour.
Store sales are also written in a logbook, and the cash doesn't always match.

What this costs today (from the interview):

- **Staff time:** about 20 booking inquiries a week, mostly on Messenger, at about 10 minutes each:
  roughly **3 hours and 20 minutes a week** spent answering availability and price questions.
- **Lost hours:** a few no-shows on court reservations and cancellations on open play slots. With no
  reservation fee, the yard receives nothing for those hours.
- **Risk of errors:** no double booking yet, but four booking channels feed one paper logbook with no
  central record, so the risk grows as bookings grow.
- **Store money and stock:** sales recorded in a logbook don't always match the cash, and the owner
  can't tell whether stock will last the week.
- **No numbers** for the owner: sales, court use, busiest hours.

> Interview evidence (owner and staff, Q1): "We track it using a logbook. The players have multiple
> ways to book: 1. Messenger 2. Text message 3. Phone call 4. Through an app named Reclub, but they
> can't see what the available time slots are so they can pick their options."
>
> Interview evidence (Q2): "Average of 20 inquiries per week, mostly through Messenger. It takes
> around 10 minutes per conversation. Common questions are 'how much per hour?' and 'is this time
> slot available?'"
>
> Interview evidence (Q3): "We have a few no-shows on court reservations and cancellations on open
> play slots. Since we don't ask for a reservation fee, we did not receive any payment. We have not
> experienced any double booking as of now, but there is a chance due to no central database."
>
> Interview evidence (Q4): "We record through a logbook, and yes, sales not matching the cash
> happens. We also don't know if our inventory is still enough for the week."

**What changed after the interview.** The owner confirmed the main pain is answering the same two
questions, not double bookings. That supports Dink's focus: answer price and availability instantly
from live data. Holds with QR payment address the unpaid no-shows. Double booking is a risk to
prevent, not a problem the yard has had.

## 2. Profile the target customer

There are two customers: the players who book, and the yard that runs the courts. The app serves
both; Dink is aimed at the player.

| | Primary: casual and regular players | Secondary: the yard (owner and front desk) |
|---|---|---|
| Who | Players aged 12 to 50 (logbook) in Agoo and nearby towns, in groups of friends or family; many new to the sport | Family owner plus a small desk team |
| How they find a court | Facebook groups, Reclub, word of mouth, Messenger | — |
| Device | Phone, GCash or Maya wallet | Phone or a laptop at the desk |
| When they play | Peak on weekends, from 5PM to 10PM (logbook); often planned the same day ("tonight after 7?") | Busy at the same peak hours they get messages |
| Job to be done | "Find a free court at a time that suits my group, and lock it in without waiting for a reply" | "Fill the courts, get paid, and stop answering the same questions" |
| Pain | Waiting for a reply; not knowing the price or how to pay; losing the slot | Repetitive questions, unpaid holds, manual cash counts |
| Language | English or Taglish | English or Taglish |

Local signal: the Agoo pickleball community groups on Reclub list 313 members (Agoo Eco Park Smash
Court) and 259 members (Agoo Pickleball Courts), and open play is organised on Reclub across La
Union ([Reclub La Union community](https://reclub.co/communities/la-union-luzon-philippines-552)).
These are people already used to booking and paying for play from their phones.

> Interview evidence (Q1, Q2): players reach the yard through four channels (Messenger, text, phone
> call, Reclub), and **most use Messenger**. Their two most common questions are "how much per
> hour?" and "is this time slot available?". Reclub is used, but players "can't see what the
> available time slots are so they can pick their options."

What this means for the profile: the typical booker is already on their phone in a chat app and
wants two facts, price and a free time. Dink answers exactly those two questions in a chat, at any
hour, and shows the free times Reclub doesn't.

> Logbook evidence: players range from 12 to 50 years old. Peak days are weekends, and peak hours
> run from 5PM to 10PM.

What this means for the product: demand is concentrated in about 5 hours on 2 days, so those are
the hours players ask about and the hours lost to no-shows hurt most. Dink's chips ("Tonight after
7", "2 hours this Saturday") target exactly that window, and when it is full Dink offers the nearest
free hours instead. The age range includes minors, which is one more reason Dink never asks for
personal details.

Not recorded in the logbook: usual group size.

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
| SOM | Venues reachable in Northern Luzon in year 1 | 3–5 venues on the same package as Serve (₱200,000 build + ₱6,000/month): ₱600k–₱1.0M in build fees plus ₱216k–₱360k a year in maintenance | Assumption; package agreed with Serve's owner (step 6) |

View B is a possible later step, not the goal of this submission.

## 4. Map the competition (gap matrix)

| Need | Facebook page / Messenger | Logbook (what Serve used) | Reclub | Playtomic | CourtReserve | **Serve app + Dink** |
|---|---|---|---|---|---|---|
| Player sees free court-hours live | No | No | Open play sessions, not hourly court rental | Yes | Yes | **Yes** |
| Answers questions at night without staff | No (waits for a reply) | No | No | No | No | **Yes (Dink)** |
| Pay by GCash or Maya QR with proof upload | Manual, in chat | No | Proof upload per club | Card and in-app wallet | Card (US-centric) | **Yes** |
| Unpaid holds release themselves | No | No | Partly (per club) | Yes | Yes | **Yes** |
| No double booking | No | No | n/a | Yes | Yes | **Yes (database rule)** |
| Store POS and daily cash close in the same system | No | No | No | Limited | Add-on | **Yes** |
| Taglish, PH service day (4AM–1AM) | Yes (human) | — | Partly | No | No | **Yes** |
| Cost to the yard | Free | Free | Free for clubs; fees on payments | Subscription from ~$38/month (third-party listing) plus player service fees | From $25–$199/month depending on source and courts | **₱200,000 one time + ₱6,000/month for 2 years, hosting included; the yard owns the code** |

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

**Test 1: the live site itself (planned: first week after launch).** The booking site is live at
https://serve-pickleball-yard.vercel.app. Share the link in the yard's Facebook page and the Agoo
groups for one week, with weekend 5PM–10PM as the window to watch, and measure:

| Measure | How | Pass if |
|---|---|---|
| Share of bookings made online | Bookings with source "online" ÷ all bookings (Reports → Sales, by channel) | ≥ 30% in week 1 |
| Unpaid holds | Expired holds ÷ online bookings | ≤ 25% |
| Dink usefulness | `agent_runs` with outcome `proposed` ÷ all player runs | ≥ 40% of conversations end with a real option |
| Dink to booking | `agent_proposals` with a `booking_ref` ÷ proposals shown | ≥ 15% |
| Cost | Tokens per conversation × model price | < ₱1 per conversation |

**Test 2: the owner and staff interview (done).** Pass criteria: staff answer booking questions
every week, there have been no-shows or double bookings, and the owner says they would use it.

| Criterion | Result | Pass? |
|---|---|---|
| Staff answer booking questions regularly | About 20 inquiries a week, about 10 minutes each (~3 h 20 min a week) | Yes |
| No-shows or double bookings | A few no-shows and open play cancellations, with no payment received; no double bookings yet | Yes (no-shows); double booking is a risk only |
| Owner would use it | "Yes, this will be helpful for us and the players." | Yes |
| What would make them stop | "If the system has too many steps to book a court or pay rentals." | Becomes a design rule (see risk 11) |

**Pricing model agreed with the owner.** The owner didn't know typical subscription prices and
prefers a one-time development fee plus a maintenance agreement over a monthly subscription. The
agreed package:

| Term | Agreed |
|---|---|
| Development | ₱200,000, one time |
| Maintenance | ₱6,000 a month for 24 months, hosting (Vercel, Supabase) and AI usage included |
| Included support | Up to 4 hours a month of fixes, small changes, security updates and backups; new features quoted separately |
| Response time | Within 1 day |
| Code and data | Owned by the family business |
| After 2 years | Renew, or hand over to a new service provider |
| Two-year total | ₱344,000 (₱200,000 + 24 × ₱6,000) |

For comparison, CourtReserve's published plans of $25–$199 a month come to about ₱35,000–₱280,000
over 2 years, without Taglish AI answers, GCash/Maya proof checks or the store POS (step 4).

Running costs are about ₱2,500–₱3,500 a month, which leaves ₱2,500–₱3,500 a month for support. If
all 4 hours are used every month, that is about ₱625–₱875 an hour (risk 12).

> Interview evidence (Q5): "Yes, this will be helpful for us and the players. [We would stop] if the
> system has too many steps to book a court or pay rentals."

**Test 3: a 10-person hallway test (planned: first weekend after launch).** Ask 10 players at the
yard during the weekend peak to find "2 hours this Saturday after 6pm" using Dink on their phone,
without help. Pass if 8 of 10 reach the booking form with hours preselected in under 2 minutes.
Record how many succeeded, the median time, and what confused people.

| Test | Status | Result |
|---|---|---|
| 1. Live site, first week | Planned | To be read from Reports and `agent_runs` after the first week |
| 2. Owner and staff interview | Done | Passed (see the table above) |
| 3. Hallway test | Planned | To be run on the first weekend after launch |

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
| 11 | Too many steps to book or pay (the owner's stated reason to stop using it) | Medium | High | Dink's "Book these hours" opens the form with hours already selected; one form (name, mobile, email); QR payment with a screenshot; no account needed | Hallway test under 8 of 10; high share of holds that expire unpaid |
| 12 | Maintenance costs more than the fee (hosting price rises, or support uses all 4 hours every month) | Medium | Medium | Hours are a monthly cap; new features quoted separately; keep the stack on standard plans; review the fee at renewal after 2 years | Support hours or running costs above ₱3,500 a month for 3 months in a row |
| 13 | The yard is stuck if the developer is unavailable | Low | High | The family business owns the code and data; README, `CLAUDE.md` and docs let a new provider take over; handover option at the end of the term | Response time over the 1-day agreement |

**Riskiest assumption:** players will use a website instead of Messenger, where most of them ask
today (interview, Q2). Test 1 measures this directly in the first week.
