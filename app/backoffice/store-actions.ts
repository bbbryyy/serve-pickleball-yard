"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { PayMethod } from "@/lib/store";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

// Store (POS). Role checks are repeated in the SQL functions.

function refresh() {
  revalidatePath("/backoffice", "layout");
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await (await createUserClient()).rpc(fn, args);
  if (error) return { error: friendlyError(error.message) };
  return { data: data as T };
}

export async function createSale(lines: { item_id: string; qty: number }[], method: PayMethod): Promise<ActionResult> {
  await requireStaff();
  const r = await call<string>("store_create_sale", { p_lines: lines, p_method: method });
  if (r.error) return { error: r.error };
  refresh();
  return { ok: "Sale saved" };
}

export async function cancelSale(saleId: string, reason: string): Promise<ActionResult> {
  await requireStaff();
  const r = await call("store_cancel_sale", { p_sale_id: saleId, p_reason: reason });
  if (r.error) return { error: r.error };
  refresh();
  return { ok: "Sale cancelled. The items are back in stock." };
}

export async function addStock(input: { itemId: string; qty: number; totalCost: number; paidFrom: string; opening: boolean }): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isInteger(input.qty) || input.qty <= 0) return { error: "Enter how many came in." };
  if (!Number.isInteger(input.totalCost) || input.totalCost < 0) return { error: "Enter the total paid in pesos." };
  const r = await call<number>("store_add_stock", {
    p_item_id: input.itemId, p_qty: input.qty, p_total_cost: input.totalCost, p_paid_from: input.paidFrom, p_opening: input.opening,
  });
  if (r.error) return { error: r.error };
  refresh();
  return { ok: `Saved. Stock is now ${r.data}.` };
}

export async function cashOut(amount: number, reason: string): Promise<ActionResult> {
  await requireStaff();
  if (!Number.isInteger(amount) || amount <= 0) return { error: "Enter an amount in pesos." };
  const r = await call("store_cash_out", { p_amount: amount, p_reason: reason });
  if (r.error) return { error: r.error };
  refresh();
  return { ok: "Cash out recorded" };
}

export async function closeDay(input: { date: string; cash: number; gcash: number; maya: number; note: string }): Promise<ActionResult> {
  await requireStaff();
  for (const v of [input.cash, input.gcash, input.maya]) {
    if (!Number.isInteger(v) || v < 0) return { error: "Enter each counted amount in whole pesos." };
  }
  const r = await call("store_close_day", { p_date: input.date, p_cash: input.cash, p_gcash: input.gcash, p_maya: input.maya, p_note: input.note });
  if (r.error) return { error: r.error };
  refresh();
  return { ok: "Day closed" };
}

// ---- admin

export async function saveItem(input: {
  id: string | null;
  name: string;
  kind: "shelf" | "made_to_order";
  price: number;
  cost: number | null;
  lowStockAt: number | null;
  inStock: number | null;
  description: string;
  imagePath: string | null;
  active: boolean;
  sort: number;
}): Promise<ActionResult> {
  await requireAdmin();
  if (input.name.trim().length < 2) return { error: "Enter the item name." };
  if (!Number.isInteger(input.price) || input.price <= 0) return { error: "Enter a selling price in whole pesos." };
  if (input.cost === null || !(input.cost >= 0)) return { error: input.kind === "shelf" ? "Enter what one item costs you." : "Enter the cost per serving." };
  if (input.inStock !== null && (!Number.isInteger(input.inStock) || input.inStock < 0)) return { error: "Enter how many are in stock." };
  const r = await call("admin_save_store_item", {
    p_id: input.id, p_name: input.name, p_kind: input.kind, p_price: input.price, p_cost: input.cost,
    p_low_stock_at: input.lowStockAt, p_in_stock: input.inStock, p_description: input.description,
    p_image_path: input.imagePath, p_active: input.active, p_sort: input.sort,
  });
  if (r.error) return { error: r.error };
  refresh();
  return { ok: input.id ? "Item saved" : "Item added" };
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Uploads an item photo to the public store-images bucket; returns its path. */
export async function uploadItemImage(form: FormData): Promise<{ path?: string; error?: string }> {
  await requireAdmin();
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  if (!IMAGE_TYPES[file.type]) return { error: "Photos must be JPG, PNG, or WEBP." };
  if (file.size > 2 * 1024 * 1024) return { error: "Photos must be 2MB or smaller." };
  const path = `items/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${IMAGE_TYPES[file.type]}`;
  const { error } = await createServiceClient().storage.from("store-images").upload(path, file, { contentType: file.type });
  if (error) return { error: "Upload failed. Try again." };
  return { path };
}

export async function correctStock(itemId: string, qty: number, reason: string): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isInteger(qty) || qty === 0) return { error: "Enter how many to add (+) or remove (−)." };
  const r = await call<number>("admin_correct_stock", { p_item_id: itemId, p_qty: qty, p_reason: reason });
  if (r.error) return { error: r.error };
  refresh();
  return { ok: `Stock corrected. Now ${r.data}.` };
}

export async function reopenDay(closeId: string): Promise<ActionResult> {
  await requireAdmin();
  const r = await call("admin_reopen_day", { p_close_id: closeId });
  if (r.error) return { error: r.error };
  refresh();
  return { ok: "Day reopened. Count and close it again. If it's today, staff can also sell and cancel again." };
}
