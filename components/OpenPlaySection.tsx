import Image from "next/image";
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
    <section id="open-play" className="scroll-mt-20 bg-court-deep py-16 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        {/* photo with the rotating court on top */}
        <div className="relative min-h-[380px] overflow-hidden rounded-3xl lg:min-h-[520px]">
          <Image src="/brand/open-play.jpg" alt="Players in an open play session at Serve Pickleball Yard" fill className="object-cover" sizes="(min-width: 1024px) 55vw, 100vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-court-deep/85 via-court-deep/10 to-transparent" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 sm:left-5 sm:translate-x-0">
            <RotationCourt />
          </div>
        </div>

        <div className="flex flex-col">
          <h2 className="font-display text-4xl leading-none font-semibold uppercase sm:text-5xl">Open play</h2>
          <p className="mt-4 max-w-[42ch] text-lg text-white/85">
            No partner? No problem. Join the line, rotate in, and play with whoever&apos;s on the court. Every level is welcome.
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/8 px-4 py-3">
              <dt className="text-sm text-white/70">Per player</dt>
              <dd className="font-display text-3xl font-semibold text-ball">{formatPeso(fee)}</dd>
            </div>
            <div className="rounded-2xl bg-white/8 px-4 py-3">
              <dt className="text-sm text-white/70">Players per court</dt>
              <dd className="font-display text-3xl font-semibold">{playersPerCourt}</dd>
            </div>
          </dl>

          <ol className="mt-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-3 border-t border-white/12 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ball text-sm font-semibold text-ball">{i + 1}</span>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-white/70">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex flex-wrap gap-3">
            <a href={RECLUB_URL} target="_blank" rel="noreferrer" className="btn-primary px-6 py-3 text-base">Join on Reclub</a>
            <Link href="/booking" className="btn border border-white/40 px-6 py-3 text-base text-white hover:bg-white/10">Check my payment</Link>
          </div>

          <div className="mt-6 flex items-center gap-4 rounded-2xl bg-white/6 p-3">
            <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl">
              <Image src="/brand/open-play-waiting.jpg" alt="Players waiting courtside for their turn" fill className="object-cover" sizes="112px" />
            </div>
            <p className="text-sm text-white/80">Walk-ins are welcome when spots are left. Pay at the front desk and join the line.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
