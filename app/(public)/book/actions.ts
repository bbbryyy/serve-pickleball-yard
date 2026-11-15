"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyError, normalizeMobile } from "@/lib/errors";
import { SLOT_ISSUE_TEXT, validateSlot } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";

export type BookState = { error?: string; values?: Record<string, string> };

const Input = z.object({
  courtId: z.coerce.number().int().positive(),
  slots: z.array(z.iso.datetime()).min(1, "Select at least one hour.").max(12, "You can book up to 12 hours at a time."),
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  mobile: z.string().transform(normalizeMobile).pipe(z.string().regex(/^09\d{9}$/, "Enter a valid PH mobile number (09XXXXXXXXX).")),
  email: z.email("Enter a valid email address."),
});

export async function createBooking(_prev: BookState, form: FormData): Promise<BookState> {
  const values = {
    name: String(form.get("name") ?? ""),
    mobile: String(form.get("mobile") ?? ""),
    email: String(form.get("email") ?? ""),
  };
  let slots: unknown = [];
  try {
    slots = JSON.parse(String(form.get("slots") ?? "[]"));
  } catch {}
  const parsed = Input.safeParse({ courtId: form.get("courtId"), slots, ...values });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const input = parsed.data;

  // fast check with the same rules the database enforces
  const { rules } = await getSiteSettings();
  const now = new Date();
  for (const s of input.slots) {
    const issue = validateSlot(new Date(s), now, rules);
    if (issue) return { error: SLOT_ISSUE_TEXT[issue], values };
  }

  const { data: ref, error } = await createServiceClient().rpc("create_booking", {
    p_court_id: input.courtId,
    p_slots: input.slots,
    p_player_name: input.name,
    p_mobile: input.mobile,
    p_email: input.email,
  });
  if (error) return { error: friendlyError(error.message), values };
  redirect(`/book/${ref}/pay`);
}
