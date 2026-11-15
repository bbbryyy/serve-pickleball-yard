import Link from "next/link";
import { Metric, RangePicker } from "@/components/RangePicker";
import { requireAdmin } from "@/lib/auth";
import { getReport, groupBy, rangePresets, resolveRange, sum } from "@/lib/reports";
import { formatPeso, formatServiceDate } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";

const METHOD: Record<string, string> = { gcash: "GCash", maya: "Maya", cash: "Cash" };

export default async function SalesPage({ searchParams }: PageProps<"/backoffice/reports/sales">) {
  await requireAdmin();
  const sp = await searchParams;
  const { rules, courts } = await getSiteSettings();
  const range = resolveRange(sp, rules, "this-month");
  const { daily } = await getReport(range.from, range.to);

  const revenue = sum(daily, (r) => r.revenue);
  const bookings = sum(daily, (r) => r.bookings);
  const hours = sum(daily, (r) => r.hours);
  const byDay = [...groupBy(daily, (r) => r.date)].sort(([a], [b]) => (a < b ? 1 : -1));
  const breakdown = (key: (r: (typeof daily)[number]) => string, label: (k: string) => string) =>
    [...groupBy(daily, key)].map(([k, rows]) => ({ label: label(k), revenue: sum(rows, (r) => r.revenue), hours: sum(rows, (r) => r.hours), bookings: sum(rows, (r) => r.bookings) })).sort((a, b) => b.revenue - a.revenue);

  const tables = [
    { title: "By court", rows: breakdown((r) => String(r.court), (k) => courts.find((c) => c.id === Number(k))?.name ?? `Court ${k}`) },
    { title: "By payment method", rows: breakdown((r) => r.method, (k) => METHOD[k] ?? k) },
    { title: "By channel", rows: breakdown((r) => r.source, (k) => (k === "walk_in" ? "Walk-in / phone" : "Online")) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-steel uppercase">Sales report</h1>
          <p className="text-sm text-steel/60">
            Confirmed bookings by play date · {formatServiceDate(range.from)} – {formatServiceDate(range.to)}
          </p>
        </div>
        <Link href={`/backoffice/reports/sales/export?from=${range.from}&to=${range.to}`} className="btn-ghost" prefetch={false}>
          Export CSV
        </Link>
      </div>
      <RangePicker base="/backoffice/reports/sales" presets={rangePresets(rules)} current={range} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Revenue" value={formatPeso(revenue)} />
        <Metric label="Bookings" value={bookings.toLocaleString()} />
        <Metric label="Hours booked" value={hours.toLocaleString()} />
        <Metric label="Avg per booking" value={formatPeso(bookings ? Math.round(revenue / bookings) : 0)} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {tables.map((t) => (
          <div key={t.title} className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-steel uppercase">{t.title}</h2>
            <table className="w-full text-sm">
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.label} className="border-t border-kitchen-light">
                    <td className="py-1.5">{r.label}</td>
                    <td className="py-1.5 text-right text-steel/60">{r.hours} h</td>
                    <td className="py-1.5 text-right font-semibold">{formatPeso(r.revenue)}</td>
                    <td className="w-12 py-1.5 text-right text-xs text-steel/60">{revenue ? Math.round((r.revenue / revenue) * 100) : 0}%</td>
                  </tr>
                ))}
                {t.rows.length === 0 && <tr><td className="py-2 text-steel/60">No sales in this range.</td></tr>}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-bold text-steel uppercase">Daily sales</h2>
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-steel/60">
            <tr>
              <th className="py-1.5">Date</th>
              {courts.map((c) => <th key={c.id} className="py-1.5 text-right">{c.name}</th>)}
              <th className="py-1.5 text-right">Bookings</th>
              <th className="py-1.5 text-right">Hours</th>
              <th className="py-1.5 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byDay.map(([date, rows]) => (
              <tr key={date} className="border-t border-kitchen-light">
                <td className="py-1.5">{formatServiceDate(date)}</td>
                {courts.map((c) => (
                  <td key={c.id} className="py-1.5 text-right text-steel/70">{formatPeso(sum(rows.filter((r) => r.court === c.id), (r) => r.revenue))}</td>
                ))}
                <td className="py-1.5 text-right">{sum(rows, (r) => r.bookings)}</td>
                <td className="py-1.5 text-right">{sum(rows, (r) => r.hours)}</td>
                <td className="py-1.5 text-right font-semibold">{formatPeso(sum(rows, (r) => r.revenue))}</td>
              </tr>
            ))}
            {byDay.length === 0 && <tr><td className="py-3 text-steel/60" colSpan={5}>No confirmed bookings in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
