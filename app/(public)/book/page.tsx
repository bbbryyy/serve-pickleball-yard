import Link from "next/link";
import { getWeek } from "@/lib/availability";
import { currentServiceDate, formatPeso, formatServiceDate } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { BookingPanel } from "./BookingPanel";

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const sp = await searchParams;
  const { rules, courts } = await getSiteSettings();
  const courtId = Number(sp.court) || courts[0]?.id || 1;
  const court = courts.find((c) => c.id === courtId) ?? courts[0];
  const week = await getWeek(court.id, typeof sp.week === "string" ? sp.week : undefined, rules);
  const href = (q: { court?: number; week?: string | null }) =>
    `/book?court=${q.court ?? court.id}&week=${q.week ?? week.monday}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-steel uppercase">Book a court</h1>
          <p className="text-sm text-steel/70">
            {formatPeso(rules.ratePerHour)} per hour · tap the hours you want · up to {rules.maxWeeksAhead} weeks ahead
          </p>
        </div>
        <div className="flex rounded-lg bg-steel p-1" role="tablist" aria-label="Court">
          {courts.map((c) => (
            <Link
              key={c.id}
              href={href({ court: c.id })}
              role="tab"
              aria-selected={c.id === court.id}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold ${c.id === court.id ? "bg-court text-white" : "text-white/70 hover:text-white"}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        {week.prevWeek ? (
          <Link href={href({ week: week.prevWeek })} className="btn-ghost px-3 py-1.5" aria-label="Previous week">‹ Prev</Link>
        ) : (
          <span className="btn-ghost invisible px-3 py-1.5">‹ Prev</span>
        )}
        <p className="font-display text-lg font-semibold text-steel">
          {formatServiceDate(week.days[0])} – {formatServiceDate(week.days[6])}
        </p>
        {week.nextWeek ? (
          <Link href={href({ week: week.nextWeek })} className="btn-ghost px-3 py-1.5" aria-label="Next week">Next ›</Link>
        ) : (
          <span className="btn-ghost invisible px-3 py-1.5">Next ›</span>
        )}
      </div>

      <BookingPanel
        key={court.id}
        court={court}
        week={week}
        rules={rules}
        today={currentServiceDate(new Date(), rules)}
      />
    </div>
  );
}
