import Link from "next/link";
import { getWeek } from "@/lib/availability";
import { requireStaff } from "@/lib/auth";
import { currentServiceDate, formatServiceDate, serviceSlotOf, slotStartFor } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";
import { ScheduleBoard, type SlotDetail } from "./ScheduleBoard";

export default async function SchedulePage({ searchParams }: PageProps<"/backoffice/schedule">) {
  await requireStaff();
  const sp = await searchParams;
  const { rules, courts } = await getSiteSettings();
  const court = courts.find((c) => c.id === Number(sp.court)) ?? courts[0];
  const week = await getWeek(court.id, typeof sp.week === "string" ? sp.week : undefined, rules, { staff: true });

  const from = slotStartFor(week.days[0], week.hours[0]).toISOString();
  const to = slotStartFor(week.days[6], week.hours.at(-1)! + 1).toISOString();
  const supabase = await createUserClient();
  const [{ data: slots }, { data: blocks }] = await Promise.all([
    supabase
      .from("booking_slots")
      .select("slot_start, bookings(id, ref, player_name, mobile, status, source, total_amount, hold_expires_at)")
      .eq("court_id", court.id)
      .eq("active", true)
      .gte("slot_start", from)
      .lt("slot_start", to),
    supabase.from("blocked_slots").select("slot_start, reason, kind").eq("court_id", court.id).gte("slot_start", from).lt("slot_start", to),
  ]);

  const details: Record<string, SlotDetail> = {};
  for (const s of slots ?? []) {
    const b = s.bookings as unknown as { id: string; ref: string; player_name: string; mobile: string | null; status: string; source: string; total_amount: number; hold_expires_at: string | null };
    if (b.status === "pending_payment" && b.hold_expires_at && new Date(b.hold_expires_at) < new Date()) continue;
    const { serviceDate, sh } = serviceSlotOf(new Date(s.slot_start), rules);
    details[`${serviceDate}|${sh}`] = { kind: "booking", ref: b.ref, name: b.player_name, mobile: b.mobile, status: b.status, source: b.source, total: b.total_amount };
  }
  for (const bl of blocks ?? []) {
    const { serviceDate, sh } = serviceSlotOf(new Date(bl.slot_start), rules);
    details[`${serviceDate}|${sh}`] = { kind: bl.kind === "open_play" ? "open_play" : "block", reason: bl.reason };
  }

  const today = currentServiceDate(new Date(), rules);
  const href = (q: { court?: number; week?: string | null }) => `/backoffice/schedule?court=${q.court ?? court.id}&week=${q.week ?? week.monday}`;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-steel uppercase">Schedule</h1>
        <div className="flex rounded-lg bg-steel p-1">
          {courts.map((c) => (
            <Link key={c.id} href={href({ court: c.id })} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${c.id === court.id ? "bg-court text-white" : "text-white/70 hover:text-white"}`}>
              {c.name}
            </Link>
          ))}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Link href={href({ week: week.prevWeek })} className="btn-ghost px-3 py-1.5">‹ Prev</Link>
          <Link href={href({ week: today })} className="btn-ghost px-3 py-1.5">Today</Link>
          <Link href={href({ week: week.nextWeek })} className="btn-ghost px-3 py-1.5">Next ›</Link>
        </div>
        <p className="font-display text-lg font-semibold text-steel">
          {formatServiceDate(week.days[0])} – {formatServiceDate(week.days[6])}
        </p>
      </div>
      <ScheduleBoard key={`${court.id}-${week.monday}`} court={court} week={week} rules={rules} details={details} today={today} />
    </div>
  );
}
