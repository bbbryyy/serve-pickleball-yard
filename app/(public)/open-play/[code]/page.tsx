import Link from "next/link";
import { notFound } from "next/navigation";
import { formatSessionTime, maxGroupSize } from "@/lib/openPlay";
import { getOpenPlayPublic } from "@/lib/openPlayData";
import { formatPeso } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { OpenPlayForm } from "./OpenPlayForm";

export const dynamic = "force-dynamic"; // spots left must be live

const CLOSED_TEXT = {
  full: { title: "This session is full", body: (n: number) => `All ${n} spots are taken. Check Reclub for the next open play night, or book a court by the hour.` },
  closed: { title: "Payments have closed", body: () => "This session has started or ended. Check Reclub for the next open play night." },
  cancelled: { title: "This session was cancelled", body: () => "Check Reclub for the next open play night, or book a court by the hour." },
};

export default async function OpenPlayLinkPage({ params }: PageProps<"/open-play/[code]">) {
  const { code } = await params;
  const session = await getOpenPlayPublic(code);
  if (!session) notFound();
  const { rules } = await getSiteSettings();
  const when = formatSessionTime(new Date(session.starts_at), new Date(session.ends_at), rules);
  const closed = session.state === "open" ? null : CLOSED_TEXT[session.state];

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <div className="card overflow-hidden">
        <div className="court-lines bg-court px-6 py-6 text-white">
          <div className="relative z-10">
            <h1 className="font-display text-3xl font-semibold uppercase">Open play</h1>
            <p className="mt-1 text-white/90">{when}</p>
            <p className="text-sm text-white/80">{session.court_names.join(" and ")}</p>
            {!closed && (
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-ball px-3 py-1 font-semibold text-ball-dark">{formatPeso(session.fee_per_player)} per player</span>
                <span className="rounded-full bg-white px-3 py-1 font-semibold text-court">
                  {session.spots_left} of {session.max_players} spots left
                </span>
              </div>
            )}
          </div>
        </div>
        {closed ? (
          <div className="space-y-4 p-6 text-center">
            <h2 className="font-display text-2xl font-semibold text-steel uppercase">{closed.title}</h2>
            <p className="text-sm text-steel/70">{closed.body(session.max_players)}</p>
            <Link href="/book" className="btn-primary inline-block">Book a court</Link>
          </div>
        ) : null}
      </div>
      {!closed && (
        <div className="mt-4">
          <OpenPlayForm code={session.code} fee={session.fee_per_player} maxPlayers={maxGroupSize(session.spots_left)} />
        </div>
      )}
    </div>
  );
}
