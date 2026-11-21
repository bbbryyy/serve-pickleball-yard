// Pure search for bookable court blocks (no database, no network).
// Hours are service hours: 4 = 4AM … 23 = 11PM, 24 = 12AM, 25 = 1AM of the evening's service date.

export type GridCell = { iso: string; state: string };
export type CourtGrid = { courtId: number; courtName: string; cells: Record<string, GridCell> };

export type FindInput = {
  dates: string[];
  /** service hours the yard is open, in order */
  hours: number[];
  duration: number;
  /** earliest start hour (default: opening) */
  fromHour?: number;
  /** latest end hour, exclusive (default: closing) */
  toHour?: number;
  rate: number;
  limit?: number;
};

export type BlockOption = {
  courtId: number;
  courtName: string;
  date: string;
  startHour: number;
  endHour: number;
  slots: string[];
  total: number;
};

/** Every block of `duration` free hours, per court and date, that starts at or after `from` and ends by `to`. */
function blocks(grids: CourtGrid[], input: FindInput, duration: number, from: number, to: number): BlockOption[] {
  const out: BlockOption[] = [];
  for (const date of input.dates) {
    for (const g of grids) {
      for (const start of input.hours) {
        const end = start + duration;
        if (start < from || end > to) continue;
        const cells: GridCell[] = [];
        for (let h = start; h < end; h++) {
          const c = g.cells[`${date}|${h}`];
          if (!c || c.state !== "available") break;
          cells.push(c);
        }
        if (cells.length !== duration) continue;
        out.push({
          courtId: g.courtId,
          courtName: g.courtName,
          date,
          startHour: start,
          endHour: end,
          slots: cells.map((c) => c.iso),
          total: duration * input.rate,
        });
      }
    }
  }
  return out;
}

/** Keep blocks in order, skipping any that overlaps one already kept on the same court and date. */
function nonOverlapping(list: BlockOption[], limit: number): BlockOption[] {
  const kept: BlockOption[] = [];
  for (const b of list) {
    if (kept.length >= limit) break;
    const clash = kept.some((k) => k.courtId === b.courtId && k.date === b.date && b.startHour < k.endHour && k.startHour < b.endHour);
    if (!clash) kept.push(b);
  }
  return kept;
}

const byTime = (a: BlockOption, b: BlockOption) => a.date.localeCompare(b.date) || a.startHour - b.startHour || a.courtId - b.courtId;

/**
 * Ranked options inside the window (earliest first), or — when none fit — up to 3 nearest
 * alternatives: same length at other times that day (closest to the wanted start), then
 * one hour shorter inside the window.
 */
export function findOptions(grids: CourtGrid[], input: FindInput): { options: BlockOption[]; alternatives: BlockOption[] } {
  const open = input.hours[0];
  const close = input.hours[input.hours.length - 1] + 1;
  const from = input.fromHour ?? open;
  const to = input.toHour ?? close;
  const limit = input.limit ?? 5;

  const options = nonOverlapping(blocks(grids, input, input.duration, from, to).sort(byTime), limit);
  if (options.length) return { options, alternatives: [] };

  const wanted = from;
  const elsewhere = blocks(grids, input, input.duration, open, close).sort(
    (a, b) => a.date.localeCompare(b.date) || Math.abs(a.startHour - wanted) - Math.abs(b.startHour - wanted) || a.courtId - b.courtId,
  );
  let alternatives = nonOverlapping(elsewhere, 3);
  if (!alternatives.length && input.duration > 1) {
    alternatives = nonOverlapping(blocks(grids, input, input.duration - 1, from, to).sort(byTime), 3);
  }
  return { options: [], alternatives };
}

export type OpenPlayBlock = { date: string; startHour: number; endHour: number; courts: string[] };

/** Open play sessions from the grid: runs of consecutive open play hours per date, with the courts they use. */
export function findOpenPlay(grids: CourtGrid[], dates: string[], hours: number[]): OpenPlayBlock[] {
  const out: OpenPlayBlock[] = [];
  for (const date of dates) {
    // which courts are in open play at each hour
    const at = hours.map((h) => grids.filter((g) => g.cells[`${date}|${h}`]?.state === "open_play").map((g) => g.courtName));
    let i = 0;
    while (i < hours.length) {
      if (!at[i].length) {
        i++;
        continue;
      }
      const start = i;
      const courts = new Set(at[i]);
      while (i + 1 < hours.length && at[i + 1].length && hours[i + 1] === hours[i] + 1) {
        i++;
        at[i].forEach((c) => courts.add(c));
      }
      out.push({ date, startHour: hours[start], endHour: hours[i] + 1, courts: [...courts].sort() });
      i++;
    }
  }
  return out;
}
