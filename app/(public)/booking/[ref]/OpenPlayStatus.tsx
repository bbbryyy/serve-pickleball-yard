import Link from "next/link";
import { notFound } from "next/navigation";
import { formatSessionTime } from "@/lib/openPlay";
import { OPEN_PLAY_STATUS_TEXT, getOpenPlayPaymentPublic } from "@/lib/openPlayData";
import { formatPeso } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";

export async function OpenPlayStatus({ reference }: { reference: string }) {
  const p = await getOpenPlayPaymentPublic(reference);
  if (!p) notFound();
  const { rules } = await getSiteSettings();
  const st = OPEN_PLAY_STATUS_TEXT[p.status];

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="card overflow-hidden">
        <div className="court-lines bg-court px-6 py-8 text-white">
          <div className="relative z-10">
            <p className="text-xs tracking-wider text-white/70 uppercase">Open play reference</p>
            <p className="font-display text-4xl font-semibold tracking-wider">{p.ref}</p>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${st.cls}`}>{st.label}</span>
          <p className="text-sm text-steel/80">{st.body}</p>
          {p.status === "rejected" && p.admin_note && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Reason: {p.admin_note}</p>
          )}
          <div className="rounded-lg bg-paper p-4 text-sm">
            <p className="font-semibold text-court">Open play · {p.court_names.join(" and ")}</p>
            <p className="text-steel">{formatSessionTime(new Date(p.starts_at), new Date(p.ends_at), rules)}</p>
            <p className="mt-2 text-steel/80">Players: {p.first_names.join(", ")}</p>
            <p className="mt-2 flex justify-between border-t border-kitchen-light pt-2">
              <span>{p.player_count} player{p.player_count === 1 ? "" : "s"}</span>
              <span className="font-semibold">{formatPeso(p.total_amount)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.status === "pending_payment" && <Link href={`/open-play/pay/${p.ref}`} className="btn-primary">Pay now</Link>}
            {["expired", "rejected"].includes(p.status) && <Link href={`/open-play/${p.code}`} className="btn-primary">Pay again</Link>}
            <Link href="/" className="btn-ghost">Back to home</Link>
          </div>
          <p className="text-xs text-steel/60">Save this page or your reference to check your payment anytime.</p>
        </div>
      </div>
    </div>
  );
}
