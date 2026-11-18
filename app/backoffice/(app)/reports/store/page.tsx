import { Metric, RangePicker } from "@/components/RangePicker";
import { requireAdmin } from "@/lib/auth";
import { rangePresets, resolveRange, sum } from "@/lib/reports";
import { formatPeso, formatServiceDate } from "@/lib/schedule";
import { PAYMENT_LABEL, type PayMethod } from "@/lib/store";
import { getSiteSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";

type Report = {
  daily: { date: string; method: PayMethod; revenue: number; cost: number }[];
  items: { item_id: string; name: string; kind: string; units: number; revenue: number; cost: number }[];
  losses: { date: string; item: string; qty: number; reason: string; cost: number }[];
  low_stock: { name: string; on_hand: number; low_stock_at: number }[];
};

const peso = (n: number) => formatPeso(Math.round(n));
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

export default async function StoreReportPage({ searchParams }: PageProps<"/backoffice/reports/store">) {
  await requireAdmin();
  const sp = await searchParams;
  const { rules } = await getSiteSettings();
  const range = resolveRange(sp, rules, "this-month");
  const { data, error } = await (await createUserClient()).rpc("store_report", { p_from: range.from, p_to: range.to });
  if (error) throw new Error(error.message);
  const r = data as Report;

  const revenue = sum(r.daily, (d) => d.revenue);
  const cost = sum(r.daily, (d) => Number(d.cost));
  const losses = sum(r.losses, (l) => Number(l.cost));
  const profit = revenue - cost - losses;
  const byMethod = (["cash", "gcash", "maya"] as const).map((m) => ({ m, revenue: sum(r.daily.filter((d) => d.method === m), (d) => d.revenue) }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-steel uppercase">Store report</h1>
        <p className="text-sm text-steel/60">Store sales by day · {formatServiceDate(range.from)} – {formatServiceDate(range.to)}</p>
      </div>
      <RangePicker base="/backoffice/reports/store" presets={rangePresets(rules)} current={range} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Revenue" value={peso(revenue)} />
        <Metric label="Cost of items sold" value={peso(cost)} />
        <Metric label="Profit" value={peso(profit)} sub={`${pct(profit, revenue)} margin, after losses`} />
        <Metric label="Losses" value={peso(losses)} sub="Expired, damaged, given away" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card overflow-x-auto p-4">
          <h2 className="mb-2 text-sm font-bold text-steel uppercase">By item</h2>
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-steel/60">
              <tr><th className="py-1.5">Item</th><th className="text-right">Sold</th><th className="text-right">Revenue</th><th className="text-right">Profit</th><th className="text-right">Margin</th></tr>
            </thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.item_id} className="border-t border-kitchen-light">
                  <td className="py-1.5 font-semibold">{i.name}</td>
                  <td className="text-right">{i.units}</td>
                  <td className="text-right">{peso(i.revenue)}</td>
                  <td className="text-right">{peso(i.revenue - Number(i.cost))}</td>
                  <td className="text-right text-steel/60">{pct(i.revenue - Number(i.cost), i.revenue)}</td>
                </tr>
              ))}
              {r.items.length === 0 && <tr><td colSpan={5} className="py-3 text-steel/60">No store sales in this range.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-steel uppercase">By payment method</h2>
            <ul className="space-y-1 text-sm">
              {byMethod.map(({ m, revenue: v }) => (
                <li key={m} className="flex justify-between"><span>{PAYMENT_LABEL[m]}</span><span className="font-semibold">{peso(v)}</span></li>
              ))}
            </ul>
          </div>
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-steel uppercase">Running low</h2>
            {r.low_stock.length === 0 ? (
              <p className="text-sm text-steel/60">Everything is above its warning level.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {r.low_stock.map((l) => (
                  <li key={l.name} className="flex justify-between"><span>{l.name}</span><span className="font-semibold text-surround-dark">{l.on_hand} left</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-steel uppercase">Losses</h2>
            {r.losses.length === 0 ? (
              <p className="text-sm text-steel/60">No losses in this range.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {r.losses.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2"><span>{formatServiceDate(l.date)} · {l.qty} {l.item} ({l.reason})</span><span className="font-semibold text-red-700">{peso(Number(l.cost))}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
