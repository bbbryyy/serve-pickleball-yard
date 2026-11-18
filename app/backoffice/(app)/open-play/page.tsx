import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatSessionTime } from "@/lib/openPlay";
import { addDays, currentServiceDate } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";

type SessionRow = {
  id: string;
  service_date: string;
  starts_at: string;
  ends_at: string;
  status: string;
  players_per_court: number;
  fee_per_player: number;
  open_play_session_courts: { court_id: number }[];
  open_play_payments: { status: string; player_count: number; hold_expires_at: string | null }[];
};

function counts(s: SessionRow, now: number) {
  let paid = 0;
  let held = 0;
  let refunds = 0;
  for (const p of s.open_play_payments) {
    if (p.status === "confirmed") paid += p.player_count;
    if (p.status === "for_verification" || (p.status === "pending_payment" && p.hold_expires_at && Date.parse(p.hold_expires_at) > now)) held += p.player_count;
    if (p.status === "refund_owed") refunds++;
  }
  return { paid, held, refunds, limit: s.players_per_court * s.open_play_session_courts.length };
}

export default async function OpenPlayListPage({ searchParams }: PageProps<"/backoffice/open-play">) {
  await requireStaff();
  const sp = await searchParams;
  const refundsOnly = sp.refunds === "1";
  const { rules, courts } = await getSiteSettings();
  const now = new Date();
  const supabase = await createUserClient();
  let query = supabase
    .from("open_play_sessions")
    .select("id, service_date, starts_at, ends_at, status, players_per_court, fee_per_player, open_play_session_courts(court_id), open_play_payments(status, player_count, hold_expires_at)")
    .order("starts_at", { ascending: true });
  if (refundsOnly) {
    // look up the sessions that owe refunds directly, however old or many they are
    const { data: owed } = await supabase.from("open_play_payments").select("session_id").eq("status", "refund_owed");
    query = query.in("id", [...new Set((owed ?? []).map((r) => r.session_id))]);
  } else {
    query = query.gte("service_date", addDays(currentServiceDate(now, rules), -30));
  }
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);

  const nowMs = now.getTime();
  const all = (data as SessionRow[]).map((s) => ({ s, c: counts(s, nowMs) }));
  const rows = refundsOnly ? all.filter((x) => x.c.refunds > 0) : all;
  const upcoming = rows.filter((x) => Date.parse(x.s.ends_at) > nowMs);
  const past = rows.filter((x) => Date.parse(x.s.ends_at) <= nowMs).reverse();
  const courtName = (id: number) => courts.find((c) => c.id === id)?.name ?? `Court ${id}`;

  const list = (items: typeof rows, empty: string) =>
    items.length === 0 ? (
      <p className="card p-6 text-sm text-steel/60">{empty}</p>
    ) : (
      <ul className="space-y-2">
        {items.map(({ s, c }) => (
          <li key={s.id}>
            <Link href={`/backoffice/open-play/${s.id}`} className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4 hover:border-court">
              <div className="min-w-[200px] flex-1">
                <p className="font-display text-lg font-semibold text-steel uppercase">{formatSessionTime(new Date(s.starts_at), new Date(s.ends_at), rules)}</p>
                <p className="text-sm text-steel/60">{s.open_play_session_courts.map((x) => courtName(x.court_id)).sort().join(" and ")}</p>
              </div>
              {s.status === "cancelled" ? (
                <span className="rounded-full bg-kitchen-light px-2.5 py-0.5 text-xs font-semibold text-steel">Cancelled</span>
              ) : (
                <div className="text-right">
                  <p className="font-display text-2xl font-semibold text-court">{c.paid} / {c.limit}</p>
                  <p className="text-xs text-steel/60">paid{c.held ? ` · ${c.held} paying or to check` : ""}</p>
                </div>
              )}
              {c.refunds > 0 && <span className="rounded-full bg-surround/20 px-2.5 py-0.5 text-xs font-semibold text-surround-dark">{c.refunds} refund{c.refunds === 1 ? "" : "s"} owed</span>}
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-steel uppercase">Open play</h1>
          <p className="text-sm text-steel/60">{refundsOnly ? "Sessions with refunds still owed." : "Create a session, copy its link into Reclub, and track who has paid."}</p>
        </div>
        <div className="flex gap-2">
          {refundsOnly && <Link href="/backoffice/open-play" className="btn-ghost">All sessions</Link>}
          <Link href="/backoffice/open-play/new" className="btn-primary">New session</Link>
        </div>
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-steel uppercase">Upcoming</h2>
        {list(upcoming, refundsOnly ? "No upcoming sessions with refunds owed." : "No upcoming sessions. Create one to get a payment link for Reclub.")}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-steel uppercase">{refundsOnly ? "Past" : "Past 30 days"}</h2>
        {list(past, "No past sessions.")}
      </section>
    </div>
  );
}
