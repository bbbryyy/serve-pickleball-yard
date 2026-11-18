import { requireAdmin } from "@/lib/auth";
import { getAdminStock } from "@/lib/storeAdmin";
import { ItemEditor } from "./ItemEditor";

export default async function ItemsPage() {
  await requireAdmin();
  const items = await getAdminStock();
  return (
    <div className="space-y-4">
      <p className="text-sm text-steel/70">
        Shelf items are counted and restocked. Made-to-order items, like nachos, aren&apos;t counted: set what one serving costs you so profit is right.
      </p>
      <ItemEditor items={items} />
    </div>
  );
}
