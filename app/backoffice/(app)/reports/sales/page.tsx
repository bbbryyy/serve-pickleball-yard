import Link from "next/link";
import { Metric, RangePicker } from "@/components/RangePicker";
import { requireAdmin } from "@/lib/auth";
import { salesSplit } from "@/lib/openPlay";
import { getReport, groupBy, rangePresets, resolveRange, sum } from "@/lib/reports";
import { formatPeso, formatServiceDate } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";

const METHOD: Record<string, string> = { gcash: "GCash", maya: "Maya", cash: "Cash" };

export default async function SalesPage({ searchParams }: PageProps<"/backoffice/reports/sales">) {
  await requireAdmin();
  const sp = await searchParams;
  const { rules, courts } = await getSiteSettings();
  const range = resolveRange(sp, rules, "this-month");
  const { daily, open_play: openPlay, open_play_refunds: refunds, open_play_sessions: sessions, refunds_owed: refundsOwed, store } = await getReport(range.from, range.to);

  const split = salesSplit(daily, openPlay, refunds, store);
  const revenue = split.total;
  const bookings = sum(daily, (r) => r.bookings);
  const sessionsHeld = sessions.filter((x) => x.status === "open" && x.players > 0).length;
  const dates = [...new Set([...daily.map((r) => r.date), ...openPlay.map((r) => r.date), ...refunds.map((r) => r.date), ...store.map((r) => r.date)])].sort().reverse();

  // revenue rows from both kinds of sales, for the method and channel breakdowns
  type Line = { key: string; revenue: number; qty: number };
  const lines = (key: (r: { method: string; source: string }) => string): Line[] => [
    ...daily.map((r) => ({ key: key(r), revenue: r.revenue, qty: r.hours })),
    ...openPlay.map((r) => ({ key: key(r), revenue: r.revenue, qty: 0 })),
    ...store.map((r) => ({ key: key({ method: r.method, source: "store" }), revenue: r.revenue, qty: 0 })),
  ];
  const breakdown = (rows: Line[], label: (k: string) => string) =>
    [...groupBy(rows, (r) => r.key)].map(([k, rs]) => ({ label: label(k), revenue: sum(rs, (r) => r.revenue), hours: sum(rs, (r) => r.qty) })).sort((a, b) => b.revenue - a.revenue);
  const gross = split.rentals + split.openPlay + split.store;

  const tables = [
    {
      title: "Court rentals by court",
      rows: [...groupBy(daily, (r) => String(r.court))]
        .map(([k, rs]) => ({ label: courts.find((c) => c.id === Number(k))?.name ?? `Court ${k}`, revenue: sum(rs, (r) => r.revenue), hours: sum(rs, (r) => r.hours) }))
        .sort((a, b) => b.revenue - a.revenue),
      total: split.rentals,
    },
    { title: "By payment method", rows: breakdown(lines((r) => r.method), (k) => METHOD[k] ?? k), total: gross },
    { title: "By channel", rows: breakdown(lines((r) => r.source), (k) => (k === "walk_in" ? "Walk-in / phone" : k === "store" ? "Store" : "Online")), total: gross },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-steel uppercase">Sales report</h1>
          <p className="text-sm text-steel/60">
            Court rentals, open play and store by play date · {formatServiceDate(range.from)} – {formatServiceDate(range.to)}
          </p>
        </div>
        <Link href={`/backoffice/reports/sales/export?from=${range.from}&to=${range.to}`} className="btn-ghost" prefetch={false}>
          Export CSV
        </Link>
      </div>
      <RangePicker base="/backoffice/reports/sales" presets={rangePresets(rules)} current={range} />

      {refundsOwed > 0 && (
        <Link href="/backoffice/open-play?refunds=1" className="inline-block rounded-full bg-surround/20 px-3 py-1 text-sm font-semibold text-surround-dark hover:underline">
          {refundsOwed} open play refund{refundsOwed === 1 ? "" : "s"} owed
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Total" value={formatPeso(revenue)} sub={split.refunds ? `after ${formatPeso(split.refunds)} in refunds` : undefined} />
        <Metric label="Court rentals" value={formatPeso(split.rentals)} sub={`${split.rentalHours.toLocaleString()} hours · ${bookings.toLocaleString()} bookings`} />
        <Metric label="Open play" value={formatPeso(split.openPlay)} sub={`${split.players.toLocaleString()} players · ${sessionsHeld} session${sessionsHeld === 1 ? "" : "s"}`} />
        <Metric label="Store" value={formatPeso(split.store)} sub={`${formatPeso(Math.round(split.storeProfit))} profit`} />
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
                    <td className="py-1.5 text-right text-steel/60">{r.hours ? `${r.hours} h` : ""}</td>
                    <td className="py-1.5 text-right font-semibold">{formatPeso(r.revenue)}</td>
                    <td className="w-12 py-1.5 text-right text-xs text-steel/60">{t.total ? Math.round((r.revenue / t.total) * 100) : 0}%</td>
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
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-steel/60">
            <tr>
              <th className="py-1.5">Date</th>
              {courts.map((c) => <th key={c.id} className="py-1.5 text-right">{c.name}</th>)}
              <th className="py-1.5 text-right">Hours</th>
              <th className="py-1.5 text-right">Open play</th>
              <th className="py-1.5 text-right">Store</th>
              <th className="py-1.5 text-right">Refunds</th>
              <th className="py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const rows = daily.filter((r) => r.date === date);
              const op = sum(openPlay.filter((r) => r.date === date), (r) => r.revenue);
              const players = sum(openPlay.filter((r) => r.date === date), (r) => r.players);
              const rf = sum(refunds.filter((r) => r.date === date), (r) => r.amount);
              const sto = sum(store.filter((r) => r.date === date), (r) => r.revenue);
              return (
                <tr key={date} className="border-t border-kitchen-light">
                  <td className="py-1.5">{formatServiceDate(date)}</td>
                  {courts.map((c) => (
                    <td key={c.id} className="py-1.5 text-right text-steel/70">{formatPeso(sum(rows.filter((r) => r.court === c.id), (r) => r.revenue))}</td>
                  ))}
                  <td className="py-1.5 text-right">{sum(rows, (r) => r.hours)}</td>
                  <td className="py-1.5 text-right text-steel/70">{op ? `${formatPeso(op)} · ${players}p` : "—"}</td>
                  <td className="py-1.5 text-right text-steel/70">{sto ? formatPeso(sto) : "—"}</td>
                  <td className="py-1.5 text-right text-red-700">{rf ? `−${formatPeso(rf)}` : ""}</td>
                  <td className="py-1.5 text-right font-semibold">{formatPeso(sum(rows, (r) => r.revenue) + op + sto - rf)}</td>
                </tr>
              );
            })}
            {dates.length === 0 && <tr><td className="py-3 text-steel/60" colSpan={courts.length + 6}>No sales in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
