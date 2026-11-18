import "server-only";
import { addDays, currentServiceDate, mondayOf, serviceHours, type BookingRules } from "./schedule";
import type { OpenPlayDaily, OpenPlayRefund, OpenPlaySessionRow } from "./openPlay";
import { createUserClient } from "./supabase/server";

export type DailyRow = { date: string; court: number; method: string; source: string; bookings: number; hours: number; revenue: number };
export type HeatRow = { dow: number; sh: number; hours: number };

/** Report data via the admin-only RPC (the database rejects non-admins). */
export async function getReport(from: string, to: string) {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("report_summary", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return data as {
    daily: DailyRow[];
    heat: HeatRow[];
    open_play: OpenPlayDaily[];
    open_play_refunds: OpenPlayRefund[];
    open_play_sessions: OpenPlaySessionRow[];
    refunds_owed: number;
  };
}

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export type RangePreset = { key: string; label: string; from: string; to: string };

export function rangePresets(rules: BookingRules, now = new Date()): RangePreset[] {
  const today = currentServiceDate(now, rules);
  const monthStart = today.slice(0, 8) + "01";
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { key: "this-week", label: "This week", from: mondayOf(today), to: today },
    { key: "this-month", label: "This month", from: monthStart, to: today },
    { key: "last-month", label: "Last month", from: lastMonthEnd.slice(0, 8) + "01", to: lastMonthEnd },
    { key: "90d", label: "Last 90 days", from: addDays(today, -89), to: today },
    { key: "12m", label: "Last 12 months", from: addDays(today, -364), to: today },
  ];
}

export function resolveRange(sp: Record<string, string | string[] | undefined>, rules: BookingRules, fallback: string) {
  const presets = rangePresets(rules);
  const preset = presets.find((p) => p.key === sp.range);
  if (preset) return { ...preset };
  if (isDate(sp.from) && isDate(sp.to) && sp.from <= sp.to) return { key: "custom", label: "Custom", from: sp.from, to: sp.to };
  return { ...presets.find((p) => p.key === fallback)! };
}

export function sum<T>(rows: T[], f: (r: T) => number) {
  return rows.reduce((a, r) => a + f(r), 0);
}

export function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400e3) + 1;
}

/** Bookable court-hours in a range (for utilization). */
export function capacityHours(from: string, to: string, rules: BookingRules, courts: number) {
  return daysBetween(from, to) * serviceHours(rules).length * courts;
}
