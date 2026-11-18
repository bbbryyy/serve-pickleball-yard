import { requireAdmin } from "@/lib/auth";
import { publicStorageUrl } from "@/lib/settings";
import { getAdminStock } from "@/lib/storeAdmin";
import { createServiceClient } from "@/lib/supabase/server";
import { InventoryManager, type HistoryRow } from "./InventoryManager";

export default async function InventoryPage({ searchParams }: PageProps<"/backoffice/inventory">) {
  await requireAdmin();
  const sp = await searchParams;
  const items = (await getAdminStock()).map((i) => ({ ...i, imageUrl: publicStorageUrl("store-images", i.image_path) }));
  const selectedId = typeof sp.item === "string" && items.some((i) => i.id === sp.item) ? sp.item : null;
  // admin page: full stock log (incl. costs) via the service client, after the admin check above
  const { data: log } = selectedId
    ? await createServiceClient()
        .from("store_stock_moves")
        .select("id, kind, qty, total_cost, paid_from, reason, created_at")
        .eq("item_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: null };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 font-display text-3xl font-semibold text-steel uppercase">Inventory</h1>
      <p className="mb-4 text-sm text-steel/70">Add and edit items, restock what came in, and remove what&apos;s expired, damaged or given away.</p>
      <InventoryManager
        key={selectedId ?? "new"}
        items={items}
        selectedId={selectedId}
        history={(log ?? []).map((m) => ({ ...m, total_cost: m.total_cost === null ? null : Number(m.total_cost) })) as HistoryRow[]}
      />
    </div>
  );
}
