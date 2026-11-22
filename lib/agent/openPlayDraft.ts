// Owner Dink: a drafted open play session, shown as a card. Dink never creates it; the owner taps
// "Create session", which runs the same RPC as the Open play screen. Pure helpers (no I/O).
import { formatHour } from "../schedule";

export type OpenPlayDraft = {
  date: string;
  fromHour: number;
  toHour: number;
  courtIds: number[];
  courtNames: string[];
  note: string | null;
  dateLabel: string;
  hoursLabel: string;
  fee: number;
  maxPlayers: number;
};

export type WindowIssue = "end_before_start" | "closed_hours" | "too_long" | "started";

export const MAX_SESSION_HOURS = 21;

/** Why a session window can't be used, or null. `slots` comes from sessionSlots() (empty when any hour is closed). */
export function sessionWindowIssue(fromHour: number, toHour: number, slots: Date[], now: Date): WindowIssue | null {
  if (toHour <= fromHour) return "end_before_start";
  if (slots.length === 0) return "closed_hours";
  if (slots.length > MAX_SESSION_HOURS) return "too_long";
  if (slots[0] <= now) return "started";
  return null;
}

export type TakenHour = { courtName: string; hour: number; what: string };

/** Groups taken hours per court and kind: "Court 1: 6PM–8PM (booking SPY-7K3QXM)". */
export function describeClashes(taken: TakenHour[]): string[] {
  const groups = new Map<string, { courtName: string; what: string; hours: number[] }>();
  for (const t of taken) {
    const key = `${t.courtName}|${t.what}`;
    const g = groups.get(key) ?? { courtName: t.courtName, what: t.what, hours: [] };
    g.hours.push(t.hour);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const hours = [...new Set(g.hours)].sort((a, b) => a - b);
    const ranges: string[] = [];
    for (let i = 0; i < hours.length; i++) {
      const start = hours[i];
      while (i + 1 < hours.length && hours[i + 1] === hours[i] + 1) i++;
      ranges.push(`${formatHour(start)}–${formatHour(hours[i] + 1)}`);
    }
    return `${g.courtName}: ${ranges.join(", ")} (${g.what})`;
  });
}
