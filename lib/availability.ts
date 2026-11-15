import "server-only";
import {
  addDays,
  currentServiceDate,
  lastBookableDate,
  serviceHours,
  serviceSlotOf,
  slotStartFor,
  validateSlot,
  type BookingRules,
  type SlotIssue,
} from "./schedule";
import { createServiceClient } from "./supabase/server";

export type CellState = "available" | "pending" | "booked" | "blocked" | "open_play" | "unavailable";
export type Cell = { iso: string; state: CellState; issue?: SlotIssue };
export type WeekData = {
  monday: string;
  days: string[];
  hours: number[];
  /** key `${serviceDate}|${sh}` */
  cells: Record<string, Cell>;
  prevWeek: string | null;
  nextWeek: string | null;
};

export const cellKey = (date: string, sh: number) => `${date}|${sh}`;

/**
 * Resolve ?week= (the first day shown) to a 7-day window starting today for
 * players, clamped so the last bookable date is still reachable.
 */
export function resolveWeek(requested: string | undefined, rules: BookingRules, now: Date, staff = false) {
  const first = currentServiceDate(now, rules);
  const last = staff ? addDays(first, 52 * 7) : addDays(lastBookableDate(now, rules), -6);
  const wanted = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : first;
  const start = staff ? wanted : wanted < first ? first : wanted > last ? last : wanted;
  return {
    monday: start,
    prevWeek: staff || start > first ? (staff ? addDays(start, -7) : maxDate(first, addDays(start, -7))) : null,
    nextWeek: start < last ? (staff ? addDays(start, 7) : minDate(last, addDays(start, 7))) : null,
  };
}

const maxDate = (a: string, b: string) => (a > b ? a : b);
const minDate = (a: string, b: string) => (a < b ? a : b);

/** Public availability for one court and one week (no personal data). */
export async function getWeek(
  courtId: number,
  requestedWeek: string | undefined,
  rules: BookingRules,
  opts: { staff?: boolean } = {},
): Promise<WeekData> {
  const now = new Date();
  const { monday, prevWeek, nextWeek } = resolveWeek(requestedWeek, rules, now, opts.staff);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const hours = serviceHours(rules);
  const from = slotStartFor(days[0], hours[0]);
  const to = slotStartFor(days[6], hours.at(-1)! + 1);

  const { data, error } = await createServiceClient().rpc("get_availability", {
    p_court_id: courtId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(error.message);

  const taken = new Map<string, CellState>();
  for (const row of data as { slot_start: string; state: CellState }[]) {
    const { serviceDate, sh } = serviceSlotOf(new Date(row.slot_start), rules);
    taken.set(cellKey(serviceDate, sh), row.state);
  }

  const cells: Record<string, Cell> = {};
  for (const d of days) {
    for (const h of hours) {
      const start = slotStartFor(d, h);
      const key = cellKey(d, h);
      const t = taken.get(key);
      if (t) {
        cells[key] = { iso: start.toISOString(), state: t };
        continue;
      }
      const issue = validateSlot(start, now, rules, { staff: opts.staff });
      cells[key] = issue ? { iso: start.toISOString(), state: "unavailable", issue } : { iso: start.toISOString(), state: "available" };
    }
  }
  return { monday, days, hours, cells, prevWeek, nextWeek };
}

