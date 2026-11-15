"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";

export type FormResult = { error?: string; ok?: string };

const SettingsInput = z
  .object({
    rate_per_hour: z.coerce.number().int().min(1).max(100000),
    hold_minutes: z.coerce.number().int().min(5).max(1440),
    max_weeks_ahead: z.coerce.number().int().min(1).max(52),
    offhours_lead_hours: z.coerce.number().int().min(0).max(168),
    early_start: z.coerce.number().int().min(0).max(23),
    regular_start: z.coerce.number().int().min(0).max(23),
    late_start: z.coerce.number().int().min(1).max(24),
    close_hour: z.coerce.number().int().min(0).max(23),
    gcash_name: z.string().trim().max(100),
    gcash_number: z.string().trim().max(30),
    maya_name: z.string().trim().max(100),
    maya_number: z.string().trim().max(30),
  })
  .refine((s) => s.close_hour < s.early_start && s.early_start < s.regular_start && s.regular_start < s.late_start, {
    message: "Hours must be in order: closing (after midnight) < early bird < regular < late night.",
  });

const QR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function updateSettings(_prev: FormResult, form: FormData): Promise<FormResult> {
  await requireAdmin();
  const parsed = SettingsInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const update: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

  const storage = createServiceClient().storage.from("qr-codes");
  for (const which of ["gcash", "maya"] as const) {
    const file = form.get(`${which}_qr`);
    if (file instanceof File && file.size > 0) {
      if (!QR_TYPES[file.type]) return { error: "QR images must be PNG, JPG, or WEBP." };
      if (file.size > 2 * 1024 * 1024) return { error: "QR images must be 2MB or smaller." };
      const path = `${which}-${Date.now()}.${QR_TYPES[file.type]}`;
      const { error } = await storage.upload(path, file, { contentType: file.type });
      if (error) return { error: `Couldn't upload the ${which === "gcash" ? "GCash" : "Maya"} QR. Try again.` };
      update[`${which}_qr_path`] = path;
    }
  }

  const supabase = await createUserClient(); // RLS: admins only
  const { error } = await supabase.from("settings").update(update).eq("id", true);
  if (error) return { error: "Couldn't save settings. Check the values and try again." };
  revalidatePath("/", "layout");
  return { ok: "Settings saved" };
}

const NewUser = z.object({
  email: z.email("Enter a valid email."),
  full_name: z.string().trim().min(2, "Enter the person's name."),
  password: z.string().min(10, "Temporary password must be at least 10 characters."),
  role: z.enum(["staff", "admin"]),
});

export async function createStaffUser(_prev: FormResult, form: FormData): Promise<FormResult> {
  await requireAdmin();
  const parsed = NewUser.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, full_name, password, role } = parsed.data;
  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) return { error: error?.message.includes("already") ? "That email already has an account." : "Couldn't create the account." };
  const supabase = await createUserClient();
  const { error: pErr } = await supabase.from("staff_profiles").insert({ user_id: data.user.id, email, full_name, role });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Couldn't create the profile." };
  }
  revalidatePath("/backoffice/users");
  return { ok: `${full_name} can now sign in as ${role}. Share the temporary password privately.` };
}

export async function updateStaffUser(userId: string, patch: { role?: "staff" | "admin"; active?: boolean }): Promise<FormResult> {
  const me = await requireAdmin();
  if (userId === me.id) return { error: "You can't change your own role or access." };
  const supabase = await createUserClient();
  const { error } = await supabase.from("staff_profiles").update(patch).eq("user_id", userId);
  if (error) return { error: "Couldn't update the user." };
  if (patch.active === false) {
    // end their sessions right away
    await createServiceClient().auth.admin.signOut(userId).catch(() => {});
  }
  revalidatePath("/backoffice/users");
  return { ok: "User updated" };
}
