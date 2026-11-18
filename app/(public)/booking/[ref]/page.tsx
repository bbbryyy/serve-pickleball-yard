import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_TEXT, getPublicBooking } from "@/lib/booking";
import { formatPeso, groupSlots } from "@/lib/schedule";
import { isOpenPlayRef } from "@/lib/openPlay";
import { getSiteSettings } from "@/lib/settings";
import { OpenPlayStatus } from "./OpenPlayStatus";

export default async function BookingStatusPage({ params }: PageProps<"/booking/[ref]">) {
  const { ref } = await params;
  if (isOpenPlayRef(ref)) return <OpenPlayStatus reference={ref} />;
  const booking = await getPublicBooking(ref);
  if (!booking) notFound();
  const { rules } = await getSiteSettings();
  const st = STATUS_TEXT[booking.status];

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="card overflow-hidden">
        <div className="court-lines bg-court px-6 py-8 text-white">
          <div className="relative z-10">
            <p className="text-xs tracking-wider text-white/70 uppercase">Booking reference</p>
            <p className="font-display text-4xl font-semibold tracking-wider">{booking.ref}</p>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${st.cls}`}>{st.label}</span>
          <p className="text-sm text-steel/80">{st.body}</p>
          {booking.status === "rejected" && booking.admin_note && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Reason: {booking.admin_note}</p>
          )}
          <div className="rounded-lg bg-paper p-4 text-sm">
            <p className="font-semibold text-steel">Hi {booking.player_name}, here&apos;s your booking</p>
            <p className="mt-2 font-semibold text-court">{booking.court_name}</p>
            <ul className="mt-1 space-y-0.5 text-steel">
              {groupSlots(booking.slots.map((s) => new Date(s)), rules).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-kitchen-light pt-2">
              <span>{booking.hours} hour{booking.hours === 1 ? "" : "s"}</span>
              <span className="font-semibold">{formatPeso(booking.total_amount)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {booking.status === "pending_payment" && (
              <Link href={`/book/${booking.ref}/pay`} className="btn-primary">Pay now</Link>
            )}
            {["expired", "rejected", "cancelled"].includes(booking.status) && (
              <Link href={`/book?court=${booking.court_id}`} className="btn-primary">Book again</Link>
            )}
            <Link href="/" className="btn-ghost">Back to home</Link>
          </div>
          <p className="text-xs text-steel/60">Save this page or your reference number to check your booking anytime.</p>
        </div>
      </div>
    </div>
  );
}
