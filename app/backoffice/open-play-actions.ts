"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { friendlyError, normalizeMobile } from "@/lib/errors";
import { parsePlayerNames, sessionSlots } from "@/lib/openPlay";
import { getSiteSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

// Open play (staff + admin). Role checks are repeated in the SQL functions.

function refresh() {
  revalidatePath("/backoffice", "layout");
  revalidatePath("/book");
}

export async function createSession(input: {
  date: string;
  fromHour: number;
  toHour: number;
  courtIds: number[];
  note?: string;
}): Promise<ActionResult> {
  await requireStaff();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Pick a date." };
  if (input.courtIds.length === 0) return { error: "Pick at least one court." };
  const { rules } = await getSiteSettings();
  const slots = sessionSlots(input.date, input.fromHour, input.toHour, rules);
  if (slots.length === 0) return { error: "Pick an end time after the start time, within opening hours." };
  const supabase = await createUserClient();
  const { data: code, error } = await supabase.rpc("staff_create_open_play_session", {
    p_slots: slots.map((d) => d.toISOString()),
    p_court_ids: input.courtIds,
    p_note: input.note || null,
  });
  if (error) return { error: friendlyError(error.message) };
  const { data: s } = await supabase.from("open_play_sessions").select("id").eq("code", code).single();
  refresh();
  redirect(`/backoffice/open-play/${s!.id}?created=1`);
}

export async function addCourt(sessionId: string, courtId: number): Promise<ActionResult> {
  await requireStaff();
  const { error } = await (await createUserClient()).rpc("staff_add_open_play_court", { p_session_id: sessionId, p_court_id: courtId });
  if (error) return { error: friendlyError(error.message) };
  refresh();
  return { ok: "Court added" };
}

export async function cancelSession(sessionId: string, reason: string): Promise<ActionResult> {
  await requireStaff();
  const { error } = await (await createUserClient()).rpc("staff_cancel_open_play_session", { p_session_id: sessionId, p_reason: reason });
  if (error) return { error: friendlyError(error.message) };
  refresh();
  return { ok: "Session cancelled" };
}

export async function addWalkIns(input: {
  sessionId: string;
  names: string[];
  paymentMethod: "cash" | "gcash" | "maya";
  mobile: string;
}): Promise<ActionResult> {
  await requireStaff();
  const parsed = parsePlayerNames(input.names);
  if ("error" in parsed) return { error: parsed.error };
  const raw = input.mobile.trim();
  const mobile = raw ? normalizeMobile(raw) : null;
  if (!mobile && input.paymentMethod !== "cash") return { error: "Enter a mobile number for GCash or Maya payments." };
  if (mobile && !/^09\d{9}$/.test(mobile)) return { error: "Enter a valid PH mobile number (09XXXXXXXXX)." };
  const { data, error } = await (await createUserClient()).rpc("staff_add_open_play_walkins", {
    p_session_id: input.sessionId,
    p_player_names: parsed.names,
    p_payment_method: input.paymentMethod,
    p_mobile: mobile,
  });
  if (error) return { error: friendlyError(error.message) };
  refresh();
  return { ok: `Added ${parsed.names.length} player${parsed.names.length === 1 ? "" : "s"} (${data})` };
}

export async function reviewOpenPlayPayment(paymentId: string, action: "approve" | "reject", note?: string): Promise<ActionResult> {
  await requireStaff();
  const { error } = await (await createUserClient()).rpc("staff_review_open_play_payment", {
    p_payment_id: paymentId,
    p_action: action,
    p_note: note || null,
  });
  if (error) return { error: friendlyError(error.message) };
  refresh();
  return { ok: action === "approve" ? "Payment approved. Accept these players in Reclub." : "Payment rejected" };
}

export async function extendOpenPlayHold(paymentId: string, minutes: number): Promise<ActionResult> {
  await requireStaff();
  const { error } = await (await createUserClient()).rpc("staff_extend_open_play_hold", { p_payment_id: paymentId, p_minutes: minutes });
  if (error) return { error: friendlyError(error.message) };
  refresh();
  return { ok: `Hold extended by ${minutes} minutes` };
}

export async function markRefunded(paymentId: string): Promise<ActionResult> {
  await requireStaff();
  const { error } = await (await createUserClient()).rpc("staff_mark_open_play_refunded", { p_payment_id: paymentId });
  if (error) return { error: friendlyError(error.message) };
  refresh();
  return { ok: "Marked as refunded" };
}
