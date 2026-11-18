import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getCatalog, getStoreDay } from "@/lib/storeData";
import { formatServiceDate } from "@/lib/schedule";
import { createUserClient } from "@/lib/supabase/server";
import { SellScreen, type TodaySale } from "./SellScreen";

export default async function SellPage() {
  await requireStaff();
  const supabase = await createUserClient();
  const today = await getStoreDay();
  const [catalog, { data: status }, { data: sales, error }] = await Promise.all([
    getCatalog(),
    supabase.rpc("store_day_status", { p_date: today }),
    supabase
      .from("store_sales")
      .select("id, payment_method, total, status, created_at, store_sale_lines(qty, store_items(name))")
      .eq("service_date", today)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (error) throw new Error(error.message);
  const todays: TodaySale[] = (sales ?? []).map((s) => ({
    id: s.id,
    method: s.payment_method,
    total: s.total,
    status: s.status,
    createdAt: s.created_at,
    items: (s.store_sale_lines as unknown as { qty: number; store_items: { name: string } }[]).map((l) => `${l.qty} × ${l.store_items.name}`).join(", "),
  }));
  const closed = (status as { closed: boolean }).closed;

  return (
    <div className="space-y-4">
      {closed && (
        <p className="rounded-lg bg-kitchen-light px-4 py-3 text-sm text-steel">
          {formatServiceDate(today)} is closed, so new sales can&apos;t be added. An admin can reopen it from{" "}
          <Link href="/backoffice/store/closes" className="text-court underline">Past closes</Link>.
        </p>
      )}
      <SellScreen items={catalog.filter((i) => i.active)} sales={todays} closed={closed} />
    </div>
  );
}
