"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { friendlyError, normalizeMobile } from "@/lib/errors";
import { createUserClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string; ok?: string };

export async function signIn(_prev: { error?: string }, form: FormData) {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error || !data.user) return { error: "Wrong email or password." };
  const { data: profile } = await supabase.from("staff_profiles").select("active").eq("user_id", data.user.id).maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: "This account doesn't have backoffice access." };
  }
  redirect("/backoffice");
}

export async function signOut() {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect("/backoffice/login");
}

// ---- bookings (staff + admin). Role checks are repeated in the SQL functions.

export async function reviewBooking(bookingId: string, action: "approve" | "reject" | "cancel", note?: string): Promise<ActionResult> {
  await requireStaff();
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("staff_review_booking", { p_booking_id: bookingId, p_action: action, p_note: note || null });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/backoffice", "layout");
  return { ok: action === "approve" ? "Booking confirmed" : action === "reject" ? "Booking rejected" : "Booking cancelled" };
}

export async function extendHold(bookingId: string, minutes: number): Promise<ActionResult> {
  await requireStaff();
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("staff_extend_hold", { p_booking_id: bookingId, p_minutes: minutes });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/backoffice", "layout");
  return { ok: `Hold extended by ${minutes} minutes` };
}

export async function createWalkIn(input: {
  courtId: number;
  slots: string[];
  name: string;
  mobile: string;
  paymentMethod: "cash" | "gcash" | "maya";
  note?: string;
}): Promise<ActionResult> {
  await requireStaff();
  const mobile = normalizeMobile(input.mobile);
  if (!/^09\d{9}$/.test(mobile)) return { error: "Enter a valid PH mobile number (09XXXXXXXXX)." };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_court_id: input.courtId,
    p_slots: input.slots,
    p_player_name: input.name,
    p_mobile: mobile,
    p_email: null,
    p_source: "walk_in",
    p_payment_method: input.paymentMethod,
    p_note: input.note || null,
  });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/backoffice", "layout");
  return { ok: `Reserved ${data}` };
}

export async function blockSlots(
  courtId: number,
  slots: string[],
  reason: string,
  kind: "blocked" | "open_play" = "blocked",
): Promise<ActionResult> {
  await requireStaff();
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("staff_block_slots", { p_court_id: courtId, p_slots: slots, p_reason: reason, p_kind: kind });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/backoffice", "layout");
  revalidatePath("/book");
  return { ok: kind === "open_play" ? `Set ${data} hour(s) as open play` : `Blocked ${data} hour(s)` };
}

export async function unblockSlots(courtId: number, slots: string[]): Promise<ActionResult> {
  await requireStaff();
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("staff_unblock_slots", { p_court_id: courtId, p_slots: slots });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/backoffice", "layout");
  revalidatePath("/book");
  return { ok: `Freed up ${data} hour(s)` };
}
