/**
 * Court schedule rules. Pure functions, no I/O — shared by the booking grid,
 * server actions and tests. The same rules are enforced again in SQL
 * (supabase/migrations: validate_slot) so the database is the final guard.
 *
 * Time model
 * - All business logic runs in Manila time (UTC+8, no DST).
 * - A "service day" runs from the early-bird open hour (4AM) to closing
 *   (1AM the next calendar day). Slots after midnight belong to the service
 *   day before them, so "Saturday 12AM" means the hour after Saturday 11PM.
 * - A service hour `sh` is 4..24 where 24 = 12AM of the next calendar date.
 */

export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type HoursConfig = {
  /** Early bird opens (Manila hour), e.g. 4 */
  earlyStart: number;
  /** Regular hours start, e.g. 9 */
  regularStart: number;
  /** Late night starts, e.g. 22 */
  lateStart: number;
  /** Closing hour after midnight, e.g. 1 (= 1AM next day) */
  closeHour: number;
};

export type BookingRules = HoursConfig & {
  offhoursLeadHours: number;
  maxWeeksAhead: number;
  ratePerHour: number;
  holdMinutes: number;
};

export const DEFAULT_RULES: BookingRules = {
  earlyStart: 4,
  regularStart: 9,
  lateStart: 22,
  closeHour: 1,
  offhoursLeadHours: 24,
  maxWeeksAhead: 8,
  ratePerHour: 400,
  holdMinutes: 30,
};

export type Band = "early" | "regular" | "late";

export const BAND_LABEL: Record<Band, string> = {
  early: "Early bird",
  regular: "Regular hours",
  late: "Late night",
};

/** Service hours in display order, e.g. [4, 5, ..., 23, 24] */
export function serviceHours(c: HoursConfig): number[] {
  const out: number[] = [];
  for (let h = c.earlyStart; h < 24 + c.closeHour; h++) out.push(h);
  return out;
}

export function bandOf(sh: number, c: HoursConfig): Band | null {
  if (sh < c.earlyStart || sh >= 24 + c.closeHour) return null;
  if (sh < c.regularStart) return "early";
  if (sh < c.lateStart) return "regular";
  return "late";
}

export function isOffHours(sh: number, c: HoursConfig): boolean {
  const b = bandOf(sh, c);
  return b === "early" || b === "late";
}

// ---------- dates (YYYY-MM-DD strings, Manila calendar) ----------

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymdFromUtcFields(t: Date): string {
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return ymdFromUtcFields(new Date(Date.UTC(y, m - 1, d) + n * DAY_MS));
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function mondayOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/** Manila wall-clock parts of an instant */
export function toManila(d: Date) {
  const t = new Date(d.getTime() + MANILA_OFFSET_MS);
  return {
    date: ymdFromUtcFields(t),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    second: t.getUTCSeconds(),
    ms: t.getUTCMilliseconds(),
  };
}

/** The service day (Manila) that `now` falls in. Between midnight and early open it is still "yesterday". */
export function currentServiceDate(now: Date, c: HoursConfig): string {
  const m = toManila(now);
  return m.hour < c.earlyStart ? addDays(m.date, -1) : m.date;
}

/** UTC instant for a service date + service hour */
export function slotStartFor(serviceDate: string, sh: number): Date {
  const [y, m, d] = serviceDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, sh) - MANILA_OFFSET_MS);
}

/** Inverse of slotStartFor */
export function serviceSlotOf(start: Date, c: HoursConfig): { serviceDate: string; sh: number } {
  const m = toManila(start);
  if (m.hour < c.earlyStart) return { serviceDate: addDays(m.date, -1), sh: m.hour + 24 };
  return { serviceDate: m.date, sh: m.hour };
}

// ---------- validation ----------

/** Last service date players can book: today + maxWeeksAhead weeks */
export function lastBookableDate(now: Date, r: BookingRules): string {
  return addDays(currentServiceDate(now, r), r.maxWeeksAhead * 7);
}

export type SlotIssue = "not_on_hour" | "closed" | "past" | "too_far" | "offhours_lead";

export const SLOT_ISSUE_TEXT: Record<SlotIssue, string> = {
  not_on_hour: "Bookings start on the hour only.",
  closed: "The court is closed at that hour.",
  past: "That hour has already started.",
  too_far: "That date is beyond the booking window.",
  offhours_lead: "Early bird and late night hours must be booked at least 24 hours ahead.",
};

export type ValidateOptions = {
  /** Staff walk-in/phone bookings skip the lead-time and window rules */
  staff?: boolean;
};

export function validateSlot(
  start: Date,
  now: Date,
  r: BookingRules,
  opts: ValidateOptions = {},
): SlotIssue | null {
  const m = toManila(start);
  if (m.minute !== 0 || m.second !== 0 || m.ms !== 0) return "not_on_hour";
  const { sh } = serviceSlotOf(start, r);
  if (bandOf(sh, r) === null) return "closed";
  if (start.getTime() <= now.getTime()) return "past";
  if (opts.staff) return null;
  if (lastBookableDate(now, r) < serviceSlotOf(start, r).serviceDate) return "too_far";
  if (isOffHours(sh, r) && start.getTime() - now.getTime() < r.offhoursLeadHours * HOUR_MS)
    return "offhours_lead";
  return null;
}

// ---------- formatting ----------

/** 13 -> "1PM", 24 -> "12AM", 25 -> "1AM" */
export function formatHour(sh: number): string {
  const h = sh % 24;
  const x = h % 12 || 12;
  return `${x}${h < 12 ? "AM" : "PM"}`;
}

export function formatSlot(start: Date, c: HoursConfig): string {
  const { serviceDate, sh } = serviceSlotOf(start, c);
  return `${formatServiceDate(serviceDate)} · ${formatHour(sh)}–${formatHour(sh + 1)}`;
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatServiceDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${DAY_SHORT[weekdayIndex(date)]} ${MONTH_SHORT[m - 1]} ${d}`;
}

export function dayShort(date: string) {
  return DAY_SHORT[weekdayIndex(date)];
}

export function monthShort(date: string) {
  return MONTH_SHORT[Number(date.split("-")[1]) - 1];
}

/**
 * Group sorted slot starts into contiguous runs, for compact display:
 * "Sat Nov 21 · 6PM–8PM".
 */
export function groupSlots(starts: Date[], c: HoursConfig): string[] {
  const sorted = [...starts].sort((a, b) => a.getTime() - b.getTime());
  const out: string[] = [];
  let runStart: Date | null = null;
  let prev: Date | null = null;
  const flush = () => {
    if (!runStart || !prev) return;
    const a = serviceSlotOf(runStart, c);
    const b = serviceSlotOf(prev, c);
    out.push(`${formatServiceDate(a.serviceDate)} · ${formatHour(a.sh)}–${formatHour(b.sh + 1)}`);
  };
  for (const s of sorted) {
    if (prev && s.getTime() - prev.getTime() === HOUR_MS) {
      prev = s;
      continue;
    }
    flush();
    runStart = s;
    prev = s;
  }
  flush();
  return out;
}

export function formatPeso(n: number): string {
  return `₱${n.toLocaleString("en-PH")}`;
}
