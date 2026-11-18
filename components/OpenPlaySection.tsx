import Link from "next/link";
import { RECLUB_URL } from "@/lib/contact";
import { formatPeso } from "@/lib/schedule";
import { RotationCourt } from "./RotationCourt";

const STEPS = [
  { title: "Register on Reclub", body: "Pick a session. You start on the waiting list." },
  { title: "Pay through the link", body: "GCash or Maya, for yourself or your whole group." },
  { title: "Get confirmed and play", body: "We move you off the waiting list once your payment checks out." },
];

export function OpenPlaySection({ fee, playersPerCourt }: { fee: number; playersPerCourt: number }) {
  return (
    <section id="open-play" className="scroll-mt-20 bg-[#eaf1fb] py-16 text-steel">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <div>
          <h2 className="font-display text-4xl leading-none font-semibold uppercase sm:text-5xl">Open play</h2>
          <p className="mt-4 max-w-[42ch] text-lg text-steel/80">
            No partner? No problem. Join the line, rotate in, and play with whoever&apos;s on the court. Every level is welcome.
          </p>

          <dl className="mt-6 grid max-w-md grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white px-4 py-3">
              <dt className="text-sm text-steel/60">Per player</dt>
              <dd className="font-display text-3xl font-semibold text-court">{formatPeso(fee)}</dd>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <dt className="text-sm text-steel/60">Players per court</dt>
              <dd className="font-display text-3xl font-semibold">{playersPerCourt}</dd>
            </div>
          </dl>

          <ol className="mt-6 max-w-md">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-3 border-t border-court/15 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-court text-sm font-semibold text-white">{i + 1}</span>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-steel/70">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex flex-wrap gap-3">
            <a href={RECLUB_URL} target="_blank" rel="noreferrer" className="btn-primary px-6 py-3 text-base">Join on Reclub</a>
            <Link href="/booking" className="btn-ghost px-6 py-3 text-base">Check my payment</Link>
          </div>
          <p className="mt-4 text-sm text-steel/70">Walk-ins are welcome when spots are left. Pay at the front desk and join the line.</p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <RotationCourt />
        </div>
      </div>
    </section>
  );
}
