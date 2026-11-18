"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyError, normalizeMobile } from "@/lib/errors";
import { parsePlayerNames } from "@/lib/openPlay";
import { createServiceClient } from "@/lib/supabase/server";
import type { PayState } from "../book/[ref]/pay/actions";

export type OpenPlayFormState = { error?: string; values?: { names: string[]; mobile: string; email: string } };

const Contact = z.object({
  mobile: z.string().transform(normalizeMobile).pipe(z.string().regex(/^09\d{9}$/, "Enter a valid PH mobile number (09XXXXXXXXX).")),
  email: z.union([z.literal(""), z.email("Enter a valid email address.")]),
});

export async function createOpenPlayPayment(_prev: OpenPlayFormState, form: FormData): Promise<OpenPlayFormState> {
  const code = String(form.get("code") ?? "");
  const rawNames = form.getAll("name").map(String);
  const values = { names: rawNames, mobile: String(form.get("mobile") ?? ""), email: String(form.get("email") ?? "").trim() };

  const parsedNames = parsePlayerNames(rawNames);
  if ("error" in parsedNames) return { error: parsedNames.error, values };
  const contact = Contact.safeParse(values);
  if (!contact.success) return { error: contact.error.issues[0].message, values };

  const { data: ref, error } = await createServiceClient().rpc("create_open_play_payment", {
    p_code: code,
    p_player_names: parsedNames.names,
    p_mobile: contact.data.mobile,
    p_email: contact.data.email || null,
  });
  if (error) return { error: friendlyError(error.message), values };
  redirect(`/open-play/pay/${ref}`);
}

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

export async function submitOpenPlayPayment(_prev: PayState, form: FormData): Promise<PayState> {
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
  const { data: payment } = await db.from("open_play_payments").select("status").eq("ref", ref).maybeSingle();
  if (!payment) return { error: "Payment not found." };
  if (!["pending_payment", "for_verification"].includes(payment.status)) redirect(`/booking/${ref}`);

  const path = `${ref}/${Date.now()}.${TYPES[file.type]}`;
  const { error: upErr } = await db.storage.from("payment-proofs").upload(path, file, { contentType: file.type });
  if (upErr) return { error: "Upload failed. Try again." };

  const { error } = await db.rpc("submit_open_play_payment", { p_ref: ref, p_method: method, p_payment_ref_no: refNo, p_proof_path: path });
  if (error) {
    await db.storage.from("payment-proofs").remove([path]);
    return { error: friendlyError(error.message).replace("Your 30-minute hold expired, so the slot was released. Book again to continue.", "Your hold expired, so your spots were released. Open the session link again to pay.") };
  }
  redirect(`/booking/${ref}`);
}
