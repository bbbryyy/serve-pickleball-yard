import { notFound, redirect } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { getPublicBooking } from "@/lib/booking";
import { formatPeso, groupSlots } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { PaymentForm } from "./PaymentForm";

export default async function PayPage({ params }: PageProps<"/book/[ref]/pay">) {
  const { ref } = await params;
  const booking = await getPublicBooking(ref);
  if (!booking) notFound();
  if (booking.status !== "pending_payment") redirect(`/booking/${booking.ref}`);
  const { rules, gcash, maya } = await getSiteSettings();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surround/15 px-5 py-4">
        <div>
          <p className="text-xs font-bold tracking-wider text-surround-dark uppercase">Slot on hold</p>
          <p className="text-sm text-steel">Pay and upload your screenshot before the hold ends, or the hours will be released.</p>
        </div>
        <p className="font-display text-3xl font-semibold text-surround-dark">
          <Countdown until={booking.hold_expires_at!} />
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <h1 className="font-display text-3xl font-semibold text-steel uppercase">Pay with GCash or Maya</h1>
          <p className="mt-1 text-sm text-steel/70">
            Scan a QR code and send exactly <strong>{formatPeso(booking.total_amount)}</strong>. Put{" "}
            <strong>{booking.ref}</strong> in the message or note.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              { name: "GCash", acct: gcash, ring: "border-[#0a6cff]", text: "text-[#0a4fb8]" },
              { name: "Maya", acct: maya, ring: "border-[#00a651]", text: "text-[#00753a]" },
            ].map(({ name, acct, ring, text }) => (
              <div key={name} className={`card border-2 ${ring} p-4 text-center`}>
                <p className={`font-display text-xl font-semibold ${text}`}>{name}</p>
                {acct.qrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={acct.qrUrl} alt={`${name} QR code`} className="mx-auto mt-3 aspect-square w-full max-w-[240px] rounded object-contain" />
                ) : (
                  <div className="mx-auto mt-3 flex aspect-square w-full max-w-[240px] items-center justify-center rounded bg-paper p-4 text-sm text-steel/60">
                    QR code coming soon. Ask our staff for payment details.
                  </div>
                )}
                {(acct.name || acct.number) && (
                  <p className="mt-3 text-sm text-steel">
                    {acct.name}
                    {acct.number && <span className="block font-semibold">{acct.number}</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="label">Booking reference</p>
            <p className="font-display text-2xl font-semibold tracking-wider text-steel">{booking.ref}</p>
            <p className="mt-3 text-sm font-semibold text-court">{booking.court_name}</p>
            <ul className="mt-1 space-y-1 text-sm text-steel">
              {groupSlots(booking.slots.map((s) => new Date(s)), rules).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between border-t border-kitchen-light pt-3">
              <span className="text-sm text-steel/70">Amount due</span>
              <span className="font-display text-2xl font-semibold text-court">{formatPeso(booking.total_amount)}</span>
            </div>
          </div>
          <PaymentForm reference={booking.ref} />
        </aside>
      </div>
    </div>
  );
}
