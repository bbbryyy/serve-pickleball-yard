import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { currentServiceDate, serviceHours } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { NewSessionForm } from "./NewSessionForm";

export default async function NewSessionPage({ searchParams }: PageProps<"/backoffice/open-play/new">) {
  await requireStaff();
  const sp = await searchParams;
  const { rules, courts, openPlay } = await getSiteSettings();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/backoffice/open-play" className="text-sm text-court hover:underline">Back to open play</Link>
      <h1 className="font-display text-3xl font-semibold text-steel uppercase">New open play session</h1>
      <NewSessionForm
        hours={serviceHours(rules)}
        courts={courts}
        fee={openPlay.fee}
        playersPerCourt={openPlay.playersPerCourt}
        today={currentServiceDate(new Date(), rules)}
        initial={{
          date: typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined,
          from: Number(sp.from) || undefined,
          to: Number(sp.to) || undefined,
          court: Number(sp.court) || undefined,
        }}
      />
    </div>
  );
}
