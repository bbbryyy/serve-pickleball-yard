import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  await requireAdmin();
  const { gcash, maya } = await getSiteSettings();
  const { data: s } = await createServiceClient().from("settings").select("*").single();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 font-display text-3xl font-semibold text-steel uppercase">Settings</h1>
      <SettingsForm s={s} gcashQr={gcash.qrUrl} mayaQr={maya.qrUrl} />
    </div>
  );
}
