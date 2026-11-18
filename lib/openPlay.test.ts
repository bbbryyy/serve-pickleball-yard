import { describe, expect, it } from "vitest";
import type { DailyRow } from "./reports";
import {
  formatSessionTime,
  isOpenPlayRef,
  maxGroupSize,
  openPlayTotal,
  parsePlayerNames,
  rotateCourt,
  salesSplit,
  sessionSlots,
  type OpenPlayDaily,
  type OpenPlayRefund,
} from "./openPlay";
import { DEFAULT_RULES as R } from "./schedule";

describe("group size and totals", () => {
  it("caps a payment at the spots left and at 12 players", () => {
    expect(maxGroupSize(7)).toBe(7);
    expect(maxGroupSize(30)).toBe(12);
    expect(maxGroupSize(-1)).toBe(0);
  });
  it("multiplies players by the session fee", () => {
    expect(openPlayTotal(3, 120)).toBe(360);
  });
});

describe("sessionSlots", () => {
  it("builds hourly starts in Manila time", () => {
    expect(sessionSlots("2026-11-22", 18, 22, R).map((d) => d.toISOString())).toEqual([
      "2026-11-22T10:00:00.000Z",
      "2026-11-22T11:00:00.000Z",
      "2026-11-22T12:00:00.000Z",
      "2026-11-22T13:00:00.000Z",
    ]);
  });
  it("keeps after-midnight hours on the evening's service date", () => {
    expect(sessionSlots("2026-11-22", 22, 25, R).at(-1)!.toISOString()).toBe("2026-11-22T16:00:00.000Z");
  });
  it("refuses closed hours and empty ranges", () => {
    expect(sessionSlots("2026-11-22", 25, 27, R)).toEqual([]);
    expect(sessionSlots("2026-11-22", 18, 18, R)).toEqual([]);
    expect(sessionSlots("2026-11-22", 20, 18, R)).toEqual([]);
  });
});

describe("formatSessionTime", () => {
  it("shows date and hour range in the site's style", () => {
    expect(formatSessionTime(new Date("2026-11-22T10:00:00Z"), new Date("2026-11-22T14:00:00Z"), R)).toBe("Sun Nov 22 · 6PM–10PM");
  });
  it("names the evening for a late-night session", () => {
    expect(formatSessionTime(new Date("2026-11-22T14:00:00Z"), new Date("2026-11-22T17:00:00Z"), R)).toBe("Sun Nov 22 · 10PM–1AM");
  });
});

describe("refs and names", () => {
  it("recognises open play refs", () => {
    expect(isOpenPlayRef("spy-op-4k2q")).toBe(true);
    expect(isOpenPlayRef("SPY-4K2Q7H")).toBe(false);
  });
  it("trims names and rejects short ones", () => {
    expect(parsePlayerNames([" Ana Reyes ", "Juan Dela Cruz"])).toEqual({ names: ["Ana Reyes", "Juan Dela Cruz"] });
    expect(parsePlayerNames([" Ana Reyes ", "J"])).toEqual({ error: "Enter each player's name as shown in Reclub." });
    expect(parsePlayerNames([])).toEqual({ error: "Add at least one player." });
    expect(parsePlayerNames(Array(13).fill("Ana Reyes"))).toEqual({ error: "One payment can cover up to 12 players." });
  });
});

describe("salesSplit", () => {
  it("adds rentals and open play, minus refunds", () => {
    expect(
      salesSplit([{ revenue: 800, hours: 2 } as DailyRow], [{ revenue: 360, players: 3 } as OpenPlayDaily], [{ amount: 120 } as OpenPlayRefund]),
    ).toMatchObject({ rentals: 800, openPlay: 360, refunds: 120, total: 1040, rentalHours: 2, players: 3 });
  });
});

describe("rotateCourt", () => {
  // order = [left pair, right pair, ...line]
  const start = [0, 1, 2, 3, 4, 5, 6, 7];
  it("sends the left pair to the back of the line and brings the next two on", () => {
    expect(rotateCourt(start, "left")).toEqual([4, 5, 2, 3, 6, 7, 0, 1]);
  });
  it("sends the right pair off when they lose", () => {
    expect(rotateCourt(start, "right")).toEqual([0, 1, 4, 5, 6, 7, 2, 3]);
  });
  it("keeps every player exactly once", () => {
    let o = start;
    for (const side of ["left", "right", "right", "left", "left"] as const) o = rotateCourt(o, side);
    expect([...o].sort()).toEqual(start);
  });
});
