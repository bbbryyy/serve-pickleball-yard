import { CONTACT, DIRECTIONS_URL, MAP_EMBED_URL } from "@/lib/contact";
import { formatHour, type HoursConfig } from "@/lib/schedule";

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const ITEMS = [
  {
    label: "Address",
    value: CONTACT.address,
    svg: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden {...icon}>
        <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    label: "Call or text",
    value: CONTACT.phone,
    href: CONTACT.phoneHref,
    svg: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden {...icon}>
        <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" />
      </svg>
    ),
  },
  {
    label: "Email",
    value: CONTACT.email,
    href: `mailto:${CONTACT.email}`,
    svg: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden {...icon}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
  {
    label: "Messenger",
    value: CONTACT.messenger,
    svg: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden {...icon}>
        <path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.3 1.8.4 2.7.4 5 0 9-3.7 9-8.4S17 3 12 3z" />
        <path d="m7 13 3-3 2.5 2L16 9l-3 3-2.5-2z" />
      </svg>
    ),
  },
];

/**
 * Full-width contact section. On wide screens the live map fills the
 * section and fades into the page on the left, under the contact card;
 * the map's right side stays interactive. On phones the map sits on top,
 * fully visible (Google's logo and credits must stay readable), with the card below.
 */
export function ContactUs({ rules }: { rules: HoursConfig }) {
  return (
    <section id="contact" className="relative scroll-mt-20 overflow-hidden bg-paper lg:min-h-[540px]">
      {/* map: full width on phones; on desktop it starts at 30% so the pin lands right of the card */}
      <div className="relative h-72 sm:h-96 lg:absolute lg:inset-y-0 lg:right-0 lg:left-[30%] lg:h-auto">
        <iframe
          title={`Map showing ${CONTACT.name} in ${CONTACT.addressShort}`}
          src={MAP_EMBED_URL}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
      {/* desktop: fade the left of the map into the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 hidden w-[62%] bg-gradient-to-r from-paper from-75% to-transparent lg:block"
      />

      <div className="relative mx-auto max-w-6xl px-4 pt-8 pb-14 lg:py-16">
        <div className="max-w-md">
          <h2 className="font-display text-3xl font-semibold text-steel uppercase sm:text-4xl">Contact us</h2>
          <p className="mt-1 text-steel/70">
            Questions about courts, coaching, or your booking? Call, text, or drop by. We&apos;re open daily,{" "}
            {formatHour(rules.earlyStart)} to {formatHour(24 + rules.closeHour)}.
          </p>

          <div className="mt-6 rounded-3xl bg-white p-5 shadow-[0_20px_50px_-24px_rgb(15_47_99/0.45)] ring-1 ring-kitchen-light">
            <ul className="divide-y divide-kitchen-light">
              {ITEMS.map((it) => (
                <li key={it.label} className="flex items-start gap-3 py-3 first:pt-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-court text-white">{it.svg}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-steel/60">{it.label}</p>
                    {it.href ? (
                      <a href={it.href} className="font-semibold break-words text-court hover:underline">{it.value}</a>
                    ) : (
                      <p className="font-semibold text-steel">{it.value}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="btn-primary">
                Get directions
              </a>
              <a href={CONTACT.phoneHref} className="btn-ghost">Call us</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
