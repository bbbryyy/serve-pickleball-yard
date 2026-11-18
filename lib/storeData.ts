import "server-only";
import { createUserClient } from "./supabase/server";

export type CatalogItem = {
  id: string;
  name: string;
  kind: "shelf" | "made_to_order";
  price: number;
  low_stock_at: number | null;
  active: boolean;
  sort_order: number;
  on_hand: number | null;
};

export async function getCatalog(): Promise<CatalogItem[]> {
  const { data, error } = await (await createUserClient()).rpc("store_catalog");
  if (error) throw new Error(error.message);
  return (data ?? []) as CatalogItem[];
}

export async function getStoreDay(): Promise<string> {
  const { data, error } = await (await createUserClient()).rpc("current_store_day");
  if (error) throw new Error(error.message);
  return data as string;
}

/** Low-stock shelf items + earlier days nobody closed (sidebar badge). */
export async function getStoreAlerts(): Promise<{ low: number; unclosed: string[] }> {
  const supabase = await createUserClient();
  const [{ data: cat }, { data: days }] = await Promise.all([supabase.rpc("store_catalog"), supabase.rpc("store_unclosed_days")]);
  const low = ((cat ?? []) as CatalogItem[]).filter((i) => i.active && i.kind === "shelf" && i.low_stock_at !== null && (i.on_hand ?? 0) <= i.low_stock_at).length;
  return { low, unclosed: (days ?? []) as string[] };
}
