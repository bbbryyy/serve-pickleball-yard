import { redirect } from "next/navigation";

async function lookup(form: FormData) {
  "use server";
  const ref = String(form.get("ref") ?? "").trim().toUpperCase();
  if (!ref) return;
  redirect(`/booking/${ref.startsWith("SPY-") ? ref : `SPY-${ref}`}`);
}

export default function BookingLookupPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-semibold text-steel uppercase">Check your booking</h1>
      <p className="mt-1 text-sm text-steel/70">Enter the reference you got when you booked a court or paid for open play.</p>
      <form action={lookup} className="card mt-6 space-y-3 p-5">
        <label className="label" htmlFor="ref">Booking reference</label>
        <input id="ref" name="ref" className="input font-mono" placeholder="SPY-7K3QXM" required />
        <button className="btn-court w-full">Check status</button>
      </form>
    </div>
  );
}
