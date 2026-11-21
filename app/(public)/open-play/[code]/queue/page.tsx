import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QueueTable, roundTime } from "@/components/QueueTable";
import { formatSessionTime } from "@/lib/openPlay";
import { getOpenPlayQueuePublic } from "@/lib/openPlayData";
import { getSiteSettings } from "@/lib/settings";
import { QueueRefresh } from "./QueueRefresh";

export const dynamic = "force-dynamic"; // staff mark rounds as they're played

export const metadata: Metadata = { title: "Open play queue", robots: { index: false } };

const team = (t: [string, string]) => `${t[0]} & ${t[1]}`;

/** Players' view of the saved queue: big "now playing" and "up next", for a TV or phones. */
export default async function OpenPlayQueuePage({ params, searchParams }: PageProps<"/open-play/[code]/queue">) {
  const { code } = await params;
  const sp = await searchParams;
  const q = await getOpenPlayQueuePublic(code);
  if (!q || q.status === "cancelled") notFound();
  const { rules } = await getSiteSettings();
  const when = formatSessionTime(new Date(q.starts_at), new Date(q.ends_at), rules);
  const courts = [...new Set(q.rounds.flatMap((r) => r.games.map((g) => g.court)))].sort();
  const now = q.rounds[q.played_through];
  const next = q.rounds[q.played_through + 1];
  const print = sp.print === "1";

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-10">
      <QueueRefresh print={print} />
      <header>
        <h1 className="font-display text-3xl font-semibold text-steel uppercase sm:text-4xl">Open play queue</h1>
        <p className="text-steel/70">{when} · Serve Pickleball Yard</p>
      </header>

      {!print && (
        now ? (
          <section aria-labelledby="now-title" className="space-y-3">
            <h2 id="now-title" className="text-xl font-semibold text-steel">Now playing · {roundTime(now.start)}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {now.games.map((g) => (
                <div key={g.court} className="rounded-2xl bg-court p-4 text-white">
                  <p className="text-sm text-white/80">{g.court}</p>
                  <p className="font-display text-2xl font-semibold uppercase sm:text-3xl">{team(g.a)}</p>
                  <p className="text-sm text-white/70">vs</p>
                  <p className="font-display text-2xl font-semibold uppercase sm:text-3xl">{team(g.b)}</p>
                </div>
              ))}
            </div>
            {next && (
              <div className="rounded-2xl border border-kitchen bg-white p-4">
                <p className="font-semibold text-steel">Up next · {roundTime(next.start)}</p>
                <ul className="mt-1 space-y-0.5 text-steel">
                  {next.games.map((g) => (
                    <li key={g.court}>
                      {g.court}: {team(g.a)} vs {team(g.b)}
                    </li>
                  ))}
                </ul>
                {next.out.length > 0 && <p className="mt-1 text-sm text-steel/60">Sitting out: {next.out.join(", ")}</p>}
              </div>
            )}
          </section>
        ) : (
          <p className="rounded-2xl bg-ball/30 p-4 font-semibold text-ball-dark">All rounds played. Thanks for playing!</p>
        )
      )}

      <section aria-labelledby="all-title" className="space-y-2">
        <h2 id="all-title" className="text-sm font-bold text-steel uppercase">All rounds</h2>
        <div className="overflow-x-auto rounded-2xl border border-kitchen bg-white">
          <QueueTable courts={courts} rounds={q.rounds} playedThrough={q.played_through} />
        </div>
        {!print && <p className="text-xs text-steel/60">Updates on its own every 30 seconds.</p>}
      </section>
    </div>
  );
}
