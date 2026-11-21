import { describe, expect, it } from "vitest";
import { suggestRestock } from "./inventory";
import { firstName, firstNames, gameCounts, planQueue, roundStarts, type QueueRound } from "./queue";

const NAMES = ["Ann", "Ben", "Cara", "Dan", "Eli", "Fay", "Gio", "Hal", "Ivy", "Jo", "Kim"];
const COURTS = ["Court 1", "Court 2"];
const starts = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 10, 21, 10, i * 15)).toISOString());

describe("planQueue", () => {
  it("fills every court with 4 different players and seats the rest out", () => {
    const rounds = planQueue({ players: NAMES, courts: COURTS, starts: starts(8), seed: "s1" });
    expect(rounds).toHaveLength(8);
    for (const r of rounds) {
      const playing = r.games.flatMap((g) => [...g.a, ...g.b]);
      expect(r.games).toHaveLength(2);
      expect(new Set(playing).size).toBe(8); // no one plays twice in a round
      expect(r.out).toHaveLength(3);
      expect(new Set([...playing, ...r.out]).size).toBe(11);
    }
  });

  it("keeps everyone within one game of each other", () => {
    const counts = Object.values(gameCounts(planQueue({ players: NAMES, courts: COURTS, starts: starts(16), seed: "s2" })));
    expect(counts).toHaveLength(11);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("mixes partners: no pair partners twice before many rounds", () => {
    const rounds = planQueue({ players: NAMES.slice(0, 8), courts: COURTS, starts: starts(5), seed: "s3" });
    const pairs = new Map<string, number>();
    for (const r of rounds) for (const g of r.games) for (const t of [g.a, g.b]) {
      const k = [...t].sort().join("|");
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    expect(Math.max(...pairs.values())).toBe(1);
  });

  it("gives the same queue for the same seed", () => {
    const a = planQueue({ players: NAMES, courts: COURTS, starts: starts(6), seed: "same" });
    const b = planQueue({ players: NAMES, courts: COURTS, starts: starts(6), seed: "same" });
    expect(a).toEqual(b);
  });

  it("continues fairly after played rounds when players leave and arrive", () => {
    const played = planQueue({ players: NAMES, courts: COURTS, starts: starts(4), seed: "s4" });
    const staying = NAMES.filter((n) => n !== "Ivy");
    const rest = planQueue({ players: [...staying, "Leo"], courts: COURTS, starts: starts(8).slice(4), seed: "s4", played });
    for (const r of rest) expect([...r.games.flatMap((g) => [...g.a, ...g.b]), ...r.out]).not.toContain("Ivy");
    const all: QueueRound[] = [...played, ...rest];
    const counts = gameCounts(all);
    // Leo arrived late: he plays every remaining round to catch up
    expect(counts.Leo).toBe(4);
    const staysCounts = staying.map((n) => counts[n]);
    expect(Math.max(...staysCounts) - Math.min(...staysCounts)).toBeLessThanOrEqual(1);
  });

  it("makes no games with fewer than 4 players", () => {
    expect(planQueue({ players: ["Ann", "Ben", "Cara"], courts: COURTS, starts: starts(1), seed: "x" })[0]).toMatchObject({ games: [], out: ["Ann", "Ben", "Cara"] });
  });
});

describe("roundStarts", () => {
  it("fits whole games inside the session", () => {
    const s = roundStarts(new Date("2026-11-21T10:00:00Z"), new Date("2026-11-21T11:00:00Z"), 15);
    expect(s).toEqual(["2026-11-21T10:00:00.000Z", "2026-11-21T10:15:00.000Z", "2026-11-21T10:30:00.000Z", "2026-11-21T10:45:00.000Z"]);
    expect(roundStarts(new Date("2026-11-21T10:00:00Z"), new Date("2026-11-21T10:50:00Z"), 20)).toHaveLength(2);
  });
});

describe("first names", () => {
  it("keeps only the first name, adding an initial when two players share it", () => {
    expect(firstName("  Juan   dela Cruz ")).toBe("Juan");
    expect(firstNames(["Ana Reyes", "Ana Lim", "Ben Tan", "Ana"])).toEqual(["Ana R.", "Ana L.", "Ben", "Ana"]);
  });
});

describe("suggestRestock", () => {
  const items = [
    { id: "w", name: "Water", onHand: 6, lowStockAt: 5 },
    { id: "g", name: "Gatorade", onHand: 30, lowStockAt: 5 },
    { id: "t", name: "Towel", onHand: 2, lowStockAt: 3 },
    { id: "b", name: "Balls", onHand: 20, lowStockAt: 4 },
  ];
  it("ranks items by days left and suggests enough for the target days above the low level", () => {
    const r = suggestRestock(items, { w: 28, g: 14 }, 14, 14);
    expect(r.map((x) => x.name)).toEqual(["Water", "Gatorade", "Towel"]); // Balls didn't sell and aren't low
    expect(r[0]).toMatchObject({ perDay: 2, daysLeft: 3, suggest: 28 }); // 2×14 + 5 + 1 − 6
    expect(r[1]).toMatchObject({ perDay: 1, daysLeft: 30, suggest: 0 });
    expect(r[2]).toMatchObject({ daysLeft: null, low: true, suggest: 2 }); // back above the low level
  });
});
