import { Metric, RangePicker } from "@/components/RangePicker";
import { requireAdmin } from "@/lib/auth";
import { capacityHours, getReport, rangePresets, resolveRange, sum } from "@/lib/reports";
import { addDays, formatHour, formatPeso, formatServiceDate, mondayOf, monthShort, serviceHours } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { BarSeries } from "./Charts";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function AnalyticsPage({ searchParams }: PageProps<"/backoffice/reports/analytics">) {
  await requireAdmin();
  const sp = await searchParams;
  const { rules, courts } = await getSiteSettings();
  const range = resolveRange(sp, rules, "12m");
  const { daily, heat } = await getReport(range.from, range.to);

  const hours = sum(daily, (r) => r.hours);
  const capacity = capacityHours(range.from, range.to, rules, courts.length);

  // weekly (Mon-start) and monthly series, including empty periods
  const weekly = new Map<string, typeof daily>();
  for (let w = mondayOf(range.from); w <= range.to; w = addDays(w, 7)) weekly.set(w, []);
  for (const r of daily) weekly.get(mondayOf(r.date))?.push(r);
  const weeklyData = [...weekly].map(([w, rows]) => ({
    label: `${monthShort(w)} ${Number(w.slice(8))}`,
    bookings: sum(rows, (r) => r.bookings),
    hours: sum(rows, (r) => r.hours),
    revenue: sum(rows, (r) => r.revenue),
  }));
  const monthly = new Map<string, typeof daily>();
  for (let m = range.from.slice(0, 7); m <= range.to.slice(0, 7); ) {
    monthly.set(m, []);
    const [y, mo] = m.split("-").map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  }
  for (const r of daily) monthly.get(r.date.slice(0, 7))?.push(r);
  const monthlyData = [...monthly].map(([m, rows]) => ({
    label: `${monthShort(m + "-01")} ${m.slice(2, 4)}`,
    bookings: sum(rows, (r) => r.bookings),
    hours: sum(rows, (r) => r.hours),
    revenue: sum(rows, (r) => r.revenue),
  }));
  const bestMonth = monthlyData.reduce((a, b) => (b.hours > (a?.hours ?? -1) ? b : a), monthlyData[0]);

  // heatmap day-of-week × hour
  const hrs = serviceHours(rules);
  const heatMap = new Map(heat.map((h) => [`${h.dow}|${h.sh}`, h.hours]));
  const maxHeat = Math.max(1, ...heat.map((h) => h.hours));
  const peak = heat.reduce((a, b) => (b.hours > (a?.hours ?? -1) ? b : a), heat[0]);
  const byDow = DOW.map((d, i) => ({ d, hours: sum(heat.filter((h) => h.dow === i + 1), (h) => h.hours) }));
  const busiestDay = byDow.reduce((a, b) => (b.hours > a.hours ? b : a), byDow[0]);

  // utilization per court
  const perCourtCap = capacity / Math.max(1, courts.length);
  const util = courts.map((c) => {
    const h = sum(daily.filter((r) => r.court === c.id), (r) => r.hours);
    return { name: c.name, hours: h, pct: perCourtCap ? Math.round((h / perCourtCap) * 100) : 0 };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-steel uppercase">Analytics</h1>
        <p className="text-sm text-steel/60">Confirmed bookings · {formatServiceDate(range.from)} – {formatServiceDate(range.to)}</p>
      </div>
      <RangePicker base="/backoffice/reports/analytics" presets={rangePresets(rules)} current={range} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Utilization" value={`${capacity ? Math.round((hours / capacity) * 100) : 0}%`} sub={`${hours.toLocaleString()} of ${capacity.toLocaleString()} court-hours`} />
        <Metric label="Peak slot" value={peak ? `${DOW[peak.dow - 1]} ${formatHour(peak.sh)}` : "—"} sub={peak ? `${peak.hours} hours booked` : undefined} />
        <Metric label="Busiest day" value={busiestDay?.hours ? busiestDay.d : "—"} sub={busiestDay?.hours ? `${busiestDay.hours} hours booked` : undefined} />
        <Metric label="Best month" value={bestMonth?.hours ? bestMonth.label : "—"} sub={bestMonth?.hours ? formatPeso(bestMonth.revenue) : undefined} />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-bold text-steel uppercase">Peak hours</h2>
        <p className="mb-3 text-xs text-steel/60">Hours booked by day of week and start time. Darker means busier.</p>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-[3px] text-[11px]">
            <thead>
              <tr>
                <th />
                {hrs.map((h) => (
                  <th key={h} className="min-w-[30px] font-normal text-steel/60">{formatHour(h).replace("AM", "a").replace("PM", "p")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOW.map((d, i) => (
                <tr key={d}>
                  <td className="pr-2 font-semibold text-steel">{d}</td>
                  {hrs.map((h) => {
                    const v = heatMap.get(`${i + 1}|${h}`) ?? 0;
                    const a = v / maxHeat;
                    return (
                      <td
                        key={h}
                        title={`${d} ${formatHour(h)}: ${v} hours`}
                        className="h-7 rounded-[3px] text-center"
                        style={{ background: v ? `rgb(31 95 191 / ${0.08 + a * 0.92})` : "#f4f5f7", color: a > 0.55 ? "white" : "#5a6270" }}
                      >
                        {v || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-sm font-bold text-steel uppercase">Monthly hours booked</h2>
          <p className="mb-2 text-xs text-steel/60">Use this to spot busy and slow seasons. Best month in orange.</p>
          <BarSeries data={monthlyData} highlight={bestMonth?.label} />
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-bold text-steel uppercase">Weekly hours booked</h2>
          <p className="mb-2 text-xs text-steel/60">Weeks start on Monday.</p>
          <BarSeries data={weeklyData} />
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-bold text-steel uppercase">Court utilization</h2>
        <div className="space-y-3">
          {util.map((u) => (
            <div key={u.name}>
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-steel">{u.name}</span>
                <span className="text-steel/70">{u.hours.toLocaleString()} h · {u.pct}%</span>
              </div>
              <div className="mt-1 h-3 rounded-full bg-kitchen-light">
                <div className="h-3 rounded-full bg-court" style={{ width: `${Math.min(100, u.pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-steel/60">Utilization = hours booked ÷ bookable hours ({hrs.length} per court per day).</p>
      </div>
    </div>
  );
}
