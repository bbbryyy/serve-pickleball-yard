import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { formatSessionTime } from "@/lib/openPlay";
import { PAYMENT_COLUMNS, toStaffPayments } from "@/lib/openPlayAdmin";
import { formatPeso } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";
import { QueueTable, roundTime } from "@/components/QueueTable";
import type { SavedQueue } from "@/lib/openPlayQueue";
import { OpenPlayPaymentRow } from "../../OpenPlayPaymentRow";
import { MarkRound, RedoRest } from "./QueueControls";
import { AddCourt, CancelSession, CopyLink, WalkInForm } from "./SessionControls";

const nowMs = () => Date.now();

const ORDER = ["for_verification", "pending_payment", "confirmed", "refund_owed", "refunded", "expired", "rejected", "cancelled"];

export default async function SessionPage({ params, searchParams }: PageProps<"/backoffice/open-play/[id]">) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createUserClient();
  const { rules, courts } = await getSiteSettings();

  const [{ data: s }, { data: payments, error }, { data: held }, { data: limit }, { data: savedQueue }] = await Promise.all([
    supabase.from("open_play_sessions").select("*, open_play_session_courts(court_id)").eq("id", id).maybeSingle(),
    supabase.from("open_play_payments").select(PAYMENT_COLUMNS).eq("session_id", id).order("created_at"),
    supabase.rpc("open_play_held", { p_session_id: id }),
    supabase.rpc("open_play_limit", { p_session_id: id }),
    supabase.from("open_play_queues").select("*").eq("session_id", id).maybeSingle(),
  ]);
  const queue = savedQueue as SavedQueue | null;
  if (!s) notFound();
  if (error) throw new Error(error.message);

  const rows = (await toStaffPayments(payments ?? [], rules)).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const paid = rows.filter((p) => p.status === "confirmed").reduce((t, p) => t + p.playerCount, 0);
  const max = (limit as number) ?? 0;
  const spotsLeft = Math.max(0, max - ((held as number) ?? 0));
  const inSession = (s.open_play_session_courts as { court_id: number }[]).map((c) => c.court_id);
  const now = nowMs();
  const started = Date.parse(s.starts_at) <= now;
  const ended = Date.parse(s.ends_at) <= now;
  const cancelled = s.status === "cancelled";
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const url = `${origin}/open-play/${s.code}`;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/backoffice/open-play" className="text-sm text-court hover:underline">Back to open play</Link>
      {sp.created && <p className="rounded-lg bg-ball/30 px-4 py-2 text-sm text-ball-dark">Session created. Copy the link below into the Reclub registration.</p>}

      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-steel uppercase sm:text-3xl">{formatSessionTime(new Date(s.starts_at), new Date(s.ends_at), rules)}</h1>
            <p className="text-sm text-steel/60">
              {inSession.map((c) => courts.find((x) => x.id === c)?.name ?? `Court ${c}`).sort().join(" and ")} · {formatPeso(s.fee_per_player)} per player
              {s.note && <> · {s.note}</>}
            </p>
          </div>
          {cancelled ? (
            <div className="text-right">
              <span className="rounded-full bg-kitchen-light px-3 py-1 text-sm font-semibold text-steel">Cancelled</span>
              {s.cancel_reason && <p className="mt-1 text-xs text-steel/60">{s.cancel_reason}</p>}
            </div>
          ) : (
            <div className="text-right">
              <p className="font-display text-3xl font-semibold text-court">{paid} / {max}</p>
              <p className="text-xs text-steel/60">players paid · {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left</p>
              <div className="mt-2 h-1.5 w-40 rounded-full bg-kitchen-light" aria-hidden>
                <div className="h-1.5 rounded-full bg-court" style={{ width: `${max ? Math.min(100, (paid / max) * 100) : 0}%` }} />
              </div>
            </div>
          )}
        </div>
        {!cancelled && !started && <CopyLink url={url} />}
        {!cancelled && started && <p className="text-sm text-steel/60">The payment link closed when the session started. Add walk-ins below.</p>}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-steel uppercase">Players</h2>
        {rows.length === 0 ? (
          <p className="card p-6 text-sm text-steel/60">No payments yet. Players appear here as soon as they start paying through the link.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((p) => <OpenPlayPaymentRow key={p.id} p={p} />)}
          </ul>
        )}
      </section>

      {!cancelled && (
        <section id="queue" className="card space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-steel uppercase">
              Queue{queue && <span className="font-normal normal-case text-steel/60"> · {queue.players.length} players · {queue.minutes_per_game} min games</span>}
            </h2>
            {queue && (
              <div className="flex gap-2">
                <Link href={`/open-play/${s.code}/queue`} target="_blank" className="btn-ghost px-3 py-1.5 text-sm">
                  Players&apos; view
                </Link>
                <Link href={`/open-play/${s.code}/queue?print=1`} target="_blank" className="btn-ghost px-3 py-1.5 text-sm">
                  Print
                </Link>
              </div>
            )}
          </div>
          {queue ? (
            <>
              <div className="overflow-x-auto">
                <QueueTable
                  courts={[...new Set(queue.rounds.flatMap((r) => r.games.map((g) => g.court)))].sort()}
                  rounds={queue.rounds}
                  playedThrough={queue.played_through}
                  action={ended ? null : <MarkRound sessionId={s.id} playedThrough={queue.played_through} total={queue.rounds.length} />}
                />
              </div>
              {queue.played_through >= queue.rounds.length && <p className="text-sm text-steel/60">All rounds played.</p>}
              {!ended && queue.played_through < queue.rounds.length && (
                <RedoRest sessionId={s.id} players={queue.players} fromLabel={roundTime(queue.rounds[queue.played_through].start)} />
              )}
              {!ended && queue.played_through >= queue.rounds.length && (
                <MarkRound sessionId={s.id} playedThrough={queue.played_through} total={queue.rounds.length} />
              )}
            </>
          ) : (
            <p className="text-sm text-steel/60">
              No queue yet. Open Ask Dink and ask for the &quot;Queue for open play today&quot;, then tap Save to session.
            </p>
          )}
        </section>
      )}

      {!cancelled && !ended && (
        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-bold text-steel uppercase">Add walk-in players</h2>
          <WalkInForm sessionId={s.id} spotsLeft={spotsLeft} />
        </section>
      )}

      {!cancelled && (!ended || !started) && (
        <div className="flex flex-wrap items-start justify-end gap-2">
          {!ended && <AddCourt sessionId={s.id} courts={courts.filter((c) => !inSession.includes(c.id))} />}
          {!started && <CancelSession sessionId={s.id} />}
        </div>
      )}
    </div>
  );
}
