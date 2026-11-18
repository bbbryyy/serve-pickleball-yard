import { requireAdmin } from "@/lib/auth";
import { formatPeso } from "@/lib/schedule";
import { isLow } from "@/lib/store";
import { getAdminStock } from "@/lib/storeAdmin";
import { createServiceClient } from "@/lib/supabase/server";
import { CorrectStock } from "./CorrectStock";

const KIND: Record<string, string> = { opening: "Opening stock", restock: "Restock", sale: "Sale", cancel: "Cancelled sale", correction: "Correction" };
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export default async function StockPage({ searchParams }: PageProps<"/backoffice/store/stock">) {
  await requireAdmin();
  const sp = await searchParams;
  const items = (await getAdminStock()).filter((i) => i.kind === "shelf");
  const selected = items.find((i) => i.id === sp.item) ?? null;
  // admin page: full log incl. costs via the service client (after the admin check above)
  const { data: log } = selected
    ? await createServiceClient().from("store_stock_moves").select("id, kind, qty, total_cost, paid_from, reason, created_at").eq("item_id", selected.id).order("created_at", { ascending: false }).limit(100)
    : { data: null };
  const low = items.filter((i) => i.active && isLow(i.on_hand ?? 0, i.low_stock_at));

  return (
    <div className="space-y-4">
      {low.length > 0 && (
        <p className="rounded-lg bg-surround/15 px-4 py-3 text-sm text-surround-dark">
          Running low: {low.map((i) => `${i.name} (${i.on_hand})`).join(", ")}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card overflow-x-auto p-4">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-steel/60">
              <tr><th className="py-1.5">Item</th><th className="text-right">In stock</th><th className="text-right">Avg cost</th><th className="text-right">Stock value</th><th /></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={`border-t border-kitchen-light ${selected?.id === i.id ? "bg-paper" : ""}`}>
                  <td className="py-1.5 font-semibold">{i.name}</td>
                  <td className={`text-right ${isLow(i.on_hand ?? 0, i.low_stock_at) ? "font-semibold text-surround-dark" : ""}`}>{i.on_hand}</td>
                  <td className="text-right">{formatPeso(i.avg_cost)}</td>
                  <td className="text-right">{formatPeso(Math.round((i.on_hand ?? 0) * i.avg_cost))}</td>
                  <td className="text-right"><a className="text-court underline" href={`/backoffice/store/stock?item=${i.id}`}>History</a></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="py-3 text-steel/60">No shelf items yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold text-steel uppercase">Correct stock</h2>
            {items.length ? <CorrectStock items={items.map((i) => ({ id: i.id, name: i.name, onHand: i.on_hand ?? 0 }))} initial={selected?.id} /> : <p className="text-sm text-steel/60">No shelf items yet.</p>}
          </section>
          {selected && (
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-bold text-steel uppercase">{selected.name} history</h2>
              <ul className="divide-y divide-kitchen-light text-sm">
                {(log ?? []).map((m) => (
                  <li key={m.id} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {KIND[m.kind]}
                      {m.reason ? ` · ${m.reason}` : ""}
                      {m.total_cost !== null ? ` · ${formatPeso(Number(m.total_cost))}${m.paid_from ? ` from ${m.paid_from}` : ""}` : ""}
                      <span className="block text-xs text-steel/60">{when(m.created_at)}</span>
                    </span>
                    <span className={`font-semibold ${m.qty < 0 ? "text-red-700" : "text-ball-dark"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
