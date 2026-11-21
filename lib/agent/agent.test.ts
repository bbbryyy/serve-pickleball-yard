import { describe, expect, it } from "vitest";
import { DEFAULT_RULES as R, slotStartFor } from "../schedule";
import { findOpenPlay, findOptions, type CourtGrid } from "./findOptions";
import { checkConversation, isRateLimited, LIMITS } from "./limits";
import { buildSystemPrompt } from "./prompt";
import { checkDateRange, CheckBookingInput, FindOptionsInput, ProposeInput } from "./schemas";

// a grid for one court: every hour 4AM–1AM available unless listed in `taken`
function grid(courtId: number, dates: string[], taken: string[] = [], unavailable: string[] = []): CourtGrid {
  const cells: CourtGrid["cells"] = {};
  for (const d of dates) {
    for (let h = 4; h < 25; h++) {
      const key = `${d}|${h}`;
      cells[key] = {
        iso: slotStartFor(d, h).toISOString(),
        state: taken.includes(key) ? "booked" : unavailable.includes(key) ? "unavailable" : "available",
      };
    }
  }
  return { courtId, courtName: `Court ${courtId}`, cells };
}
const HOURS = Array.from({ length: 21 }, (_, i) => 4 + i);

describe("findOptions", () => {
  it("finds 2-hour blocks inside the time window with the ₱ total", () => {
    const sat = "2026-11-28";
    const r = findOptions([grid(1, [sat]), grid(2, [sat])], { dates: [sat], hours: HOURS, duration: 2, fromHour: 18, toHour: 22, rate: 400 });
    expect(r.options.length).toBeGreaterThan(0);
    for (const o of r.options) {
      expect(o.startHour).toBeGreaterThanOrEqual(18);
      expect(o.endHour).toBeLessThanOrEqual(22);
      expect(o.endHour - o.startHour).toBe(2);
      expect(o.total).toBe(800);
      expect(o.slots).toHaveLength(2);
    }
    expect(r.options[0]).toMatchObject({ courtId: 1, date: sat, startHour: 18, endHour: 20 });
  });

  it("skips booked and unavailable hours", () => {
    const d = "2026-11-28";
    const r = findOptions([grid(1, [d], [`${d}|18`, `${d}|19`], [`${d}|20`])], { dates: [d], hours: HOURS, duration: 2, fromHour: 18, toHour: 23, rate: 400 });
    expect(r.options.map((o) => [o.startHour, o.endHour])).toEqual([[21, 23]]);
  });

  it("keeps late-night blocks on the evening's service date across midnight", () => {
    const d = "2026-11-28";
    const r = findOptions([grid(1, [d])], { dates: [d], hours: HOURS, duration: 2, fromHour: 23, toHour: 25, rate: 400 });
    expect(r.options[0]).toMatchObject({ date: d, startHour: 23, endHour: 25 });
    expect(r.options[0].slots[1]).toBe(slotStartFor(d, 24).toISOString()); // 12AM Sunday belongs to Saturday
  });

  it("does not offer overlapping blocks on the same court", () => {
    const d = "2026-11-28";
    const r = findOptions([grid(1, [d])], { dates: [d], hours: HOURS, duration: 2, fromHour: 18, toHour: 22, rate: 400 });
    expect(r.options.map((o) => o.startHour)).toEqual([18, 20]);
  });

  it("offers nearest alternatives when nothing fits the window", () => {
    const d = "2026-11-28";
    const full = [18, 19, 20, 21].map((h) => `${d}|${h}`);
    const r = findOptions([grid(1, [d], full), grid(2, [d], full)], { dates: [d], hours: HOURS, duration: 2, fromHour: 18, toHour: 22, rate: 400 });
    expect(r.options).toEqual([]);
    expect(r.alternatives.length).toBeGreaterThan(0);
    expect(r.alternatives.length).toBeLessThanOrEqual(3);
    // closest to 6PM first: 4PM–6PM or 10PM–12AM
    expect([16, 22]).toContain(r.alternatives[0].startHour);
  });
});

describe("findOpenPlay", () => {
  it("groups consecutive open play hours into sessions with their courts", () => {
    const d = "2026-11-28";
    const g1 = grid(1, [d, "2026-11-29"]);
    const g2 = grid(2, [d, "2026-11-29"]);
    for (const h of [18, 19, 20, 21]) g1.cells[`${d}|${h}`].state = "open_play";
    for (const h of [18, 19]) g2.cells[`${d}|${h}`].state = "open_play";
    g1.cells[`${d}|8`].state = "open_play";
    const r = findOpenPlay([g1, g2], [d, "2026-11-29"], HOURS);
    expect(r).toEqual([
      { date: d, startHour: 8, endHour: 9, courts: ["Court 1"] },
      { date: d, startHour: 18, endHour: 22, courts: ["Court 1", "Court 2"] },
    ]);
  });
  it("returns nothing when no open play is scheduled", () => {
    expect(findOpenPlay([grid(1, ["2026-11-28"])], ["2026-11-28"], HOURS)).toEqual([]);
  });
});

describe("tool input checks", () => {
  it("rejects bad formats and durations", () => {
    expect(FindOptionsInput.safeParse({ date_from: "28/11/2026", date_to: "2026-11-28", duration_hours: 2 }).success).toBe(false);
    expect(FindOptionsInput.safeParse({ date_from: "2026-11-28", date_to: "2026-11-28", duration_hours: 0 }).success).toBe(false);
    expect(FindOptionsInput.safeParse({ date_from: "2026-11-28", date_to: "2026-11-28", duration_hours: 2, after_hour: 18 }).success).toBe(true);
    expect(ProposeInput.safeParse({ court_id: 1, date: "2026-11-28", start_hour: 18, duration_hours: 9 }).success).toBe(false);
    expect(CheckBookingInput.safeParse({ ref: "SPY-7K3QXM" }).success).toBe(true);
    expect(CheckBookingInput.safeParse({ ref: "drop table" }).success).toBe(false);
  });

  it("rejects past dates, reversed or long ranges, and dates past the booking window", () => {
    expect(checkDateRange("2026-11-20", "2026-11-21", "2026-11-21", "2027-01-16")).toBe("past");
    expect(checkDateRange("2026-11-25", "2026-11-23", "2026-11-21", "2027-01-16")).toBe("reversed");
    expect(checkDateRange("2026-11-21", "2026-12-10", "2026-11-21", "2027-01-16")).toBe("too_long");
    expect(checkDateRange("2027-01-20", "2027-01-21", "2026-11-21", "2027-01-16")).toBe("too_far");
    expect(checkDateRange("2026-11-21", "2026-11-28", "2026-11-21", "2027-01-16")).toBeNull();
  });
});

describe("conversation limits", () => {
  it("allows a normal conversation", () => {
    expect(checkConversation([{ role: "user", content: "2 hours Saturday?" }])).toEqual({ ok: true });
  });
  it("rejects long messages, long conversations, and bad shapes", () => {
    expect(checkConversation([{ role: "user", content: "x".repeat(LIMITS.messageChars + 1) }])).toEqual({ ok: false, reason: "too_long" });
    const many = Array.from({ length: LIMITS.messages + 1 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "hi" }) as const);
    expect(checkConversation(many)).toEqual({ ok: false, reason: "too_many" });
    expect(checkConversation([])).toEqual({ ok: false, reason: "empty" });
    expect(checkConversation([{ role: "assistant", content: "hi" }])).toEqual({ ok: false, reason: "bad_shape" });
  });
  it("rate-limits at the window cap", () => {
    expect(isRateLimited(LIMITS.ratePerWindow - 1)).toBe(false);
    expect(isRateLimited(LIMITS.ratePerWindow)).toBe(true);
  });
});

describe("system prompt", () => {
  it("includes today's Manila service date, the coming days, and the current rate", () => {
    const now = new Date("2026-11-21T02:30:00Z"); // Sat Nov 21, 10:30AM Manila
    const p = buildSystemPrompt({ now, rules: { ...R, ratePerHour: 450 }, courts: [{ id: 1, name: "Court 1" }], openPlayFee: 120 });
    expect(p).toContain("2026-11-21");
    expect(p).toContain("Sat Nov 21");
    expect(p).toContain("Sun Nov 22");
    expect(p).toContain("₱450");
    expect(p).toContain("Court 1 (id 1)");
  });
  it("treats an early-morning hour as the previous service day", () => {
    const now = new Date("2026-11-21T16:30:00Z"); // Sun 12:30AM Manila → still Saturday's service day
    expect(buildSystemPrompt({ now, rules: R, courts: [], openPlayFee: 120 })).toContain("service date is 2026-11-21");
  });
});

describe("OpenAI tool specs", () => {
  it("turns each tool's Zod schema into an OpenAI function with a clean JSON schema", async () => {
    const { openAiToolSpecs } = await import("./openaiTools");
    const { GetInfoInput } = await import("./schemas");
    const specs = openAiToolSpecs([
      { name: "find_options", description: "Find courts", schema: FindOptionsInput },
      { name: "get_info", description: "Yard info", schema: GetInfoInput },
    ]);
    expect(specs.map((s) => s.function.name)).toEqual(["find_options", "get_info"]);
    const p = specs[0].function.parameters as { type: string; required: string[]; properties: Record<string, unknown> };
    expect(p.type).toBe("object");
    expect(p.required).toEqual(["date_from", "date_to", "duration_hours"]);
    expect("$schema" in p).toBe(false);
    // a field with a default is optional for the model
    expect((specs[1].function.parameters as { required?: string[] }).required ?? []).not.toContain("topic");
  });
});
