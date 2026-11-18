import { notFound, redirect } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { QrPanels } from "@/components/QrPanels";
import { formatSessionTime } from "@/lib/openPlay";
import { getOpenPlayPaymentPublic } from "@/lib/openPlayData";
import { formatPeso } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { PaymentForm } from "../../../book/[ref]/pay/PaymentForm";
import { submitOpenPlayPayment } from "../../actions";

export const dynamic = "force-dynamic";

export default async function OpenPlayPayPage({ params }: PageProps<"/open-play/pay/[ref]">) {
  const { ref } = await params;
  const p = await getOpenPlayPaymentPublic(ref);
  if (!p) notFound();
  if (p.status !== "pending_payment") redirect(`/booking/${p.ref}`);
  const { rules, gcash, maya } = await getSiteSettings();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surround/15 px-5 py-4">
        <div>
          <p className="text-xs font-bold tracking-wider text-surround-dark uppercase">Spots on hold</p>
          <p className="text-sm text-steel">Pay and upload your screenshot before the hold ends, or your spots will be released.</p>
        </div>
        <p className="font-display text-3xl font-semibold text-surround-dark">
          <Countdown until={p.hold_expires_at!} />
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <h1 className="font-display text-3xl font-semibold text-steel uppercase">Pay with GCash or Maya</h1>
          <p className="mt-1 text-sm text-steel/70">
            Scan a QR code and send exactly <strong>{formatPeso(p.total_amount)}</strong>. Put <strong>{p.ref}</strong> in the message or note.
          </p>
          <QrPanels gcash={gcash} maya={maya} />
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="label">Reference</p>
            <p className="font-display text-2xl font-semibold tracking-wider text-steel">{p.ref}</p>
            <p className="mt-3 text-sm font-semibold text-court">Open play · {p.court_names.join(" and ")}</p>
            <p className="text-sm text-steel">{formatSessionTime(new Date(p.starts_at), new Date(p.ends_at), rules)}</p>
            <p className="mt-1 text-sm text-steel/70">{p.first_names.join(", ")}</p>
            <div className="mt-3 flex items-baseline justify-between border-t border-kitchen-light pt-3">
              <span className="text-sm text-steel/70">{p.player_count} player{p.player_count === 1 ? "" : "s"}</span>
              <span className="font-display text-2xl font-semibold text-court">{formatPeso(p.total_amount)}</span>
            </div>
          </div>
          <PaymentForm reference={p.ref} submit={submitOpenPlayPayment} />
        </aside>
      </div>
    </div>
  );
}
