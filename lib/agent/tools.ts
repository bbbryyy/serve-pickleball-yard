import "server-only";
import type { z } from "zod";
import { getWeek } from "../availability";
import { getPublicBooking, STATUS_TEXT } from "../booking";
import { CONTACT, DIRECTIONS_URL, RECLUB_URL } from "../contact";
import { formatSessionTime, isOpenPlayRef } from "../openPlay";
import { getOpenPlayPaymentPublic, OPEN_PLAY_STATUS_TEXT } from "../openPlayData";
import {
  addDays,
  currentServiceDate,
  formatHour,
  formatPeso,
  formatServiceDate,
  groupSlots,
  lastBookableDate,
  serviceHours,
  slotStartFor,
} from "../schedule";
import type { SiteSettings } from "../settings";
import { createServiceClient } from "../supabase/server";
import type { QueueDraft } from "./queue";
import { findOpenPlay, findOptions, type BlockOption, type CourtGrid, type OpenPlayBlock } from "./findOptions";
import { checkDateRange, CheckBookingInput, FindOpenPlayInput, FindOptionsInput, GetInfoInput, ProposeInput } from "./schemas";

/** A booking proposal shown to the player as an option card with a "Book these hours" button. */
export type ProposalCard = {
  proposalId: string;
  courtName: string;
  dateLabel: string;
  hoursLabel: string;
  total: number;
  href: string;
};

/** Per-request state the route reads after the run. */
export type RunContext = {
  runId: string;
  settings: SiteSettings;
  now: Date;
  toolsUsed: Set<string>;
  cards: ProposalCard[];
  sawNoOptions: boolean;
  /** staff mode: a planned open play queue to show as a card */
  queue?: QueueDraft;
};

const json = (v: unknown) => JSON.stringify(v);
const hoursLabel = (start: number, end: number) => `${formatHour(start)}–${formatHour(end)}`;

/** Free/taken cells for every court over the given service dates (from the public availability RPC). */
async function loadGrids(settings: SiteSettings, dates: string[]): Promise<CourtGrid[]> {
  const { rules, courts } = settings;
  const weekStarts = [dates[0], ...(dates.length > 7 ? [addDays(dates[0], 7)] : [])];
  return Promise.all(
    courts.map(async (c) => {
      const weeks = await Promise.all(weekStarts.map((w) => getWeek(c.id, w, rules)));
      return { courtId: c.id, courtName: c.name, cells: Object.assign({}, ...weeks.map((w) => w.cells)) };
    }),
  );
}

const describe = (o: BlockOption) => ({
  court_id: o.courtId,
  court: o.courtName,
  date: o.date,
  day: formatServiceDate(o.date),
  start_hour: o.startHour,
  hours: hoursLabel(o.startHour, o.endHour),
  total: formatPeso(o.total),
});

/** A tool both providers can run: a Zod input schema and a function returning JSON text for the model. */
export type ToolDef = { name: string; description: string; schema: z.ZodType; run: (input: never) => Promise<string> };
const defineTool = <S extends z.ZodType>(t: { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<string> }) =>
  t as unknown as ToolDef;

/** Player-mode tools: read-only, plus proposals that only become bookings when the player fills in the form. */
export function playerToolDefs(ctx: RunContext): ToolDef[] {
  const { rules, courts, gcash, maya, openPlay } = ctx.settings;
  const today = currentServiceDate(ctx.now, rules);
  const lastDay = lastBookableDate(ctx.now, rules);
  const used = (name: string) => ctx.toolsUsed.add(name);

  const getInfo = defineTool({
    name: "get_info",
    description:
      "Policies and facts about Serve Pickleball Yard: hours, rates, booking rules, how to pay, open play, location and contact. Use for any question about how the yard works.",
    schema: GetInfoInput,
    run: async ({ topic }) => {
      used("get_info");
      const close = 24 + rules.closeHour;
      const info = {
        hours_and_rates: {
          courts: courts.map((c) => c.name),
          open: `${formatHour(rules.earlyStart)}–${formatHour(close)} every day`,
          bands: {
            early_bird: hoursLabel(rules.earlyStart, rules.regularStart),
            regular: hoursLabel(rules.regularStart, rules.lateStart),
            late_night: hoursLabel(rules.lateStart, close),
          },
          rate: `${formatPeso(rules.ratePerHour)} per court per hour`,
          off_hours_notice: `Early bird and late night need at least ${rules.offhoursLeadHours} hours' notice`,
          booking_window: `Up to ${rules.maxWeeksAhead} weeks ahead`,
        },
        how_to_book_and_pay: {
          steps: [
            "Pick court and hours on the Book a court page (or tap Book these hours from Dink)",
            "Enter name, mobile and email in the form",
            `Your hours are held for ${rules.holdMinutes} minutes`,
            "Pay by GCash or Maya QR and upload the payment screenshot",
            "Staff check the payment and confirm the booking; check status any time with your SPY- reference",
          ],
          payment_methods: [gcash.qrUrl || gcash.number ? "GCash" : null, maya.qrUrl || maya.number ? "Maya" : null].filter(Boolean),
          no_card_payments: true,
        },
        open_play: {
          fee: `${formatPeso(openPlay.fee)} per player`,
          players_per_court: openPlay.playersPerCourt,
          how_to_join: `Register on Reclub (${RECLUB_URL}), then pay through the session's payment link; walk-ins welcome when spots are left`,
        },
        location_and_contact: {
          address: CONTACT.address,
          phone: CONTACT.phone,
          email: CONTACT.email,
          messenger: CONTACT.messenger,
          directions: DIRECTIONS_URL,
        },
      };
      return json(topic === "all" ? info : { [topic]: info[topic] });
    },
  });

  const findOptionsTool = defineTool({
    name: "find_options",
    description:
      "Find open courts for a duration within a date range (max 14 days) and an optional time window, using live availability. Returns up to 5 options, or nearest alternatives when nothing fits.",
    schema: FindOptionsInput,
    run: async (input) => {
      used("find_options");
      const issue = checkDateRange(input.date_from, input.date_to, today, lastDay);
      if (issue) {
        const why = {
          past: `Dates must be ${today} or later.`,
          reversed: "date_to must be on or after date_from.",
          too_long: "Search at most 14 days at a time.",
          too_far: `Bookings open up to ${lastDay}.`,
        }[issue];
        return json({ error: why });
      }
      const last = input.date_to > lastDay ? lastDay : input.date_to;
      const dates: string[] = [];
      for (let d = input.date_from; d <= last; d = addDays(d, 1)) dates.push(d);
      const grids = await loadGrids(ctx.settings, dates);
      const { options, alternatives } = findOptions(grids, {
        dates,
        hours: serviceHours(rules),
        duration: input.duration_hours,
        fromHour: input.after_hour,
        toHour: input.before_hour,
        rate: rules.ratePerHour,
      });
      if (!options.length) ctx.sawNoOptions = true;
      return json({
        options: options.map(describe),
        alternatives: alternatives.map(describe),
        note: options.length ? undefined : "Nothing fits exactly. Offer the alternatives, if any.",
      });
    },
  });

  const propose = defineTool({
    name: "propose_booking",
    description:
      "Re-check one option from find_options against live availability and show the player a 'Book these hours' button for it. Call for each of the best 1–3 options. It does not book or hold anything.",
    schema: ProposeInput,
    run: async ({ court_id, date, start_hour, duration_hours }) => {
      used("propose_booking");
      const court = courts.find((c) => c.id === court_id);
      if (!court) return json({ ok: false, reason: "Unknown court." });
      if (checkDateRange(date, date, today, lastDay)) return json({ ok: false, reason: "That date can't be booked." });
      const [grid] = await loadGrids({ ...ctx.settings, courts: [court] }, [date]);
      const slots: string[] = [];
      for (let h = start_hour; h < start_hour + duration_hours; h++) {
        const cell = grid.cells[`${date}|${h}`];
        if (!cell || cell.state !== "available") return json({ ok: false, reason: "Those hours aren't free any more. Search again." });
        slots.push(cell.iso);
      }
      const total = duration_hours * rules.ratePerHour;
      const { data, error } = await createServiceClient()
        .from("agent_proposals")
        .insert({ run_id: ctx.runId, court_id, slots, total })
        .select("id")
        .single();
      if (error || !data) return json({ ok: false, reason: "Couldn't prepare that option. Try again." });
      const label = hoursLabel(start_hour, start_hour + duration_hours);
      const params = new URLSearchParams({ court: String(court_id), week: date, slots: slots.join(","), via: data.id });
      ctx.cards.push({
        proposalId: data.id,
        courtName: court.name,
        dateLabel: formatServiceDate(date),
        hoursLabel: label,
        total,
        href: `/book?${params.toString()}`,
      });
      return json({ ok: true, shown_to_player: `${court.name}, ${formatServiceDate(date)}, ${label}, ${formatPeso(total)}` });
    },
  });

  const findOpenPlayTool = defineTool({
    name: "find_open_play",
    description:
      "List scheduled open play sessions in a date range (max 14 days): date, time and courts. Use whenever the player asks about open play days or times.",
    schema: FindOpenPlayInput,
    run: async (input) => {
      used("find_open_play");
      const issue = checkDateRange(input.date_from, input.date_to, today, lastDay);
      if (issue) return json({ error: issue === "too_long" ? "Search at most 14 days at a time." : `Search dates from ${today} to ${lastDay}.` });
      const dates: string[] = [];
      for (let d = input.date_from; d <= input.date_to; d = addDays(d, 1)) dates.push(d);
      const grids = await loadGrids(ctx.settings, dates);
      // drop sessions that already ended; flag the one running now
      const sessions = findOpenPlay(grids, dates, serviceHours(rules)).filter((s) => slotStartFor(s.date, s.endHour) > ctx.now);
      const runningNow = (s: { date: string; startHour: number }) => slotStartFor(s.date, s.startHour) <= ctx.now;
      const show = (s: OpenPlayBlock) => ({ date: s.date, day: formatServiceDate(s.date), hours: hoursLabel(s.startHour, s.endHour), courts: s.courts, running_now: runningNow(s) || undefined });
      // nothing in the asked dates: look up to 14 more days so Dink can mention the next session
      let next: OpenPlayBlock | undefined;
      if (!sessions.length && input.date_to < lastDay) {
        const later: string[] = [];
        for (let d = addDays(input.date_to, 1); d <= lastDay && later.length < 14; d = addDays(d, 1)) later.push(d);
        next = findOpenPlay(await loadGrids(ctx.settings, later), later, serviceHours(rules))[0];
      }
      return json({
        sessions: sessions.map(show),
        next_session_after_these_dates: next ? show(next) : undefined,
        fee: `${formatPeso(openPlay.fee)} per player`,
        how_to_join: `Register on Reclub (${RECLUB_URL}), then pay through the session's payment link; walk-ins welcome when spots are left`,
        note: sessions.length
          ? undefined
          : next
            ? "None in these dates. Tell the player about the next session after them."
            : "No open play scheduled in these dates yet. Suggest checking Reclub or booking a court.",
      });
    },
  });

  const checkBooking = defineTool({
    name: "check_booking",
    description: "Look up a booking or open play payment by its reference (SPY-XXXXXX or SPY-OP-XXXX). Returns status only, no personal details.",
    schema: CheckBookingInput,
    run: async ({ ref }) => {
      used("check_booking");
      const r = ref.trim().toUpperCase();
      if (isOpenPlayRef(r)) {
        const p = await getOpenPlayPaymentPublic(r);
        if (!p) return json({ found: false });
        return json({
          found: true,
          kind: "open play",
          status: OPEN_PLAY_STATUS_TEXT[p.status].label,
          what_next: OPEN_PLAY_STATUS_TEXT[p.status].body,
          session: formatSessionTime(new Date(p.starts_at), new Date(p.ends_at), rules),
          players: p.player_count,
          total: formatPeso(p.total_amount),
        });
      }
      const b = await getPublicBooking(r);
      if (!b) return json({ found: false });
      return json({
        found: true,
        kind: "court booking",
        status: STATUS_TEXT[b.status].label,
        what_next: STATUS_TEXT[b.status].body,
        court: b.court_name,
        hours: groupSlots(b.slots.map((s) => new Date(s)), rules),
        total: formatPeso(b.total_amount),
        hold_ends: b.status === "pending_payment" ? b.hold_expires_at : undefined,
      });
    },
  });

  return [getInfo, findOptionsTool, propose, findOpenPlayTool, checkBooking];
}
