import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";

describe("friendlyError for open play", () => {
  it("says how many spots are left", () => {
    expect(friendlyError("not_enough_spots:2")).toBe("Only 2 spots left in this session.");
    expect(friendlyError("not_enough_spots:1")).toBe("Only 1 spot left in this session.");
    expect(friendlyError("not_enough_spots:0")).toBe("This session is full.");
  });
  it("explains session states", () => {
    expect(friendlyError("session_closed")).toBe("Payments for this session have closed.");
    expect(friendlyError("session_cancelled")).toBe("This session was cancelled.");
    expect(friendlyError("session_started")).toBe("This session has already started, so it can't be cancelled.");
    expect(friendlyError("session_slot")).toBe("These hours belong to an open play session. Change them from the session page.");
    expect(friendlyError("not_contiguous")).toBe("Pick one continuous block of hours on one day.");
    expect(friendlyError("too_many_players")).toBe("One payment can cover up to 12 players.");
    expect(friendlyError('new row violates check constraint "open_play_mobile_required"')).toBe(
      "Enter a mobile number. It's only optional for walk-ins paying cash.",
    );
    expect(friendlyError('violates check constraint "open_play_players_name_check"')).toBe("Enter each player's name as shown in Reclub.");
  });
});
