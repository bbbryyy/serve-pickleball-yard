import "server-only";
import { DEFAULT_RULES, type BookingRules } from "./schedule";
import { createServiceClient } from "./supabase/server";

export type PaymentAccount = { qrUrl: string | null; name: string | null; number: string | null };

export type SiteSettings = {
  rules: BookingRules;
  gcash: PaymentAccount;
  maya: PaymentAccount;
  courts: { id: number; name: string }[];
};

export function publicStorageUrl(bucket: string, path: string | null): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const db = createServiceClient();
  const [{ data: s }, { data: courts }] = await Promise.all([
    db.from("settings").select("*").single(),
    db.from("courts").select("id, name").eq("active", true).order("id"),
  ]);
  const rules: BookingRules = s
    ? {
        earlyStart: s.early_start,
        regularStart: s.regular_start,
        lateStart: s.late_start,
        closeHour: s.close_hour,
        offhoursLeadHours: s.offhours_lead_hours,
        maxWeeksAhead: s.max_weeks_ahead,
        ratePerHour: s.rate_per_hour,
        holdMinutes: s.hold_minutes,
      }
    : DEFAULT_RULES;
  return {
    rules,
    gcash: { qrUrl: publicStorageUrl("qr-codes", s?.gcash_qr_path), name: s?.gcash_name, number: s?.gcash_number },
    maya: { qrUrl: publicStorageUrl("qr-codes", s?.maya_qr_path), name: s?.maya_name, number: s?.maya_number },
    courts: courts ?? [],
  };
}
