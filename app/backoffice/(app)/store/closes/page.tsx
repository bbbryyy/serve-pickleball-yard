import { requireAdmin } from "@/lib/auth";
import { formatPeso, formatServiceDate } from "@/lib/schedule";
import { closeDiff } from "@/lib/store";
import { createUserClient } from "@/lib/supabase/server";
import { ReopenButton } from "./ReopenButton";

const diffText = (n: number) => (n === 0 ? "₱0" : n > 0 ? `+${formatPeso(n)}` : `−${formatPeso(-n)}`);

export default async function ClosesPage() {
  await requireAdmin();
  const supabase = await createUserClient();
  const [{ data, error }, { data: staff }, { data: lateDays }] = await Promise.all([
    supabase.from("store_daily_closes").select("*").order("service_date", { ascending: false }).order("closed_at", { ascending: false }).limit(90),
    supabase.from("staff_profiles").select("user_id, full_name"),
    supabase.rpc("store_late_days"),
  ]);
  if (error) throw new Error(error.message);
  // money recorded after closing, for the days that have some
  const late = new Map<string, { cash: number; gcash: number; maya: number }>();
  await Promise.all(
    ((lateDays ?? []) as string[]).map(async (d) => {
      const { data: st } = await supabase.rpc("store_day_status", { p_date: d });
      if (st?.late) late.set(d, st.late);
    }),
  );
  const name = new Map((staff ?? []).map((s) => [s.user_id, s.full_name]));

  return (
    <div className="card overflow-x-auto p-4">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-left text-xs text-steel/60">
          <tr><th className="py-1.5">Day</th><th>Closed by</th><th className="text-right">Cash</th><th className="text-right">GCash</th><th className="text-right">Maya</th><th className="text-right">Difference</th><th>Note</th><th /></tr>
        </thead>
        <tbody>
          {(data ?? []).map((c) => {
            const d = closeDiff({ cash: c.expected_cash, gcash: c.expected_gcash, maya: c.expected_maya }, { cash: c.counted_cash, gcash: c.counted_gcash, maya: c.counted_maya });
            return (
              <tr key={c.id} className={`border-t border-kitchen-light align-top ${c.reopened_at ? "text-steel/50" : ""}`}>
                <td className="py-1.5 font-semibold">{formatServiceDate(c.service_date)}{c.reopened_at && <span className="block text-xs font-normal">Reopened</span>}</td>
                <td>{name.get(c.closed_by) ?? "—"}</td>
                {(["cash", "gcash", "maya"] as const).map((m) => (
                  <td key={m} className="text-right">
                    {formatPeso(c[`counted_${m}`])}
                    <span className={`block text-xs ${d[m] === 0 ? "text-steel/50" : "text-red-700"}`}>{d[m] === 0 ? `of ${formatPeso(c[`expected_${m}`])}` : diffText(d[m])}</span>
                  </td>
                ))}
                <td className={`text-right font-semibold ${d.total === 0 ? "text-ball-dark" : "text-red-700"}`}>{diffText(d.total)}</td>
                <td className="max-w-[220px] text-xs text-steel/70">
                  {c.note}
                  {!c.reopened_at && late.has(c.service_date) && (
                    <span className="mt-1 block font-semibold text-surround-dark">
                      Recorded after close: {formatPeso(late.get(c.service_date)!.cash + late.get(c.service_date)!.gcash + late.get(c.service_date)!.maya)}
                    </span>
                  )}
                </td>
                <td className="text-right">{!c.reopened_at && <ReopenButton closeId={c.id} />}</td>
              </tr>
            );
          })}
          {(data ?? []).length === 0 && <tr><td colSpan={8} className="py-3 text-steel/60">No days closed yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
