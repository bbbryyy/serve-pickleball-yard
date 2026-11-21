// Tool input schemas for Dink (validated on the server before any tool runs).
import { z } from "zod";
import { addDays } from "../schedule";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
/** service hours: 4 = 4AM … 24 = 12AM, 25 = 1AM (late night belongs to the evening before) */
const serviceHour = z.number().int().min(4).max(26);

export const MAX_RANGE_DAYS = 14;

export const FindOptionsInput = z.object({
  date_from: isoDate.describe("First service date to search, YYYY-MM-DD"),
  date_to: isoDate.describe("Last service date to search, YYYY-MM-DD (at most 14 days after date_from)"),
  duration_hours: z.number().int().min(1).max(6).describe("How many hours in a row"),
  after_hour: serviceHour.optional().describe("Earliest start, service hour: 18 = 6PM, 24 = 12AM"),
  before_hour: serviceHour.optional().describe("Latest end, service hour: 22 = 10PM, 25 = 1AM"),
});

export const ProposeInput = z.object({
  court_id: z.number().int().positive(),
  date: isoDate.describe("Service date of the block"),
  start_hour: serviceHour.describe("Start, service hour"),
  duration_hours: z.number().int().min(1).max(6),
});

export const CheckBookingInput = z.object({
  ref: z.string().trim().regex(/^SPY-(OP-)?[A-Z2-9]{4,6}$/i, "A reference looks like SPY-7K3QXM"),
});

export const GetInfoInput = z.object({
  topic: z.enum(["hours_and_rates", "how_to_book_and_pay", "open_play", "location_and_contact", "all"]).default("all"),
});

export const FindOpenPlayInput = z.object({
  date_from: isoDate.describe("First service date to search, YYYY-MM-DD"),
  date_to: isoDate.describe("Last service date to search, YYYY-MM-DD (at most 14 days after date_from)"),
});

export type DateRangeIssue = "past" | "reversed" | "too_long" | "too_far";

/** Checks a search range against today and the last bookable date (all YYYY-MM-DD). */
export function checkDateRange(from: string, to: string, today: string, lastBookable: string): DateRangeIssue | null {
  if (from < today) return "past";
  if (to < from) return "reversed";
  if (to > addDays(from, MAX_RANGE_DAYS - 1)) return "too_long";
  if (from > lastBookable) return "too_far";
  return null;
}
