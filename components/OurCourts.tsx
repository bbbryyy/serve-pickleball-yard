import Image from "next/image";
import Link from "next/link";
import { formatPeso } from "@/lib/schedule";

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const FEATURES = [
  {
    title: "Acrylic court surface",
    body: "A smooth, true bounce and reliable grip, so every shot plays the way you hit it.",
    tone: "bg-court text-white",
    svg: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden {...icon}>
        <rect x="3" y="5" width="18" height="14" rx="1" />
        <path d="M12 5v14M3 12h6M15 12h6" />
      </svg>
    ),
  },
  {
    title: "Covered courts",
    body: "Play rain or shine. The roof keeps you dry and out of the sun, and LED lights keep night games bright.",
    tone: "bg-steel text-white",
    svg: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden {...icon}>
        <path d="M2 11 12 4l10 7" />
        <path d="M5 10v10M19 10v10M8 20v-5h8v5" />
      </svg>
    ),
  },
  {
    title: "Parking space",
    body: "Park right at the yard and walk straight onto the court.",
    tone: "bg-surround text-white",
    svg: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden {...icon}>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
      </svg>
    ),
  },
  {
    title: "Food and drinks",
    body: "Refuel between games with food and drinks available at the court.",
    tone: "bg-ball text-ball-dark",
    svg: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden {...icon}>
        <path d="M6 3h9l-1 18H7L6 3z" />
        <path d="M6.5 8h8M15 6l3-3" />
      </svg>
    ),
  },
];

export function OurCourts({ courts, ratePerHour }: { courts: { id: number; name: string }[]; ratePerHour: number }) {
  return (
    <section id="courts" className="scroll-mt-20 bg-white py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="font-display text-3xl font-semibold text-steel uppercase sm:text-4xl">Our courts</h2>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* photo with floating badges */}
          <div className="relative min-h-[320px] overflow-hidden rounded-3xl">
            <Image src="/brand/court1.jpg" alt="The two covered courts at Serve Pickleball Yard" fill className="object-cover" sizes="(min-width: 1024px) 55vw, 100vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-court-deep/80 via-transparent to-transparent" />
            <div className="absolute top-4 left-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-steel backdrop-blur">
                {courts.length} courts
              </span>
              <span className="rounded-full bg-ball px-3 py-1 text-sm font-semibold text-ball-dark">
                {formatPeso(ratePerHour)} / hour
              </span>
            </div>
            <p className="absolute right-4 bottom-5 left-5 font-display text-lg leading-tight font-semibold whitespace-nowrap text-white uppercase sm:text-2xl">
              Rain or shine, morning to midnight
            </p>
          </div>

          {/* features */}
          <ul className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-3xl border border-kitchen-light bg-paper p-5">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${f.tone}`}>{f.svg}</span>
                <p className="mt-4 font-semibold text-steel">{f.title}</p>
                <p className="mt-1 text-sm text-steel/70">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* one card per court */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {courts.map((c) => (
            <div key={c.id} className="flex items-center gap-4 rounded-3xl border border-kitchen-light bg-white p-3 pr-5">
              <div className="rounded-2xl bg-surround p-1.5">
                <div className="court-lines flex h-16 w-28 items-center justify-center rounded-xl bg-court">
                  <span className="relative z-10 font-display text-lg font-bold text-white">{c.id}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-semibold text-steel uppercase">{c.name}</p>
                <p className="text-sm text-steel/60">Acrylic · covered · LED lights</p>
              </div>
              <Link href={`/book?court=${c.id}`} className="btn-primary shrink-0 px-4 py-2">
                Book
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
