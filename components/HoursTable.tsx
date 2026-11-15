import { BAND_LABEL, formatHour, formatPeso, type BookingRules } from "@/lib/schedule";

export function HoursCards({ rules }: { rules: BookingRules }) {
  const bands = [
    { key: "early" as const, from: rules.earlyStart, to: rules.regularStart, note: `Book at least ${rules.offhoursLeadHours} hours ahead`, accent: "border-surround", tag: "text-surround-dark" },
    { key: "regular" as const, from: rules.regularStart, to: rules.lateStart, note: "Book anytime, even same day", accent: "border-court", tag: "text-court" },
    { key: "late" as const, from: rules.lateStart, to: 24 + rules.closeHour, note: `Book at least ${rules.offhoursLeadHours} hours ahead`, accent: "border-steel", tag: "text-steel" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {bands.map((b) => (
        <div key={b.key} className={`card border-t-4 ${b.accent} p-5`}>
          <p className={`text-xs font-bold tracking-wider uppercase ${b.tag}`}>{BAND_LABEL[b.key]}</p>
          <p className="mt-1 font-display text-3xl font-semibold text-steel">
            {formatHour(b.from)} – {formatHour(b.to)}
          </p>
          <p className="mt-2 text-sm text-steel/70">{b.note}</p>
          <p className="mt-3 text-sm font-semibold text-court">{formatPeso(rules.ratePerHour)} / hour</p>
        </div>
      ))}
    </div>
  );
}
