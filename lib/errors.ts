import { SLOT_ISSUE_TEXT, type SlotIssue } from "./schedule";

/** Turn an RPC error message (raised in SQL) into text a player or staff member can act on. */
export function friendlyError(message: string | undefined): string {
  const m = message ?? "";
  if (m.startsWith("slot_taken")) return "One of those hours was just taken. Pick another hour and try again.";
  if (m.startsWith("slot_invalid:")) {
    const issue = m.split(":")[1] as SlotIssue;
    return SLOT_ISSUE_TEXT[issue] ?? "One of those hours can't be booked.";
  }
  if (m.startsWith("hold_expired")) return "Your 30-minute hold expired, so the slot was released. Book again to continue.";
  if (m.startsWith("invalid_status")) return "This booking can't be changed in its current status.";
  if (m.startsWith("reason_required")) return "Enter a reason for the player.";
  if (m.startsWith("too_many_slots")) return "You can book up to 12 hours at a time.";
  if (m.startsWith("no_slots")) return "Select at least one hour.";
  if (m.startsWith("not_enough_spots:")) {
    const n = Number(m.split(":")[1]);
    if (!n) return "This session is full.";
    return `Only ${n} spot${n === 1 ? "" : "s"} left in this session.`;
  }
  if (m.startsWith("session_closed")) return "Payments for this session have closed.";
  if (m.startsWith("session_cancelled")) return "This session was cancelled.";
  if (m.startsWith("session_started")) return "This session has already started, so it can't be cancelled.";
  if (m.startsWith("session_slot")) return "These hours belong to an open play session. Change them from the session page.";
  if (m.startsWith("not_contiguous")) return "Pick one continuous block of hours on one day.";
  if (m.startsWith("too_many_players")) return "One payment can cover up to 12 players.";
  if (m.startsWith("court_in_session")) return "That court is already part of this session.";
  if (m.startsWith("invalid_court")) return "Pick at least one court.";
  if (m.includes("open_play_mobile_required")) return "Enter a mobile number. It's only optional for walk-ins paying cash.";
  if (m.includes("open_play_payments_mobile_check")) return "Enter a valid PH mobile number (09XXXXXXXXX).";
  if (m.includes("open_play_payments_email_check")) return "Enter a valid email address.";
  if (m.includes("open_play_players_name_check")) return "Enter each player's name as shown in Reclub.";
  if (m.startsWith("forbidden")) return "Your account doesn't have access to do that.";
  if (m.startsWith("not_found")) return "Booking not found.";
  if (m.includes("bookings_mobile_check")) return "Enter a valid PH mobile number (09XXXXXXXXX).";
  if (m.includes("bookings_mobile_required")) return "Enter a mobile number. It's only optional for walk-ins paying cash.";
  if (m.includes("bookings_email_check")) return "Enter a valid email address.";
  if (m.includes("bookings_player_name_check")) return "Enter your full name.";
  return "Something went wrong. Try again.";
}

/** Normalize "0917 123 4567" / "+63 917..." to 09XXXXXXXXX */
export function normalizeMobile(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+63")) return "0" + digits.slice(3);
  if (digits.startsWith("63") && digits.length === 12) return "0" + digits.slice(2);
  return digits;
}
