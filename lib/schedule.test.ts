import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES as R,
  addDays,
  bandOf,
  currentServiceDate,
  formatHour,
  groupSlots,
  mondayOf,
  serviceHours,
  serviceSlotOf,
  slotStartFor,
  validateSlot,
} from "./schedule";

// Manila wall clock -> instant
const mnl = (s: string) => new Date(`${s}+08:00`);

describe("hour bands", () => {
  it("covers 4AM to 1AM with 21 bookable hours", () => {
    const hours = serviceHours(R);
    expect(hours[0]).toBe(4);
    expect(hours.at(-1)).toBe(24);
    expect(hours).toHaveLength(21);
  });
  it("classifies bands", () => {
    expect(bandOf(4, R)).toBe("early");
    expect(bandOf(8, R)).toBe("early");
    expect(bandOf(9, R)).toBe("regular");
    expect(bandOf(21, R)).toBe("regular");
    expect(bandOf(22, R)).toBe("late");
    expect(bandOf(24, R)).toBe("late"); // 12AM–1AM
    expect(bandOf(25, R)).toBeNull(); // 1AM closed
    expect(bandOf(3, R)).toBeNull();
  });
});

describe("midnight crossover", () => {
  it("12AM slot belongs to the previous service day", () => {
    const start = slotStartFor("2026-11-21", 24);
    expect(start.toISOString()).toBe(mnl("2026-11-22T00:00:00").toISOString());
    expect(serviceSlotOf(start, R)).toEqual({ serviceDate: "2026-11-21", sh: 24 });
  });
  it("service date stays 'yesterday' until early open", () => {
    expect(currentServiceDate(mnl("2026-11-22T00:30:00"), R)).toBe("2026-11-21");
    expect(currentServiceDate(mnl("2026-11-22T04:00:00"), R)).toBe("2026-11-22");
  });
  it("formats hours", () => {
    expect(formatHour(4)).toBe("4AM");
    expect(formatHour(12)).toBe("12PM");
    expect(formatHour(22)).toBe("10PM");
    expect(formatHour(24)).toBe("12AM");
    expect(formatHour(25)).toBe("1AM");
  });
  it("groups contiguous slots across midnight", () => {
    const s = [22, 23, 24].map((h) => slotStartFor("2026-11-21", h));
    expect(groupSlots(s, R)).toEqual(["Sat Nov 21 · 10PM–1AM"]);
  });
});

describe("validateSlot", () => {
  const now = mnl("2026-11-16T10:15:00"); // Monday 10:15AM

  it("accepts a regular hour later today", () => {
    expect(validateSlot(mnl("2026-11-16T15:00:00"), now, R)).toBeNull();
  });
  it("rejects a slot not on the hour", () => {
    expect(validateSlot(mnl("2026-11-16T15:30:00"), now, R)).toBe("not_on_hour");
  });
  it("rejects closed hours (1AM–4AM)", () => {
    expect(validateSlot(mnl("2026-11-18T02:00:00"), now, R)).toBe("closed");
  });
  it("rejects a slot that already started", () => {
    expect(validateSlot(mnl("2026-11-16T10:00:00"), now, R)).toBe("past");
  });
  it("rejects early bird/late night under 24h ahead", () => {
    expect(validateSlot(mnl("2026-11-16T22:00:00"), now, R)).toBe("offhours_lead");
    expect(validateSlot(mnl("2026-11-17T06:00:00"), now, R)).toBe("offhours_lead");
  });
  it("accepts early bird/late night 24h+ ahead", () => {
    expect(validateSlot(mnl("2026-11-17T22:00:00"), now, R)).toBeNull();
    expect(validateSlot(mnl("2026-11-18T00:00:00"), now, R)).toBeNull();
  });
  it("enforces the 8-week window", () => {
    // today (Nov 16) + 56 days = Jan 11, whole day bookable incl. its 12AM slot
    expect(validateSlot(mnl("2027-01-11T21:00:00"), now, R)).toBeNull();
    expect(validateSlot(mnl("2027-01-12T00:00:00"), now, R)).toBeNull();
    expect(validateSlot(mnl("2027-01-12T09:00:00"), now, R)).toBe("too_far");
  });
  it("staff skip lead time and window but not past/closed", () => {
    expect(validateSlot(mnl("2026-11-16T22:00:00"), now, R, { staff: true })).toBeNull();
    expect(validateSlot(mnl("2027-03-01T09:00:00"), now, R, { staff: true })).toBeNull();
    expect(validateSlot(mnl("2026-11-16T09:00:00"), now, R, { staff: true })).toBe("past");
  });
});

describe("dates", () => {
  it("finds Monday of a week", () => {
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
  });
  it("adds days across months", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
});
