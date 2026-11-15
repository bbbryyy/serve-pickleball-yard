"use server";

import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/server";

export type PayState = { error?: string };

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

export async function submitPayment(_prev: PayState, form: FormData): Promise<PayState> {
  const ref = String(form.get("ref") ?? "").toUpperCase();
  const method = String(form.get("method") ?? "");
  const refNo = String(form.get("refNo") ?? "").trim();
  const file = form.get("proof");

  if (!["gcash", "maya"].includes(method)) return { error: "Choose GCash or Maya." };
  if (refNo.length < 4) return { error: "Enter the reference number from your GCash or Maya receipt." };
  if (!(file instanceof File) || file.size === 0) return { error: "Upload a screenshot of your payment." };
  if (!TYPES[file.type]) return { error: "Upload a JPG, PNG, or WEBP image." };
  if (file.size > 5 * 1024 * 1024) return { error: "The screenshot must be 5MB or smaller." };

  const db = createServiceClient();
  const { data: booking } = await db.from("bookings").select("status").eq("ref", ref).maybeSingle();
  if (!booking) return { error: "Booking not found." };
  if (!["pending_payment", "for_verification"].includes(booking.status)) redirect(`/booking/${ref}`);

  const path = `${ref}/${Date.now()}.${TYPES[file.type]}`;
  const { error: upErr } = await db.storage.from("payment-proofs").upload(path, file, { contentType: file.type });
  if (upErr) return { error: "Upload failed. Try again." };

  const { error } = await db.rpc("submit_payment", {
    p_ref: ref,
    p_method: method,
    p_payment_ref_no: refNo,
    p_proof_path: path,
  });
  if (error) {
    await db.storage.from("payment-proofs").remove([path]);
    return { error: friendlyError(error.message) };
  }
  redirect(`/booking/${ref}`);
}
