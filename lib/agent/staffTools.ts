import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { salesSplit, sessionSlots } from "../openPlay";
import { adjustPlayers, buildQueue, loadQueueSession } from "../openPlayQueue";
import { getReport } from "../reports";
import { addDays, currentServiceDate, formatHour, formatPeso, formatServiceDate, serviceSlotOf, slotStartFor, toManila } from "../schedule";
import { getCatalog, getStoreDay } from "../storeData";
import { suggestRestock } from "./inventory";
import { describeClashes, MAX_SESSION_HOURS, sessionWindowIssue, type OpenPlayDraft, type TakenHour } from "./openPlayDraft";
import { firstName, gameCounts } from "./queue";
import { DateInput, DateRangeInput, DraftOpenPlayInput, PlanQueueInput, rangeDays, RestockInput } from "./schemas";
import { playerToolDefs, type RunContext, type ToolDef } from "./tools";

const json = (v: unknown) => JSON.stringify(v);
const defineTool = <S extends z.ZodType>(t: { name: string; description: string; schema: S; run: (input: z.infer<S>) => Promise<string> }) =>
  t as unknown as ToolDef;

/** "6:30PM" in Manila time. */
function clock(iso: string) {
  const m = toManila(new Date(iso));
  return formatHour(m.hour).replace(/(AM|PM)$/, `:${String(m.minute).padStart(2, "0")}$1`);
}

/** Hour ranges from sorted service hours: [18,19,21] → "6PM–8PM, 9PM–10PM". */
function hourRanges(hours: number[]): string {
  const s = [...new Set(hours)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const start = s[i];
    while (i + 1 < s.length && s[i + 1] === s[i] + 1) i++;
    out.push(`${formatHour(start)}–${formatHour(s[i] + 1)}`);
  }
  return out.join(", ");
}

type Role = "staff" | "admin";

/**
 * Backoffice Dink tools. They read with the signed-in user's client, so RLS and the RPCs' role
 * checks apply. Read-only: the only write paths are buttons on cards (server actions): the queue
 * card's "Save to session", and for the owner the open play draft card's "Create session".
 */
export function staffToolDefs(ctx: RunContext, db: SupabaseClient, role: Role): ToolDef[] {
  const { rules, courts } = ctx.settings;
  const today = currentServiceDate(ctx.now, rules);
  const used = (name: string) => ctx.toolsUsed.add(name);

  const getSchedule = defineTool({
    name: "get_schedule",
    description: "Who has each court on a service date: bookings (ref, first name, status, source), open play and blocked hours. Use for 'what's booked today/tonight'.",
    schema: DateInput,
    run: async ({ date }) => {
      used("get_schedule");
      const d = date ?? today;
      const from = slotStartFor(d, rules.earlyStart).toISOString();
      const to = slotStartFor(d, 24 + rules.closeHour).toISOString();
      const [{ data: slots, error }, { data: blocks }] = await Promise.all([
        db
          .from("booking_slots")
          .select("court_id, slot_start, bookings(ref, player_name, status, source, hold_expires_at)")
          .eq("active", true)
          .gte("slot_start", from)
          .lt("slot_start", to),
        db.from("blocked_slots").select("court_id, slot_start, reason, kind").gte("slot_start", from).lt("slot_start", to),
      ]);
      if (error) return json({ error: "Couldn't read the schedule." });
      const byBooking = new Map<string, { court: number; ref: string; name: string; status: string; source: string; hours: number[] }>();
      for (const s of slots ?? []) {
        const b = s.bookings as unknown as { ref: string; player_name: string; status: string; source: string; hold_expires_at: string | null };
        if (b.status === "pending_payment" && b.hold_expires_at && new Date(b.hold_expires_at) < ctx.now) continue;
        const { sh } = serviceSlotOf(new Date(s.slot_start), rules);
        const row = byBooking.get(b.ref) ?? { court: s.court_id, ref: b.ref, name: firstName(b.player_name), status: b.status, source: b.source, hours: [] as number[] };
        row.hours.push(sh);
        byBooking.set(b.ref, row);
      }
      const blockMap = new Map<string, { court: number; what: string; hours: number[] }>();
      for (const b of blocks ?? []) {
        const what = b.kind === "open_play" ? "Open play" : `Blocked: ${b.reason}`;
        const key = `${b.court_id}|${what}`;
        const row = blockMap.get(key) ?? { court: b.court_id, what, hours: [] as number[] };
        row.hours.push(serviceSlotOf(new Date(b.slot_start), rules).sh);
        blockMap.set(key, row);
      }
      return json({
        date: d,
        day: formatServiceDate(d),
        courts: courts.map((c) => ({
          court: c.name,
          bookings: [...byBooking.values()]
            .filter((b) => b.court === c.id)
            .sort((a, b) => Math.min(...a.hours) - Math.min(...b.hours))
            .map((b) => ({ hours: hourRanges(b.hours), ref: b.ref, name: b.name, status: b.status, source: b.source })),
          other: [...blockMap.values()].filter((b) => b.court === c.id).map((b) => ({ hours: hourRanges(b.hours), what: b.what })),
        })),
        link: `/backoffice/schedule`,
      });
    },
  });

  const waitingPayments = defineTool({
    name: "list_waiting_payments",
    description:
      "Court bookings and open play payments still waiting: unpaid holds (with when the hold ends) and payment screenshots waiting for staff to check. Dink can't approve or reject; it links to the bookings page.",
    schema: DateInput,
    run: async () => {
      used("list_waiting_payments");
      const [{ data: bookings }, { data: ops }] = await Promise.all([
        db
          .from("bookings")
          .select("ref, player_name, total_amount, status, hold_expires_at, proof_uploaded_at, courts(name), booking_slots(slot_start)")
          .in("status", ["pending_payment", "for_verification"])
          .order("created_at"),
        db
          .from("open_play_payments")
          .select("ref, player_count, total_amount, status, hold_expires_at, proof_uploaded_at, session_id, open_play_players(position, name), open_play_sessions(starts_at)")
          .in("status", ["pending_payment", "for_verification"])
          .order("created_at"),
      ]);
      const live = (r: { status: string; hold_expires_at: string | null }) =>
        r.status === "for_verification" || !r.hold_expires_at || new Date(r.hold_expires_at) > ctx.now;
      const describe = (status: string, hold: string | null) =>
        status === "for_verification" ? "Screenshot uploaded, needs checking" : `Waiting for payment, hold ends ${hold ? clock(hold) : "soon"}`;
      return json({
        court_bookings: (bookings ?? []).filter(live).map((b) => {
          const slots = ((b.booking_slots ?? []) as { slot_start: string }[]).map((s) => serviceSlotOf(new Date(s.slot_start), rules));
          return {
            ref: b.ref,
            name: firstName(b.player_name),
            court: (b.courts as unknown as { name: string } | null)?.name,
            when: slots.length ? `${formatServiceDate(slots[0].serviceDate)} ${hourRanges(slots.map((s) => s.sh))}` : undefined,
            total: formatPeso(b.total_amount),
            state: describe(b.status, b.hold_expires_at),
          };
        }),
        open_play: (ops ?? []).filter(live).map((p) => {
          const lead = [...((p.open_play_players ?? []) as { position: number; name: string }[])].sort((a, b) => a.position - b.position)[0];
          return {
            ref: p.ref,
            name: lead ? firstName(lead.name) : undefined,
            players: p.player_count,
            total: formatPeso(p.total_amount),
            state: describe(p.status, p.hold_expires_at),
          };
        }),
        links: { to_check: "/backoffice?status=for_verification", unpaid: "/backoffice?status=pending_payment" },
      });
    },
  });

  const getStock = defineTool({
    name: "get_stock",
    description: "Store shelf stock: on hand, low-stock level, and which items are low. Use for 'what's low in the store' or 'how many X left'.",
    schema: DateInput,
    run: async () => {
      used("get_stock");
      const items = (await getCatalog()).filter((i) => i.active && i.kind === "shelf");
      return json({
        items: items.map((i) => ({ name: i.name, on_hand: i.on_hand ?? 0, low_at: i.low_stock_at, low: i.low_stock_at !== null && (i.on_hand ?? 0) <= i.low_stock_at })),
        link: "/backoffice/store",
      });
    },
  });

  const getStoreDayTool = defineTool({
    name: "get_store_day",
    description: "Money for one store day by method (cash, GCash, Maya): store sales, walk-in court and open play payments, cash-outs; whether the day is closed; earlier days not yet closed.",
    schema: DateInput,
    run: async ({ date }) => {
      used("get_store_day");
      const d = date ?? (await getStoreDay());
      const [{ data: expected, error }, { data: status }, { data: unclosed }] = await Promise.all([
        db.rpc("store_day_expected", { p_date: d }),
        db.rpc("store_day_status", { p_date: d }),
        db.rpc("store_unclosed_days"),
      ]);
      if (error) return json({ error: "Couldn't read the store day." });
      return json({
        date: d,
        day: formatServiceDate(d),
        expected,
        closed: Boolean((status as { closed?: boolean } | null)?.closed),
        earlier_days_not_closed: ((unclosed ?? []) as string[]).filter((x) => x !== d),
        link: "/backoffice/store/close",
      });
    },
  });

  const planQueueTool = defineTool({
    name: "plan_open_play_queue",
    description:
      "Plan the doubles queue for an open play session from its paid players: rounds per court, who sits out, games per player. Played rounds of a saved queue are kept. The queue appears as a card staff can save; you don't save it.",
    schema: PlanQueueInput,
    run: async ({ date, session_id, minutes_per_game, absent, walk_ins }) => {
      used("plan_open_play_queue");
      const d = date ?? today;
      let id: string | undefined = session_id;
      if (!id) {
        const { data: sessions } = await db
          .from("open_play_sessions")
          .select("id, starts_at, ends_at")
          .eq("service_date", d)
          .eq("status", "open")
          .order("starts_at");
        const upcoming = (sessions ?? []).filter((s) => new Date(s.ends_at) > ctx.now);
        if (!upcoming.length) return json({ error: `No open play session on ${formatServiceDate(d)} that hasn't ended.` });
        if (upcoming.length > 1)
          return json({
            choose_one: upcoming.map((s) => ({ session_id: s.id, time: `${clock(s.starts_at)}–${clock(s.ends_at)}` })),
            note: "Ask which session, then call again with session_id.",
          });
        id = upcoming[0].id;
      }
      const session = await loadQueueSession(db, id as string, rules);
      if (!session || session.status !== "open") return json({ error: "That session isn't open." });
      if (session.endsAt <= ctx.now) return json({ error: "That session has ended." });
      const base = session.saved?.players.length ? session.saved.players : session.paidPlayers;
      const players = adjustPlayers(base, absent, walk_ins);
      if (players.length < 4) return json({ error: `Only ${players.length} players. A doubles queue needs at least 4.`, players });
      const draft = buildQueue(session, players, minutes_per_game, ctx.now);
      ctx.queue = draft;
      const counts = Object.values(gameCounts(draft.rounds));
      return json({
        shown_to_staff_as_card: true,
        session: session.title,
        courts: session.courts,
        players: players.length,
        minutes_per_game,
        rounds: draft.rounds.length,
        rounds_already_played: draft.playedThrough,
        games_per_player: counts.length ? `${Math.min(...counts)}–${Math.max(...counts)}` : "0",
        first_round: draft.rounds[draft.playedThrough],
        replaces_saved_queue: draft.replaces,
        names_not_found: absent.filter((a) => !base.some((p) => p.toLowerCase().startsWith(a.toLowerCase()))),
      });
    },
  });

  // reused from player mode (read-only); staff don't need booking proposal cards
  const shared = playerToolDefs(ctx).filter((t) => ["get_info", "find_options", "find_open_play", "check_booking"].includes(t.name));
  const tools = [getSchedule, waitingPayments, getStock, getStoreDayTool, planQueueTool, ...shared];
  if (role !== "admin") return tools;

  const getSales = defineTool({
    name: "get_sales",
    description: "Owner only. Sales for a date range: court rentals, open play, store sales and profit, refunds, total, court hours, open play players, busiest hours.",
    schema: DateRangeInput,
    run: async ({ date_from, date_to }) => {
      used("get_sales");
      if (!rangeDays(date_from, date_to, 366)) return json({ error: "Use a range of up to 366 days, from before to." });
      const r = await getReport(date_from, date_to);
      const split = salesSplit(r.daily, r.open_play, r.open_play_refunds, r.store);
      const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // ISO day of week
      const busiest = [...r.heat].sort((a, b) => b.hours - a.hours).slice(0, 3).map((h) => `${DOW[h.dow] ?? h.dow} ${formatHour(h.sh)} (${h.hours} court-hours)`);
      return json({
        from: date_from,
        to: date_to,
        court_rentals: formatPeso(split.rentals),
        open_play: formatPeso(split.openPlay),
        store_sales: formatPeso(split.store),
        store_profit: formatPeso(split.storeProfit),
        refunds: formatPeso(split.refunds),
        total: formatPeso(split.total),
        court_hours_sold: split.rentalHours,
        open_play_players: split.players,
        open_play_payments_still_owed_a_refund: r.refunds_owed,
        busiest_hours: busiest,
        link: `/backoffice/reports?from=${date_from}&to=${date_to}`,
      });
    },
  });

  const getStoreReport = defineTool({
    name: "get_store_report",
    description: "Owner only. Store revenue, cost, profit, best sellers and losses for a date range.",
    schema: DateRangeInput,
    run: async ({ date_from, date_to }) => {
      used("get_store_report");
      if (!rangeDays(date_from, date_to, 366)) return json({ error: "Use a range of up to 366 days, from before to." });
      const { data, error } = await db.rpc("store_report", { p_from: date_from, p_to: date_to });
      if (error) return json({ error: "Couldn't read the store report." });
      const rep = data as { daily: { revenue: number; cost: number }[]; items: { name: string; units: number; revenue: number; cost: number }[]; losses: { cost: number }[] };
      const revenue = rep.daily.reduce((t, x) => t + Number(x.revenue), 0);
      const cost = rep.daily.reduce((t, x) => t + Number(x.cost), 0);
      return json({
        from: date_from,
        to: date_to,
        revenue: formatPeso(revenue),
        cost: formatPeso(Math.round(cost)),
        profit: formatPeso(Math.round(revenue - cost)),
        best_sellers: [...rep.items].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((i) => ({ name: i.name, units: i.units, revenue: formatPeso(i.revenue) })),
        losses_cost: formatPeso(Math.round(rep.losses.reduce((t, x) => t + Number(x.cost), 0))),
        link: `/backoffice/reports/store?from=${date_from}&to=${date_to}`,
      });
    },
  });

  const restock = defineTool({
    name: "suggest_restock",
    description: "Owner only. Which shelf items will run out soon and how many to buy, from the last 14 days of sales.",
    schema: RestockInput,
    run: async ({ target_days }) => {
      used("suggest_restock");
      const days = 14;
      const from = addDays(today, -(days - 1));
      const [{ data, error }, catalog] = await Promise.all([db.rpc("store_report", { p_from: from, p_to: today }), getCatalog()]);
      if (error) return json({ error: "Couldn't read store sales." });
      const sold: Record<string, number> = {};
      for (const i of (data as { items: { item_id: string; units: number }[] }).items) sold[i.item_id] = Number(i.units);
      const items = catalog
        .filter((i) => i.active && i.kind === "shelf")
        .map((i) => ({ id: i.id, name: i.name, onHand: i.on_hand ?? 0, lowStockAt: i.low_stock_at ?? 0 }));
      return json({
        based_on: `${formatServiceDate(from)} to ${formatServiceDate(today)}`,
        target_days,
        items: suggestRestock(items, sold, days, target_days).map((s) => ({
          name: s.name,
          on_hand: s.onHand,
          sells_per_day: s.perDay,
          days_left: s.daysLeft,
          buy: s.suggest,
          low_now: s.low,
        })),
        link: "/backoffice/inventory",
      });
    },
  });

  const draftOpenPlay = defineTool({
    name: "draft_open_play_session",
    description:
      "Owner only. Drafts a new open play session (date, hours, courts, optional note) and checks the courts are free. It appears as a card with a \"Create session\" button; the owner taps it to create the session. You don't create it.",
    schema: DraftOpenPlayInput,
    run: async ({ date, from_hour, to_hour, court_ids, note }) => {
      used("draft_open_play_session");
      if (date < today) return json({ error: "That date has passed." });
      const slots = sessionSlots(date, from_hour, to_hour, rules);
      const issue = sessionWindowIssue(from_hour, to_hour, slots, ctx.now);
      if (issue === "end_before_start") return json({ error: "The end time must be after the start time." });
      if (issue === "closed_hours") return json({ error: `Those hours are outside opening hours (${formatHour(rules.earlyStart)} to ${formatHour(24 + rules.closeHour)}).` });
      if (issue === "too_long") return json({ error: `A session can be at most ${MAX_SESSION_HOURS} hours.` });
      if (issue === "started") return json({ error: "That start time has already passed." });

      const ids = [...new Set(court_ids)].sort((a, b) => a - b);
      const picked = courts.filter((c) => ids.includes(c.id));
      if (picked.length !== ids.length) return json({ error: "Unknown court.", courts: courts.map((c) => ({ id: c.id, name: c.name })) });
      const nameOf = (id: number) => courts.find((c) => c.id === id)?.name ?? `Court ${id}`;

      const iso = slots.map((s) => s.toISOString());
      const [{ data: booked, error }, { data: blocked }] = await Promise.all([
        db.from("booking_slots").select("court_id, slot_start, bookings(ref)").eq("active", true).in("court_id", ids).in("slot_start", iso),
        db.from("blocked_slots").select("court_id, slot_start, reason, kind, session_id").in("court_id", ids).in("slot_start", iso),
      ]);
      if (error) return json({ error: "Couldn't check the schedule." });
      const hourOf = (s: string) => serviceSlotOf(new Date(s), rules).sh;
      const taken: TakenHour[] = [
        ...(booked ?? []).map((b) => ({
          courtName: nameOf(b.court_id),
          hour: hourOf(b.slot_start),
          what: `booking ${(b.bookings as unknown as { ref: string } | null)?.ref ?? ""}`.trim(),
        })),
        ...(blocked ?? [])
          .filter((b) => b.kind !== "open_play" || b.session_id !== null)
          .map((b) => ({ courtName: nameOf(b.court_id), hour: hourOf(b.slot_start), what: b.session_id ? "another open play session" : `blocked: ${b.reason}` })),
      ];
      if (taken.length)
        return json({
          error: "Some of those hours are taken, so the session can't be set up as asked.",
          taken: describeClashes(taken),
          tip: "Suggest other hours or courts, or the owner can free the hours in the backoffice first.",
        });

      const draft: OpenPlayDraft = {
        date,
        fromHour: from_hour,
        toHour: to_hour,
        courtIds: ids,
        courtNames: picked.map((c) => c.name),
        note: note ? note : null,
        dateLabel: formatServiceDate(date),
        hoursLabel: `${formatHour(from_hour)}–${formatHour(to_hour)}`,
        fee: ctx.settings.openPlay.fee,
        maxPlayers: ctx.settings.openPlay.playersPerCourt * ids.length,
      };
      ctx.openPlayDraft = draft;
      return json({
        shown_to_owner_as_card: true,
        not_created_yet: "The owner taps Create session on the card.",
        day: draft.dateLabel,
        hours: draft.hoursLabel,
        courts: draft.courtNames,
        fee_per_player: formatPeso(draft.fee),
        max_players: draft.maxPlayers,
        note: draft.note,
      });
    },
  });

  return [...tools, getSales, getStoreReport, restock, draftOpenPlay];
}
