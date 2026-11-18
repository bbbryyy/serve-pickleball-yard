import "server-only";
import { unstable_cache } from "next/cache";
import { DEFAULT_RULES, type BookingRules } from "./schedule";
import { createServiceClient } from "./supabase/server";

export type PaymentAccount = { qrUrl: string | null; name: string | null; number: string | null };

export type SiteSettings = {
  rules: BookingRules;
  gcash: PaymentAccount;
  maya: PaymentAccount;
  courts: { id: number; name: string }[];
  openPlay: { fee: number; playersPerCourt: number };
};

export function publicStorageUrl(bucket: string, path: string | null): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Settings and courts rarely change, so they're cached for 5 minutes instead
 * of being fetched on every page view (the database can be a long round trip
 * from the web servers). Saving Settings clears the cache immediately via the
 * "settings" tag. Live data such as availability is never cached.
 */
export const getSiteSettings = unstable_cache(loadSiteSettings, ["site-settings"], {
  tags: ["settings"],
  revalidate: 300,
});

async function loadSiteSettings(): Promise<SiteSettings> {
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
    openPlay: { fee: s?.open_play_fee ?? 120, playersPerCourt: s?.open_play_players_per_court ?? 12 },
  };
}
