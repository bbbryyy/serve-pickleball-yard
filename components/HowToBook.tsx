import Link from "next/link";

/*
 * "How booking works": the four steps sit on a top-down court, with a lime
 * ball path arcing from step to step like a rally. Each step shows a small
 * slice of the real screen it refers to.
 */

// --- mini screens (decorative; the step text carries the meaning) ---

function MiniGrid() {
  const cells = [
    "bg-court", "bg-court", "bg-kitchen", "bg-court",
    "bg-court", "bg-ball ring-2 ring-steel", "bg-court", "bg-surround",
    "bg-court", "bg-ball ring-2 ring-steel", "bg-court", "bg-court",
  ];
  return (
    <div className="grid grid-cols-4 gap-1">
      {cells.map((c, i) => (
        <span key={i} className={`h-5 rounded-[3px] ${c}`} />
      ))}
    </div>
  );
}

function MiniForm({ holdMinutes }: { holdMinutes: number }) {
  return (
    <div className="space-y-1.5">
      <div className="h-5 rounded-md border border-kitchen bg-white px-2 text-[10px] leading-5 text-steel/50">Juan dela Cruz</div>
      <div className="h-5 rounded-md border border-kitchen bg-white px-2 text-[10px] leading-5 text-steel/50">0917 123 4567</div>
      <span className="inline-flex items-center gap-1 rounded-full bg-surround/15 px-2 py-0.5 text-[11px] font-semibold text-surround-dark">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        Held {String(holdMinutes).padStart(2, "0")}:00
      </span>
    </div>
  );
}

// fixed pattern so the QR looks the same on every render
const QR = "1110111100010110101101011101011100001110101101101111001101".split("");

function MiniQr() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-[72px] w-[72px] shrink-0 grid-cols-8 gap-px rounded-md bg-white p-1.5 ring-1 ring-kitchen-light">
        {Array.from({ length: 64 }, (_, i) => {
          const corner = (r: number, c: number) => r < 3 && c < 3;
          const r = Math.floor(i / 8), c = i % 8;
          const on = corner(r, c) || corner(r, 7 - c) || corner(7 - r, c) || QR[i % QR.length] === "1";
          return <span key={i} className={on ? "bg-steel" : "bg-transparent"} />;
        })}
      </div>
      <div className="space-y-1.5">
        <span className="block rounded-full bg-[#0a6cff] px-2 py-0.5 text-[10px] font-semibold text-white">GCash</span>
        <span className="block rounded-full bg-[#00a651] px-2 py-0.5 text-[10px] font-semibold text-white">Maya</span>
      </div>
    </div>
  );
}

function MiniTicket() {
  return (
    <div className="relative rounded-lg border border-dashed border-kitchen bg-white p-2.5">
      <span className="rounded-full bg-ball px-2 py-0.5 text-[10px] font-bold text-ball-dark">Confirmed</span>
      <p className="mt-1.5 font-display text-sm font-semibold tracking-wider text-steel">SPY-7K3QXM</p>
      <p className="text-[10px] text-steel/60">Court 1, 6PM to 8PM</p>
      <span aria-hidden className="absolute top-1/2 -left-1.5 h-3 w-3 -translate-y-1/2 rounded-full bg-paper" />
      <span aria-hidden className="absolute top-1/2 -right-1.5 h-3 w-3 -translate-y-1/2 rounded-full bg-paper" />
    </div>
  );
}

export function HowToBook({ holdMinutes }: { holdMinutes: number }) {
  const steps = [
    { title: "Pick your hours", body: "Choose a court and tap the open hours on the weekly schedule.", screen: <MiniGrid /> },
    { title: "Reserve", body: `Enter your name and mobile number. We hold your hours for ${holdMinutes} minutes.`, screen: <MiniForm holdMinutes={holdMinutes} /> },
    { title: "Pay via QR", body: "Scan our GCash or Maya QR and upload a screenshot of your payment.", screen: <MiniQr /> },
    { title: "Get confirmed", body: "Our staff checks your payment and confirms your booking. See you on court.", screen: <MiniTicket /> },
  ];

  return (
    <section id="how-to-book" className="scroll-mt-20 bg-white py-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-3xl font-semibold text-steel uppercase sm:text-4xl">How booking works</h2>
          <p className="max-w-sm text-steel/70">From picking an hour to stepping on court, all from your phone.</p>
        </div>

        {/* the court */}
        <div className="relative mt-8 overflow-hidden rounded-[2rem] bg-surround p-3 sm:p-4">
          <div className="relative overflow-hidden rounded-[1.5rem] bg-court px-4 py-10 sm:px-8 lg:py-14">
            {/* court markings: boundary, centre line, kitchen around the net */}
            <div aria-hidden className="pointer-events-none absolute inset-4 rounded-xl border-[3px] border-white/50" />
            <div aria-hidden className="pointer-events-none absolute inset-y-4 left-1/2 hidden w-[16%] -translate-x-1/2 border-x-[3px] border-white/50 bg-kitchen/35 lg:block" />
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-1 -translate-x-1/2 bg-steel/70 lg:block" />
            <div aria-hidden className="pointer-events-none absolute inset-x-4 top-1/2 h-[3px] bg-white/50 lg:hidden" />

            {/* the rally: a ball path arcing over the steps */}
            <svg aria-hidden viewBox="0 0 1000 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-8 top-2 hidden h-24 lg:block">
              <path
                d="M60 100 Q190 -10 310 92 Q440 -10 565 92 Q690 -10 815 92 Q890 10 960 40"
                fill="none"
                stroke="var(--color-ball)"
                strokeWidth="3"
                strokeDasharray="2 10"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <ol className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {steps.map((s, i) => (
                <li key={s.title} className="relative rounded-2xl bg-white p-5 pt-7 shadow-[0_10px_30px_-12px_rgb(15_47_99/0.6)]">
                  <span className="absolute -top-4 left-5 flex h-9 w-9 items-center justify-center rounded-full bg-ball font-display text-lg font-bold text-ball-dark ring-4 ring-court">
                    {i + 1}
                  </span>
                  <div aria-hidden className="rounded-xl bg-paper p-3">{s.screen}</div>
                  <h3 className="mt-4 font-semibold text-steel">{s.title}</h3>
                  <p className="mt-1 text-sm text-steel/70">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-steel px-5 py-4 text-white">
          <p className="text-lg font-semibold">Ready to play?</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/booking" className="btn border border-white/40 text-white hover:bg-white/10">Check a booking</Link>
            <Link href="/book" className="btn-lime">Book a court</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
