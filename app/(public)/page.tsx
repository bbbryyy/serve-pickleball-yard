import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { HoursCards } from "@/components/HoursTable";
import { formatHour, formatPeso } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";

export default async function HomePage() {
  await connection();
  const { rules, courts } = await getSiteSettings();

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-court-deep text-white">
        <Image src="/brand/court1.jpg" alt="" fill priority className="-z-10 object-cover opacity-45" sizes="100vw" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-court-deep via-court-deep/80 to-transparent" />
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="font-display text-sm tracking-[0.25em] text-ball uppercase">Indoor pickleball · 2 courts</p>
          <h1 className="mt-3 max-w-xl font-display text-5xl leading-[1.05] font-bold uppercase sm:text-6xl">
            Play with <span className="text-surround">purpose</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-white/85">
            Book a court by the hour from {formatHour(rules.earlyStart)} to {formatHour(24 + rules.closeHour)}. Pay with
            GCash or Maya and you&apos;re set.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/book" className="btn-lime px-6 py-3 text-base">Check availability →</Link>
            <Link href="#hours" className="btn border border-white/40 px-6 py-3 text-base text-white hover:bg-white/10">
              Hours and rates
            </Link>
          </div>
          <p className="mt-6 font-display text-2xl">
            {formatPeso(rules.ratePerHour)} <span className="text-base text-white/70">/ hour / court</span>
          </p>
        </div>
      </section>

      {/* Hours */}
      <section id="hours" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-3xl font-semibold text-steel uppercase">Court hours</h2>
          <p className="text-sm text-steel/70">Bookings are by the hour, starting on the hour.</p>
        </div>
        <HoursCards rules={rules} />
      </section>

      {/* Courts */}
      <section id="courts" className="bg-surround/15 py-14">
        <div className="mx-auto max-w-6xl scroll-mt-24 px-4">
          <h2 className="mb-6 font-display text-3xl font-semibold text-steel uppercase">Our courts</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {courts.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-xl bg-surround p-3">
                <div className="court-lines flex aspect-[2/1] flex-col items-center justify-center rounded bg-court text-white">
                  <p className="relative z-10 font-display text-4xl font-bold uppercase">{c.name}</p>
                  <p className="relative z-10 mt-1 text-sm text-white/80">Indoor · covered · LED lights</p>
                </div>
                <div className="flex items-center justify-between px-1 pt-3">
                  <span className="font-semibold text-white">{formatPeso(rules.ratePerHour)} / hour</span>
                  <Link href={`/book?court=${c.id}`} className="btn bg-white text-court hover:bg-paper">
                    Book {c.name}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coaching */}
      <section id="coaching" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14">
        <div className="grid items-center gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
          <div className="relative aspect-[3/4] overflow-hidden rounded-xl">
            <Image
              src="/brand/coaching.jpg"
              alt="Two players holding paddles beside a cart of practice balls, in front of the Serve Pickleball Yard mural"
              fill
              className="object-cover"
              sizes="(min-width: 768px) 40vw, 100vw"
            />
          </div>
          <div>
            <h2 className="font-display text-3xl font-semibold text-steel uppercase">Coaching</h2>
            <p className="mt-3 text-lg text-steel/80">
              New to pickleball or ready to sharpen your game? Train with a coach on our courts and play with purpose.
            </p>
            <ul className="mt-6 space-y-4">
              {[
                ["Beginners", "Learn the grip, the serve, scoring, and the kitchen rules so you can join games with confidence."],
                ["Improving players", "Drill dinks, third-shot drops, and volleys, and work on footwork and positioning."],
                ["Groups and teams", "Bring your friends, office, or club for a clinic built around your level."],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-ball ring-2 ring-ball-dark/20" />
                  <div>
                    <p className="font-semibold text-steel">{title}</p>
                    <p className="text-sm text-steel/70">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-steel/70">
              Ask our front desk about coaches and session rates. Lessons run on a booked court at{" "}
              {formatPeso(rules.ratePerHour)} an hour.
            </p>
            <Link href="/book" className="btn-primary mt-4 px-6 py-3 text-base">Book a court for a lesson</Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-6 font-display text-3xl font-semibold text-steel uppercase">How booking works</h2>
        <ol className="grid gap-4 sm:grid-cols-4">
          {[
            ["Pick your hours", "Choose a court and the hours you want on the weekly schedule."],
            ["Reserve", `Enter your name and mobile number. We hold the slot for ${rules.holdMinutes} minutes.`],
            ["Pay via QR", "Scan our GCash or Maya QR, then upload your payment screenshot."],
            ["Get confirmed", "Our staff checks your payment and confirms your booking."],
          ].map(([title, body], i) => (
            <li key={title} className="card p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ball font-display text-lg font-bold text-ball-dark">
                {i + 1}
              </span>
              <p className="mt-3 font-semibold text-steel">{title}</p>
              <p className="mt-1 text-sm text-steel/70">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl bg-court p-5 text-white">
          <p className="flex-1 text-lg font-semibold">Ready to play?</p>
          <Link href="/book" className="btn-lime px-6 py-3">Book a court</Link>
        </div>
      </section>
    </>
  );
}
