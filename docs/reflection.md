# Reflection

Draft, November 2026. Read it once more and change anything that doesn't sound like you.

## What I built

I built a booking, payment and store system for Serve Pickleball Yard, our family's 2-court indoor
venue in Agoo, La Union. Dink is its AI assistant. Players ask Dink about prices, free court hours
and open play, then go to the booking form with their hours already selected. Staff and the owner
can also ask Dink read-only questions about the schedule, payments, stock and sales. The app is
live on Vercel with Supabase behind it.

## How I worked with AI

I gave Claude Code the initial design of the website and the theme colors, which come from our
court: court blue, kitchen gray, surround orange and ball lime. Claude Code wrote all the code. My
job was to check it. I tested every flow myself: booking, paying, staff approval, the store and
reports, on a laptop and on a phone, to make sure it worked and fit small screens.

For Dink, I tested by acting like a player. I tried different requests, asked about dates and
times in different ways, and asked questions that had nothing to do with the yard, to see whether
it stayed on topic and refused things it shouldn't do.

There were also things the AI couldn't do, or could only partly do, on its own, mostly where my
accounts and secret keys were involved. Adding environment variables in Vercel and configuring
Supabase are two examples. The AI walked me through the steps and told me what each value was for,
and I made the changes myself. That kept the keys out of the chat and out of the code.

## Where the AI fell short, and how we fixed it

Testing found real gaps. For example, I asked Dink whether there were open play sessions in the
next 2 weeks. A session was already set up, but Dink couldn't find it, because its tools only
searched for free court hours to rent. We improved Dink by adding an open play finder
(`find_open_play`). It reads the sessions from the schedule and hides ones that have already
ended. The prompt now sends open play questions to it.

I also saw that the AI writes guesses with the same confidence as facts. The first spec said we
tracked bookings in a spreadsheet, but we use a logbook. It also claimed a booking lookup returned
no personal data, when it actually returned the player's first name. Earlier in the project, the AI
redesigned screens without asking, and we reverted those changes three times. Since then, new
designs are shown as mockups first, and that rule is written in the project's AI instructions.

## What I learned

- **Testing is my main job when AI writes the code.** The code usually ran, but only using it like
  a real player showed what was missing.
- **Talk to the users before building more.** The interview showed that the biggest pain was
  answering "how much per hour?" and "is this slot available?" about 20 times a week, not double
  bookings. That is exactly what Dink answers.
- **Keep the AI on rails.** Dink only reads data and suggests options. The player still books
  through the normal form, and no names or mobile numbers go to the AI.
- **A clear spec makes the AI better.** Exact inputs, rules and acceptance criteria gave Claude
  Code something to build and test against.

## What I would improve in v2

1. Dink draft actions: staff type a walk-in, block or restock in one line, and Dink fills in a
   confirm card (GitHub issue #8).
2. A Messenger channel, since that is where most players ask today.
3. Booking confirmations by SMS or email.
4. Run the planned first-week measurement and the hallway test with 10 players, then adjust Dink
   based on what confused them.
5. A privacy review against the PH Data Privacy Act before offering the app to other venues.
