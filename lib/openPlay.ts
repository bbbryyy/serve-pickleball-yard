// Pure open play helpers (shared by server and client code).
import type { DailyRow } from "./reports";
import { formatHour, formatServiceDate, serviceHours, serviceSlotOf, slotStartFor, type HoursConfig } from "./schedule";

export const MAX_GROUP = 12;

export type OpenPlayDaily = { date: string; method: string; source: string; payments: number; players: number; revenue: number };
export type OpenPlayRefund = { date: string; payments: number; players: number; amount: number };
export type OpenPlaySessionRow = {
  session_id: string;
  date: string;
  starts_at: string;
  ends_at: string;
  courts: number;
  max_players: number;
  players: number;
  status: "open" | "cancelled";
};

export type OpenPlayStatus =
  | "pending_payment"
  | "for_verification"
  | "confirmed"
  | "rejected"
  | "expired"
  | "cancelled"
  | "refund_owed"
  | "refunded";

/** Players one payment can cover: the spots left, at most 12. */
export function maxGroupSize(spotsLeft: number): number {
  return Math.max(0, Math.min(spotsLeft, MAX_GROUP));
}

export function openPlayTotal(players: number, fee: number): number {
  return players * fee;
}

/**
 * Hourly slot starts for a session on `serviceDate` from service hour `fromHour`
 * up to (not including) `toHour`. Late-night hours use 24, 25 for 12AM, 1AM.
 * Returns [] for an empty range or any hour the yard is closed.
 */
export function sessionSlots(serviceDate: string, fromHour: number, toHour: number, rules: HoursConfig): Date[] {
  if (toHour <= fromHour) return [];
  const open = new Set(serviceHours(rules));
  const out: Date[] = [];
  for (let h = fromHour; h < toHour; h++) {
    if (!open.has(h)) return [];
    out.push(slotStartFor(serviceDate, h));
  }
  return out;
}

/** "Sun Nov 22 · 6PM–10PM", dated by the service day (so 10PM–1AM stays on the evening). */
export function formatSessionTime(startsAt: Date, endsAt: Date, rules: HoursConfig): string {
  const a = serviceSlotOf(startsAt, rules);
  const lastHour = serviceSlotOf(new Date(endsAt.getTime() - 3600e3), rules);
  return `${formatServiceDate(a.serviceDate)} · ${formatHour(a.sh)}–${formatHour(lastHour.sh + 1)}`;
}

export function isOpenPlayRef(ref: string): boolean {
  return /^SPY-OP-/i.test(ref.trim());
}

export function parsePlayerNames(raw: string[]): { names: string[] } | { error: string } {
  const names = raw.map((n) => n.trim().replace(/\s+/g, " "));
  if (names.length === 0) return { error: "Add at least one player." };
  if (names.length > MAX_GROUP) return { error: "One payment can cover up to 12 players." };
  if (names.some((n) => n.length < 2 || n.length > 60)) return { error: "Enter each player's name as shown in Reclub." };
  return { names };
}

export function salesSplit(rentals: DailyRow[], openPlay: OpenPlayDaily[], refunds: OpenPlayRefund[]) {
  const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0);
  const r = sum(rentals, (x) => x.revenue);
  const o = sum(openPlay, (x) => x.revenue);
  const f = sum(refunds, (x) => x.amount);
  return {
    rentals: r,
    openPlay: o,
    refunds: f,
    total: r + o - f,
    rentalHours: sum(rentals, (x) => x.hours),
    players: sum(openPlay, (x) => x.players),
  };
}

/**
 * One open play rotation (home page animation). `order` is
 * [left pair, right pair, ...line]: the losing pair goes to the back of the
 * line and the next two in line take their places.
 */
export function rotateCourt(order: number[], losers: "left" | "right"): number[] {
  const [a, b, c, d, ...line] = order;
  const next = line.slice(0, 2);
  const court = losers === "left" ? [...next, c, d] : [a, b, ...next];
  return [...court, ...line.slice(2), ...(losers === "left" ? [a, b] : [c, d])];
}
