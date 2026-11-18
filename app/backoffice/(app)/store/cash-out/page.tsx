import { requireStaff } from "@/lib/auth";
import { formatPeso } from "@/lib/schedule";
import { getStoreDay } from "@/lib/storeData";
import { createUserClient } from "@/lib/supabase/server";
import { CashOutForm } from "./CashOutForm";

export default async function CashOutPage() {
  await requireStaff();
  const today = await getStoreDay();
  const { data: outs } = await (await createUserClient())
    .from("store_cash_outs")
    .select("id, amount, reason, created_at")
    .eq("service_date", today)
    .order("created_at", { ascending: false });
  const total = (outs ?? []).reduce((t, o) => t + o.amount, 0);

  return (
    <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-1 text-sm font-bold text-steel uppercase">Cash out</h2>
        <p className="mb-3 text-sm text-steel/70">Money taken from the drawer, like ice or change for a bill. It&apos;s taken off today&apos;s expected cash.</p>
        <CashOutForm />
      </section>
      <section className="card p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-steel uppercase">Taken from the drawer today</h2>
          <span className="text-sm font-semibold">{formatPeso(total)}</span>
        </div>
        {(outs ?? []).length === 0 ? (
          <p className="text-sm text-steel/60">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-kitchen-light text-sm">
            {(outs ?? []).map((o) => (
              <li key={o.id} className="flex justify-between py-1.5"><span>{o.reason}</span><span className="font-semibold">{formatPeso(o.amount)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
