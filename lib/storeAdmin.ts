import "server-only";
import { createUserClient } from "./supabase/server";

export type StockRow = {
  id: string;
  name: string;
  kind: "shelf" | "made_to_order";
  price: number;
  serving_cost: number | null;
  avg_cost: number;
  on_hand: number | null;
  low_stock_at: number | null;
  active: boolean;
  sort_order: number;
};

/** Admin-only: every item with its costs (the database refuses staff). */
export async function getAdminStock(): Promise<StockRow[]> {
  const { data, error } = await (await createUserClient()).rpc("admin_store_stock");
  if (error) throw new Error(error.message);
  return ((data ?? []) as StockRow[]).map((r) => ({ ...r, avg_cost: Number(r.avg_cost), serving_cost: r.serving_cost === null ? null : Number(r.serving_cost) }));
}
