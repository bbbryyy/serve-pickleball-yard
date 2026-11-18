import { requireStaff } from "@/lib/auth";
import { formatPeso } from "@/lib/schedule";
import { getCatalog, getStoreDay } from "@/lib/storeData";
import { createUserClient } from "@/lib/supabase/server";
import { CashOutForm, RestockForm } from "./forms";

export default async function RestockPage() {
  const user = await requireStaff();
  const isAdmin = user.role === "admin";
  const supabase = await createUserClient();
  const today = await getStoreDay();
  const [catalog, { data: outs }, stock] = await Promise.all([
    getCatalog(),
    supabase.from("store_cash_outs").select("id, amount, reason, created_at").eq("service_date", today).order("created_at", { ascending: false }),
    isAdmin ? supabase.rpc("admin_store_stock") : Promise.resolve({ data: null }),
  ]);
  const avg = new Map(((stock.data ?? []) as { id: string; avg_cost: number }[]).map((r) => [r.id, Number(r.avg_cost)]));
  const shelf = catalog.filter((i) => i.kind === "shelf" && i.active).map((i) => ({ id: i.id, name: i.name, onHand: i.on_hand ?? 0, avgCost: isAdmin ? avg.get(i.id) ?? 0 : null }));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold text-steel uppercase">Restock</h2>
        {shelf.length === 0 ? <p className="text-sm text-steel/60">No shelf items yet.</p> : <RestockForm items={shelf} isAdmin={isAdmin} />}
      </section>
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="mb-1 text-sm font-bold text-steel uppercase">Cash out</h2>
          <p className="mb-3 text-sm text-steel/70">Money taken from the drawer for something other than a restock, like ice or change for a bill.</p>
          <CashOutForm />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold text-steel">Taken from the drawer today</h3>
          {(outs ?? []).length === 0 ? (
            <p className="text-sm text-steel/60">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-kitchen-light text-sm">
              {(outs ?? []).map((o) => (
                <li key={o.id} className="flex justify-between py-1.5"><span>{o.reason}</span><span className="font-semibold">{formatPeso(o.amount)}</span></li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
